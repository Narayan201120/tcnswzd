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
- Signed error percentiles: P5, P10, P50, P90, and P95 of `error_mw`. Percentiles use linear interpolation at rank `(n-1)*p` in the sorted values.
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

Metrics use Python standard library math and statistics. The tested runtime dependencies are FastAPI 0.119.1, Starlette 0.48.0, Uvicorn 0.54.0, and Pydantic 2.14.1. Test dependencies are separate. No NumPy, pandas, or PyArrow is used. The committed snapshot has 1,488 actual rows and 17,864 forecast vintages, including 17,688 January publications and 176 Dec 31 context vintages, and is 2,244,993 bytes. A clean Codespace runtime dependency target measured 15,661,832 bytes. Runtime dependencies plus the backend tree and `api/index.py` measured about 18,016,666 bytes uncompressed, about 17.2 MiB, below the 250 MB Vercel function limit. This is a conservative input-size estimate, not a built Vercel artifact; deployment must confirm the final bundle.

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


## Known characteristics: January 2026 bias and alignment audit

The January 2 through February 1 run has 744 scored hours and no missing half-hour actuals. With the 09:00 Europe/London decision cutoff and the documented same-hour mean alignment, mean actual generation was 11,283.56 MW. MAE was 2,038.91 MW, nMAE was 18.07%, signed bias was +1,747.89 MW, and relative bias was +15.49%. The sign convention is forecast minus actual, so the forecast was above reported outturn on average.

### Hand check of the first target

For target `2026-01-02T00:00:00Z`, selected forecast was 18,781 MW, published at `2026-01-01T07:30:00Z`. FUELHH actuals were 15,228 MW at `00:00Z` and 15,505 MW at `00:30Z`. Their mean is 15,366.5 MW. Error is `18,781 - 15,366.5 = +3,414.5 MW`. This matches the snapshot and endpoint.

### Alignment sensitivity

All combinations scored 744 targets. A shift means actual starts at forecast startTime plus the stated hours. Single-period comparisons use only the first or second half-hour; mean uses both.

| Actual shift | First half MAE / bias MW | Second half MAE / bias MW | Hourly mean MAE / bias MW |
| ---: | ---: | ---: | ---: |
| -2 h | 1,966.44 / +1,717.30 | 1,961.39 / +1,721.80 | 1,958.24 / +1,719.55 |
| -1 h | 1,969.73 / +1,731.90 | 1,989.60 / +1,736.08 | 1,974.53 / +1,733.99 |
| 0 h | 2,022.47 / +1,745.94 | 2,061.45 / +1,749.84 | 2,038.91 / +1,747.89 |
| +1 h | 2,098.08 / +1,759.04 | 2,143.73 / +1,763.11 | 2,119.09 / +1,761.08 |
| +2 h | 2,183.77 / +1,772.30 | 2,233.20 / +1,776.51 | 2,206.78 / +1,774.40 |

The lowest MAE among these 15 comparisons is the -2 h hourly mean at 1,958.24 MW, 80.67 MW lower than the documented 0 h mean. Therefore the documented alignment does not minimize this sample's error. The 0 h rule is retained because it pairs each hourly forecast with the half-hours whose UTC starts fall within that target hour, as required by the approved scoring definition. The -2 h result is a temporal-skill anomaly to validate with a data owner, not evidence to silently relabel timestamps. All shifts retain a large positive bias, so the bias is not created by the half-hour aggregation choice.

### Bias by actual generation level

Terciles are rank-balanced groups of 248 hours each, ordered by hourly mean actual. Relative bias is signed bias divided by mean actual.

| Actual group | Actual range MW | Mean actual MW | MAE MW | Bias MW | Relative bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 1,711.5 to 8,824.5 | 6,331.43 | 1,820.55 | +1,450.68 | +22.91% |
| Mid | 8,828.5 to 14,474.5 | 11,658.24 | 1,941.92 | +1,510.19 | +12.95% |
| High | 14,481.0 to 17,755.5 | 15,861.00 | 2,354.27 | +2,282.79 | +14.39% |

Bias is positive in every tercile and absolute MW bias is largest in the high group. Relative bias is not monotonic: it is largest in the low group, falls in the middle, then rises in the high group. This does not show a simple curtailment-style pattern where overforecast grows steadily with wind output. FUELHH contains reported output, not unconstrained available wind or a curtailment flag, so curtailment cannot be inferred.

### Bias by local time of day

The groups use four-hour Europe/London clock blocks. January is on GMT. Each contains 124 scored hours.

| Local hours | Mean actual MW | MAE MW | Bias MW | Relative bias |
| --- | ---: | ---: | ---: | ---: |
| 00 to 03 | 11,287.76 | 2,227.33 | +2,165.31 | +19.18% |
| 04 to 07 | 10,816.00 | 2,360.57 | +2,286.07 | +21.14% |
| 08 to 11 | 11,051.94 | 1,980.60 | +1,764.88 | +15.97% |
| 12 to 15 | 11,178.46 | 1,900.75 | +1,323.46 | +11.84% |
| 16 to 19 | 11,658.81 | 1,918.20 | +1,339.94 | +11.49% |
| 20 to 23 | 11,708.37 | 1,846.03 | +1,607.67 | +13.73% |

Every time block has positive bias, but the size varies by local time. Together with the tercile results, this is not a single constant MW offset and not a clean monotonic high-wind effect. It is a measured forecast-versus-outturn characteristic needing further periods and source context before assigning a cause.

### Hour convention check

Elexon's [WINDFOR dataset stream documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream) exposes startTime for each forecast target. The official [wind generation page](https://bmrs.elexon.co.uk/wind-generation) describes the product as hourly and states that it spans 20:00 on D through 20:00 on D+2. The payload has no endTime, and documentation does not explicitly state the half-open interval boundary. Interpreting target T as the hour beginning at T is consistent with the documented hourly targets and sample timestamps; averaging FUELHH at T and T+30 minutes implements the approved hourly comparison. Treat [T, T+1h) as the application's convention, not a quoted Elexon definition. The empirical -2 h minimum remains an open validation item.

### Client note

Across the 744 January decision hours, the selected wind forecast averaged about 1.75 GW above reported wind output. That positive bias is a finding to include when reviewing forecast uncertainty and procurement decisions. It does not prove that wind was curtailed: these datasets do not report unconstrained wind availability or curtailment.

## Bias diagnostic follow up (evidence, not proof)

A time boxed diagnostic ran in the Codespace on 2026-10-24 using scripts/bias_diagnostic.py against the committed snapshot, with the approved alignment rule unchanged. Run it from the repo root with `PYTHONPATH=. .venv/bin/python scripts/bias_diagnostic.py`. Every table below is a measurement of that snapshot. They are evidence about the bias pattern, not proof of a cause.

### Lead time profile, 4 hour buckets, all January published vintages

All 17,688 January published vintages were scored after dropping 0 exact duplicates; 6,006 fell outside the [0,48) lead range and 0 lacked an actual pair, leaving 11,682 scored rows, matching the by-lead-time endpoint counts. Each forecast is paired with the approved hourly mean of FUELHH half hours at T and T+30 minutes.

| Lead hours | n | Mean forecast MW | Mean actual MW | Mean signed error MW | Relative bias pct | MAE MW | RMSE MW |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 to 4 | 963 | 12,853.45 | 11,398.52 | +1,454.93 | 12.76 | 1,690.90 | 2,145.89 |
| 4 to 8 | 967 | 12,910.77 | 11,431.61 | +1,479.16 | 12.94 | 1,703.53 | 2,163.61 |
| 8 to 12 | 972 | 13,009.25 | 11,471.16 | +1,538.09 | 13.41 | 1,780.22 | 2,229.32 |
| 12 to 16 | 978 | 13,059.21 | 11,437.74 | +1,621.47 | 14.18 | 1,829.14 | 2,296.25 |
| 16 to 20 | 985 | 13,075.03 | 11,324.73 | +1,750.29 | 15.46 | 1,926.98 | 2,403.00 |
| 20 to 24 | 991 | 13,004.73 | 11,229.18 | +1,775.55 | 15.81 | 1,957.31 | 2,427.55 |
| 24 to 28 | 989 | 12,962.30 | 11,227.04 | +1,735.26 | 15.46 | 1,966.53 | 2,421.87 |
| 28 to 32 | 985 | 12,930.68 | 11,248.33 | +1,682.35 | 14.96 | 1,997.22 | 2,457.51 |
| 32 to 36 | 980 | 12,990.13 | 11,284.63 | +1,705.49 | 15.11 | 2,069.36 | 2,546.15 |
| 36 to 40 | 974 | 13,072.24 | 11,266.07 | +1,806.17 | 16.03 | 2,124.02 | 2,644.38 |
| 40 to 44 | 967 | 13,072.08 | 11,169.61 | +1,902.48 | 17.03 | 2,245.07 | 2,807.26 |
| 44 to 48 | 931 | 13,011.64 | 11,069.15 | +1,942.49 | 17.55 | 2,345.06 | 2,910.74 |

Bias is already large at the shortest leads: +1,454.93 MW, or 12.76 percent of mean actual, at 0 to 4 h. It then grows steadily with lead, about 9.81 MW per additional lead hour on a least squares fit over the bucket midpoints, reaching +1,942.49 MW, or 17.55 percent, at 44 to 48 h, while MAE rises from 1,690.90 to 2,345.06 MW. Mean forecast stays between 12.85 and 13.08 GW in every bucket while mean actual stays between 11.07 and 11.47 GW, so most of the bias is a level gap between published forecast and reported outturn, with forecast skill degradation as a secondary effect on top.

### Bias by actual level, 744 selected cutoff hours

Terciles are rank balanced groups of 248 hours ordered by hourly mean actual.

| Group | n | Actual range MW | Mean actual MW | MAE MW | Bias MW | Relative bias pct |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Low | 248 | 1,711.5 to 8,824.5 | 6,331.43 | 1,820.55 | +1,450.68 | 22.91 |
| Mid | 248 | 8,828.5 to 14,474.5 | 11,658.24 | 1,941.92 | +1,510.19 | 12.95 |
| High | 248 | 14,481.0 to 17,755.5 | 15,861.00 | 2,354.27 | +2,282.79 | 14.39 |

Mean signed error in MW rises with wind level, from +1,450.68 MW in the low tercile to +2,282.79 MW in the high tercile. That direction is the one a constraint on output at high wind would produce, so the table is evidence consistent with constraint, but relative bias is not monotonic across terciles and FUELHH and WINDFOR contain no curtailment or unconstrained availability field, so this is not proof of curtailment.

### Shift test with the actual window moved

For every shift the forecast timestamp stays fixed at T and only the actual window moves, so this does not relabel forecast timestamps or change vintage selection. Targets whose shifted half hour window has no actuals at the month edges are dropped, so n varies between 738 and 744.

| Actual window shift h | n | MAE MW | Bias MW |
| ---: | ---: | ---: | ---: |
| -6 | 738 | 2,280.18 | +1,648.04 |
| -5 | 739 | 2,168.09 | +1,664.76 |
| -4 | 740 | 2,071.20 | +1,681.60 |
| -3 | 741 | 1,995.28 | +1,698.60 |
| -2 | 742 | 1,954.85 | +1,715.52 |
| -1 | 743 | 1,972.85 | +1,731.98 |
| 0 | 744 | 2,038.91 | +1,747.89 |
| +1 | 743 | 2,121.09 | +1,764.31 |
| +2 | 742 | 2,211.14 | +1,780.77 |
| +3 | 741 | 2,310.76 | +1,797.29 |
| +4 | 740 | 2,420.25 | +1,813.89 |
| +5 | 739 | 2,544.52 | +1,830.09 |
| +6 | 738 | 2,680.07 | +1,846.11 |

| Actual window shift h | n | MAE MW | Bias MW |
| ---: | ---: | ---: | ---: |
| -3 | 741 | 1,995.28 | +1,698.60 |
| -2.5 | 741 | 1,965.81 | +1,705.84 |
| -2 | 742 | 1,954.85 | +1,715.52 |
| -1.5 | 742 | 1,957.12 | +1,722.56 |
| -1 | 743 | 1,972.85 | +1,731.98 |
| -0.5 | 743 | 2,001.94 | +1,738.78 |
| 0 | 744 | 2,038.91 | +1,747.89 |
| +0.5 | 743 | 2,080.16 | +1,757.44 |
| +1 | 743 | 2,121.09 | +1,764.31 |
| +1.5 | 742 | 2,167.25 | +1,773.73 |
| +2 | 742 | 2,211.14 | +1,780.77 |
| +2.5 | 741 | 2,261.14 | +1,790.11 |
| +3 | 741 | 2,310.76 | +1,797.29 |

The minimum MAE is 1,954.85 MW at a -2 h shift, an interior point of the tested -6 to +6 h range, and the half hour scan confirms a smooth minimum near -2 h rather than an edge effect. Against the approved zero shift MAE of 2,038.91 MW the gain is 84.06 MW, or 4.12 percent. The 10 percent decision threshold is not met, so the alignment rule stands as approved and this remains an open validation item with a data owner, not a change trigger. Bias stays between +1,648.04 and +1,846.11 MW at every shift, so the bias is not produced by the alignment choice.

### Daily mean signed error over the 31 delivery days

| Delivery day | Mean signed error MW | Delivery day | Mean signed error MW |
| --- | ---: | --- | ---: |
| 2026-01-02 | +3,109.9 | 2026-01-03 | +2,102.2 |
| 2026-01-04 | +1,146.5 | 2026-01-05 | -55.9 |
| 2026-01-06 | +1,835.3 | 2026-01-07 | +1,468.1 |
| 2026-01-08 | +844.8 | 2026-01-09 | +804.9 |
| 2026-01-10 | -86.1 | 2026-01-11 | +4,801.6 |
| 2026-01-12 | +4,868.2 | 2026-01-13 | +156.5 |
| 2026-01-14 | -84.2 | 2026-01-15 | +1,041.8 |
| 2026-01-16 | +352.0 | 2026-01-17 | +1,726.8 |
| 2026-01-18 | +1,554.8 | 2026-01-19 | -730.1 |
| 2026-01-20 | +351.8 | 2026-01-21 | +3,658.3 |
| 2026-01-22 | +2,666.4 | 2026-01-23 | +1,514.8 |
| 2026-01-24 | +1,925.9 | 2026-01-25 | +1,891.2 |
| 2026-01-26 | +1,980.9 | 2026-01-27 | +3,479.1 |
| 2026-01-28 | +5,374.8 | 2026-01-29 | +1,739.0 |
| 2026-01-30 | +1,371.7 | 2026-01-31 | +2,390.2 |
| 2026-02-01 | +983.0 | | |

27 of 31 delivery days have a positive mean error and day means range from -730.1 to +5,374.8 MW. Together with the near flat bucket means in the lead time table, the offset is a broad based level difference across the month, not the product of a few unusually bad days.

### Decision rules applied

- Bias large and flat across lead times: largely met. The gap is already 12.76 percent at 0 to 4 h lead, so the primary description is a systematic gap between published forecast and reported outturn, and the product should offer a bias adjusted uncertainty reference next to the existing P90 and P95 buffer values.
- Bias grows with lead time: met as a secondary effect, about 9.81 MW per lead hour, described as forecast skill degradation on top of the level gap.
- Shift minimum interior with MAE gain above 10 percent: not met, the gain is 4.12 percent, so the approved alignment rule stands and no alignment decision is flagged. The -2 h minimum stays attached to the open WINDFOR interval validation question.
- Curtailment, embedded wind, or capacity differences: not claimed as the cause. The tercile rise in MW bias points in the direction constraint would produce, but no dataset field identifies a mechanism and relative bias is not monotonic.
- Every explanation above is labeled evidence, not proof.

### Client wording for UI and video

Across the 744 decision hours of January 2026, the published national wind forecast averaged about 1.75 GW above the output reported afterwards, roughly 15 percent of average wind generation. The gap is already present in forecasts used 0 to 4 hours ahead and appears on 27 of 31 delivery days, so it behaves like a steady level difference between forecast and outturn rather than a few bad days. At longer lead times the gap widens slowly, from about 1.45 GW in the first 4 hours to about 1.95 GW at 44 to 48 hours, so fresher forecasts are modestly more accurate. For day ahead buying, treat the historical P90 and P95 overforecast errors of about 4.1 and 5.3 GW as the uncertainty reference, and note that these datasets cannot explain why the forecast sits high because they do not report curtailment or unconstrained availability.
