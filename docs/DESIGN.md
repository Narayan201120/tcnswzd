# WindLens design research

## Purpose and boundary

WindLens is a decision-support pilot for the GB day-ahead wind forecast. It compares the Elexon WINDFOR wind forecast with the FUELHH wind generation outturn. This design uses only those Elexon datasets. It does not calculate residual demand or recommend a purchase quantity because demand, prices, dispatch constraints, and other generation sources are outside this data boundary.

## Research sources and API contract

The exact Elexon dataset documentation pages reviewed are:

- [FUELHH stream endpoint documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
- [WINDFOR stream endpoint documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
- [Elexon wind generation page](https://bmrs.elexon.co.uk/wind-generation)
- [Elexon Insights API developer portal](https://developer.data.elexon.co.uk/)

The production API base is `https://data.elexon.co.uk/bmrs/api/v1`. The requests used for the sample and coverage checks were:

- FUELHH sample: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?publishDateTimeFrom=2026-01-02T00:00:00Z&publishDateTimeTo=2026-01-02T01:00:00Z&fuelType=WIND`
- WINDFOR sample for target `2026-01-02T00:00:00Z`: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-31T00:00:00Z&publishDateTimeTo=2026-01-01T09:00:00Z`
- FUELHH coverage query: `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?publishDateTimeFrom=2026-01-01T00:00:00Z&publishDateTimeTo=2026-02-02T03:00:00Z&fuelType=WIND`
- WINDFOR coverage query: `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=2025-12-28T00:00:00Z&publishDateTimeTo=2026-02-01T00:00:00Z`

The dataset stream endpoints accept publication-time bounds named `publishDateTimeFrom` and `publishDateTimeTo`; FUELHH also accepts `fuelType=WIND`. The date filters select rows by publication time, not by target `startTime`. A FUELHH request for the publication window Jan 2 00:00Z through 01:00Z returned target starts at Jan 1 23:30Z, Jan 2 00:00Z, and Jan 2 00:30Z. The application must therefore filter the returned rows by target `startTime` after fetching. Stream responses are JSON arrays. FUELHH rows include `dataset`, `publishTime`, `startTime`, `settlementDate`, `settlementPeriod`, `fuelType`, and `generation`; WINDFOR rows include `dataset`, `publishTime`, `startTime`, and `generation`.

The Elexon developer portal says its APIs are public and require no API key. It describes stream endpoints as JSON-only and says there is no restriction on the amount of data returned. I found no published numeric request-rate quota. A data-return statement is not a requests-per-second guarantee, so ingestion should cache responses and retry transient errors with bounded backoff. The documentation and links above are the controlling references for implementation.

Small raw examples are checked in at [docs/samples/fuelhh_stream_sample.json](samples/fuelhh_stream_sample.json) and [docs/samples/windfor_target_sample.json](samples/windfor_target_sample.json). The actual sample contains three FUELHH rows and every row has `fuelType` equal to `WIND`. The forecast sample contains eleven WINDFOR revisions for one target start.

## Findings from January 2026 data

The queried FUELHH data contains 48 half-hourly records for every delivery date from Jan 1 through Jan 31, with no missing or duplicate target starts in that interval. The requested recommended scope, Jan 2 through Feb 1 inclusive, has complete half-hourly actual coverage for all 31 dates. The alternative Jan 1 through Jan 31 also has complete coverage. The coverage query returned 1,536 half-hourly WIND rows for Jan 1 through Feb 1 inclusive.

WINDFOR has hourly target starts in the queried January window, not half-hourly target starts. There are 744 hourly target starts in either 31-day delivery window. Comparing directly at half-hourly resolution would imply a forecast precision the source does not provide. The analysis should compare one hourly forecast with the mean of the two consecutive half-hourly FUELHH actuals for that hour. Require both actual periods; do not repeat an hourly forecast into half-hour records or interpolate missing outturns.

The Elexon wind page describes an hourly forecast period from 20:00 on the current day through 20:00 two days later, a 48-hour target window. It also says updates are published up to eight times per day at 03:30, 05:30, 08:30, 10:30, 12:30, 16:30, 19:30, and 23:30 GMT. In the fetched Jan 1 through Jan 31 history, there were eight distinct publication editions on each date. Most observed issue times were recorded at 02:30Z, 04:30Z, 07:30Z, 09:30Z, 11:30Z, 15:30Z, 18:30Z, and 22:30Z; one midday edition was recorded at 12:25Z. These observed timestamps differ from the page's nominal clock labels, so the application must use each row's actual `publishTime`, not infer issue times from the schedule.

For 744 delivery-hour targets in the recommended Jan 2 through Feb 1 scope, the number of forecast vintages available by a 09:00 Europe/London decision cutoff ranged from 3 to 11 per `startTime`; the median was 11. There were 682 targets with 11 eligible vintages and 62 with 3. The target and publication pairs were unique in the queried history. For all fetched records targeting Jan 2 through Feb 1, the measured lead time ranged from 0.5 to 66.5 hours. With the 09:00 D-1 decision rule, the selected forecasts have lead times from 16.5 to 39.5 hours.

For a target hour, define forecast horizon precisely as:

`horizon_hours = (startTime_utc - publishTime_utc).total_seconds() / 3600`

This is the lead time of the selected vintage to its target hour. It is not the interval from the decision cutoff to delivery. Preserve UTC for arithmetic and keys.

## Scope interpretation

Recommended interpretation: "decisions made in January 2026" means the decision date D-1 is in January. This makes delivery days Jan 2 through Feb 1, 2026 inclusive. It gives 31 January decision days and includes the decision on Jan 31 for Feb 1 delivery. Coverage is complete in the queried actual and forecast data.

Alternative: use delivery days Jan 1 through Jan 31 inclusive. That is also fully covered, with 31 delivery days, but its decisions run from Dec 31 through Jan 30. It includes a December decision and omits the Jan 31 decision for Feb 1. The D-1 interpretation is recommended because it follows the user's phrase "decisions made in January" directly.

## Decision cutoff and forecast selection

The EPEX SPOT 2025 trading brochure lists the GB 60-minute day-ahead auction gate closure at 09:20 GMT and the GB 30-minute auction at 15:30 GMT. Nord Pool's N2EX support page lists 09:50 GMT gate closure. January is GMT in Europe/London. These published times are documented at [EPEX SPOT trading brochure, February 2025](https://www.epexspot.com/sites/default/files/2025-02/EPEX%20SPOT%20Trading%20Brochure%202025%20February.pdf) and [Nord Pool: About the N2EX Day Ahead Auction](https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction).

**Assumption, configurable default:** use 09:00 Europe/London on D-1. This provides 20 minutes before the EPEX GB hourly auction closure and 50 minutes before N2EX closure. It is a conservative common cutoff for the morning auctions and is not asserted to be the client's operational deadline. The 15:30 EPEX half-hourly auction has a later gate closure; a client trading that auction may choose a separate later cutoff. Store the cutoff as a configuration value with timezone `Europe/London`, and display the resolved local time and UTC instant for the delivery date.

For each forecast target `startTime`, select the row with the greatest `publishTime` that is at or before the D-1 cutoff. Rows published after the cutoff are ineligible even when they precede delivery. When no eligible row exists, return an explicit missing forecast rather than substituting a later vintage.

## Worked selection and error example

Target: `2026-01-02T00:00:00Z`. Decision date: Jan 1. The default cutoff is Jan 1 09:00 Europe/London, which is `2026-01-01T09:00:00Z` because the UK is on GMT in January. All eleven candidate rows returned for this target are below in chronological order. Generation is MW.

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

The actual FUELHH record for `2026-01-02T00:00:00Z` is 15,228 MW (published at `2026-01-02T00:30:00Z`). With `error = forecast - actual`, the selected forecast error is `18,781 - 15,228 = +3,553 MW`, an overforecast. This hindsight actual is used only in the accuracy view, never in the decision view. The selected horizon is 16.5 hours.

## Accuracy metrics and interpretation

For each matched hourly target, let `error_mw = forecast_mw - actual_mw`.

- MAE: mean absolute error in MW.
- RMSE: square root of mean squared error in MW.
- Bias: mean signed error in MW; positive means the forecast is above outturn.
- P50, P90, and P95: empirical percentiles of absolute error in MW.
- MAPE: mean of `100 * abs(error_mw / actual_mw)` over rows with nonzero actual. Exclude zero-actual rows from the MAPE denominator, show how many rows were excluded, and show MAPE as unavailable if every actual is zero. Do not replace a zero actual with an epsilon or silently treat it as an error-free observation.
- Error by hour of day: summarize signed and absolute error by Europe/London local clock hour and include the sample count. Keep UTC timestamps as the unique keys; retain offset/fold information so the repeated hour at autumn DST change can be distinguished.
- Error by forecast horizon: group using the selected horizon in hours, with bins `[0,12)`, `[12,24)`, `[24,36)`, `[36,48)`, `[48,60)`, and `[60,72)`. Include counts and error measures per bin.
- Error distribution: report signed error distribution; percentiles above are computed from absolute error.

A zero FUELHH value is a valid measured output and stays in MAE, RMSE, bias, percentile, hour, horizon, and signed distribution calculations. It is excluded only from MAPE because the percentage denominator is zero. FUELHH does not provide a curtailment flag or unconstrained wind availability. Therefore this pilot scores forecast against reported metered/outturn generation, including any curtailment reflected in that outturn; it must not claim to measure weather-only forecast skill or reverse-estimate curtailed generation. No zero WIND output rows appeared in the queried January sample.

P90 or P95 absolute error can be shown as a historical uncertainty reference for a user to consider. It is not a recommended purchase buffer or a procurement quantity: demand, price, and portfolio data are unavailable here.

## Data quality, time, and coverage rules

- Normalize `startTime`, `publishTime`, and cutoff instants to timezone-aware UTC for comparison. Accept cutoff input in Europe/London and display both local time and UTC.
- Treat FUELHH as half-hourly MW outturn and WINDFOR as hourly MW forecast, based on the observed data and source description. Build hourly actuals only from the two matching half-hour rows. If either is absent, leave that hour unmatched and report coverage. Never fill missing data with zero or carry values forward.
- Stream requests are bounded by `publishDateTimeFrom` and `publishDateTimeTo`, not target time. Filter results to the required target start range after fetching.
- Multiple WINDFOR rows for one target are expected forecast vintages, not duplicates. Select the latest eligible vintage as above. Drop exact duplicate `(startTime, publishTime)` rows during normalization and flag conflicting duplicates for review.
- FUELHH can be republished. If the same target has multiple actual rows, use the latest `publishTime` for the scored outturn and record that a correction was present.
- Use UTC target keys across daylight saving transitions. A London delivery day may contain 46 or 50 half-hours and 23 or 25 hours. Do not invent periods to force each local date to 48 half-hours or 24 forecast points. A repeated local clock hour remains distinct by UTC instant and offset.
- The forecast dataset covers wind farms visible to the system operator with operational metering, as described by Elexon. FUELHH is generation by fuel type. Their populations may not be perfectly identical; document this as a scope limitation when interpreting errors.

## Architecture and deployment split

The planned ingestion job fetches Elexon stream data, filters target windows, normalizes timestamps, validates the source grain, and writes a compact versioned JSON snapshot. The app reads that snapshot by default so the demonstration does not depend on live Elexon availability. Pure backend functions select a forecast vintage and compute accuracy metrics. FastAPI exposes health, decision, comparison, summary, and breakdown endpoints. React with Vite renders the decision and accuracy views.

For production, Vercel serves the static frontend and Python serverless API functions, with the snapshot bundled as read-only data. For local and review use, Docker Compose runs the frontend and FastAPI service as separate containers. An optional live-refresh route should use caching and bounded retries; it must not be required for the core demo.

## Source links

- Elexon FUELHH stream endpoint: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream
- Elexon WINDFOR stream endpoint: https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream
- Elexon wind forecast notes and nominal update schedule: https://bmrs.elexon.co.uk/wind-generation
- Elexon API access, dataset publication-time behavior, and stream response notes: https://developer.data.elexon.co.uk/
- EPEX SPOT auction timings: https://www.epexspot.com/sites/default/files/2025-02/EPEX%20SPOT%20Trading%20Brochure%202025%20February.pdf
- N2EX gate closure: https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-n2ex-day-ahead-auction
