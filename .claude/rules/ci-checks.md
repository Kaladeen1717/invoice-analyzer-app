# CI Checks

## Before Committing

Run all checks locally:

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npx knip
```

If any check fails, fix the issue before committing.

## Before Creating a PR

Verify all CI checks would pass locally using the same command above. The CI pipeline runs:

1. **Build** — `npm run build:frontend` (compile frontend TypeScript)
2. **Typecheck** — `npm run typecheck` (verify all TypeScript types)
3. **Lint** — `npm run lint`
4. **Format** — `npm run format:check`
5. **Test** — `npm test` (on Node 20 and 22)
6. **Audit** — `npm audit --audit-level=moderate`
7. **Knip** — `npx knip` (dead code detection)

## If CI Fails

1. Read the failing job output from GitHub Actions
2. Reproduce locally with the specific failing command
3. Fix the issue and push a fix commit (don't amend)

## CI Pipeline Jobs

The CI workflow (`.github/workflows/ci.yml`) runs three jobs on PRs to `main` and pushes to `main`:

### 1. lint-and-test (Node 20 + 22)

`npm ci` → `npm run build:frontend` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`

### 2. security

- `npm audit --omit=dev` — production dependency vulnerabilities
- `npx knip` — dead code and unused dependency detection
- **TruffleHog** v3.93.8 — secret scanning across full git history (`--only-verified`, `continue-on-error: true`)
- **Semgrep** via Docker — static analysis with `p/owasp-top-ten`, `p/javascript`, `p/secrets` rulesets (`continue-on-error: true`)

### 3. codeql

GitHub CodeQL v4 security analysis. Results appear in the repo's Security tab → Code scanning.

## Common CI Failures

- **Build failure**: Check `tsconfig.frontend.json` paths and that all frontend imports resolve
- **Knip**: See "Knip False Positives" below — update `knip.json` if needed
- **Security jobs**: Run with `continue-on-error: true` — check Security tab for actionable alerts rather than blocking PRs
- **npm audit**: Uses `--omit=dev` to exclude dev-only vulnerabilities. Fix production issues with `npm audit fix`

## Knip False Positives

If Knip reports a legitimate export as unused:

- **Do not** add fake imports to silence the warning
- **Do** update `knip.json` — add the export to the ignore list or adjust `exclude` rules
- The current config excludes `exports` checks since many modules export public API surface for tests/CLI
