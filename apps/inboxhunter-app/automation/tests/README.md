# Proof Capture Tests

Isolated test suite for verifying the proof-of-submission capture functionality.

## Tests

### test_proof_capture.py
Tests proof capture against real external websites. Uses Playwright's `expect_response` to detect form submission completion.

```bash
python tests/test_proof_capture.py
```

### test_local_form.py
Deterministic test using a local HTTP server with a controlled form. This test:
1. Starts a local server with a signup form
2. Submits the form using Playwright
3. Captures screenshots BEFORE and AFTER submission
4. Verifies the confirmation page is captured correctly

```bash
python tests/test_local_form.py
```

## Output

Test screenshots (`*.png`) and output files are gitignored and won't be committed.
