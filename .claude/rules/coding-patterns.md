# Coding Patterns

## Backend (Node.js / TypeScript ESM)

- Use `import` / `export` — all backend code is ESM TypeScript
- All relative imports must use `.js` extension: `import { foo } from './bar.js'`
- Use `import.meta.url` + `fileURLToPath` instead of `__dirname`/`__filename`
- Express error handling: wrap all route handlers in `try/catch`, return `res.status(code).json({ error, details })`
- Use constants from `src/constants.ts` — never hardcode field types, override sections, or default values
- Config validation lives in `src/config.ts` — route handlers call these validators, don't inline validation
- Processing pipeline modules (`processor.ts`, `parallel-processor.ts`) are pure business logic — no Express refs
- Type all function parameters and return types using shared types from `src/types/`
- For error handling in catch blocks, cast to `Error`: `(error as Error).message`

## Frontend (TypeScript → Browser ES Modules)

- Source files live in `src/frontend/`, compiled by `tsc` to `public/`
- Use `import` / `export` with `.js` extensions in import paths
- DOM manipulation: use `createElement`/`textContent`/`appendChild` — never use `innerHTML`
- Use `EditorState` from `editor-state.js` for any editor section with save/discard
- UI helpers from `ui-utils.js`: `showAlert()`, `addLogEntry()`, `clearLog()`, `escapeHtml()`
- Frontend constants from `src/frontend/modules/constants.ts`: `KNOWN_MODELS`, `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`
- Type DOM element refs: `HTMLButtonElement`, `HTMLInputElement`, `HTMLSelectElement`, etc.
- For event listeners, use `Event` type and cast inside: `const ke = e as KeyboardEvent`

## Constants Sync

Backend and frontend constants must stay in sync:

- `src/constants.ts` — source of truth for `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`, `DEFAULT_MODEL`
- `src/frontend/modules/constants.ts` — mirrors these for the frontend

When adding a new field type or override section, update **both** files.

## File Naming

- All files use `kebab-case` (e.g., `client-manager.ts`, `result-manager.ts`)
- Module files match their primary export concept (e.g., `csv-logger.ts` exports `appendInvoiceRow`)

## Type Definitions

- Shared types live in `src/types/` (config.ts, client.ts, processing.ts, index.ts)
- Import types with `import type { ... } from './types/index.js'`
- For dynamic objects, use `Record<string, unknown>` over `any`
- For JSON.parse results, cast to the appropriate type

## Module Pattern

Each frontend module follows this pattern:

```ts
// Private state
let domRefs: HTMLElement | null;
let moduleState: SomeType;

// Public init (called once from app.ts)
export function initMyModule(): void {
    /* grab DOM refs, wire events */
}

// Public data loader (called lazily)
export async function loadMyData(): Promise<void> {
    /* fetch and render */
}

// Public state queries
export function hasUnsavedMyChanges(): boolean {
    /* return boolean */
}
export function discardMyChanges(): void {
    /* revert edits */
}
```
