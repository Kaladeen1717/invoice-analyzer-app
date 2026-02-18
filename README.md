# Invoice Analyzer App

A local application that analyzes invoice PDFs using Google's Gemini Vision API. Supports multi-client management with both a web-based Admin UI and CLI for batch processing.

**Model:** `gemini-2.5-flash-preview-05-20`

## Features

- Analyzes PDF invoices (text-based and image-based)
- Uses Gemini Vision for intelligent OCR and data extraction
- Adds analysis summary to processed PDFs
- Automatically renames files: `SupplierName - YYYY.MM.DD - InvoiceID - Currency - Amount.pdf`
- Multi-client support with individual configurations
- Admin Web UI for client management and processing
- CLI for batch processing and automation
- CSV logging of processed invoices

## Prerequisites

- Node.js (v18 or higher)
- Google AI Studio API Key

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

- **Client List** - View all configured clients with status indicators
- **Create/Edit Clients** - Add new clients or modify existing ones
- **Process Invoices** - Run processing with real-time progress streaming
- **Processing Log** - View live output during processing

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
- Never commit your `.env` file to version control

## License

ISC
