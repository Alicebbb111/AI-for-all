# Implementation report — Bus Bunching baseline v1

> Historical first implementation report. The optimization, 30-seed evaluation, Worker Thread migration and current limitations are documented in [BUNCHING_OPTIMIZATION_REPORT.md](BUNCHING_OPTIMIZATION_REPORT.md). Figures below describe the earlier three-seed version and are retained for traceability.

## Delivered

- Schema 1.0 and runtime validation; aggregate-only passenger adapter; flow/occupancy separation; duplicate handling; ordered late-event replay; bounded in-memory retention.
- External GPS corridor matching, unknown vehicle/route/direction checks, freshness/jump checks; separate Live/Replay/Simulation stores. Simulation never overwrites live input.
- Common-reference-stop ETA headways, front/back headways, observed-time history and bounded trend forecasting. Explicit unknown when input coverage is inadequate; no probability output.
- Passenger-aware holding candidate evaluation and terminal dispatch suggestions. Simulation execution requires manual approval through the original dispatch endpoint and Audit Log. No real vehicle commands.
- Four-arm, multi-seed experiments using the existing Engine/World, actual passage observations, passenger-time integration and matured prediction errors.
- Existing Dispatcher integration, map, source selector, recommendations, local Copilot and experiment results. Existing SSE extended for mode-specific operations data.
- Separate telemetry/operator write tokens, production fail-closed writes, development loopback-only fallback.
- Mock Replay sender and integration contract. No camera/CV implementation changed; no dependencies installed.

## Reused / corrected

Reused World vehicle dynamics, passenger queues, route path, stop-by-stop propagation, historical/learned speeds, terminal layover constraints, Engine ticks, SSE, REST helpers, Leaflet and existing audit/approval systems.

Corrections required for trustworthy integration: reverse-direction runTimeSec previously returned zero; boarding capacity previously excluded newly freed alighting spaces; initial learned speeds previously differed by policy seed. Operational hold duration is excluded from dwell-based passenger correction. Legacy demo auto-approval now defaults off. New OPS decisions never use demo auto-approval.

## Files

New: `engine/telemetry.js`, `engine/bunching.js`, `engine/operations.js`, `engine/twin.js`, `engine/copilot.js`, `schemas/telemetry-v1.schema.json`, `public/js/operations.js`, `public/css/operations.css`, `scripts/send_mock_telemetry.js`, `tests/operations.test.js`, `tests/api.test.js`, and documentation in `docs/`.

Modified: `engine/engine.js`, `engine/world.js`, `server.js`, `public/dispatcher.html`, `package.json`, `.env.example`, `README.md`.

Pre-existing modified files `public/index.html` and `public/js/passenger.js` were left untouched by this implementation. No commits, push or deployment.

## Verification actually performed

- `npm test`: **47 tests passed, 0 failed**, using node:test.
- Syntax checks: 24 runtime/tool JavaScript files parsed successfully; schema JSON parsed; `git diff --check` clean.
- HTTP integration starts a temporary production-configured server and checks existing routes/state/timetable/feed, SSE, separate write credentials, validation, Replay mock sender, mode-specific Replay SSE and Digital Twin API.
- In-memory tests cover all 17 requested categories, plus clock offsets, stale Replay, fake polling-history prevention, reverse ETA, manual approvals, Kill Switch, and hold-time passenger correction.
- Browser inspection on a separate temporary server confirmed the added Dispatcher panel, source label, map markers and fleet table rendered, and browser JavaScript error log was empty. The user's existing process on 8787 was not stopped/restarted. That old process must be restarted to load new server routes.

## Experiment evidence (not a promise of improvement)

Executed three seeds, 1800 seconds, explicit `bunching` scenario. Stops S02/S03/S05/S07/S09/S11 were supplied **only as synthetic experiment fixtures**, not certified real-world safe holding locations. No default real-world safe stops are configured.

| Seed | No intervention passenger-seconds | Holding passenger-seconds | Holding actions | Bunching events none / holding |
|---|---:|---:|---:|---:|
| 1 | 836745 | 836930 | 2 | 1 / 2 |
| 2 | 803865 | 804405 | 1 | 2 / 1 |
| 3 | 857265 | 858435 | 2 | 1 / 2 |

Dispatch and combined arms were also executed; dispatch did not change total passenger time in these runs. Baseline prediction MAE was approximately 153.45 / 153.22 / 125.17 seconds with six matched observations per seed; Holding MAE was 136.05 / 136.53 / 158.02 seconds. Holding increased passenger time in all three fixtures, while reducing bunching episodes only in seed 2. Results were retained without adjustment. These small synthetic samples do not establish effectiveness. Normal sparse-fleet runs can have no eligible forecasts/actions and null prediction MAE; null is reported as missing, never zero accuracy.

## Remaining limitations / unsuccessful goals

- No real camera/GPS feed, certified holding-stop list, real demand rates or terminal readiness feed is connected. Live monitoring/prediction can accept canonical input, but external Holding/Dispatch stays unavailable until those operational inputs are integrated.
- Prediction is a transparent heuristic, not calibrated probability or trained ML. A common downstream reference within ten minutes and sufficient history are required, so coverage can be low for sparse fleets. Existing ETA/demand assumptions and last-flow dwell proxies need real-data validation.
- The holding objective has **not demonstrated improvement** in tested scenarios. It needs tuning/evaluation on more seeds and measured operations before pilot use. Dispatch is heuristic and has not shown benefit in the short example runs.
- Local Copilot is implemented. Bedrock provider is not implemented or tested; core requires no AWS credentials. Original optional OpenAI crowd forecaster remains separate.
- Telemetry, dedup, logs and experiment output are in memory; restart loses them. No durable DB or ingestion queue added.
- Bounded Digital Twin executes synchronously and briefly blocks HTTP/SSE. No worker infrastructure added.
- Only one active route context is supported as in the original code. Independent simultaneous multi-route engines would require refactoring module-level route state.
- Token-aware legacy controls are supported in Dispatcher via its token field. Other original write pages need token client integration before production use; write APIs now correctly require authorization in production.
- Existing `/api/gtfs-rt` retains its original hardcoded R1 identifiers/simulation timestamps; it was not converted into a standards-compliant production feed in this change.

## Run / exercise

1. Restart `npm start`, open `/dispatcher.html`; default is Simulation and manual approvals.
2. `npm test` runs validation, algorithms, integration and repeatability tests without cloud credentials.
3. `node scripts/send_mock_telemetry.js` sends two-bus Replay GPS/occupancy; select Replay and paste its printed run ID. If tokens are configured, set TELEMETRY_TOKEN in the sender shell.
4. Choose Normal or Bunching scenario and run Digital Twin. To enable virtual holding, first configure HOLDING_STOP_IDS for operator-approved stops and restart. With no approved stops, unavailable holding is expected.
5. Send the canonical flow/occupancy/GPS examples from `BUS_BUNCHING_API.md` using current observedAt timestamps and the telemetry token. Use distinct event IDs; resending one tests dedup; sending an earlier observation tests ordering.
6. Configure OPERATIONS_TOKEN to protect approvals and controls; enter it in the Dispatcher token field. Production writes are denied when credentials are absent.

Full schema, examples, request/response contracts and semantics: [BUS_BUNCHING_API.md](BUS_BUNCHING_API.md) and [formal JSON Schema](../schemas/telemetry-v1.schema.json).
