1. Problem setting
Consider that you are a product developer developing and delivering a customized software product to a client. A product manager has given you some broad context, directions, and requirements as below. You need to understand it, do additional learning and information gathering to gain sufficient knowledge of the domain, then develop the first version of the product based on it. You also need to:
- present and pitch the product to the client
- explain the software design and implementation to an internal technical lead reviewing the work

2. Requirement
(from the product manager)
The client is an energy utility in the UK. They need to buy electricity from the wholesale market to serve their consumers. The specific team (that we are pitching the software to) is responsible for buying required power from the UK day-ahead market. More specifically, to meet their consumer{�u���Y electricity demand, they need to understand how much power needs to be additionally procured (e.g., from thermal plants) beyond the generation available from renewable sources like wind. The power generation from renewable sources is weather-dependent, and the power purchase decisions from the day-ahead market need to be made one day before the delivery day. Hence, they need to rely on renewable generation forecasts when making decisions.
Using our web app product, they need to:
1. Clearly understand the latest renewable generation forecasts available when they need to make decisions on buying from the day-ahead market
2. Evaluate the accuracy of the renewable generation forecasts quantitatively, so that they can make their decisions considering the quantified error
To limit the scope of this challenge, for the above 2 purposes, we consider the national level generation of actuals and forecasts of wind power available from elexon alone (no other data beyond this).

2.1 Actual generation
The actual generation data for this is available at https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream. Please consider values corresponding to "fuelType" "WIND". Some relevant fields:
�u���b "startTime": the target time (resolution of 30 minutes)
�w^~)�v "generation": generated wind power

2.2 Forecasted generation
The forecasts are available at https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream. Relevant fields:
��y��y� "startTime": similar to the "startTime" field in the actuals dataset
�w^~)�v "publishTime": the time at which the forecast was created
�w^~)�v "generation": similar to the "generation" field in the actuals dataset

Please consider data relevant only for purchase decisions to be made in January 2026.
Please build the application using React for front-end and Python for backend. You are free to use AI tools to assist with building this application (please mention it explicitly in the README if yo{�u���Yve used AI tools). Please use docker. Please deploy the sample application in vercel or heroku.
Please do not spend more than 16 hours on this assignment.

3. Deliverables

3.1 Video demo
Please create an unlisted youtube video (guide) as explained below.
The video needs to have 2 parts:
Part 1: Assume that you�w^~)�ure presenting the portal and analysis to the customer as the output of a pilot project yov��y��y�ve done for them. The goal is to impress them. Please include a max 5-minute-long initial overview.
Part 2: Assume that yo{�u���Yre showing the work to the tech load for his/her review. You need to explain the architecture, design, analysis, code base, and key development practices. The goal is to make review easy and to provide clear knowledge transfer too. Please include a max 5-minute-long initial overview.
Please limit the video to a maximum of 10 minutes.
Our evaluation will start with the video. Hence, please dok�u���Yt submit without this video.

3.2 Repo
Please create a public github repo (with an anonymous repo name e.g., a random string like"��y��y�kjhwr��y��y�) to submit your code. Please include a README containing:
��y��y� Details of the files and directories present
�w^~)�v How to start the application
��y��y� Link to the vercel/heroku app

3.3 Submit form
Please submit all the details in this form: Full Stack SWE challenge submission v4 - Fill out form
Please open each URL yo{�u���Yre submitting as part of the form in incognito mode and verify that sufficient access is available for them.

Build the task above in phases. Stop and report after each phase. Do not skip ahead.

PROJECT SETTINGS
- Product name (UI, README title, video): WindLens
- Tagline: Day-ahead wind forecast clarity and accuracy
- Workspace: A:/Projects/ (Windows, use PowerShell). Local folder name must equal the repo name.
- Repo name: random 6 to 8 lowercase letters, unrelated to WindLens, Elexon, or me.
- ANONYMITY: no personal names, college names, or usernames in any file, path, README, LICENSE holder, code comment, or commit message. Use relative paths in docs.
- Git identity for this repo only: user.name "dev", user.email = GitHub noreply address.
  Get it with: `gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"'`
  Set with git config (repo scope, not global).

CONSTRAINTS
- Local disk is nearly full. Do NOT run Docker locally. Do NOT install heavy dependencies locally (no npm install, no venv, no pip install on this machine).
  Run and verify everything (installs, tests, docker compose) in a GitHub Codespace or GitHub Actions.
  Keep local usage to editing files and git.
- Stack: React (Vite) frontend, Python (FastAPI) backend, Docker, deploy on Vercel.
- Time budget: 16 hours total. Prefer simple, working, tested.
- Style: no em dashes or en dashes in any text you write (README, UI copy, comments, commits).

PHASE 0: Repo and environment
1. Run gh auth status. If not logged in, stop and tell me.
2. Generate the name in PowerShell:
   `$name = -join ((97..122) | Get-Random -Count 7 | ForEach-Object {[char]$_})`
3. cd A:\Projects ; gh repo create $name --public --clone ; cd $name
4. Set the neutral git identity (see PROJECT SETTINGS).
5. Add .gitignore (node_modules, .venv, **pycache**, dist, .env), .dockerignore, LICENSE (MIT, holder "WindLens contributors").
6. Add .devcontainer/devcontainer.json (Python 3.12, Node, docker-in-docker, forward ports 3000, 8000).
7. Commit and push. Then:
   gh auth refresh -h github.com -s codespace
   gh codespace create --help (confirm the 2 core machine name, e.g. basicLinux32gb)
   gh codespace create -R <owner>/<name> --machine <2-core-name>
   Run all later installs, tests, and docker commands via gh codespace ssh,
   or tell me to open the Codespace in VS Code if SSH is awkward.
8. Report back with the repo URL and local path.

PHASE 1: Research (no code yet)
1. Read the Elexon BMRS docs for FUELHH and WINDFOR stream endpoints. Confirm:
   query params, date filters (including publishDateTime filters for WINDFOR), response shape,
   forecast horizon, time resolution, rate limits, whether an API key is needed.
2. Fetch a small real sample of each. Confirm fuelType "WIND" filtering and startTime alignment.
3. Write docs/DESIGN.md with:
   - Interpretation of "decisions made in January 2026": delivery day D, decision on D-1.
     State which delivery days are in scope and why.
   - Decision cutoff time on D-1 as a CONFIGURABLE parameter with a default and justification
     (GB day-ahead auction gate closure). Flag it as an assumption.
   - Forecast selection rule: for each target startTime, use the latest publishTime
     at or before the cutoff.
   - Metrics: error, MAE, RMSE, bias (mean error), MAPE (guard zero actuals), plus
     error percentiles (P50, P90, P95) and error by hour of day and by forecast horizon.
   - Data quality handling: missing half hours, duplicates, timezone (UTC vs Europe/London, DST).
   - Architecture and deployment split (Vercel serverless for prod, Docker for local and review).
   Stop and show me the design before building.

PHASE 2: Backend (Python/FastAPI)
- Ingestion script: fetch January 2026 data (include whatever Feb 1 actuals the scope needs),
  normalize, save a small snapshot (Parquet or JSON) committed to the repo so the deployed
  app does not depend on live Elexon calls. Optional live-refresh endpoint with caching.
- Endpoints (examples): /health, /api/forecast/latest?delivery_date=&cutoff=,
  /api/actual-vs-forecast?start=&end=, /api/accuracy/summary, /api/accuracy/by-hour,
  /api/accuracy/by-horizon, /api/accuracy/distribution.
- Pure functions for selection and metrics, with pytest unit tests (including edge cases:
  missing data, DST days, multiple publishTimes, zero actuals).
- Type hints, pydantic models, clear error handling.

PHASE 3: Frontend (React + Vite)
- Views: (1) Decision view: pick delivery day, show actual-free latest forecast available at
  cutoff, with the cutoff time and publishTime shown clearly. (2) Accuracy view: actual vs
  forecast chart, error over time, metric cards (MAE, RMSE, bias, P95), error by hour,
  error by horizon, error distribution. (3) Plain language "what this means for buying"
  notes, e.g. suggested buffer from P90/P95 error.
- Header shows "WindLens" and the tagline.
- Loading and error states, responsive, accessible, polished enough to impress a utility client.
- Component tests for key logic; lint and format configured.

PHASE 4: Docker and CI
- backend/Dockerfile (python slim, non-root), frontend/Dockerfile (multi stage, serve static),
  docker-compose.yml at root: `docker compose up --build` runs everything.
- GitHub Actions: lint, pytest, frontend tests and build, docker compose build, smoke test /health.
- Verify in the Codespace, not locally.

PHASE 5: Vercel deployment
- Structure so Vercel serves the static frontend plus Python serverless functions
  (vercel.json, api/ entrypoint reusing the same backend code and bundled snapshot).
- Tell me exactly which commands I must run myself (vercel login, vercel link, vercel --prod)
  and then verify the deployed URL with curl. Confirm it works without any login (public access).

PHASE 6: README and handoff
README must contain: project overview (titled WindLens), directory and file descriptions,
how to start (docker compose up, plus a non Docker fallback), how to run tests,
the live Vercel link, architecture and decision log, assumptions (cutoff, scope),
metrics definitions, limitations, and an explicit AI tools disclosure
(state that Claude and a coding agent assisted).
Also produce docs/VIDEO_SCRIPT.md with two timed parts (customer pitch under 5 minutes,
tech lead walkthrough), a demo click path, and a list of code files to show.
Final check: grep the repo and git log for personal names or usernames in files and commit messages
(the GitHub account name in the repo URL is unavoidable).
