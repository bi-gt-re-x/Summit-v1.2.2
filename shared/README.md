# shared/

What the browser and the server must agree on, kept once.

- `rules.json` — values: the XP range and bands, grade bands, the time-spent
  caps, the task reasons, the recommendation and space-page limits. The server
  reads it through `backend/config/shared.py` (`RULES`); the browser imports
  `@shared/rules.json`. Change a value here, never in code.
- `cases/` — logic both sides implement (there is no way to share code between
  Python and TypeScript), pinned by one set of examples that both test suites
  run: `tests/test_shared_cases.py` and `frontend/src/shared.cases.test.ts`.
  Change the behaviour on one side and the other side's run of the same cases
  fails.
