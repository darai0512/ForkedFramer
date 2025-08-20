// @ts-nocheck: Suppress type checking for this file due to complex type definitions
import { z } from "zod";

export const RecordMaterialRequestSchema = z.object({
  category: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  file: z.string().min(1),
});
export type RecordMaterialRequest = z.infer<typeof RecordMaterialRequestSchema>;

export const RecordMaterialResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  message: z.string(),
});
export type RecordMaterialResponse = z.infer<typeof RecordMaterialResponseSchema>;

export const ApproveMaterialRequestSchema = z.object({
  material_id: z.string().uuid(),
  approve: z.boolean(),
});
export type ApproveMaterialRequest = z.infer<typeof ApproveMaterialRequestSchema>;

export const ApproveMaterialResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rewarded: z.boolean().optional(),
});
export type ApproveMaterialResponse = z.infer<typeof ApproveMaterialResponseSchema>;

export const ListMaterialsRequestSchema = z.object({
  category: z.string().optional(),
  approved_only: z.boolean().optional().default(true),
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
});
export type ListMaterialsRequest = z.infer<typeof ListMaterialsRequestSchema>;

export const MaterialSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  category: z.string(),
  display_name: z.string(),
  description: z.string(),
  file: z.string(),
  approved_at: z.string().nullable(),
  rewarded_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

export const ListMaterialsResponseSchema = z.object({
  materials: z.array(MaterialSchema),
  total: z.number(),
});
export type ListMaterialsResponse = z.infer<typeof ListMaterialsResponseSchema>;
