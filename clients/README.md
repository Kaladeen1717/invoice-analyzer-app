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
  "apiKeyEnvVar": null
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name shown in logs and reports |
| `enabled` | boolean | Set to `false` to skip this client during batch processing |
| `folderPath` | string | Absolute path to the folder containing invoices |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `apiKeyEnvVar` | string | Environment variable name for client-specific Gemini API key. Falls back to `GEMINI_API_KEY` if not set |
| `model` | string | Override global model selection (e.g., `"gemini-3-flash-preview"`) |
| `fieldOverrides` | object | Per-field overrides (enable/disable, customize extraction behavior) |
| `tagOverrides` | object | Per-client overrides for global tag definitions (parameter values and enabled state) |
| `promptOverride` | object | Override global prompt template (partial override, merged with global) |
| `outputOverride` | object | Override global output settings (partial override, merged with global) |

## Example: Basic Client

```json
{
  "name": "Acme Corporation",
  "enabled": true,
  "folderPath": "/Users/john/Documents/Acme/Invoices",
  "tagOverrides": {
    "private": {
      "parameters": {
        "address": "123 Home Street, Apt 4B"
      }
    }
  },
  "apiKeyEnvVar": null
}
```

## Example: Client with Overrides

```json
{
  "name": "Beta Industries",
  "enabled": true,
  "folderPath": "/Users/john/Documents/Beta/Invoices",
  "apiKeyEnvVar": "BETA_GEMINI_API_KEY",
  "model": "gemini-3-flash-preview",
  "tagOverrides": {
    "private": {
      "parameters": {
        "address": "456 Personal Ave"
      }
    }
  },
  "fieldOverrides": {
    "totalAmount": { "enabled": true },
    "vatNumber": { "enabled": false }
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
npx tsx batch-process.ts --list

# Process all enabled clients
npx tsx batch-process.ts

# Process a specific client
npx tsx batch-process.ts --client {client-id}
```

## Migration from Legacy Format

If you have an existing `clients.json` file, run the migration script:

```bash
# Preview changes
npx tsx scripts/migrate-clients.ts --dry-run

# Run migration
npx tsx scripts/migrate-clients.ts
```
