# Rule

- 応答は日本語で
- git commit はuserが行う。commit message の提案を英語で書いて
- 変更内容を `change.log` に機能レベルで簡潔に追記して
- A11y警告はsvelte-ignoreでOK
- src/lib以下は他プロジェクトからライブラリとして利用される可能性があるので、svelte関連のコード(storeなど)を使わないで。

# What is this

FramePlanner is a manga creation tool that allows users to define manga frame structures as tree data (JSON) and arrange images within frames like windows. This is a Svelte-based web application with a complex layered canvas system for interactive manga editing.

## Project Structure
- `/public/` - Static assets (fonts, favicons, banners)
- `/src/assets/` - UI icons and graphics organized by feature
- `/src/lib/` - Core libraries and data models
- `/src/bookeditor/` - Main editing interface components
- `/src/utils/` - Shared utilities and dialogs
- `/documents/` - Technical documentation and SQL schemas

## Build, Test, and Development Commands
- `npm run dev`: Start Vite dev server.
- `npm run dev-https`: Local HTTPS dev using `vite.https.config.ts` and bundled certs.
- `npm run build`: Typecheck and bundle to `dist/`.
- `npm run preview`: Serve the production build locally.
- `npm run check`: Run `svelte-check` type diagnostics.
- `npm run vitest` (or `npx vitest --run`): Run unit tests.
- テスト実行時は `npx tsc --noEmit && npm run vitest -- --run` のように型チェックも併せて行うこと。
- Deploy: `npm run deploy` (publishes via Cloudflare Pages only on `sns_main`).

### Testing

Use PBT (Property Based Testing) for testing.

- `npm run vitest` - Run Vitest test runner
- Test files use `.vitest.ts` extension (see `src/lib/layeredCanvas/tools/geometry/geometry.vitest.ts`)
- Test setup configured in `test/setup.ts` with fake IndexedDB and mocked Canvas APIs

## Coding Style & Naming Conventions
- TypeScript, 2-space indentation, semicolons optional but be consistent.
- Svelte components: PascalCase (`FramePanel.svelte`). Utilities/stores: camelCase files (`fileSystem.ts`, `uiStore.ts`).
- Path aliases: `$bookTypes/*` → `src/lib/book/types/*`, `$protocolTypes/*` → `src/utils/edgeFunctions/types/*`.
- Keep UI in `.svelte`, business logic in `src/lib/**`, and side effects in `src/utils/**`.
- Styling via Tailwind/PostCSS; prefer utility classes over inline styles.

## Core Systems

**LayeredCanvas System** (`src/lib/layeredCanvas/`)
- **Paper/Layer Architecture**: Multi-layered rendering system where each "Paper" contains multiple "Layers"
- **Viewport Management**: Handles canvas transformations, scaling, and coordinate conversions
- **Event Handling**: Sophisticated pointer event system with depth-based layering
- Key files: `system/layeredCanvas.ts`, `system/paperArray.ts`

**Book Data Model** (`src/lib/book/`)
- **Book Structure**: Books contain Pages, Pages contain FrameTrees and Bubbles
- **History Management**: Undo/redo system with tagged operations
- **Media Handling**: Support for images, videos, and remote media references
- Key files: `book.ts`, `envelope.ts` (for serialization)

**File System Abstraction** (`src/lib/filesystem/`)
- **Multi-Backend Support**: IndexedDB, File System Access API, Supabase, Firebase
- **Content Storage**: Separate image storage backends (Backblaze, Firebase)
- **Versioning**: Revision-based file tracking with ULIDs and prefixes
- Key files: `fileSystem.ts`, `contentStorage/`
- **AIクイックリファレンス**: [ファイルシステム概要](./documents/filesystem-summary.md)

**Component Architecture**
- **BookEditor**: Main editing workspace (`src/bookeditor/BookWorkspace.svelte`)
- **Inspectors**: Specialized panels for bubbles, frames, and pages
- **Generators**: AI image generation integrations
- **File Manager**: Tree-based file browser with drag-and-drop

### Data Flow

1. **Store-based State**: Svelte stores manage global state (`workspaceStore.ts`, `uiStore.ts`)
2. **Canvas Rendering**: LayeredCanvas handles real-time rendering and interaction
3. **File Operations**: FileSystem abstraction handles persistence across backends
4. **History Tracking**: Operations create reversible history entries

### Key Patterns

**Bubble System**: Speech bubbles with customizable shapes, fonts, and text layout
- Shape definitions in `src/lib/layeredCanvas/tools/draw/bubbleGraphic.ts`
- Font loading and management in `src/bookeditor/fontLoading.ts`

**Frame Tree**: Hierarchical layout system for manga panels
- Tree structure in `src/lib/layeredCanvas/dataModels/frameTree.ts`
- Physical layout calculation with constraints

**Film Stack**: Layered media elements within frames
- Film compositing in `src/lib/layeredCanvas/dataModels/film.ts`
- Effect processing and transformations

## Adding New Bubble Shapes

Based on the README instructions:
1. Add shape function to `src/lib/layeredCanvas/tools/draw/bubbleGraphic.ts`
2. Add entry to `drawBubble` function in same file
3. Add shape to the list in `src/bookeditor/bubbleinspector/ShapeChooser.svelte`

## Configuration Notes

- **TypeScript**: Configured with path aliases (`$bookTypes/*`, `$protocolTypes/*`)
- **Vite**: Custom config includes Paper.js optimization and WASM asset handling
- **Tailwind CSS**: Used for styling with Skeleton UI components
- **Testing**: Vitest with jsdom environment and mocked Canvas/IndexedDB APIs

## Development Environment

- **Target**: WSL2, Ubuntu 22 (as noted in README)
- **Font Loading**: Automatic Google Fonts integration for bubble text
- **Asset Management**: WebP conversion pipeline for optimized images
- **Deployment**: Cloudflare Pages with branch-based deployment protection

## Dialog Components

### ConfirmDialog Usage
確認ダイアログを表示するには `waitDialog` 関数を使用します：

```typescript
import { waitDialog } from '../utils/waitDialog';

// 基本的な使用方法
const confirmed = await waitDialog<boolean>('confirm', {
  title: 'タイトル',
  message: 'メッセージ内容',
  positiveButtonText: 'OK',
  negativeButtonText: 'キャンセル'
});

if (confirmed) {
  // ユーザーがOKを選択した場合の処理
}
```

- `title`: ダイアログのタイトル
- `message`: 確認メッセージ（`\n` で改行可能）
- `positiveButtonText`: 確認ボタンのテキスト
- `negativeButtonText`: キャンセルボタンのテキスト
- 戻り値: `true` (確認) または `false` (キャンセル)