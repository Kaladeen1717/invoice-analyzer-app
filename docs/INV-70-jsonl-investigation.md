# INV-70: JSONL Pipeline Investigation — Findings

## 1. Root Cause Analysis: Current Data Loss Scenarios

### 1.1 Race Condition in Concurrent Writes

`parallel-processor.ts` uses `p-limit` for concurrency (default 5). Each worker calls `appendResult()` independently. The call chain is:

```
appendResult(folderPath, result)
  → readResultsFile(folderPath)    // Step A: read entire JSON
  → data.results.push(record)      // Step B: append in memory
  → writeResultsFile(folderPath)   // Step C: write entire JSON
```

When workers W1 and W2 overlap:

```
W1: Step A → reads [r1, r2, r3]
W2: Step A → reads [r1, r2, r3]       ← same snapshot
W1: Step C → writes [r1, r2, r3, r4]
W2: Step C → writes [r1, r2, r3, r5]  ← overwrites r4
```

**Result**: r4 is silently lost. With concurrency=5, this can lose multiple results per batch. The more concurrent workers and the faster the API responds, the worse the data loss.

### 1.2 Crash/Interruption During Write

`writeResultsFile()` does write-to-temp then rename, which is atomic on POSIX — so a crash during the write itself is safe. However:

- If the process dies **between** `readResultsFile()` and `writeResultsFile()`, no data loss occurs (old file is untouched).
- If the process dies **during** `writeResultsFile()` and the temp file isn't fully written, the old file survives (rename hasn't happened).

The actual crash scenario described in the ticket ("file was cleared") is more likely caused by the race condition above, not a mid-write crash. When processing resumes after interruption, the first `appendResult` reads the file (which may have lost records from the race condition) and continues from there.

### 1.3 `updateResult()` Has the Same Race

`updateResult()` (used by retry) follows the same read-modify-write pattern. If a retry runs concurrently with a batch process (unlikely but possible via the UI), the same overwrite race applies.

## 2. Concern 1: Per-Client JSONL Source of Truth

### 2.1 Proposed Architecture

Replace `processing-results.json` (read-modify-write) with **two files** per client:

| File                      | Purpose                      | Access Pattern                               |
| ------------------------- | ---------------------------- | -------------------------------------------- |
| `results.jsonl`           | Append-only truth log        | `fs.appendFile()` — one JSON line per result |
| `processing-results.json` | Derived cache for fast reads | Rebuilt from JSONL on demand                 |

Each line in `results.jsonl` is a self-contained JSON object (one `ResultRecord` per line). New results are appended with `fs.appendFile()`, which is **atomic for small writes on local filesystems** (<= PIPE_BUF, typically 4KB — a single result record is ~500B-2KB).

### 2.2 Write Path Changes

**Current** (`appendResult`):

```
read JSON → parse → push → serialize → write temp → rename
```

**Proposed** (`appendResult`):

```
serialize record → fs.appendFile(resultsJsonlPath, JSON + '\n')
```

No read step. No parse step. No race condition. Multiple concurrent workers can safely append simultaneously.

**Current** (`updateResult` for retry):

```
read JSON → find by ID → replace in-place → serialize → write temp → rename
```

**Proposed** (`updateResult` for retry):

```
serialize new record with retriedFrom reference → fs.appendFile()
```

JSONL is append-only — retries don't modify previous records. The new record includes `retriedFrom: "<original-id>"`. The cache rebuild step deduplicates by keeping only the latest record per `(originalFilename, id)` pair, or more simply: the latest record with a given `retriedFrom` replaces the original.

### 2.3 Read Path Changes

The read path (`getResults`, `getSummary`, `getResult`, `getFailedResults`) currently does:

```
read JSON → parse → filter/sort/slice → return
```

Two options for JSONL reads:

**Option A: Line-by-line parse on every read** — Simple but scales linearly with file size. For 1,000 records (~1.5MB JSONL), this takes <10ms. For 10,000 records (~15MB), ~50-100ms. Acceptable for this application's expected volumes.

**Option B: Derived JSON cache** — Rebuild `processing-results.json` from JSONL periodically (on startup, after writes, or lazily on first read). The existing read path code stays unchanged. Cache invalidation is trivial: compare `results.jsonl` mtime with cache mtime.

**Recommendation: Option B (derived cache)**. Reasons:

- Zero changes to read path code (`getResults`, `getSummary`, etc. remain unchanged)
- Cache rebuild is a simple sequential read of JSONL → deduplicate retries → write JSON
- Startup cost is negligible (<100ms for 10K records)
- The JSON file becomes disposable — delete it and it rebuilds automatically

### 2.4 Cache Rebuild Logic

```
rebuildCache(folderPath):
  1. Read results.jsonl line by line
  2. Build Map<id, ResultRecord>
  3. For records with retriedFrom: replace the original record's id in the map
  4. Sort by timestamp descending
  5. Write processing-results.json atomically (temp + rename)
```

Trigger points:

- After each `appendResult()` call (debounced — batch writes trigger one rebuild at end)
- On `getResults()`/`getSummary()` if cache is stale (mtime check)
- On server startup

### 2.5 Retry Deduplication

When a retry succeeds, the JSONL log contains both the original failed record and the new success record. The dedup rule during cache rebuild:

- Records with `retriedFrom` set → find the record whose `id` matches `retriedFrom` value → replace it in the cache with the retry result
- This means the JSON cache always shows the **latest outcome** per invoice, matching current UI behavior

### 2.6 Migration Path

1. Ship the JSONL writer alongside the existing JSON writer (dual-write phase)
2. Add cache rebuild logic that reads from JSONL
3. Switch read path to prefer JSONL-derived cache over legacy JSON
4. For clients with existing `processing-results.json` but no `results.jsonl`: convert JSON → JSONL as a one-time migration (simple script: read JSON, write each record as a JSONL line)
5. Remove legacy JSON-only write path

This can be done in a single PR — the dual-write phase is just for the migration script, not a long-lived feature flag.

## 3. Concern 2: Cross-Client JSONL Archive

### 3.1 Proposed Schema

File: `data/global-results.jsonl`

Each line is a JSON object with the full `ResultRecord` fields plus client context:

```typescript
interface GlobalResultRecord extends ResultRecord {
    clientId: string;
    clientName: string;
}
```

Fields per record:

- **Identity**: `id`, `clientId`, `clientName`, `originalFilename`, `outputFilename`
- **Outcome**: `status`, `error`, `rawResponse`
- **Timing**: `timestamp`, `duration`, `retriedFrom`
- **Model**: `model`
- **Tokens**: `promptTokens`, `outputTokens`, `totalTokens`, `cachedTokens`, `thoughtsTokens`
- **Extraction**: `extractedFields`, `tags`

### 3.2 Write Integration

In `parallel-processor.ts`, after the per-client `appendResult()` call, also append to the global archive:

```typescript
await appendGlobalResult(result, { clientId, clientName, model, duration });
```

Same `fs.appendFile()` pattern — no read-modify-write, no race conditions.

### 3.3 Storage Growth Projections

Estimated per-record size (based on current `ResultRecord` shape):

- **Success record** (with extractedFields, tags, tokenUsage): ~800B–2KB depending on field count
- **Failed record** (with error, rawResponse): ~500B–5KB depending on rawResponse size
- **Average**: ~1.5KB per record

| Records | JSONL Size | JSON Cache Size |
| ------- | ---------- | --------------- |
| 1,000   | ~1.5 MB    | ~1.8 MB         |
| 10,000  | ~15 MB     | ~18 MB          |
| 50,000  | ~75 MB     | ~90 MB          |
| 100,000 | ~150 MB    | ~180 MB         |

At expected usage (hundreds to low thousands of invoices per client, a handful of clients), the global archive will stay well under 50MB for years. At 100K+ records, consider log rotation or archival — but this is far beyond current scale.

### 3.4 Consumption Patterns

| Consumer                 | Method                                                      | Notes                                                                                                                        |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/api/stats` endpoint    | Read JSONL → aggregate in memory                            | Replaces current per-client `getSummary()` loop. Single file read instead of N client reads                                  |
| Admin UI dashboard       | Via `/api/stats` API                                        | No frontend changes needed                                                                                                   |
| CLI analytics            | `npx tsx scripts/analyze-results.ts`                        | Custom script reads JSONL directly                                                                                           |
| DuckDB ad-hoc queries    | `SELECT * FROM read_json_auto('data/global-results.jsonl')` | Zero-config — DuckDB auto-detects JSONL. Enables complex analytics: cost per model, error rates over time, throughput trends |
| Pipeline test comparison | Combine with `tests/fixtures/pipeline-runs.json`            | Cross-reference extraction accuracy with production results                                                                  |

### 3.5 Can the Global Archive Replace `/api/stats`?

**Yes.** The current `/api/stats` endpoint iterates over every client, loads each `processing-results.json`, calls `getSummary()`, and aggregates. With a global JSONL archive, this becomes:

```
read global-results.jsonl → group by clientId → compute stats per group + totals
```

Single file read, no per-client config resolution needed. Significant simplification.

## 4. Recommended Implementation Plan

### Phase 1: Per-Client JSONL (fixes the data loss bug)

1. Add `appendResultLine()` function to `result-manager.ts` — simple `fs.appendFile()` to `results.jsonl`
2. Add `rebuildResultsCache()` function — reads JSONL, deduplicates retries, writes `processing-results.json`
3. Modify `appendResult()` to write JSONL line + trigger cache rebuild
4. Modify `updateResult()` to append JSONL line with `retriedFrom` + trigger cache rebuild
5. Add migration function: existing `processing-results.json` → `results.jsonl`
6. Add startup hook: rebuild cache from JSONL if stale
7. Read path (`getResults`, etc.) stays unchanged — reads from JSON cache

### Phase 2: Global JSONL Archive

1. Create `data/` directory, add `data/global-results.jsonl` to `.gitignore`
2. Add `appendGlobalResult()` function
3. Wire into `parallel-processor.ts` alongside per-client append
4. Add migration script: backfill global archive from existing per-client JSON files
5. Refactor `/api/stats` to read from global archive instead of per-client loop

### Phase 3: Cleanup

1. Remove dual-write fallback after confirming JSONL stability
2. Add log rotation utility for global archive (low priority — not needed for years at current scale)

## 5. Decisions

| Question                                  | Recommendation                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Per-client JSON files: keep or eliminate? | **Keep as derived cache.** Zero read-path changes, trivially rebuildable. Delete the cache and it auto-rebuilds.                |
| JSONL read path: direct parse or cache?   | **Cache (Option B).** The existing read code stays untouched.                                                                   |
| Cache rebuild trigger                     | **After writes (debounced) + on stale reads.**                                                                                  |
| Global archive: separate from per-client? | **Yes, separate file.** Per-client JSONL handles correctness; global archive handles analytics. Both are append-only.           |
| `rawResponse` in global archive?          | **No.** Exclude `rawResponse` from global records to keep file size manageable. Keep it only in per-client JSONL for debugging. |
| Migration: big-bang or gradual?           | **Single PR per phase.** Phase 1 is the critical bug fix. Phase 2 is an enhancement.                                            |

## 6. Follow-Up Tickets

### INV-80: Replace per-client JSON with JSONL source of truth (Phase 1)

- **Type**: fix (addresses data loss bug)
- **Priority**: High
- **Scope**: `src/result-manager.ts`, `src/parallel-processor.ts`, migration script
- **Acceptance**: concurrent writes don't lose data, retry dedup works, existing UI unchanged

### INV-81: Add cross-client JSONL archive (Phase 2)

- **Type**: feature
- **Priority**: Medium
- **Scope**: `src/result-manager.ts`, `src/parallel-processor.ts`, `server.ts` (`/api/stats`), migration script
- **Acceptance**: global archive populated on every process run, `/api/stats` reads from it, DuckDB queryable

### INV-82: Add `rawResponse` exclusion and JSONL housekeeping (Phase 3)

- **Type**: chore
- **Priority**: Low
- **Scope**: Archive size management, optional log rotation
