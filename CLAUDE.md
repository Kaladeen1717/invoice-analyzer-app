# Invoice Analyzer App

## Project Context

Local application that analyzes invoice PDFs using Google's Gemini Vision API. Supports multi-client management with both a web-based Admin UI and CLI for batch processing.

- **Model**: `gemini-3-flash-preview` (configurable per-client)
- **Runtime**: Node.js (v18+)
- **Server**: Express.js on port 3000 (configurable via `PORT` in `.env`)
- **Backend**: CommonJS modules (`require`/`module.exports`)
- **Frontend**: ES Modules (`import`/`export`, no bundler)

## Tech Stack

- `@google/generative-ai` — Gemini Vision API client
- `express` — Web server and REST API
- `pdf-lib` — PDF manipulation (embedding analysis)
- `p-limit` — Concurrency control for parallel processing
- `dotenv` — Environment variable loading
- `eslint` + `prettier` — Code quality and formatting
- `jest` — Unit testing
- `knip` — Dead code and dependency detection

## Project Structure

```
server.js               — Express server, REST API endpoints (29 endpoints), SSE streaming
batch-process.js        — CLI entry point for batch invoice processing
config.json             — Global processing configuration (not committed)
.env                    — API keys and port (never commit)

src/
  constants.js          — Shared backend constants (field types, override sections, defaults)
  config.js             — Configuration loader, validator, export/import/backup
  client-manager.js     — Multi-client config discovery, merge, overrides
  processor.js          — Single invoice processing (Vision API call, PDF enrichment)
  parallel-processor.js — Concurrent processing with retry logic
  prompt-builder.js     — Gemini API prompt construction from config
  filename-generator.js — Dynamic filename from extracted data + template
  csv-logger.js         — CSV logging of processed invoices
  result-manager.js     — Processing result storage and retrieval (per-client JSON)

public/
  app.js                — Thin orchestrator (~160 lines): init, tab switching, keyboard shortcuts
  index.html            — Admin UI markup
  styles.css            — UI styles
  modules/
    state.js            — Shared reactive state object
    constants.js        — Frontend constants (KNOWN_MODELS, VALID_FIELD_TYPES)
    ui-utils.js         — escapeHtml, showAlert, addLogEntry helpers
    editor-state.js     — Reusable EditorState class (save/discard/hasChanges pattern)
    table-editor.js     — Generic click-to-edit table cell handler
    field-editor.js     — Global field definitions editor
    tag-editor.js       — Global tag definitions editor
    prompt-editor.js    — Prompt template editor (structured + raw mode)
    model-editor.js     — Global model selector
    filename-editor.js  — Filename template editor with placeholder chips
    export-import.js    — Config export/import/backup management
    client-list.js      — Dashboard: client cards, CRUD, processing with SSE
    client-detail.js    — Client detail: view config, customize/reset overrides
    results-viewer.js   — Processing history viewer with filtering, retry, pagination

clients/                — Per-client JSON config files (e.g., duffbeauty.json)
tests/                  — Unit tests (Jest)
scripts/                — Utility scripts (migrate-clients.js)
```

## Architecture

### Processing Pipeline

```
PDF input → processor.analyzeInvoice()
              → prompt-builder.buildExtractionPrompt(config)
              → Gemini Vision API
              → prompt-builder.parseGeminiResponse()
              → prompt-builder.validateAnalysis()
              → filename-generator.generateFormattedFilename()
              → processor.addSummaryToPdf()
              → csv-logger.appendInvoiceRow()
```

### Backend Module Dependencies

```
server.js
  ├── src/constants.js        (VALID_OVERRIDE_SECTIONS, defaults)
  ├── src/config.js           (load, save, validate, export/import/backup)
  ├── src/client-manager.js   (CRUD, merge config, overrides)
  ├── src/prompt-builder.js   (prompt preview)
  └── src/parallel-processor.js
        ├── src/processor.js  (analyze, enrich PDF)
        │     ├── src/prompt-builder.js
        │     └── src/filename-generator.js
        └── src/csv-logger.js
```

### Frontend Module Dependencies

```
app.js (orchestrator)
  ├── modules/ui-utils.js
  ├── modules/table-editor.js
  ├── modules/field-editor.js    → editor-state, ui-utils, constants
  ├── modules/tag-editor.js      → editor-state, ui-utils, constants
  ├── modules/prompt-editor.js   → ui-utils
  ├── modules/model-editor.js    → ui-utils, constants
  ├── modules/filename-editor.js → ui-utils
  ├── modules/export-import.js   → ui-utils
  ├── modules/client-list.js     → ui-utils, client-detail, export-import
  └── modules/client-detail.js   → ui-utils, constants
```

### Constants Pattern

Constants are split across two files that must be kept in sync:

- **Backend**: `src/constants.js` (CommonJS) — `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`, `DEFAULT_MODEL`, default folder/CSV names
- **Frontend**: `public/modules/constants.js` (ES Modules) — `KNOWN_MODELS`, `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`

When adding a new field type or override section, update both files.

## Development Workflow

- Always reference a Linear ticket ID when working on planned work
- Use conventional commits with ticket reference (see Linear rules)
- Branch from `main` for each ticket
- Dev server: `npm run dev` (auto-restarts via nodemon)
- Test changes: open `http://localhost:3000` (UI) or `node batch-process.js --list` (CLI)

### Pre-commit Checks

Run before every commit:

```bash
npm run lint && npm run format:check && npm test && npx knip
```

Or use the `/run-checks` skill to run all checks and get a summary.

### CI Pipeline

On every PR to `main`, GitHub Actions runs:

1. **lint-and-test** (Node 18 + 20): `npm ci` → `npm run lint` → `npm run format:check` → `npm test`
2. **security**: `npm audit` → `npx knip` → TruffleHog (secret scanning) → Semgrep (static analysis)
3. **codeql**: GitHub CodeQL security analysis

## Linear Integration

- **Team**: Invoice Analyzer | **Prefix**: `INV`
- See `.claude/rules/linear-workflow.md` for full workflow rules
- Commit format: `{type}(INV-{number}): {description}`
- Branch format: `{type}/INV-{number}-{short-description}`

## Common Development Tasks

### Adding a new API endpoint

1. Add route in `server.js` in the appropriate section (client management, global config, processing)
2. Follow the try-catch pattern with consistent error responses:

```js
app.get('/api/example/:id', async (req, res) => {
    try {
        const result = await someOperation(req.params.id);
        res.json(result);
    } catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to ...', details: error.message });
    }
});
```

### Adding a new UI editor section

1. Create `public/modules/my-editor.js`
2. Import from `ui-utils.js` (`showAlert`), `editor-state.js` (`EditorState`), `constants.js` as needed
3. Own all state and DOM refs inside the module (set in `initMyEditor()`)
4. Export: `initMyEditor`, `loadMyData`, `isMyDataLoaded`, `invalidateMyData`, `hasUnsavedMyChanges`, `discardMyChanges`
5. Import and wire up in `app.js`: call init in `DOMContentLoaded`, add to `switchTab` lazy loading and unsaved-changes check
6. Add HTML section in `index.html`, styles in `styles.css`

### Adding a new client config override section

1. Add section name to `VALID_OVERRIDE_SECTIONS` in `src/constants.js` AND `public/modules/constants.js`
2. Backend: add merge logic in `client-manager.js` → `getClientConfig()` and `getAnnotatedClientConfig()`
3. Backend: add save/remove cases in `saveClientOverrides()` and `removeClientOverrides()`
4. Frontend: add customize/reset UI in `client-detail.js`

### Adding a new extraction field

No code changes needed — add the field to `fieldDefinitions` in config.json via the UI or API. The processing pipeline handles it automatically:

- `prompt-builder.js` includes it in the prompt
- `processor.js` passes it through
- `filename-generator.js` can reference it via `{fieldKey}` in templates
- `csv-logger.js` adds a column for it

### Extending the processing pipeline

- To modify extraction: edit `prompt-builder.js` (`buildExtractionPrompt`, `validateAnalysis`)
- To modify output files: edit `processor.js` (`addSummaryToPdf`) or `csv-logger.js`
- To modify filename generation: edit `filename-generator.js` (`formatFieldValue`, `generateFormattedFilename`)

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage report
```

- Tests live in `tests/` mirroring `src/` modules
- Focus on pure function tests — no network calls, no external dependencies
- Current coverage: `filename-generator`, `prompt-builder`, `config` validation
- Mock `fs` only when testing file I/O functions

## Coding Conventions

- Backend: CommonJS `require()` / `module.exports`
- Frontend: ES Modules `import` / `export` (native, no bundler)
- Frontend DOM: use `createElement`/`textContent`/`appendChild` — avoid `innerHTML`
- Express route handlers in `server.js`, business logic in `src/` modules
- Client configs in `clients/*.json` — do not modify without explicit request
- Secrets in `.env`, app settings in `config.json` — never commit either
- Error handling: try-catch with meaningful messages in processing pipeline
- Run `npm run lint` and `npm run format` to check code quality
