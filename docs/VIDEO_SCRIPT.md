# WindLens video script

Two parts, total under 10 minutes. Part 1 pitches the product to the utility customer (target
4:30). Part 2 walks the tech lead through architecture, code, and process (target 5:00). Record
the live app at https://tcnswzd.vercel.app and the repository side by side.

## Pre recording checklist

- Fresh browser profile, no personal bookmarks or extensions visible; 100 percent zoom.
- Live app open on the Decision view, delivery day 2 Jan 2026, cutoff 09:00 before recording.
- Repository open in the editor at the files listed in part 2; no personal paths in the title bar.
- Microphone test; record 1080p; hide bookmarks bar; do not show file paths with personal names.
- Rehearse the two opening paragraphs once each; speak the numbers slowly.
- Keep the whole recording under 10:00; if a take runs long, cut the revisions segment first.

## Part 1: customer pitch (target 4:30)

### 0:00 to 0:30, opening (say these words)

"Buying power for tomorrow is a bet on the wind. You place that bet at the day-ahead auction,
but the forecast you bet on keeps changing right up to the deadline, and nobody shows you how
wrong it usually is. WindLens fixes that. It shows you exactly what the forecast said when you
had to decide, and it measures, in gigawatts and percent, how much you should distrust it."

### 0:30 to 1:15, the problem and what they get

Say: day-ahead buyers need two things: the forecast as it stood at the decision moment, and a
quantified error band around it. WindLens gives both for the national wind fleet, using only the
official Elexon forecast and outturn data, with no black boxes.

### 1:15 to 2:45, live click path

1. Decision view, 2 Jan 2026, cutoff 09:00. Point out: peak 18.9 GW at 04:00 London, trough
   17.5 GW at 12:00, mean 18.3 GW; the meta line reads "Selected edition published 07:30 UTC",
   lead 16.5 to 39.5 hours. No actuals on screen.
2. Cutoff to 08:00, then 09:20. Say: the curve updates to the edition that existed at each
   deadline; 09:20 matches 09:00 because no new edition landed in between.
3. Revisions panel. Say: every edition of the day, with the edition the rule selects
   highlighted; later editions are context, not decision inputs.
4. Optional, 5 seconds: toggle "Adjust for observed January bias". The adjusted curve drops about
   1.7 GW below published; label says in-sample, not a forecast of future bias.
5. Accuracy view. Metric cards: MAE 2,039 MW, RMSE 2,505 MW, bias +1,748 MW, relative bias
   +15.5%, P90 overforecast 4.1 GW, P95 5.3 GW. Scroll: actual versus forecast, daily mean error
   (27 of 31 days positive), error by hour, error by lead time (gap grows with lead), histogram,
   cutoff sensitivity table.
6. Buying notes. Read the first sentence aloud: the forecast averaged 1.7 GW above reported
   output, 15.5 percent of mean actual generation.

### 2:45 to 3:45, the finding as value

Say: the headline is not that the forecast is bad; it is that it sits high, steadily, at every
lead time and on 27 of 31 days. For buying, that means the P90 and P95 overforecast numbers,
about 4.1 and 5.3 GW, are the practical uncertainty references when sizing a position. WindLens
turns a vague distrust of forecasts into numbers you can plan against.

### 3:45 to 4:30, honesty and next steps

Say, plainly: this is one month, in sample; the datasets do not explain why the forecast sits
high because they carry no curtailment or availability data; and the 09:00 cutoff is a
configurable assumption. Next steps: more months, an availability feed, and a bias adjusted
default view. Close: "WindLens makes the day-ahead wind bet visible. Thank you."

## Part 2: tech lead review (target 5:00)

### 0:00 to 0:30, opening (say these words)

"This is WindLens from the engineering side: a FastAPI backend with pure, tested metric
functions, a React and Vite frontend with one typed API client, a committed data snapshot so the
app never depends on a live API, and two deployment paths: Docker Compose for local and CI, and
a single Vercel Python function in production. Everything you see is reproducible from the repo."

### 0:30 to 1:30, architecture and data flow

Show the ASCII diagram in README.md. Data flow: one maintenance command, `python -m
backend.ingest`, pulls FUELHH and WINDFOR from Elexon, normalizes them, and writes the versioned
snapshot `backend/data/january_2026.json` (1,488 actual rows, 17,864 forecast vintages, 2.24 MB).
The FastAPI app reads only that snapshot, so production has no live Elexon dependency. The
frontend never calls fetch outside `frontend/src/api/client.ts`.

### 1:30 to 2:30, selection and alignment with the worked example

Open `backend/metrics.py`. Explain: for each target hour T, select the latest WINDFOR edition
published at or before the D-1 cutoff; align the actual to the mean of FUELHH half hours at T and
T+30 minutes; signed error is forecast minus actual. Golden example from the tests: target Jan 2
00:00 UTC, selected edition 18,781 MW published Jan 1 07:30 UTC, actuals 15,228 and 15,505 MW,
mean 15,366.5 MW, error +3,414.5 MW. Missing half hours drop the target and are reported, never
filled.

### 2:30 to 3:15, metrics module and tests

Same file: typed, pure functions; standard library math and statistics only, no pandas.
`tests/` has 20 pytest tests including missing data, duplicate editions, cutoff validation, and
the golden example; `backend/metrics.py` sits at 100 percent coverage. Frontend has 29 Vitest
tests over formatting, derivations, the buying notes builder with a negative bias fixture, the
cutoff control, and error and loading states.

### 3:15 to 4:00, repo tour (open these files in this order)

1. `README.md`, decisions and findings tables.
2. `backend/metrics.py`, selection, alignment, and metrics.
3. `backend/app.py`, nine GET endpoints and validation.
4. `api/index.py`, the Vercel entrypoint importing the same app object.
5. `frontend/src/api/client.ts` and `frontend/src/lib/notes.ts`.
6. `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`, `docker-compose.yml`.
7. `.github/workflows/ci.yml`, three jobs with smoke tests.
8. `scripts/bias_diagnostic.py`, the reproducible bias evidence tables.

### 4:00 to 4:40, Docker, CI, and deployment

Say: `docker compose up --build` starts uvicorn on 8000 and an unprivileged nginx on 3000 that
proxies /api, so review matches production shape. CI builds both images, waits for healthy
containers, and asserts MAE 2,038.91 and bias +1,747.89 through the proxy. Production is the
static Vite build plus one Python function on Vercel; requirements are split because Vercel
serves the ASGI app itself, so its requirements file has no uvicorn. One lesson worth sharing:
Vercel's FastAPI auto detection skips the requirements install and rewrites paths, so the config
pins framework null.

### 4:40 to 5:00, trade offs and next steps

Say: trade offs were a committed snapshot instead of live calls (deterministic and free, at the
cost of freshness), stdlib metrics instead of pandas (small and auditable), and one national
series instead of regions (matched the brief). Next: more months, an availability feed, and
bias adjusted display by default.

## Questions an evaluator is likely to ask

- Why is the bias 15 percent? The published forecast sat above reported output for 27 of 31 days
  and at every lead time. We measure it and bound it with P90 and P95 buffers; these datasets
  cannot explain the cause because they carry no curtailment or availability data.
- Why the 09:00 cutoff? It is a configurable assumption: 20 minutes before the EPEX hourly gate
  at 09:20 GMT and 50 minutes before N2EX at 09:50. The sensitivity endpoint shows metrics are
  flat across plausible cutoffs.
- Why this hourly alignment? The forecast timestamp is the start of an hour, so it is paired with
  the two half hours inside that hour. The empirical MAE minimum sits at a -2 hour actual window
  shift but gains only 4 percent MAE, so we keep the approved rule and flag the question to a
  data owner.
- Why not claim curtailment? Curtailment needs unconstrained availability, which FUELHH and
  WINDFOR do not publish. Rising absolute bias with wind level is consistent with constraint but
  is evidence, not proof.
- Why standard library metrics? Seven metrics over 744 rows need no dataframe; pure functions on
  the stdlib are fast, auditable, dependency free, and fully covered by tests.
- Why a committed snapshot? Deterministic demos and tests, no live API dependency in production,
  and a 2.24 MB fixture is cheap. Freshness is a maintenance command away.
- Why two requirements files? Vercel serves the ASGI app itself and needs only fastapi and
  pydantic; the Docker image runs uvicorn. Sharing one file would install uvicorn on Vercel or
  omit it in Docker.
- Why hash routing? The static deployment needs no server rewrites, deep links work on Vercel
  and in Docker, and every view is shareable.
