# WindLens handoff

## Phase status

| Phase | Status | Commit evidence |
| --- | --- | --- |
| 0. Repository and environment | Done | 8e0387f, cd9d732, 380230f |
| 1. Research and design | Done | 00a1803, 0c71eea, c530b9b |
| 2. Backend and snapshot | Done | f86a900, 840f7f5, eb01f72, d655763, 7ad05d3 |
| 3. React frontend | Done | 473cfce |
| 4. Docker and CI | Pending | Not started |
| 5. Vercel deployment | Stage A prepared and locally verified; awaiting dashboard deploy | This commit |
| 6. README, video, and final handoff | Pending | Not complete |

Repository head before this handoff change was 7ad05d3. Phase 2 verification in the Codespace: 20 tests passed, metrics module coverage 100% (170 of 170 statements). Tests were not rerun during this documentation-only handoff turn.

## Decisions log

| Decision | Current choice | Reason |
| --- | --- | --- |
| January scope | Decision date D-1 is in January, so delivery days Jan 2 through Feb 1, 2026 | Covers all 31 January decisions and complete actual coverage. Jan 1 through Jan 31 delivery would include a Dec 31 decision and omit Jan 31's Feb 1 delivery. |
| Default cutoff | 09:00 Europe/London on D-1, configurable per request | Assumption giving 20 minutes before EPEX hourly gate closure at 09:20 and 50 minutes before N2EX closure at 09:50. Conservative common cutoff, not a client commitment. |
| Forecast selection | For each target startTime, choose latest publishTime at or before the D-1 cutoff | Reconstructs information available at decision time. |
| Hourly alignment | Forecast at UTC T versus mean of actual starts T and T+30 minutes | Approved primary score treats the target as the hour beginning at T. Missing either half-hour drops the target. Zero missing half-hours in the 744 scored targets. |
| Signed error | Forecast MW minus actual MW | Positive values mean forecast exceeded reported outturn. |
| Buffer reference | P90 and P95 of max(forecast minus actual, 0), in MW, and percent of nonzero forecasts | Historical overforecast reference, not a purchase recommendation because demand, price, and portfolio data are absent. |
| Dependencies | Python standard library for metrics, FastAPI, Starlette, Uvicorn, Pydantic; no NumPy, pandas, or PyArrow | Keeps runtime small and avoids unnecessary analytics packages. |
| Snapshot | Versioned JSON at backend/data/january_2026.json, 2,244,993 bytes | Simple deployable fixture with 1,488 actual rows, 17,864 vintages, 17,688 January publications, and 176 Dec 31 context vintages. Timestamps are UTC ISO strings. |

## Phase 2 endpoints and real response examples

Examples below were requested from the FastAPI app in the Codespace with the committed snapshot. Arrays are excerpts from the actual responses.

1. GET /health
   Response: {"status":"ok","snapshot_loaded":true,"actual_rows":1488,"forecast_vintages":17864,"schema_version":1}

2. GET /api/forecast/latest?delivery_date=2026-01-02&cutoff=09:00
   Actual-free response excerpt: {"delivery_date":"2026-01-02","cutoff_local":"2026-01-01T09:00+00:00","cutoff_utc":"2026-01-01T09:00:00Z","points":[{"start_time_utc":"2026-01-02T00:00:00Z","forecast_mw":18781.0,"publish_time_utc":"2026-01-01T07:30:00Z","lead_hours":16.5}],"missing_forecast_hours":0}

3. GET /api/actual-vs-forecast?start=2026-01-02&end=2026-02-01&cutoff=09:00
   Response excerpt: {"start_date":"2026-01-02","end_date":"2026-02-01","cutoff_local":"09:00","cutoff_timezone":"Europe/London","coverage":{"expected_target_hours":744,"scored_target_hours":744,"missing_half_hour_targets":0,"missing_forecast_targets":0,"corrected_actual_starts":0},"points":[{"start_time_utc":"2026-01-02T00:00:00Z","forecast_mw":18781.0,"actual_mw":15366.5,"error_mw":3414.5,"absolute_error_mw":3414.5,"publish_time_utc":"2026-01-01T07:30:00Z","lead_hours":16.5}]}

4. GET /api/accuracy/summary?start=2026-01-02&end=2026-02-01&cutoff=09:00
   Real values: sample_count 744; mean_actual_mw 11283.557795698925; mae_mw 2038.9126344086021; rmse_mw 2504.758652899355; bias_mw 1747.8870967741937; nmae_pct 18.069767278418126; relative_bias_pct 15.49056714576722; mape_pct 22.04464554856942. Signed error percentiles MW P5/P10/P50/P90/P95: -1151.425/-549.3/1592.0/4097.9/5283.35. Absolute error P50/P90/P95: 1671.0/4097.9/5283.35. Positive buffer P90/P95: 4097.9/5283.35 MW and 29.7794%/41.9028% of forecast. Coverage: 744 expected and scored, zero missing half-hours, zero missing forecasts, zero corrected actual starts.

5. GET /api/accuracy/by-hour?start=2026-01-02&end=2026-02-01&cutoff=09:00
   First real bucket: {"hour_local":0,"sample_count":31,"mae_mw":2027.8064516129032,"bias_mw":1952.741935483871}

6. GET /api/accuracy/by-lead-time?start=2026-01-02&end=2026-02-01
   Response counts: 11,682 eligible January-published vintages, 6,006 excluded outside [0,48), zero excluded for missing actual pairs. First bucket: {"lead_start_hours":0,"lead_end_hours":1,"sample_count":240,"mae_mw":1703.16875,"bias_mw":1473.5395833333334}

7. GET /api/accuracy/distribution?start=2026-01-02&end=2026-02-01&cutoff=09:00
   Real response contained 744 signed and absolute errors. First three signed values: -3550.0, -3243.0, -2867.0 MW. First three absolute values: 4.0, 6.5, 8.0 MW.

8. GET /api/accuracy/cutoff-sensitivity?start=2026-01-02&end=2026-02-01&cutoff=10:00
   The response compared 08:00, 09:00, 09:20, and 10:00 Europe/London. For 08:00, 09:00, and 09:20, each row had n=744, MAE 2038.912634, RMSE 2504.758653, bias +1747.887097, and P95 absolute error 5283.35 MW. For 10:00: n=744, MAE 2013.0081, RMSE 2505.9431, bias +1729.9315, P95 absolute error 5322.25 MW.

9. GET /api/revisions?delivery_date=2026-01-02&cutoff=09:00
   The real response contained 32 publication groups and 24 selected target points. First target selected point: {"publish_time_utc":"2026-01-01T07:30:00Z","start_time_utc":"2026-01-02T00:00:00Z","generation_mw":18781.0,"selected_at_cutoff":true}

## Bias and alignment check

The reproducible audit script is scripts/bias_check.py. It used the Codespace snapshot plus a fresh read of boundary FUELHH actuals from the existing Elexon stream. It added no API endpoint.

At the 09:00 cutoff and approved zero-shift hourly-mean alignment, 744 hours scored. Mean actual was 11,283.56 MW, MAE 2,038.91 MW, nMAE 18.07%, bias +1,747.89 MW, and relative bias +15.49%. Jan 2 00:00 UTC hand check: forecast 18,781 MW; actuals 15,228 and 15,505 MW; mean actual 15,366.5 MW; error +3,414.5 MW.

Every shift and half-hour variant scored 744 rows:

| Actual shift | First half MAE / bias MW | Second half MAE / bias MW | Mean MAE / bias MW |
| ---: | ---: | ---: | ---: |
| -2 h | 1,966.44 / +1,717.30 | 1,961.39 / +1,721.80 | 1,958.24 / +1,719.55 |
| -1 h | 1,969.73 / +1,731.90 | 1,989.60 / +1,736.08 | 1,974.53 / +1,733.99 |
| 0 h | 2,022.47 / +1,745.94 | 2,061.45 / +1,749.84 | 2,038.91 / +1,747.89 |
| +1 h | 2,098.08 / +1,759.04 | 2,143.73 / +1,763.11 | 2,119.09 / +1,761.08 |
| +2 h | 2,183.77 / +1,772.30 | 2,233.20 / +1,776.51 | 2,206.78 / +1,774.40 |

The tested MAE minimum is -2 h mean, not zero shift. No tested alignment satisfies both empirical minimization and the approved same-hour rule. Zero shift matches the target timestamp and approved contract. Elexon's docs call WINDFOR hourly and expose target startTime, but do not explicitly spell out the half-open interval. The backend has no implementation mismatch with its contract, but source-time semantics should be confirmed with a domain owner. Do not present zero shift as the empirical minimum.

Bias by actual tercile, 248 rows each:

| Group | Actual range MW | Mean actual MW | MAE MW | Bias MW | Relative bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 1,711.5 to 8,824.5 | 6,331.43 | 1,820.55 | +1,450.68 | +22.91% |
| Mid | 8,828.5 to 14,474.5 | 11,658.24 | 1,941.92 | +1,510.19 | +12.95% |
| High | 14,481.0 to 17,755.5 | 15,861.00 | 2,354.27 | +2,282.79 | +14.39% |

Bias is positive in all groups. Absolute bias is highest at high wind, but relative bias is not monotonic and is highest at low wind. Across four-hour Europe/London blocks every bias is positive, ranging from +1,323.46 MW for 12 to 15 to +2,286.07 MW for 04 to 07. This is not a constant MW offset and does not demonstrate a simple curtailment effect. FUELHH has no curtailment or unconstrained availability field.

Elexon says wind forecasts are hourly over a D to D+2 horizon and the WINDFOR stream schema includes startTime but no endTime. Sources: [WINDFOR stream docs](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) and [Elexon wind generation](https://bmrs.elexon.co.uk/wind-generation).

Client wording: Across January's 744 decision hours, the selected forecast averaged about 1.75 GW above reported wind output. That bias is a measured finding to include in uncertainty review. These datasets do not show unconstrained wind availability or curtailment, so this does not prove curtailment.

## API contract for Phase 3

All routes return JSON. Dates use YYYY-MM-DD. Request cutoff is HH:MM in Europe/London. Energy values and errors are MW. Percentage metrics are 0 to 100 percent. UTC timestamps are ISO 8601 strings ending in Z. The target timestamp is the start of an hour.

- GET /health: status, snapshot_loaded, actual_rows, forecast_vintages, schema_version.
- GET /api/forecast/latest?delivery_date=2026-01-02&cutoff=09:00: delivery_date; cutoff_local and cutoff_utc; points with start_time_utc, forecast_mw, publish_time_utc, lead_hours; missing_forecast_hours. Contains no actuals. cutoff_local here is a resolved local datetime including offset.
- GET /api/actual-vs-forecast?start=2026-01-02&end=2026-02-01&cutoff=09:00: start_date, end_date, cutoff_local, cutoff_timezone, coverage, points with start_time_utc, forecast_mw, actual_mw, error_mw, absolute_error_mw, publish_time_utc, lead_hours. cutoff_local here is the requested clock string.
- GET /api/accuracy/summary with start/end/cutoff: sample_count, mean_actual_mw, mae_mw, rmse_mw, bias_mw, nmae_pct, relative_bias_pct, mape_pct, mape_sample_count, mape_excluded_zero_actual_count, signed_error_percentiles_mw, absolute_error_percentiles_mw, positive_error_buffer_mw, positive_error_buffer_pct_forecast, positive_error_buffer_pct_sample_count, dates, cutoff, coverage.
- GET /api/accuracy/by-hour with start/end/cutoff: dates, cutoff, timezone, buckets with hour_local, sample_count, mae_mw, bias_mw. Hour is Europe/London local clock.
- GET /api/accuracy/by-lead-time with start/end: dates, eligible_vintage_count, excluded_out_of_range_count, excluded_missing_actual_count, buckets with lead_start_hours, lead_end_hours, sample_count, mae_mw, bias_mw. No cutoff; includes all January-published vintages.
- GET /api/accuracy/distribution with start/end/cutoff: dates, cutoff, timezone, sample_count, signed_error_mw array, absolute_error_mw array.
- GET /api/accuracy/cutoff-sensitivity with start/end and optional cutoff: dates, timezone, cutoffs_compared, results with cutoff_local, sample_count, mae_mw, rmse_mw, bias_mw, p95_absolute_error_mw. Always compares 08:00, 09:00, 09:20 plus the supplied cutoff if present.
- GET /api/revisions?delivery_date=2026-01-02&cutoff=09:00: delivery_date, cutoff_local, cutoff_utc, vintages. Each vintage has publish_time_utc and points with start_time_utc, generation_mw, selected_at_cutoff. cutoff_local here is a resolved local datetime including offset.

Default scoring range is Jan 2 through Feb 1; default cutoff is 09:00. Latest forecast and revisions require delivery_date. Comparison, summary, by-hour, distribution, and sensitivity accept start/end and cutoff as applicable. By-lead-time accepts start/end with no cutoff.

Route validation and service errors use {"detail":"message"}. Observed invalid cutoff response: HTTP 422 and {"detail":"cutoff must use HH:MM in Europe/London"}. Pydantic query validation also returns HTTP 422 with detail as an array of validation objects. Missing or invalid snapshot returns HTTP 503 with a detail string. The app has no authentication.

## Open questions, known issues, and unverified items

- Confirm WINDFOR startTime interval boundary with Elexon or a utility data owner. Elexon describes hourly forecasts and timestamps but does not state the end boundary in the referenced payload. The best measured MAE at -2 h conflicts with the approved same-hour rule.
- Bias is consistently positive. The restricted datasets cannot identify curtailment or unconstrained wind availability.
- Confirm the client's operational decision deadline and auction product. The 09:00 cutoff is an assumption based on gate times.
- Vercel built artifact size and deployed runtime have not been measured. The prebuild estimate is about 18.0 MB uncompressed, under 250 MB, but it is not a built artifact check.
- Frontend, component tests, linting, Docker, CI, public Vercel deployment, video, final README, and submission form are not complete.
- By-hour and by-lead-time are separate views. Do not present them as independent dimensions of a 2D effect.

## Vercel deployment, Stage A (native Python runtime, prepared and locally verified)

Files added at the repository root: `vercel.json`, `requirements.txt`, and `api/index.py`.

- vercel.json: install command `cd frontend && npm ci`, build command `cd frontend && npm run build`, output directory `frontend/dist`; `functions` entry for `api/index.py` with `includeFiles: backend/**` so the backend package and `backend/data/january_2026.json` ship with the function; rewrites send `/api/:path*` and `/health` to the function while everything else serves the static build. Hash routing means no SPA fallback rewrite is needed: the only document route is `/`, and all views are `/#/...` fragments.
- requirements.txt: `fastapi==0.119.1` and `pydantic==2.14.1` only. Vercel's Python runtime serves the ASGI app with its own server, so Uvicorn is intentionally absent. Verified during the local build that Vercel installs requirements with uv and vendors the packages into the function.
- api/index.py: imports the one FastAPI app object from backend.app after inserting the repository root into sys.path, so the import resolves regardless of runtime path order. The snapshot path in backend/store.py is resolved from its own file location, not the working directory.
- Local verification in the Codespace, no Vercel account needed: loading api/index.py by file path from /tmp boots the app, and TestClient calls return health ok with 1,488 actual rows and 17,864 vintages, MAE 2,038.91 MW and bias +1,747.89 MW and relative bias +15.49 percent for the default January run, and 24 forecast points with 18,781.0 MW first forecast and zero missing for Jan 2 at the 09:00 cutoff. These match the Codespace backend values exactly. A full `npx vercel@latest build` with stub project settings succeeded: frontend built (572.4 kB JS, 162.9 kB gzip), Python function built with uv, and the function bundle map includes backend/data/january_2026.json with fastapi, pydantic, starlette, and pydantic_core vendored. The uv virtual environment used for the function weighed 19 MB uncompressed, in line with the prebuild estimate of about 18 MB.
- Deployment steps for the owner: sign in at vercel.com, Add New, Project, Import Narayan201120/tcnswzd. Framework preset Other, root directory left empty (repository root), project name `windlens` (fallbacks `windlens-app`, `windlens-forecast`). vercel.json supplies the build settings; no environment variables are required. Deploy, then Settings, Deployment Protection: disable Vercel Authentication so the production URL is public. Every push to master redeploys automatically.
- The production URL is deliberately not written here until the owner confirms the deployment works.

## Next step: Vercel Stage A deploy, then Stage B, then Phase 4

Order confirmed with the owner: Phase 5 first (two stages), then Phase 4, then Phase 6.

1. Stage A (this commit): the owner imports the repository in the Vercel dashboard (project name `windlens`, framework preset Other, root directory left at the repository root). Dashboard build settings are supplied by vercel.json: install `cd frontend && npm ci`, build `cd frontend && npm run build`, output `frontend/dist`. Python runtime default 3.12. If Deployment Protection is enabled, turn it off so the production URL is public.
2. After the owner shares the URL: verify with curl `/health`, `/api/forecast/latest`, `/api/accuracy/summary` (expect MAE 2,038.91 MW and bias +1,747.89 MW), the SPA root, and a hash route, and confirm no login wall. Only then may the production URL be written into files.
3. Stage B (time boxed to one hour, only after Stage A works): branch `vercel-container` adds `Dockerfile.vercel` (python 3.12 slim, uvicorn on 0.0.0.0:$PORT, snapshot included) and a `services` based vercel.json with a web service for the Vite build and an api service using `runtime: container` and `entrypoint: Dockerfile.vercel`, with rewrites sending `/api/(.*)` and `/health` to the api service. Per the Vercel Docker guide, the original request path reaches the container service, so the existing `/api` prefixed FastAPI routes work unchanged. Verify locally in the Codespace as far as docker build, run, and curl. Deployed as a second Vercel project from the branch; do not merge into master until the owner decides.
4. Phase 4 (Docker and CI) after Phase 5 is approved, then Phase 6.

## Phase 3 frontend scope, as implemented

- Views: Decision (delivery day and cutoff controls, 24 hour published curve, peak, trough, mean cards, revisions panel, optional January bias adjustment slider), Accuracy (seven metric cards, actual versus forecast, signed error over time, daily mean error with positive day count, error by delivery hour, error by lead time, error distribution histogram, cutoff sensitivity table), Buying notes (sentences built from live API values, limitations list).
- Stack: TypeScript, React 18, Vite 5, Recharts, plain CSS with light and dark support. Hash routing gives shareable view URLs without server rewrites. 29 Vitest and Testing Library tests pass; ESLint and Prettier configured and passing. Bundle 572.4 kB JS, 162.9 kB gzip, 8.4 kB CSS. Screenshots in docs/screenshots.
- One typed API client module in frontend/src/api/client.ts with the base path from the single env var VITE_API_BASE_PATH (default /api). Pure helpers in frontend/src/lib (format, derive, notes). No fetch calls in components.
