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
- `express-rate-limit` — Rate limiting for processing endpoints
- `pdf-lib` — PDF manipulation (embedding analysis)
- `p-limit` — Concurrency control for parallel processing
- `sanitize-filename` — Path traversal prevention (CodeQL-recognized sanitizer)
- `dotenv` — Environment variable loading
- `eslint` + `prettier` — Code quality and formatting
- `jest` — Unit and API integration testing
- `supertest` — HTTP assertion library for Express endpoint tests (dev)
- `knip` — Dead code and dependency detection

## Project Structure

```
server.js               — Express server, REST API endpoints (32 endpoints), SSE streaming, exports app
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

clients/                — Per-client JSON config files (gitignored, not committed)
tests/                  — Unit tests (Jest), mirrors src/ structure
  api/                  — Supertest API endpoint tests (clients, config, processing, results, health)
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

- **Backend**: `src/constants.js` (CommonJS) — `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`, `DEFAULT_MODEL`, default folder/CSV names, `safeJoin` path sanitizer
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

Triggers on both PRs to `main` and pushes to `main`. GitHub Actions runs:

1. **lint-and-test** (Node 18 + 20): `npm ci` → `npm run lint` → `npm run format:check` → `npm test`
2. **security**: `npm audit --omit=dev` → `npx knip` → TruffleHog (full history, `fetch-depth: 0`) → Semgrep (`p/owasp-top-ten`, `p/javascript`, `p/secrets`)
3. **codeql**: GitHub CodeQL security analysis — results appear in the repo's Security tab

### Security Scanning

The repo is **public** with GitHub Advanced Security features enabled for free:

- **CodeQL** — deep taint-tracking analysis. Alerts appear in Security tab → Code scanning. Can be queried via `gh api repos/{owner}/{repo}/code-scanning/alerts`.
- **TruffleHog** — secret scanning across full git history (catches deleted secrets). Uses `--only-verified` and `continue-on-error: true`.
- **Semgrep** — static analysis with explicit rulesets (OWASP, JavaScript, secrets). Uses `continue-on-error: true`.
- **Dependabot** — automatic dependency vulnerability alerts and fix PRs. Check via Security tab → Dependabot.
- **Secret scanning + push protection** — GitHub-native, blocks pushes containing detected secrets.

#### Responding to security alerts

- **CodeQL path injection (`js/path-injection`)**: Use `sanitize-filename` on user input before building file paths. CodeQL recognizes this package as a sanitizer. Custom helpers like `safeJoin` (in `constants.js`) provide defense-in-depth but are NOT recognized by CodeQL across module boundaries.
- **CodeQL rate limiting (`js/missing-rate-limiting`)**: Apply `processingLimiter` middleware (defined in `server.js`) to new routes that do file I/O.
- **False positives**: Dismiss via GitHub API with a reason: `gh api repos/{owner}/{repo}/code-scanning/alerts/{n} -X PATCH -f state=dismissed -f "dismissed_reason=false positive" -f "dismissed_comment=..."`.
- **npm audit**: CI runs `--omit=dev` to avoid false positives from dev-only dependencies (e.g., ajv in eslint). Fix production vulnerabilities with `npm audit fix`.

#### Path sanitization pattern

All functions that build file paths from user input (clientId, backupId, label) use two layers:

```js
const sanitize = require('sanitize-filename'); // Layer 1: CodeQL-recognized sanitizer
const { safeJoin } = require('./constants'); // Layer 2: path.resolve + startsWith check

const filePath = safeJoin(baseDir, `${sanitize(userInput)}.json`);
```

When adding new endpoints or functions that take user input and build file paths, always apply both layers.

## Linear Integration

- **Team**: Invoice Analyzer | **Prefix**: `INV`
- See `.claude/rules/linear-workflow.md` for full workflow rules, ticket description standards, and quality requirements
- Commit format: `{type}(INV-{number}): {description}`
- Branch format: `{type}/INV-{number}-{short-description}`

## Common Development Tasks

### Adding a new API endpoint

1. Add route in `server.js` in the appropriate section (client management, global config, processing)
2. Add `processingLimiter` middleware if the route does file I/O or heavy processing
3. Follow the try-catch pattern with consistent error responses:

```js
app.get('/api/example/:id', processingLimiter, async (req, res) => {
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

4. Add Supertest tests in the appropriate `tests/api/*.test.js` file (see "Adding tests for a new endpoint")

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

### Unit tests (`tests/*.test.js`)

- Mirror `src/` modules: `src/foo.js` → `tests/foo.test.js`
- Pure function tests — no network calls, no external dependencies
- Current coverage: `filename-generator`, `prompt-builder`, `config`, `result-manager`
- Mock `fs` only when testing file I/O functions

### API endpoint tests (`tests/api/*.test.js`)

- Use Supertest against the Express `app` (exported from `server.js` behind `require.main === module` guard)
- Mock backend modules at module level: `jest.mock('../../src/client-manager')`, `jest.mock('../../src/config')`, etc.
- No filesystem or network side effects — all dependencies are mocked
- Current coverage: all 32 endpoints across 5 test files (134 tests)

**Test file → endpoint mapping:**

| File                 | Endpoints                                                                    |
| -------------------- | ---------------------------------------------------------------------------- |
| `clients.test.js`    | 9 Client CRUD + overrides                                                    |
| `config.test.js`     | 15 Global config (fields, tags, prompt, model, output, export/import/backup) |
| `processing.test.js` | 3 SSE (process, process-all, retry) + files listing                          |
| `results.test.js`    | Results pagination, summary, aggregate stats                                 |
| `health.test.js`     | Health check                                                                 |

**Key patterns:**

- SSE endpoints return `text/event-stream` — parse with: `res.text.split('\n\n').filter(c => c.startsWith('data: ')).map(c => JSON.parse(c.replace('data: ', '')))`
- Use unique client IDs per SSE test to avoid `activeProcessing` Map collisions across tests
- When mocking `fs` for endpoints that coexist with `express.static`, preserve the real module: `jest.mock('fs', () => ({ ...jest.requireActual('fs'), promises: { access: jest.fn(), ... } }))`
- Error routing convention: `error.message.includes('not found')` → 404, `'already exists'` → 409, else 400 or 500

### Adding tests for a new endpoint

1. Identify which `tests/api/*.test.js` file covers the endpoint group
2. Add mock setup in `beforeEach` if the endpoint uses new dependencies
3. Write happy-path test, then error cases (400, 404, 500)
4. For SSE endpoints: mock callbacks (`onProgress`, `onComplete`) and parse event stream
5. Run `npm test` to verify

## Coding Conventions

- Backend: CommonJS `require()` / `module.exports`
- Frontend: ES Modules `import` / `export` (native, no bundler)
- Frontend DOM: use `createElement`/`textContent`/`appendChild` — avoid `innerHTML`
- Express route handlers in `server.js`, business logic in `src/` modules
- Client configs in `clients/*.json` — gitignored, never commit (contain personal data)
- Secrets in `.env`, app settings in `config.json` — never commit either
- Error handling: try-catch with meaningful messages in processing pipeline
- Path safety: always use `sanitize(userInput)` + `safeJoin(baseDir, segment)` when building paths from user input
- Rate limiting: apply `processingLimiter` middleware to routes that do file I/O or heavy processing
- Run `npm run lint` and `npm run format` to check code quality
