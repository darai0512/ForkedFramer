// @ts-nocheck: Suppress type checking for this file due to complex type definitions
import { NotebookBaseSchema } from "$bookTypes/notebook"; // @deno-ts
import { z } from "zod";

export const ThinkerSchema = z.enum([
  "sonnet", 
  "sonnet:think", 
  "sonnet-4.0",
  "opus-4.1",
  "gpt4o", 
  "gpt4.1",
  "gpt4.1-mini",
  "gpt4.1-nano",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-chat",
  "o4-mini", 
  "o4-mini-high", 
  "o3", 
  "gemini", 
  "gemini-flash", 
  "gemini-flash:think", 
  "grok3-mini", 
  "grok3",
  "grok4",
]);
export type Thinker = z.infer<typeof ThinkerSchema>;

export const NotebookRequestSchema = z.object({
  thinker: ThinkerSchema,
  notebook: NotebookBaseSchema,
});
export type NotebookRequest = z.infer<typeof NotebookRequestSchema>;

export const NotebookWithInstructionRequestSchema = NotebookRequestSchema.extend({
  instruction: z.string()
});
export type NotebookWithInstructionRequest = z.infer<typeof NotebookWithInstructionRequestSchema>;

export const AdviseThemeResponseSchema = z.object({
  theme: z.string(),
  pageNumber: z.number(),
  format: z.enum(["4koma", "standard"])
});
export type AdviseThemeResponse = z.infer<typeof AdviseThemeResponseSchema>;


export const AdvisePageGenerationResponseSchema = z.object({
  pages: z.array(z.string()).describe("各ページの画像生成用マークダウンプロンプト"),
});
export type AdvisePageGenerationResponse = z.infer<typeof AdvisePageGenerationResponseSchema>;
