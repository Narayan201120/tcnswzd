# WindLens design research and backend contract

## Purpose and boundary

WindLens is decision support for a GB day-ahead wind forecast. It compares the Elexon WINDFOR forecast with FUELHH wind generation outturn. The product uses only these two Elexon datasets. It does not calculate residual demand or recommend a purchase quantity because demand, prices, dispatch constraints, and other generation sources are outside this data boundary.

## Research sources and API contract

The exact Elexon documentation pages reviewed are:

- [FUELHH stream endpoint documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [WINDFOR stream endpoint documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
- [Elexon wind generation page](https://bmrs.elexon.co.uk/wind-generation)
- [Elexon Insights API developer portal](https://developer.data.elexon.co.uk/)

The production API base is `https://data.elexon.co.uk/bmrs/api/v1`. The sample and coverage requests were:

- FUELHH sample: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?publishDateTimeFrom=2026-01-02T00:00:00Z&publishDateTimeTo=2026-01-02T01:00:00Z&fuelType=WIND`
- WINDFOR sample for target `2026-01-02T00:00:00Z`: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-31T00:00:00Z&publishDateTimeTo=2026-01-01T09:00:00Z`
- FUELHH coverage query: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?publishDateTimeFrom=2026-01-01T00:00:00Z&publishDateTimeTo=2026-02-02T03:00:00Z&fuelType=WIND`
- WINDFOR coverage query: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00:00Z&publishDateTimeTo=2026-02-01T00:00:00Z`

The dataset stream endpoints accept publication-time bounds named `publishDateTimeFrom` and `publishDateTimeTo`; FUELHH also accepts `fuelType=WIND`. The filters select rows by publication time, not target `startTime`. For example, a FUELHH publication window of Jan 2 00:00Z through 01:00Z returned target starts Jan 1 23:30Z, Jan 2 00:00Z, and Jan 2 00:30Z. Fetch by publication time, then filter results by target start time. Stream responses are JSON arrays. FUELHH rows include `dataset`, `publishTime`, `startTime`, `settlementDate`, `settlementPeriod`, `fuelType`, and `generation`; WINDFOR rows include `dataset`, `publishTime`, `startTime`, and `generation`.

The Elexon developer portal says its APIs are public and require no API key. It describes stream endpoints as JSON-only and says there is no restriction on the amount of data returned. I found no published numeric request-rate quota. A data-return statement is not a request-rate guarantee, so ingestion should cache responses and retry transient errors with bounded backoff.

Small raw examples are checked in at [docs/samples/fuelhh_stream_sample.json](samples/fuelhh_stream_sample.json) and [docs/samples/windfor_target_sample.json](samples/windfor_target_sample.json). The actual sample has three FUELHH rows, all with `fuelType` equal to `WIND`, and eleven WINDFOR revisions for one target start.

## January 2026 findings

The queried FUELHH data contains 48 half-hourly records for every date from Jan 1 through Jan 31, with no missing or duplicate target starts in that interval. Jan 2 through Feb 1 has complete actual coverage for all 31 dates. The alternative Jan 1 through Jan 31 is also covered. The coverage query returned 1,536 half-hour WIND rows for Jan 1 through Feb 1 inclusive.

WINDFOR target starts in the queried January window are hourly, not half-hourly. Each 31-day delivery window has 744 hourly targets. For the forecast sample target `2026-01-02T00:00:00Z`, FUELHH provides actuals at that start and 30 minutes later. The WINDFOR payload does not contain an `endTime`; the sample and hourly cadence support treating `startTime` T as the start of the one-hour interval `[T, T+1h)`. This interval convention is explicit in the application contract and will be exercised by alignment tests.

For primary scoring, pair each hourly forecast with the arithmetic mean of the two FUELHH WIND half-hours starting at T and T+30 minutes UTC. Thus one forecast at `00:00Z` is scored against the mean of actuals at `00:00Z` and `00:30Z`, covering `[00:00Z, 01:00Z)`. Drop a target if either half-hour actual is missing. Do not interpolate, substitute zero, or score a one-half-hour partial mean. Report the expected target count, scored target count, and the count dropped for a missing half-hour. The Jan data audit found both half-hour values for all 744 target hours, so the observed missing-half-hour drop count is 0. The implementation still reports this count for any later incomplete source period.

The Elexon wind page describes hourly forecast coverage from 20:00 on the current day through 20:00 two days later, a 48-hour target window. It says updates are published up to eight times per day at 03:30, 05:30, 08:30, 10:30, 12:30, 16:30, 19:30, and 23:30 GMT. In the fetched Jan 1 through Jan 31 history, eight distinct publication editions were observed on each date. Most observed issue times were recorded at 02:30Z, 04:30Z, 07:30Z, 09:30Z, 11:30Z, 15:30Z, 18:30Z, and 22:30Z; one midday edition was recorded at 12:25Z. These actual timestamps differ from the page's nominal clock labels, so use each row's `publishTime` rather than infer an issue time from the schedule.

For 744 target hours in the recommended scope, the number of forecast vintages available by a 09:00 Europe/London D-1 cutoff ranged from 3 to 11 per target `startTime`; the median was 11. There were 682 targets with 11 eligible vintages and 62 with 3. Target and publication pairs were unique in the queried history. Across all fetched records for these target dates, measured lead time ranged from 0.5 to 66.5 hours. With the 09:00 D-1 rule, selected lead times ranged from 16.5 to 39.5 hours.

## Scope interpretation

Recommended interpretation: "decisions made in January 2026" means the decision date D-1 is in January. Delivery days are Jan 2 through Feb 1, 2026 inclusive. This gives 31 January decision days and includes the Jan 31 decision for Feb 1 delivery. Actual and forecast coverage was complete in the queried data.

Alternative: use delivery days Jan 1 through Jan 31 inclusive. This is also fully covered, but its decisions run from Dec 31 through Jan 30. It includes a December decision and omits the Jan 31 decision for Feb 1. The D-1 interpretation is recommended because it follows "decisions made in January" directly.

## Decision cutoff and selection

The EPEX SPOT 2025 trading brochure lists GB day-ahead gate closure at 09:20 GMT for hourly contracts and 15:30 GMT for half-hourly contracts. Nord Pool lists N2EX gate closure at 09:50 GMT. January is GMT in Europe/London. Sources: [EPEX SPOT trading brochure, February 2025](https://www.epexspot.com/sites/default/files/2025-02/EPEX%20SPOT%20Trading%20Brochure%202025%20February.pdf) and [Nord Pool: About the N2EX Day Ahead Auction](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction).

**Assumption, configurable default:** use 09:00 Europe/London on D-1. It is 20 minutes before EPEX's hourly gate closure and 50 minutes before N2EX closure. This is a conservative common morning cutoff, not a claim about the client's operational deadline. The later EPEX half-hourly auction permits a later cutoff if the client uses it. API requests accept a `cutoff` clock time in Europe/London. Resolve and show both the local cutoff and UTC instant for each delivery date.

For each target hour, select the forecast row with the greatest `publishTime` at or before the D-1 cutoff. Later vintages remain visible in the revision view but cannot be selected for that cutoff. If no eligible row exists, return an explicit missing forecast.

Cutoff sensitivity compares 08:00, 09:00, and 09:20 Europe/London, plus an optional user-supplied cutoff. Report MAE, RMSE, signed bias, P95 absolute error, and scored target count for each. The 09:20 scenario is a sensitivity value at the EPEX hourly gate, not an operational safety margin.

## Horizon and error dimensions

For each forecast vintage, define lead time exactly as:

`lead_hours = (startTime_utc - publishTime_utc).total_seconds() / 3600`

This is the forecast lead to its hourly target, not time from the decision cutoff. For selected-cutoff scoring, retain error by delivery-hour target timestamp. Separately, use all available January-published WINDFOR vintages and matched hourly actuals for a one-dimensional lead-time analysis. Bucket lead time into one-hour intervals from 0 through 48 hours, represented as `[0,1)`, `[1,2)`, through `[47,48)`. Include row count, MAE, and signed bias per bucket. Count and report vintages excluded because lead time is outside `[0,48)` or no complete actual pair exists. Do not combine hour of day and lead time as independent dimensions or present them as a two-dimensional relationship. The selected-cutoff delivery-hour series and all-vintage lead-time profile answer separate questions.

## Worked selection and golden test example

Target: `2026-01-02T00:00:00Z`. Decision date: Jan 1. Default cutoff: Jan 1 09:00 Europe/London, equal to `2026-01-01T09:00:00Z` because the UK is on GMT. These are all eleven candidate rows available by that cutoff, in chronological order. Generation is MW.

| Publish time UTC | Forecast MW | Eligible at cutoff |
| --- | ---: | --- |
| 2025-12-31T02:30:00Z | 19087 | Yes |
| 2025-12-31T04:30:00Z | 18955 | Yes |
| 2025-12-31T07:30:00Z | 18959 | Yes |
| 2025-12-31T09:30:00Z | 19109 | Yes |
| 2025-12-31T11:30:00Z | 19161 | Yes |
| 2025-12-31T15:30:00Z | 19099 | Yes |
| 2025-12-31T18:30:00Z | 19014 | Yes |
| 2025-12-31T22:30:00Z | 19162 | Yes |
| 2026-01-01T02:30:00Z | 18767 | Yes |
| 2026-01-01T04:30:00Z | 18719 | Yes |
| 2026-01-01T07:30:00Z | 18781 | **Chosen** |

The FUELHH actual at `2026-01-02T00:00:00Z` is 15,228 MW, published at `2026-01-02T00:30:00Z`. The next actual at `00:30Z` is 15,505 MW. The primary hourly actual is `(15,228 + 15,505) / 2 = 15,366.5 MW`. With `error = forecast - actual`, the chosen vintage error is `18,781 - 15,366.5 = +3,414.5 MW`. Its lead time is 16.5 hours. The accuracy tests must assert this selection, alignment, and error as a golden example. Actuals are never shown in the decision view.

## Accuracy metrics

For each matched hourly target, define `error_mw = forecast_mw - actual_mw`. Positive error means forecast generation was above reported outturn.

- MAE: mean absolute error in MW.
- RMSE: square root of mean squared error in MW.
- Bias: mean signed error in MW.
- nMAE: `100 * MAE / mean(actual_mw)` as a percentage.
- Relative bias: `100 * bias / mean(actual_mw)` as a percentage. Return unavailable if mean actual is zero.
- Signed error percentiles: P5, P10, P50, P90, and P95 of `error_mw`.
- Absolute error percentiles: P50, P90, and P95 of `abs(error_mw)`.
- MAPE: mean of `100 * abs(error_mw / actual_mw)` for nonzero actuals only. Exclude zero-actual rows, report the excluded count, and return unavailable when all actuals are zero. Do not replace a zero denominator with an epsilon.
- One-sided buffer reference: clip each signed error at zero with `max(error_mw, 0)`, then compute P90 and P95 in MW across all scored hours. Also compute P90 and P95 of `100 * max(error_mw, 0) / forecast_mw` as percent of forecast for rows with nonzero forecast, reporting that denominator count. These are historical overforecast uncertainty references, not procurement instructions.
- Selected-cutoff delivery-hour output: retain one result per UTC target hour, with forecast, paired actual, signed error, absolute error, selected `publishTime`, and lead time.
- Selected-cutoff by-hour profile: optionally group selected errors by Europe/London local clock hour with counts. Keep the timestamp series available; do not combine this profile with lead-time buckets.
- All-vintage lead-time profile: one-hour buckets over `[0,48)` using all January-published vintage rows matched to actuals, with MAE, signed bias, and count.
- Error distribution: retain signed errors; absolute-error percentiles are reported separately.

A P90 or P95 one-sided error is an uncertainty reference for a user to consider. It is not a recommended purchase buffer or quantity because demand, price, and portfolio data are not available.

## Data quality and time rules

- Normalize `startTime`, `publishTime`, and cutoffs to timezone-aware UTC for arithmetic and keys. Accept cutoffs in Europe/London and display local and UTC values.
- Treat a WINDFOR target `startTime` T as the start of `[T,T+1h)`. Pair only the FUELHH records at T and T+30 minutes. If either is absent, drop that target from scoring and report the missing-half-hour count. Never fill with zero, carry-forward, interpolate, or score a partial mean.
- Stream request date filters are publication-time filters. Filter records to target start and publication windows after retrieval.
- Multiple WINDFOR rows for one target are expected vintages. Drop exact `(startTime,publishTime)` duplicates and flag conflicting duplicates.
- FUELHH may have corrections. If the same target has multiple actual rows, use the latest `publishTime` and record that a correction existed.
- Use UTC target keys across daylight saving changes. A London local delivery day can have 46 or 50 half-hours and 23 or 25 hourly forecasts. Do not synthesize periods. Keep repeated local clock hours distinct by UTC instant and offset.
- FUELHH has no curtailment field or unconstrained wind availability. A zero value is a valid observed output and remains in all absolute and signed metrics. It is excluded only from MAPE's denominator. Do not estimate curtailed generation or claim weather-only forecast skill. No zero WIND actuals appeared in the queried January sample.
- Elexon describes WINDFOR coverage as farms visible to the system operator with operational metering. FUELHH is generation by fuel type. Their populations may not be perfectly identical; this limits interpretation of measured error.

## Backend contract and deployment design

Use one FastAPI app object in `backend/app.py`. `api/index.py` is a thin Vercel entrypoint that imports and reuses that same object. Pure functions own vintage selection, hourly actual alignment, lead-time bucketing, and metrics; route handlers validate requests, read the bundled JSON snapshot, and translate results to Pydantic response models.

The reproducible ingestion command is `python -m backend.ingest`. It fetches all WINDFOR publications from Jan 1 through Jan 31 for lead-time analysis, plus Dec 31 publications that target Jan 2 so the first delivery day has its full revision history. The lead-time endpoint includes only Jan 1 through Jan 31 publication times; Dec 31 rows provide decision and revision context. It fetches FUELHH WIND actuals for delivery starts Jan 2 through Feb 1. The script uses bounded retries and a polite request interval, filters and normalizes rows, logs progress, and writes a compact versioned JSON snapshot under `backend/data/`. Ingestion is a development or maintenance operation and must never run as part of a production request. The app reads the committed snapshot by default.

Use Python standard library math and statistics for the metric calculations. Do not add pandas, pyarrow, or numpy for this data volume. Runtime dependencies are FastAPI and its Pydantic/Starlette requirements. Test dependencies are separate. Phase 2 will report the measured snapshot size and installed runtime dependency size against Vercel's 250 MB unzipped function limit.

Production is planned as a static Vite frontend and Python serverless API on Vercel, with the snapshot bundled read-only. Docker Compose is for local and review environments. The core app does not depend on a live Elexon call.

## Planned backend endpoints

- `GET /health`: process and snapshot health.
- `GET /api/forecast/latest?delivery_date=2026-01-02&cutoff=09:00`: actual-free forecast for each delivery hour, selected vintage time, and resolved cutoff.
- `GET /api/actual-vs-forecast?start=2026-01-02&end=2026-02-01&cutoff=09:00`: selected-cutoff chronological comparison series and coverage counts.
- `GET /api/accuracy/summary?start=2026-01-02&end=2026-02-01&cutoff=09:00`: selected-cutoff metrics.
- `GET /api/accuracy/by-hour?start=2026-01-02&end=2026-02-01&cutoff=09:00`: selected-cutoff profile grouped by local delivery clock hour.
- `GET /api/accuracy/by-lead-time?start=2026-01-02&end=2026-02-01`: all-vintage one-hour lead buckets over `[0,48)`.
- `GET /api/accuracy/distribution?start=2026-01-02&end=2026-02-01&cutoff=09:00`: signed and absolute error distribution values.
- `GET /api/accuracy/cutoff-sensitivity?start=2026-01-02&end=2026-02-01&cutoff=10:00`: comparison for 08:00, 09:00, 09:20, and the supplied 10:00 time.
- `GET /api/revisions?delivery_date=2026-01-02&cutoff=09:00`: all snapshot vintages for that delivery date, grouped into hourly series and marked per target with `selected_at_cutoff`.
