# CI Checks

## Before Committing

Run all checks locally:

```bash
npm run lint && npm run format:check && npm test && npx knip
```

If any check fails, fix the issue before committing.

## Before Creating a PR

Verify all CI checks would pass locally using the same command above. The CI pipeline runs:

1. **Lint** — `npm run lint`
2. **Format** — `npm run format:check`
3. **Test** — `npm test` (on Node 18 and 20)
4. **Audit** — `npm audit --audit-level=moderate`
5. **Knip** — `npx knip` (dead code detection)

## If CI Fails

1. Read the failing job output from GitHub Actions
2. Reproduce locally with the specific failing command
3. Fix the issue and push a fix commit (don't amend)

## Knip False Positives

If Knip reports a legitimate export as unused:

- **Do not** add fake imports to silence the warning
- **Do** update `knip.json` — add the export to the ignore list or adjust `exclude` rules
- The current config excludes `exports` checks since many modules export public API surface for tests/CLI
