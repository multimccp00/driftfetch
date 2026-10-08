# Current 0.5.2

- A failed link no longer suppresses later copies of the same URL. Copy it again after changing Current, updating the engine, or refreshing an account session and it receives a new attempt.
- Successful and active downloads still keep normal duplicate protection. This change only releases failed entries, which remain visible in History for diagnosis.

## Validation

The queue test suite verifies that a failed copied URL produces a fresh job rather than a duplicate capture. The complete automated suite passes with 65 tests.
