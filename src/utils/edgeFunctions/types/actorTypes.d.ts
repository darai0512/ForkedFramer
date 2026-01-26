// @ts-nocheck: Suppress type checking for this file due to complex type definitions
import { z } from "zod";

// カテゴリの定義
export const ActorCategorySchema = z.enum([
  'general',      // その他
  'protagonist',  // 主人公向け
  'supporting',   // 脇役向け
  'comedy',       // ギャグ向け
  'serious'       // シリアス向け
]);
export type ActorCategory = z.infer<typeof ActorCategorySchema>;

// 役者登録リクエスト
export const RecordActorRequestSchema = z.object({
  // CharacterBaseからの情報
  name: z.string().min(1),
  personality: z.string(),
  appearance: z.string(),
  theme_color: z.string(),
  // 表示・分類
  category: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  portrait_url: z.string().min(1),
});
export type RecordActorRequest = z.infer<typeof RecordActorRequestSchema>;

export const RecordActorResponseSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  message: z.string(),
});
export type RecordActorResponse = z.infer<typeof RecordActorResponseSchema>;

// 役者承認リクエスト（管理者用）
export const ApproveActorRequestSchema = z.object({
  actor_id: z.string().uuid(),
  approve: z.boolean(),
});
export type ApproveActorRequest = z.infer<typeof ApproveActorRequestSchema>;

export const ApproveActorResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  rewarded: z.boolean().optional(),
});
export type ApproveActorResponse = z.infer<typeof ApproveActorResponseSchema>;

// 役者一覧取得リクエスト
export const ListActorsRequestSchema = z.object({
  category: z.string().optional(),
  approved_only: z.boolean().optional().default(true),
  limit: z.number().optional().default(100),
  offset: z.number().optional().default(0),
});
export type ListActorsRequest = z.infer<typeof ListActorsRequestSchema>;

// 役者データ
export const ActorSchema = z.object({
  id: z.string(),
  // CharacterBaseからの情報
  name: z.string(),
  personality: z.string(),
  appearance: z.string(),
  theme_color: z.string(),
  // 表示・分類
  category: z.string(),
  display_name: z.string(),
  description: z.string(),
  portrait_url: z.string(),
  // 作者情報
  author_username: z.string(),
  author_display_name: z.string(),
});
export type Actor = z.infer<typeof ActorSchema>;

export const ListActorsResponseSchema = z.object({
  actors: z.array(ActorSchema),
  total: z.number(),
});
export type ListActorsResponse = z.infer<typeof ListActorsResponseSchema>;
