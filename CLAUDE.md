# Invoice Analyzer App

## Project Context

Local application that analyzes invoice PDFs using Google's Gemini Vision API. Supports multi-client management with both a web-based Admin UI and CLI for batch processing.

- **Model**: `gemini-2.5-flash-preview-05-20`
- **Runtime**: Node.js (v18+), CommonJS modules
- **Server**: Express.js on port 3000 (configurable via `PORT` in `.env`)

## Tech Stack

- `@google/generative-ai` — Gemini Vision API client
- `express` — Web server and REST API
- `pdf-lib` — PDF manipulation (embedding analysis)
- `pdf-parse` — PDF text extraction
- `p-limit` — Concurrency control for parallel processing
- `multer` — File upload handling
- `dotenv` — Environment variable loading

## Project Structure

```
server.js               — Express server, REST API endpoints, SSE streaming
batch-process.js        — CLI entry point for batch invoice processing
config.json             — Global processing configuration
.env                    — API keys and port (never commit)

src/
  config.js             — Configuration loader and validator
  client-manager.js     — Multi-client config discovery and validation
  processor.js          — Single invoice processing (Vision API call)
  parallel-processor.js — Concurrent processing with retry logic
  prompt-builder.js     — Gemini API prompt construction
  filename-generator.js — Dynamic filename from extracted data
  csv-logger.js         — CSV logging of processed invoices

public/                 — Web Admin UI (HTML, JS, CSS)
clients/                — Per-client JSON config files (e.g., duffbeauty.json)
scripts/                — Utility scripts (migrate-clients.js)
```

## Linear Integration

- **Team**: Invoice Analyzer | **Prefix**: `INV`
- See `.claude/rules/linear-workflow.md` for full workflow rules
- Commit format: `{type}(INV-{number}): {description}`
- Branch format: `{type}/INV-{number}-{short-description}`

## Development Workflow

- Always reference a Linear ticket ID when working on planned work
- Use conventional commits with ticket reference (see Linear rules)
- Branch from `main` for each ticket
- Dev server: `npm run dev` (auto-restarts via nodemon) or `/dev-server start|stop|restart`
- Test changes: open `http://localhost:3000` (UI) or `node batch-process.js --list` (CLI)

## Coding Conventions

- CommonJS `require()` / `module.exports` — not ES modules
- Express route handlers in `server.js`, business logic in `src/` modules
- Client configs in `clients/*.json` — do not modify without explicit request
- Secrets in `.env`, app settings in `config.json` — never commit either
- Error handling: try-catch with meaningful messages in processing pipeline
