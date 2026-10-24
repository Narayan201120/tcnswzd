# WindLens project instructions

WindLens is a day-ahead wind forecast clarity and accuracy pilot for a UK energy utility. Deliverables are a short customer and technical lead video, a public anonymous GitHub repository, a README, a Vercel application link, and submission form details. The assignment budget is 16 hours. The selected stack is React with Vite, Python with FastAPI, Docker, and Vercel. Work in phases and stop after each phase to report its result.

## Hard constraints

- Do not run Docker or install heavy dependencies locally because disk space is nearly full. Run installs, tests, and Docker commands in the Codespace or GitHub Actions.
- Do not use em dash or en dash characters in any text, source, comments, commit, or docs. Use plain ASCII hyphens.
- Preserve anonymity. Do not put personal names, college names, usernames, or identifying paths in project files, README, LICENSE holder, source comments, or commit messages. The GitHub account in the repository URL is an unavoidable hosting detail.
- Git identity for this repository only is `dev` with a GitHub noreply address. Never set this globally.
- Stop after each phase and report. Do not start a later phase without approval.

## Environment

The Codespace is `symmetrical-funicular-4j66v4gv75425j96`, machine `basicLinux32gb` with 2 cores. The free quota is 120 core-hours. Stop it whenever idle.

- Connect, which auto-starts a stopped Codespace: `gh codespace ssh -c symmetrical-funicular-4j66v4gv75425j96 -- "cd /workspaces/tcnswzd && pwd"`.
- This installed GitHub CLI has no `gh codespace start` subcommand. Use the SSH command above to start and connect.
- Stop: `gh codespace stop -c symmetrical-funicular-4j66v4gv75425j96`.
- Check status: `gh codespace list`.

## Commands

Run commands in the Codespace unless they are Git or documentation operations that do not need dependencies.

- Backend API: `.venv/bin/uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000`.
- Backend tests: `.venv/bin/python -m pytest`.
- Metrics coverage: `.venv/bin/coverage run -m pytest`, then `.venv/bin/coverage report --include=backend/metrics.py`.
- Ingest snapshot: `.venv/bin/python -m backend.ingest`. This contacts Elexon and is a maintenance command, never a production startup step.
- Frontend development, when Phase 3 creates the frontend: from `frontend`, `npm run dev -- --host 0.0.0.0`. The frontend is not implemented yet.
- Lint, when Phase 3 configures it: use the configured frontend lint command from `frontend/package.json`; no lint configuration exists yet.
- Docker Compose, when Phase 4 creates it: `docker compose up --build`. Run only in Codespace or Actions. Docker files and Compose configuration are not implemented yet.

## Deployment (Vercel, Stage A)

- The repo root carries `vercel.json`, `requirements.txt`, and `api/index.py`. The Vercel build runs `npm ci` and `npm run build` inside `frontend`, serves `frontend/dist` as the static site, and rewrites `/api/*` and `/health` to the Python function. `includeFiles` bundles `backend/**` with the snapshot.
- `requirements.txt` lists FastAPI and Pydantic only. Vercel's Python runtime serves the ASGI app itself, so Uvicorn is never part of the deployment dependencies.
- Deploy by importing the GitHub repository in the Vercel dashboard (project name `windlens`) so every push to master redeploys. The CLI alternative is `npx vercel@latest login`, then `link`, then `--prod`; no global install anywhere. Never commit `.vercel/` project settings.
- After deployment, verify `/health`, `/api/forecast/latest`, `/api/accuracy/summary` (expect MAE 2,038.91 MW and bias +1,747.89 MW), the SPA root, a hash route, and that access needs no login. Do not write the production URL into any file until it is confirmed working.

## Conventions

- Keep domain selection and metric calculations as typed, pure functions in `backend/metrics.py`; parse and validate external timestamps at the boundary in `backend/domain.py`.
- Pydantic response models live in `backend/models.py`. FastAPI route handlers live in `backend/app.py`. Keep one app object and let Vercel's `api/index.py` import that object.
- Routes use GET under `/api`; health is `/health`. Use snake_case JSON fields, MW units in field suffixes, UTC ISO 8601 timestamps ending in `Z`, and Europe/London clock times for cutoffs. Errors use FastAPI JSON with a `detail` field. Invalid request data returns HTTP 422.
- Preserve selection rule: latest publishTime at or before D-1 cutoff. Align hourly target at UTC T to mean FUELHH actuals starting at T and T+30 minutes. Signed error is forecast minus actual.
- The current snapshot is versioned JSON in `backend/data/january_2026.json`. Use Python standard library math and statistics for metrics, FastAPI and Pydantic for the API, and avoid NumPy, pandas, and PyArrow unless approved size evidence justifies a change.
- Tests belong in `tests/`, with metric edge cases and the golden January sample. Keep ingestion reproducible, polite, bounded by retries, and out of production request paths.
- Keep code readable, typed, explicit about missing data, and narrow in scope. Do not claim frontend, Docker, CI, or deployment work complete until those phases are approved and verified.
