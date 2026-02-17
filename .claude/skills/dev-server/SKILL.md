---
name: dev-server
description: Start, stop, or restart the development server
disable-model-invocation: true
allowed-tools: Bash
argument-hint: [start|stop|restart]
---

Manage the development server for the invoice analyzer app.

## Actions

Based on $ARGUMENTS:

- **start** (or no argument): Start the dev server in background with `npm run dev`
- **stop**: Find and kill the running server process on port 3000
- **restart**: Stop any running server, then start fresh

## Implementation

- Use `lsof -ti:3000` to find processes on port 3000
- Start with `npm run dev` in background using the Bash tool's `run_in_background` option
- After starting, verify with a quick `curl http://localhost:3000/api/health`
- Report the result to the user
