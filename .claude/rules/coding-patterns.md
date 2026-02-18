# Coding Patterns

## Backend (Node.js / CommonJS)

- Use `require()` / `module.exports` — no ES Modules in backend
- Express error handling: wrap all route handlers in `try/catch`, return `res.status(code).json({ error, details })`
- Use constants from `src/constants.js` — never hardcode field types, override sections, or default values
- Config validation lives in `src/config.js` — route handlers call these validators, don't inline validation
- Processing pipeline modules (`processor.js`, `parallel-processor.js`) are pure business logic — no Express refs

## Frontend (Browser / ES Modules)

- Use `import` / `export` — native ES Modules, no bundler
- All modules live in `public/modules/` and are loaded via `<script type="module">`
- DOM manipulation: use `createElement`/`textContent`/`appendChild` — never use `innerHTML`
- Use `EditorState` from `editor-state.js` for any editor section with save/discard
- UI helpers from `ui-utils.js`: `showAlert()`, `addLogEntry()`, `clearLog()`, `escapeHtml()`
- Frontend constants from `public/modules/constants.js`: `KNOWN_MODELS`, `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`

## Constants Sync

Backend and frontend constants must stay in sync:

- `src/constants.js` (CommonJS) — source of truth for `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`, `DEFAULT_MODEL`
- `public/modules/constants.js` (ES Modules) — mirrors these for the frontend

When adding a new field type or override section, update **both** files.

## File Naming

- All files use `kebab-case` (e.g., `client-manager.js`, `result-manager.js`)
- Module files match their primary export concept (e.g., `csv-logger.js` exports `appendInvoiceRow`)

## Module Pattern

Each frontend module follows this pattern:

```js
// Private state
let domRefs, moduleState;

// Public init (called once from app.js)
export function initMyModule() {
    /* grab DOM refs, wire events */
}

// Public data loader (called lazily)
export async function loadMyData() {
    /* fetch and render */
}

// Public state queries
export function hasUnsavedMyChanges() {
    /* return boolean */
}
export function discardMyChanges() {
    /* revert edits */
}
```
