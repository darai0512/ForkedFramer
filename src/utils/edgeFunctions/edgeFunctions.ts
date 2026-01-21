import { supabase } from "../../supabase";
import { z, ZodSchema, ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";
import { FunctionsHttpError } from '@supabase/supabase-js';
import { toastStore } from '@skeletonlabs/skeleton';

// グローバルで処理済み（toast表示済み）のHTTPエラーかどうかを判定
export function isHandledHttpError(error: unknown): boolean {
  if (!(error instanceof FunctionsHttpError)) return false;
  const status = error.context.status;
  return status === 402; // 残高不足
}

function isZodObject(schema: ZodTypeAny): schema is ZodObject<ZodRawShape> {
  return schema instanceof ZodObject;
}

export async function invoke<ResSchema extends ZodSchema>(
  functionName: string,
  req: any,
  requestSchema: ZodTypeAny,
  responseSchema: ResSchema,
): Promise<z.infer<ResSchema>> {
  const parsedReq = isZodObject(requestSchema)
    ? requestSchema.strip().parse(req)
    : requestSchema.parse(req);
  const startTime = performance.now();
  
  try {
    const {data, error} = await supabase.functions.invoke(`aigateway/${functionName}`, {
      body: JSON.stringify(parsedReq),
    });
    if (error) {
      console.error("Error invoking function:", functionName, error);
      throw error;
    }

    return responseSchema.parse(data);
  } catch (e) {
    if (e instanceof FunctionsHttpError && e.context.status === 402) {
      toastStore.trigger({
        message: `残高が不足しています。チャージしてください。`,
        timeout: 5000
      });
    }
    throw e;
  } finally {
    const endTime = performance.now();
    console.log(`Function ${functionName} executed in ${(endTime - startTime).toFixed(2)}ms`);
  }
}
