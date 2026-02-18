---
name: run-checks
description: Run all pre-commit checks (lint, format, test, knip) in sequence
user_invocable: true
---

# /run-checks

Run all pre-commit quality checks in sequence and report results.

## Steps

1. Run `npm run lint`
2. Run `npm run format:check`
3. Run `npm test`
4. Run `npx knip`

## Instructions

Execute each command sequentially. If any command fails, continue running the remaining commands so you can report all failures at once. After all commands complete, provide a summary:

- For each check: PASS or FAIL with the relevant error output
- If all pass: confirm the codebase is ready to commit
- If any fail: list what needs to be fixed
