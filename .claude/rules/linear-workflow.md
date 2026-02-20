# Linear Workflow Rules

## Team Configuration

- **Team**: Invoice Analyzer
- **Prefix**: INV (tickets: INV-1, INV-2, etc.)
- **Statuses**: Backlog > Todo > In Progress > In Review > Done (+ Canceled)
- **Labels**: bug, feature, improvement, chore, docs, research
- **Priorities**: Linear built-in (Urgent, High, Medium, Low, No Priority)

## Working on Tickets

When the user asks to work on a ticket (e.g., "work on INV-12"):

1. Use the Linear MCP to read the ticket details
2. Summarize the ticket to confirm understanding
3. Set ticket status to **In Progress** (ask user before changing)
4. Create a feature branch following the naming convention
5. When work is complete, ask user whether to set **In Review** or **Done**

Always confirm with the user before changing ticket status.

## Reading Tickets

- Use Linear MCP to list issues for the Invoice Analyzer team
- Use Linear MCP to get issue details by identifier (e.g., INV-12)
- When starting a session, check if there are any In Progress tickets to resume

## Commit Message Convention

Format: `{type}(INV-{number}): {description}`

Types:

- `feat` — New capability
- `fix` — Bug fix
- `improve` — Enhancement to existing feature
- `chore` — Maintenance, dependencies, config
- `docs` — Documentation changes
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests
- `research` — Documentation artifacts from exploration work (never code changes)

Examples:

```
feat(INV-12): add multi-currency support to filename generator
fix(INV-7): handle PDF parse failure for scanned invoices
chore(INV-15): upgrade @google/generative-ai to v0.22
docs(INV-3): add client configuration examples
```

For work without a ticket (rare), omit the scope: `chore: update .gitignore`

## Branch Naming Convention

Format: `{type}/INV-{number}-{short-kebab-description}`

Examples:

```
feat/INV-12-multi-currency
fix/INV-7-scanned-pdf-handling
chore/INV-15-upgrade-gemini-sdk
```

## Creating New Tickets

When discovering bugs or improvements during work:

1. Suggest creating a ticket to the user
2. Use Linear MCP to create the issue in the Invoice Analyzer team
3. Apply the appropriate label (bug, feature, improvement, chore, docs)
4. Set priority based on impact
5. Add to Backlog unless the user specifies otherwise
6. Write the description following the **Ticket Description Standards** below

## Ticket Description Standards

**Never create a ticket with just a title and one-line description.** Every ticket must have structured sections that provide enough context for someone to understand the work without external discussion.

### Required Sections (All Ticket Types)

Every ticket description must include at minimum:

1. **Context** (2-4 sentences) — Why this work is needed. Explain the problem, motivation, or business reason. Reference related tickets if applicable.
2. **Acceptance Criteria** — Checkbox list of testable outcomes. Each item should be independently verifiable.
3. **Key Files** — Bulleted list of files to create or modify, each with a short description of the expected change.

### Type-Specific Sections

Add these sections based on the ticket label:

#### `feat` (Feature)

- **Requirements** — Numbered list of functional requirements. Include code snippets, JSON shapes, or API contracts where relevant.
- **Dependencies** — Other tickets, libraries, or config changes this depends on.
- **Architecture Notes** — How this fits into the existing system. Reference module dependency chains from CLAUDE.md if helpful.

#### `fix` (Bug Fix)

- **Current Behavior** — What happens now (include error messages, screenshots, or reproduction steps).
- **Expected Behavior** — What should happen instead.
- **Root Cause** — Analysis of why the bug occurs (or "TBD — needs investigation" if unknown).

#### `improve` (Improvement)

- **Current State** — How the feature works today and what's lacking.
- **Technical Approach** — Step-by-step plan for the improvement.
- **Dependencies** — Other tickets or changes this builds on.

#### `chore` (Maintenance)

- **Technical Approach** — Step-by-step plan with config examples, commands, or file snippets where applicable.

#### `research` (Exploration)

- **Investigation Scope** — What questions to answer, what to audit or analyze.
- **Expected Outcome** — What deliverables to produce (e.g., findings summary, follow-up tickets).

**Research ticket rules:**

- Research tickets are for exploring and qualifying ideas — never for making code changes.
- The outcome of a Research ticket is knowledge + concrete follow-up tickets (if warranted).
- Use the `research` commit type only for documentation artifacts produced during investigation, never for code changes.
- Research tickets move to Done when the investigation is complete, regardless of whether follow-up tickets are created.
- Keep the scope focused: one research question per ticket. Split broad investigations into multiple tickets.

#### `refactor` (Restructuring)

- **Current State** — What the code looks like today and why it needs restructuring.
- **Technical Approach** — The target architecture or pattern.
- **Architecture Notes** — How the refactored code fits into the broader system.

### Retroactive Documentation

For tickets already in **Done** status, descriptions serve as a historical record:

- Write in past tense ("Added...", "Implemented...", "Configured...")
- Replace "Requirements" with "What Was Done"
- Replace "Key Files" with "Files Modified"
- Check all acceptance criteria checkboxes

### Quality Checklist

Before submitting a ticket description, verify:

- [ ] Context explains **why**, not just **what**
- [ ] Acceptance criteria are testable (someone else could verify them)
- [ ] Key files are listed with change descriptions
- [ ] Feature tickets are 300+ words
- [ ] Chore/improvement tickets are 200+ words
- [ ] Bug tickets include reproduction information
- [ ] Code examples are included where they clarify requirements

## PR Conventions

- PR title matches the primary commit format: `{type}(INV-{number}): {description}`
- PR body includes: `Closes INV-{number}` (or `Part of INV-{number}` for partial work)
- Keep PRs focused on a single ticket when possible

## Commit Discipline

- **Never commit automatically** — only commit when the user explicitly asks (e.g., "commit", "commit this", "make a commit")
- Do not commit as a side effect of completing a task
- Do not commit after fixing a bug, adding a feature, or any other change unless told to
- When asked to commit, follow the commit message convention above
- Always show `git status` and `git diff` summary before committing so the user can review
- Never push to remote unless explicitly asked
