# Invoice Analyzer App

A local application that analyzes invoice PDFs using Google's Gemini Vision API. Supports multi-client management with both a web-based Admin UI and CLI for batch processing.

**Default model:** `gemini-3-flash-preview` (configurable per-client via the Admin UI)

## Features

- Analyzes PDF invoices (text-based and image-based)
- Uses Gemini Vision for intelligent OCR and data extraction
- Adds analysis summary to processed PDFs
- Automatically renames files: `SupplierName - YYYY.MM.DD - InvoiceID - Currency - Amount.pdf`
- Multi-client support with individual configurations
- Admin Web UI for client management and processing
- CLI for batch processing and automation
- CSV logging of processed invoices
- Per-client config overrides (fields, tags, prompt, output, model)
- Processing history with retry support for failed invoices
- Config export/import with timestamped backups

## Prerequisites

- Node.js v18 or higher (tested on 18 and 20)
- Google AI Studio API Key ([get one here](https://aistudio.google.com/apikey))

## Setup

1. **Install Dependencies**

    ```bash
    npm install
    ```

2. **Configure API Key**

    ```bash
    cp .env.example .env
    ```

    Get your API key from [Google AI Studio](https://aistudio.google.com/apikey) and add to `.env`:

    ```
    GEMINI_API_KEY=your_actual_api_key_here
    ```

3. **Start the Server**

    ```bash
    npm start
    ```

4. **Open Admin UI**

    Navigate to http://localhost:3000

## Usage

### Admin Web UI

The web interface at `http://localhost:3000` provides:

- **Dashboard** - View all configured clients with status and PDF counts
- **Client Management** - Create, edit, delete clients with per-client overrides
- **Process Invoices** - Run processing with real-time SSE progress streaming
- **Processing History** - View results, filter by status, retry failed invoices
- **Global Config** - Edit field definitions, tags, prompt templates, filename patterns, model
- **Export/Import** - Backup and restore configurations

### CLI Batch Processing

```bash
# List all configured clients
node batch-process.js --list

# Process all enabled clients
node batch-process.js

# Process a specific client
node batch-process.js --client <client-id>
```

## Client Configuration

Clients are stored as individual JSON files in the `clients/` directory. See `clients/README.md` for detailed configuration options.

### Quick Setup

Create `clients/my-company.json`:

```json
{
    "name": "My Company",
    "enabled": true,
    "folderPath": "/path/to/invoices",
    "tagOverrides": {
        "private": {
            "parameters": {
                "address": "Home Address Here"
            }
        }
    }
}
```

### Folder Structure

When processing, the following structure is created:

```
{folderPath}/
├── *.pdf                    # Input: Place new invoices here
├── processed-original/      # Original PDFs after processing
├── processed-enriched/      # PDFs with embedded analysis
└── invoice-log.csv          # Processing log
```

## File Naming Convention

Processed files are renamed as:

```
[Supplier] - [Invoice Date] - [Invoice ID] - [Currency] - [Amount].pdf
```

Example:

```
Acme Corp - 2024.01.15 - INV-2024-001 - USD - 1250.00.pdf
```

## Troubleshooting

- **API Key Issues**: Ensure your `.env` file contains a valid Gemini API key
- **Port Already in Use**: Change the PORT in `.env` to a different number
- **PDF Processing Errors**: Ensure PDFs are not password-protected
- **Folder Not Found**: Verify the `folderPath` in client config exists

## Privacy & Security

- All processing happens locally on your machine
- Your API key is stored only in your local `.env` file
- No data is sent anywhere except to Google's Gemini API for analysis
- Client configs (`clients/*.json`) are gitignored — they may contain personal data
- Never commit your `.env` or `config.json` files to version control

### CI Security

The repository runs automated security scanning on every push and PR:

- **CodeQL** — deep code analysis for vulnerabilities (injection, XSS, path traversal)
- **Semgrep** — OWASP Top 10, JavaScript-specific, and secrets rulesets
- **TruffleHog** — secret scanning across full git history
- **Dependabot** — dependency vulnerability monitoring with auto-fix PRs
- **Secret scanning + push protection** — blocks pushes containing detected secrets

## License

ISC
