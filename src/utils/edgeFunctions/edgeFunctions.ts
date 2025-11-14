import { supabase } from "../../supabase";
import { z, ZodSchema, ZodObject, type ZodRawShape, type ZodTypeAny } from "zod";

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
  } finally {
    const endTime = performance.now();
    console.log(`Function ${functionName} executed in ${(endTime - startTime).toFixed(2)}ms`);
  }
}
