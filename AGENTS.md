# WindLens contributor guide

WindLens is a day-ahead wind forecast clarity and accuracy pilot for a GB energy utility audience. It compares the Elexon WINDFOR national wind forecast with FUELHH wind outturn for the January 2026 day-ahead purchase decisions, serves a React frontend with a FastAPI backend, and reports accuracy metrics with plain language buying notes. The live deployment is https://windlens-dayahead.vercel.app.

## Commands

Run installs, tests, and Docker commands in a cloud development environment or CI; keep local usage to editing files and git.

- Backend API: `.venv/bin/uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000`.
- Backend tests: `.venv/bin/python -m pytest`. Dev requirements: `backend/requirements-dev.txt`.
- Backend lint: `.venv/bin/ruff check backend tests` (config in `ruff.toml`).
- Metrics coverage: `.venv/bin/coverage run -m pytest`, then `.venv/bin/coverage report --include=backend/metrics.py`.
- Ingest snapshot: `.venv/bin/python -m backend.ingest`. This contacts Elexon and is a maintenance command, never a production startup step.
- Frontend, from `frontend`: `npm run dev -- --host 0.0.0.0` (port 3000, proxies `/api` and `/health` to 8000), `npm test`, `npm run lint`, `npm run build`.
- Docker: `docker compose up --build` at the repository root. Backend on host port 8000, frontend on host port 3000.
- CI: GitHub Actions runs the backend, frontend, and docker jobs on push and pull request.

## Requirements files

- Root `requirements.txt` (fastapi, pydantic) is the Vercel function runtime. Vercel serves the ASGI app with its own runtime, so uvicorn is intentionally absent.
- `backend/requirements.txt` (fastapi, starlette, uvicorn) is the Docker runtime image.
- `backend/requirements-dev.txt` adds coverage, httpx, pytest, and ruff for development and CI.

## Production

- Production URL: https://windlens-dayahead.vercel.app. It is a CLI alias pinned to the current production deployment of the tcnswzd project; the original https://tcnswzd.vercel.app domain also resolves and is retained.
- Every push to master auto-deploys production because the Vercel Git integration is connected. To go CLI only, disconnect it in the Vercel dashboard under Project Settings, Git.
- After every production deployment, re-point the alias and verify: `npx vercel@latest alias set <deployment-url> windlens-dayahead`, then check /health and /api/accuracy/summary on the alias.
- Vercel Authentication is disabled for the project, so both domains are public. If protection is re-enabled, the alias goes behind a login wall again.

## Conventions

- Keep domain selection and metric calculations as typed, pure functions in `backend/metrics.py`; parse and validate external timestamps at the boundary in `backend/domain.py`.
- Pydantic response models live in `backend/models.py`; FastAPI route handlers live in `backend/app.py`. Keep one app object and let Vercel's `api/index.py` import that object.
- Routes use GET under `/api`; health is `/health`. Use snake_case JSON fields, MW units in field suffixes, UTC ISO 8601 timestamps ending in `Z`, and Europe/London clock times for cutoffs. Errors use FastAPI JSON with a `detail` field; invalid request data returns HTTP 422.
- Selection rule: latest publishTime at or before the D-1 cutoff. Align the hourly target at UTC T to the mean of FUELHH actuals starting at T and T+30 minutes. Signed error is forecast minus actual.
- The January 2026 snapshot is versioned JSON at `backend/data/january_2026.json`. Use Python standard library math and statistics for metrics; avoid NumPy, pandas, and PyArrow unless approved size evidence justifies a change.
- Tests belong in `tests/` for the backend and `frontend/src/__tests__/` for the frontend. Keep ingestion reproducible, polite, bounded by retries, and out of production request paths.
- Keep code readable, typed, explicit about missing data, and narrow in scope. Verify every change with tests, a build, and a smoke test before merging.

## Constraints

- No em or en dash characters anywhere in text, source, comments, commits, or docs. Use plain ASCII hyphens.
- Preserve anonymity: no personal names, college names, or usernames in files, paths, comments, commit messages, or the LICENSE. The GitHub account name inside repository URLs is an unavoidable hosting detail.
- The git identity for this repository is `dev` with a GitHub noreply address, repository scoped, never global.
- Do not run the ingestion inside a production request path, and do not regenerate the committed snapshot casually.
- Production runs on Vercel; Docker Compose is for local, review, and CI. Redeploy production only when app code changes or when asked.
