# Testing Patterns

## Convention

- Test file mirrors source: `src/foo.ts` → `tests/foo.test.ts`
- Use Jest with ts-jest (`npm test`)
- Focus on pure function tests — no network calls, no external dependencies

## Structure

```ts
describe('moduleName', () => {
    describe('functionName', () => {
        it('should do expected behavior', () => {
            // Arrange → Act → Assert
        });
    });
});
```

## Setup / Teardown

- Use `beforeEach` / `afterEach` for test isolation
- For temp files: use `fs.mkdtemp(path.join(os.tmpdir(), 'prefix-'))` and clean up in `afterEach`
- Reset module state between tests when testing stateful modules

## Mocking

- Mock `fs` for file I/O tests (e.g., `jest.mock('fs')`)
- Mock API clients (e.g., `@google/generative-ai`) — never call real APIs
- Use `jest.fn()` for callback verification
- Use `jest.mocked()` for type-safe mock access:
    ```ts
    import { loadConfig } from '../src/config.js';
    jest.mock('../src/config.js');
    const mockedLoadConfig = jest.mocked(loadConfig);
    ```
- Mock paths use `.js` extension matching import paths

## API Endpoint Tests (Supertest)

Tests live in `tests/api/*.test.ts` and use Supertest against the Express `app` exported from `server.ts`.

### Mocking

- Mock backend modules at module level: `jest.mock('../../src/client-manager.js')`
- Use `jest.mocked()` for type-safe mock access
- When mocking `fs` alongside `express.static`, preserve the real module:
    ```ts
    jest.mock('fs', () => ({
        ...jest.requireActual('fs'),
        promises: { access: jest.fn(), readdir: jest.fn(), readFile: jest.fn() }
    }));
    ```

### Error routing convention

Server routes follow this pattern — match it in tests:

- `error.message.includes('not found')` → 404
- `error.message.includes('already exists')` → 409
- Validation errors → 400
- Unexpected errors → 500

### SSE endpoint testing

- Assert `Content-Type: text/event-stream`
- Parse events: `res.text.split('\n\n').filter(c => c.startsWith('data: ')).map(c => JSON.parse(c.replace('data: ', '')))`
- Use unique client IDs per SSE test to avoid `activeProcessing` Map collisions across parallel tests

## Verification

- Always run `npm test` after writing or modifying tests
- Always run `npm run typecheck` to verify types
- Run `npm run lint` to verify test files pass linting
- Run `npm run test:coverage` to check coverage gaps
