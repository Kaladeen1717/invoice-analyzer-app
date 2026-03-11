# Invoice Analyzer App

## Project Context

Local application that analyzes invoice PDFs using Google's Gemini Vision API. Supports multi-client management with both a web-based Admin UI and CLI for batch processing.

- **Model**: `gemini-3-flash-preview` (configurable per-client)
- **Runtime**: Node.js (v18+)
- **Server**: Express.js on port 3000 (configurable via `PORT` in `.env`)
- **Backend**: TypeScript with ESM (`import`/`export`), compiled via `tsx`
- **Frontend**: TypeScript source in `src/frontend/`, compiled to `public/` ES Modules

## Tech Stack

- `typescript` — Type-safe development across backend, frontend, and scripts
- `tsx` — TypeScript execution (dev server, scripts). Replaces `nodemon`
- `ts-jest` — Jest transformer for TypeScript tests
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
server.ts               — Express server, REST API endpoints (32 endpoints), SSE streaming, exports app
batch-process.ts        — CLI entry point for batch invoice processing
config.json             — Global processing configuration (not committed)
.env                    — API keys and port (never commit)
tsconfig.json           — TypeScript configuration (ESM, strict mode)
dist/                   — Compiled JavaScript output (gitignored)

src/
  types/                — Shared TypeScript type definitions
  constants.ts          — Shared backend constants (field types, override sections, defaults)
  config.ts             — Configuration loader, validator, export/import/backup
  client-manager.ts     — Multi-client config discovery, merge, overrides
  processor.ts          — Single invoice processing (Vision API call, PDF enrichment)
  parallel-processor.ts — Concurrent processing with retry logic
  prompt-builder.ts     — Gemini API prompt construction from config
  filename-generator.ts — Dynamic filename from extracted data + template
  csv-logger.ts         — CSV logging of processed invoices
  result-manager.ts     — Processing result storage and retrieval (per-client JSON)
  frontend/             — Frontend TypeScript source (compiled to public/)
    app.ts              — Thin orchestrator (~160 lines): init, tab switching, keyboard shortcuts
    modules/
      state.ts          — Shared reactive state object
      constants.ts      — Frontend constants (KNOWN_MODELS, VALID_FIELD_TYPES)
      ui-utils.ts       — escapeHtml, showAlert, addLogEntry helpers
      editor-state.ts   — Reusable EditorState class (save/discard/hasChanges pattern)
      table-editor.ts   — Generic click-to-edit table cell handler
      field-editor.ts   — Global field definitions editor
      tag-editor.ts     — Global tag definitions editor
      prompt-editor.ts  — Prompt template editor (structured + raw mode)
      model-editor.ts   — Global model selector
      filename-editor.ts — Filename template editor with placeholder chips
      export-import.ts  — Config export/import/backup management
      client-list.ts    — Dashboard: client cards, CRUD, processing with SSE
      client-detail.ts  — Client detail: view config, customize/reset overrides
      results-viewer.ts — Processing history viewer with filtering, retry, pagination

public/                 — Compiled frontend output (served by Express)
  app.js                — Compiled from src/frontend/app.ts
  index.html            — Admin UI markup
  styles.css            — UI styles
  modules/              — Compiled frontend modules

clients/                — Per-client JSON config files (gitignored, not committed)
tests/                  — Unit tests (Jest + ts-jest), mirrors src/ structure
  api/                  — Supertest API endpoint tests (clients, config, processing, results, health)
scripts/                — Utility TypeScript scripts (run via npx tsx)
  migrate-clients.ts    — Legacy clients.json to individual files
  migrate-client-overrides.ts — Simplify client override storage
  migrate-tag-output.ts — Move tag output properties to top-level
  generate-truth.ts     — Generate ground truth files for eval corpus
  eval-quality.ts       — Extraction quality evaluation against ground truth
  research-multi-agent.ts — Multi-agent extraction research harness
  create-test-invoice.ts — Create sample test invoice PDF
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

- **Backend**: `src/constants.ts` (ESM) — `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`, `DEFAULT_MODEL`, default folder/CSV names, `safeJoin` path sanitizer
- **Frontend**: `src/frontend/modules/constants.ts` (compiled to `public/modules/constants.js`) — `KNOWN_MODELS`, `VALID_FIELD_TYPES`, `VALID_OVERRIDE_SECTIONS`

When adding a new field type or override section, update both files.

## Development Workflow

- Always reference a Linear ticket ID when working on planned work
- Use conventional commits with ticket reference (see Linear rules)
- Branch from `main` for each ticket
- Dev server: `npm run dev` (auto-restarts via `tsx watch`)
- Build: `npm run build` (compile TypeScript), `npm run build:frontend` (frontend only)
- Typecheck: `npm run typecheck` (no emit, verification only)
- Test changes: open `http://localhost:3000` (UI) or `npx tsx batch-process.ts --list` (CLI)

### Pre-commit Checks

Run before every commit:

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npx knip
```

Or use the `/run-checks` skill to run all checks and get a summary.

### CI Pipeline

Triggers on both PRs to `main` and pushes to `main`. GitHub Actions runs:

1. **lint-and-test** (Node 18 + 20): `npm ci` → `npm run build:frontend` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`
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

```ts
import sanitize from 'sanitize-filename'; // Layer 1: CodeQL-recognized sanitizer
import { safeJoin } from './constants.js'; // Layer 2: path.resolve + startsWith check

const filePath = safeJoin(baseDir, `${sanitize(userInput)}.json`);
```

When adding new endpoints or functions that take user input and build file paths, always apply both layers.

## Linear Integration

- **Team**: Invoice Analyzer | **Prefix**: `INV`
- **Labels**: bug, feature, improvement, chore, docs, research
- See `.claude/rules/linear-workflow.md` for full workflow rules, ticket description standards, and quality requirements
- Commit format: `{type}(INV-{number}): {description}`
- Branch format: `{type}/INV-{number}-{short-description}`

## Common Development Tasks

### Adding a new API endpoint

1. Add route in `server.js` in the appropriate section (client management, global config, processing)
2. Add `processingLimiter` middleware if the route does file I/O or heavy processing
3. Follow the try-catch pattern with consistent error responses:

```ts
app.get('/api/example/:id', processingLimiter, async (req: Request, res: Response) => {
    try {
        const result = await someOperation(req.params.id);
        res.json(result);
    } catch (error) {
        if ((error as Error).message.includes('not found')) {
            return res.status(404).json({ error: (error as Error).message });
        }
        res.status(500).json({ error: 'Failed to ...', details: (error as Error).message });
    }
});
```

4. Add Supertest tests in the appropriate `tests/api/*.test.ts` file (see "Adding tests for a new endpoint")

### Adding a new UI editor section

1. Create `src/frontend/modules/my-editor.ts`
2. Import from `ui-utils.js` (`showAlert`), `editor-state.js` (`EditorState`), `constants.js` as needed
3. Own all state and DOM refs inside the module (set in `initMyEditor()`)
4. Export: `initMyEditor`, `loadMyData`, `isMyDataLoaded`, `invalidateMyData`, `hasUnsavedMyChanges`, `discardMyChanges`
5. Import and wire up in `app.js`: call init in `DOMContentLoaded`, add to `switchTab` lazy loading and unsaved-changes check
6. Add HTML section in `index.html`, styles in `styles.css`

### Adding a new client config override section

1. Add section name to `VALID_OVERRIDE_SECTIONS` in `src/constants.ts` AND `src/frontend/modules/constants.ts`
2. Backend: add merge logic in `client-manager.js` → `getClientConfig()` and `getAnnotatedClientConfig()`
3. Backend: add save/remove cases in `saveClientOverrides()` and `removeClientOverrides()`
4. Frontend: add customize/reset UI in `client-detail.js`

### Adding a new extraction field

No code changes needed — add the field to `fieldDefinitions` in config.json via the UI or API. The processing pipeline handles it automatically:

- `prompt-builder.ts` includes it in the prompt
- `processor.ts` passes it through
- `filename-generator.ts` can reference it via `{fieldKey}` in templates
- `csv-logger.ts` adds a column for it

### Extending the processing pipeline

- To modify extraction: edit `prompt-builder.ts` (`buildExtractionPrompt`, `validateAnalysis`)
- To modify output files: edit `processor.ts` (`addSummaryToPdf`) or `csv-logger.ts`
- To modify filename generation: edit `filename-generator.ts` (`formatFieldValue`, `generateFormattedFilename`)

### Rate limit handling

The processing pipeline detects Gemini API rate limits (429) and uses adaptive backoff:

- **Detection** (`src/processor.ts`): In `processInvoice()` catch block, errors containing `429`, `RATE_LIMIT`, or `Resource has been exhausted` are tagged with `isRateLimited: true` on the result object.
- **Adaptive backoff** (`src/parallel-processor.ts`): `processWithRetry()` checks `result.isRateLimited` and uses 3x exponential backoff (1s → 3s → 9s) instead of the standard 2x (1s → 2s → 4s) for other errors.
- **Concurrency**: Controlled by `config.processing.concurrency` (default 5) via `p-limit`. Express-level rate limiting (30 req/60s) is handled separately by `processingLimiter` middleware.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage report
```

### Unit tests (`tests/*.test.ts`)

- Mirror `src/` modules: `src/foo.ts` → `tests/foo.test.ts`
- Pure function tests — no network calls, no external dependencies
- Current coverage: `filename-generator`, `prompt-builder`, `config`, `result-manager`
- Mock `fs` only when testing file I/O functions

### API endpoint tests (`tests/api/*.test.ts`)

- Use Supertest against the Express `app` (exported from `server.ts` behind `import.meta.url` guard)
- Mock backend modules at module level: `jest.mock('../../src/client-manager.js')`, `jest.mock('../../src/config.js')`, etc.
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
- When mocking `fs` for endpoints that coexist with `express.static`, preserve the real module: `jest.mock('fs', () => ({ ...jest.requireActual('fs'), promises: { access: jest.fn(), ... } }))`. Use `jest.mocked()` for typed mock access.
- Error routing convention: `error.message.includes('not found')` → 404, `'already exists'` → 409, else 400 or 500

### Adding tests for a new endpoint

1. Identify which `tests/api/*.test.ts` file covers the endpoint group
2. Add mock setup in `beforeEach` if the endpoint uses new dependencies
3. Write happy-path test, then error cases (400, 404, 500)
4. For SSE endpoints: mock callbacks (`onProgress`, `onComplete`) and parse event stream
5. Run `npm test` to verify

## Coding Conventions

- Backend: TypeScript ESM `import` / `export` (compiled via `tsx`)
- Frontend: TypeScript source in `src/frontend/`, compiled to `public/` ES Modules
- All relative imports must use `.js` extension (Node ESM resolution)
- Use `import.meta.url` + `fileURLToPath` instead of `__dirname`/`__filename`
- Frontend DOM: use `createElement`/`textContent`/`appendChild` — avoid `innerHTML`
- Express route handlers in `server.ts`, business logic in `src/` modules
- Client configs in `clients/*.json` — gitignored, never commit (contain personal data)
- Secrets in `.env`, app settings in `config.json` — never commit either
- Error handling: try-catch with meaningful messages in processing pipeline
- Path safety: always use `sanitize(userInput)` + `safeJoin(baseDir, segment)` when building paths from user input
- Rate limiting: apply `processingLimiter` middleware to routes that do file I/O or heavy processing
- Run `npm run lint` and `npm run format` to check code quality
