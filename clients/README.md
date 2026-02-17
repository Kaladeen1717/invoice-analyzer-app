# Client Configuration

This folder contains individual configuration files for each client. Each `.json` file represents one client, with the filename (without extension) serving as the client ID.

## Creating a New Client

1. Create a new file: `clients/{client-id}.json`
2. Use lowercase, hyphenated names for the client ID (e.g., `acme-corp.json`)
3. Add the required configuration (see structure below)

## Client Configuration Structure

```json
{
  "name": "Client Display Name",
  "enabled": true,
  "folderPath": "/absolute/path/to/invoice/folder",
  "privateAddressMarker": "Address to identify private invoices",
  "apiKeyEnvVar": null
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown in logs and reports |
| `enabled` | boolean | Set to `false` to skip this client during batch processing |
| `folderPath` | string | Absolute path to the folder containing invoices |
| `privateAddressMarker` | string | Address text used to identify private/personal invoices. If this text appears anywhere in the invoice, `isPrivate` is set to `true` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `apiKeyEnvVar` | string | Environment variable name for client-specific Gemini API key. Falls back to `GEMINI_API_KEY` if not set |
| `extraction` | object | Override global extraction settings (replaces entirely, does not merge) |
| `output` | object | Override global output settings (replaces entirely, does not merge) |
| `documentTypes` | array | Override global document types |

## Example: Basic Client

```json
{
  "name": "Acme Corporation",
  "enabled": true,
  "folderPath": "/Users/john/Documents/Acme/Invoices",
  "privateAddressMarker": "123 Home Street, Apt 4B",
  "apiKeyEnvVar": null
}
```

## Example: Client with Custom Extraction

```json
{
  "name": "Beta Industries",
  "enabled": true,
  "folderPath": "/Users/john/Documents/Beta/Invoices",
  "privateAddressMarker": "456 Personal Ave",
  "apiKeyEnvVar": "BETA_GEMINI_API_KEY",
  "extraction": {
    "fields": ["supplierName", "invoiceDate", "totalAmount", "currency"],
    "includeSummary": false
  }
}
```

## Folder Structure

When processing, the following subfolders are created inside each client's `folderPath`:

```
{folderPath}/
├── *.pdf                    # Input: Place new invoices here
├── processed-original/      # Original PDFs after processing
├── processed-enriched/      # PDFs with embedded metadata
└── invoice-log.csv          # Processing log
```

## Managing Clients

### Admin Web UI

The easiest way to manage clients is through the Admin UI at `http://localhost:3000`:

- Create new clients with the "+ New Client" button
- Edit existing clients via the "Edit" button
- Process clients individually or all at once
- View real-time processing progress

### CLI Commands

```bash
# List all configured clients
node batch-process.js --list

# Process all enabled clients
node batch-process.js

# Process a specific client
node batch-process.js --client {client-id}
```

## Migration from Legacy Format

If you have an existing `clients.json` file, run the migration script:

```bash
# Preview changes
node scripts/migrate-clients.js --dry-run

# Run migration
node scripts/migrate-clients.js
```
