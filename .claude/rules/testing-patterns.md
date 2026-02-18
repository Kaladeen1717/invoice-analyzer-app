# Testing Patterns

## Convention

- Test file mirrors source: `src/foo.js` → `tests/foo.test.js`
- Use Jest (`npm test`)
- Focus on pure function tests — no network calls, no external dependencies

## Structure

```js
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

## Verification

- Always run `npm test` after writing or modifying tests
- Run `npm run lint` to verify test files pass linting
- Run `npm run test:coverage` to check coverage gaps
