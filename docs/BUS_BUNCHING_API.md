# Bus Bunching integration — Schema 1.0

This extends the existing Node.js server, Engine/World simulation, SSE and Dispatcher. No camera/CV code is present or modified. No video, identities or tracking IDs are required. Runtime has no new npm dependencies.

## Run and access control

```powershell
npm start
npm test
```

Open `http://localhost:8787/dispatcher.html`. The added panel has its own map and Simulation / Live / Replay selector. Operations use existing `/api/events` SSE as `operations`; it accepts `mode` and `runId` query parameters for external modes as well. The surrounding legacy snapshot remains Simulation; read the `operations.mode` envelope for the selected source. HTTP operations APIs also support mode-specific reads. Existing passenger map files are untouched in this change.

Environment variables (set in the shell before starting, or `.env`):

| Name | Behavior |
|---|---|
| `PORT` | HTTP port, default 8787; use shell environment for port |
| `TELEMETRY_TOKEN` | Bearer token permitting telemetry writes only |
| `OPERATIONS_TOKEN` | Separate Bearer token permitting operator writes, existing controls, approvals and experiments |
| `NODE_ENV=production` | No token means writes denied, including loopback |
| `HOLDING_STOP_IDS` | Comma-separated operator-approved safe stops on the active route; default empty |

Development without tokens permits writes only from loopback. External cameras must use TELEMETRY_TOKEN. Tokens are not credentials for reading public data. The new Dispatcher token field keeps an operator token only in the page input, not localStorage, and also authenticates existing Dispatcher controls. Write controls on other pages do not attach a token; under token-protected operation use authenticated API calls or adapt those clients before production use. Production requires HTTPS through existing infrastructure; this change does not provision hosting or TLS. Read feeds remain public; do not put identities into source IDs.

The simulator never consumes external live events: they are held in a separate telemetry store. No real vehicle commands are transmitted. Existing automatic demonstration approval now defaults to **off**. OPS recommendations always require explicit approval, independently of the legacy auto-approval toggle.

## Endpoints

| Method | Path | Access / result |
|---|---|---|
| POST | `/api/telemetry/passenger` | Telemetry token; canonical passenger event |
| POST | `/api/telemetry/position` | Telemetry token; canonical GPS event |
| GET | `/api/operations/state` | Combined monitoring, history, predictions, evaluations and recommendations |
| GET | `/api/operations/headways` | `{mode,simulationRunId,data:[...]}` |
| GET | `/api/operations/predictions` | Same envelope; risk levels, not probabilities |
| GET | `/api/operations/recommendations` | Same envelope; pending and recently decided recommendations |
| GET | `/api/operations/copilot` | Local explanation generated from calculated results; no AWS dependency |
| POST | `/api/dispatch` | Existing operator endpoint; also accepts `OPS...` recommendation IDs |
| POST | `/api/operations/twin` | Operator token; bounded Worker Thread simulation experiment; waits for final compatible response |
| GET | `/api/operations/twin` | Current progress and most recent result/status |

Reads accept `?mode=simulation` (default), `?mode=live`, or `?mode=replay&runId=...`. Only the currently active route is shown. Fleet IDs must exist in `/api/routes` + the route's fleet configuration. Selecting another simulation route remains the existing global operation and resets simulation operations history. External stores are isolated by mode/run/route/bus and retained in memory only.

Responses: 200 success; 400 invalid event/options; 401 missing/wrong write token; 404 unknown endpoint; 405 wrong method. JSON request bodies retain the existing 100 KB limit.

## Common event fields

Formal shape: `schemas/telemetry-v1.schema.json`. Runtime validates semantics without a schema-library dependency in `engine/telemetry.js`. Route membership, ordering, timestamps and flow overlap require runtime validation beyond JSON Schema.

| Field | Type / rule |
|---|---|
| schemaVersion | Required string `1.0` |
| eventId | Required nonempty string ≤128 chars; unique across all kinds for a source |
| sourceId | Required nonempty string ≤128 chars; stable producer ID |
| sourceType | Required for passenger: `camera`, `apc`, `manual`, `mock` |
| mode | Required `live`, `simulation`, `replay` |
| observedAt | Required ISO timestamp with Z or numeric timezone, actual observation time |
| busId, routeId, tripId | Required nonempty strings ≤128 chars; trip changes at turnaround |
| direction | Required numeric `1` or `-1`; cannot change within a retained trip |
| stopId | Passenger optional/null; supplied stop must belong to route |
| simulationRunId | Required nonempty string for simulation/replay |
| simTimeSec | Required nonnegative finite seconds for simulation/replay; independent of wall clock |

Optional unavailable measurements may be omitted or null. Null never becomes a measured zero. Zero means explicitly measured zero. Events >30 seconds into the future are rejected. Live GPS older than 90 seconds is rejected. Passenger events up to one hour late are accepted and reordered; stale passenger estimates (>90 seconds) are hidden from monitoring. Replay freshness is relative to the run's latest simulation timestamp. Server adds `receivedAt`.

## Passenger fields and semantics

| Field | Rule |
|---|---|
| measurementType | Required `flow` or `occupancy` |
| board, alight | Integer 0–1000; both required for flow; absent/null for occupancy |
| onboard | Integer 0–1000; required for occupancy; absent/null for flow |
| capacity | Optional positive integer 1–1000; not inferred from missing camera data |
| crowdingLevel | Optional 0/1/2; producer must use agreed seat/standing thresholds; omit if incompatible |
| confidence | Optional number 0–1; omit if camera cannot supply it |
| windowStart, windowEnd | Required date-time for flow; start ≤ end ≤ observedAt |

Flow is the delta during a non-overlapping window. Occupancy is an absolute replacement anchor. Recompute from the last anchor and subsequent flows in observed-time order. **Never add occupancy as boarding.** Flow without an anchor retains board/alight but leaves onboard unknown. Same-time flows are applied before occupancy (the snapshot is treated as including those flows). Overlapping flow windows for a trip are rejected, even across sources, to avoid silently double-counting multi-camera coverage; aggregate door cameras upstream. Counts above capacity are retained as measurements, not silently clamped.

`sourceId:eventId` deduplicates accepted events. Retention: 50,000 dedup IDs, 500 vehicle streams, 500 ordered events per stream. Data older than retained history is rejected. Dedupe and histories do not survive restart. For durable delivery/replay a persistent event log is future work. Do not reuse source/event IDs across runs.

Example camera occupancy (replace observedAt with a current timestamp for Live):

```json
{
  "schemaVersion": "1.0",
  "eventId": "camera01-trip001-123",
  "sourceId": "camera01",
  "sourceType": "camera",
  "mode": "live",
  "observedAt": "2026-10-28T10:00:00Z",
  "busId": "B01",
  "routeId": "R1",
  "tripId": "R1-out-001",
  "direction": 1,
  "stopId": "S03",
  "measurementType": "occupancy",
  "onboard": 25,
  "board": null,
  "alight": null,
  "capacity": 60,
  "crowdingLevel": null,
  "confidence": 0.91
}
```

Flow event uses the same envelope with a **new eventId**, and replaces measurement fields with:

```json
{
  "measurementType": "flow",
  "windowStart": "2026-10-28T10:00:01Z",
  "windowEnd": "2026-10-28T10:00:20Z",
  "board": 8,
  "alight": 3,
  "onboard": null
}
```

Successful ingestion:

```json
{"ok":true,"duplicate":false,"outOfOrder":false,"applied":true,"receivedAt":"2026-10-28T10:00:21Z"}
```

Duplicate acknowledgment:

```json
{"ok":true,"duplicate":true,"applied":false}
```

Adapter boundary: change only `passengerAdapter()` to translate a teammate's aggregate payload to this contract, or perform translation in their sender. Prediction and optimization consume canonical data. Unknown fields are stripped; send no video or personal metadata. The API accepts canonical JSON today, not arbitrary vendor camera payloads.

## GPS fields

Required latitude [-90,90] and longitude [-180,180]. Optional/null speedKmh [0,150], bearingDeg [0,360], accuracyM [0,1000]. Missing speed gives insufficient prediction data, not invented speed. GPS is projected onto the configured route polyline and rejected beyond max(100m, accuracyM). Consecutive events reject >150 km/h implied jumps and >100m backward route progression within the same trip. This is a corridor match, not a road-network map matcher. Opposite-direction vehicles never pair.

```json
{
  "schemaVersion": "1.0",
  "eventId": "gps01-001",
  "sourceId": "gps01",
  "mode": "live",
  "observedAt": "2026-10-28T10:00:00Z",
  "busId": "B01",
  "routeId": "R1",
  "tripId": "R1-out-001",
  "direction": 1,
  "latitude": 13.798803,
  "longitude": 100.546465,
  "speedKmh": 20,
  "bearingDeg": 180,
  "accuracyM": 10
}
```

## Headway, prediction, optimization

Headway is the difference between estimated passage times at the **same downstream stop**, not straight-line distance divided by speed. Simulation uses the original World passenger propagation/ETA, with reverse-direction running-time integration corrected. Live/replay use along-route position, measured speed and observation timestamps. When available, last measured boarding/alighting provides an explicitly labelled historical dwell proxy (9 + 1.3*board + 0.9*alight seconds per intermediate stop, with an occupancy penalty); this is a heuristic, not measured future demand. Missing flow contributes no invented count and reduces coverage. Traffic/stop demand are not fabricated. Current Headway displayed is an ETA-based estimate, not an observed passing interval. The experiment evaluates actual same-stop passage intervals. Missing common reference, stale GPS, missing speed or <2 observations yields unknown. Repeated HTTP reads without new GPS never create fake observation history.

Prediction v1.1 treats common-stop ETA difference as an already-forward-looking headway, then compares up to three downstream passenger-aware ETAs inside 600 seconds. It does not extrapolate the historical slope a second time. No common reference within ten minutes gives unknown. Risk: high below 0.5 target, medium below 0.75 target, otherwise low. Contributing factors are rule labels, not causal attribution. Output includes predictedHeadwaySec, predictionStopId, predictedReferenceHeadwaySec (for reference scoring), estimatedTimeToBunchingSec, predictionHorizonSec, dataQuality and modelVersion. These are uncalibrated heuristic estimates, never probabilities or ML output.

Holding enumerates 0/30/60/90/120/180 seconds and keeps 0 as a real No Intervention candidate. Counterfactual rollouts reuse `World.step` and minimize integrated queue+onboard passenger time, not headway regularity alone. A positive hold must beat zero by a passenger-sensitive margin under the main horizon, a longer horizon and demand 75%/125%, and must leave at least 60 seconds to the following bus. Only a bus currently dwelling at an explicitly approved stop may receive a Simulation recommendation. Without observations, demand, headways, an approved point, or robust benefit, evaluations explain why No Intervention/unavailable. Approval rechecks current location/state/gap and benefit; no real vehicle command is sent.

Dispatch compares the existing release time with bounded alternatives for the oldest **ready** terminal bus. Forward rollouts preserve minimum departure separation, minimum layover, explicit unavailable-until time, pending reservations and finite fleet state. Candidates must reduce downstream passenger time across the main/longer horizons and demand sensitivity checks. No ready bus or no robust saving means No Intervention. It is a heuristic, not a globally optimal schedule. It reuses `/api/dispatch` and the audit log. Live/replay dispatch and holding remain unavailable without validated terminal readiness, demand and safe-stop integration.

Approval example (OPERATIONS_TOKEN):

```json
{"recId":"OPS1","decision":"approved","note":"Reviewed in Dispatcher; Simulation only"}
```

OPS recommendations expire after 60 seconds of their source clock and are never auto-approved. Kill Switch clears pending simulated holds/release overrides and rejects approvals while stopped.

## Mock integration

```powershell
$env:TELEMETRY_TOKEN='your-token'
node scripts/send_mock_telemetry.js
```

This sends REPLAY GPS and occupancy for two existing R1 buses at two simulation times. Copy the printed run ID into the Dispatcher Replay field. Select R1 first. It uses no camera, video, AWS or OpenAI. Contract tests exercise flow, occupancy, duplicates and late arrivals separately.

## Digital Twin

POST with OPERATIONS_TOKEN:

```json
{"seeds":["1","2","3"],"durationSec":1800,"holdingStopIds":[],"scenario":"normal"}
```

Runs none / holding / dispatch / combined in a Worker Thread using the existing Engine/World. Same seed is verified by hashes to have identical initial state and the same generated passenger/traffic event tape in every arm; mismatch aborts the experiment. Supports 1–100 unique seeds, 120–3600 seconds. API holdingStopIds must be a subset of operator-approved configuration. Synthetic experiments auto-apply only their selected intervention to virtual buses; the interactive Engine remains unchanged. Only one experiment job runs at a time. POST retains the final-response API contract while GET exposes progress, and HTTP/SSE stay on the main event loop.

`scenario` supports `normal`, `bunching`, `traffic_heavy`, `traffic_light`, `passengers_high`, `passengers_low`, and `late_departure`. The same declared disturbance is applied to every arm. It changes simulated conditions, never hardcodes prediction or KPI output. Sparse-fleet scenarios may have insufficient forecast coverage and no eligible interventions; those results remain visible.

KPIs derive from five-second simulation steps: boarded-passenger waiting-time mean, variance of actual same-stop passage headways, bunching episode count (below half target per bus pair, rearmed after a normal gap), holding passenger delay, integrated queue+onboard passenger time, interventions, holding duration, and matured prediction error/classification. Warm-start passengers contribute exposure but have no complete pre-start journey. Outcomes beyond experiment end are censored. Unmatched predictions yield null MAE; uncovered positive events count as false negatives. Each seed/arm and mean/SD/P10/median/P90 are reported; worse results are retained.

## Tests and limits

`npm test` uses built-in node:test, isolated in-memory simulation and a temporary server on port 18987. It checks telemetry quality, duplicate/late counting, direction separation, prediction leakage/coverage, real simulated bunching, passenger holding cost, No Intervention, safety allowlists, unavailable buses, same-seed exogenous matching, Worker event-loop progress, old endpoints, SSE and write authorization. See `BUNCHING_OPTIMIZATION_REPORT.md` for the reproducible 30-seed evaluation.

No camera/GPS service is connected by this implementation. No persistent DB or durable event queue. No probability calibration. No ML training. Local Copilot works without credentials; Amazon Bedrock provider is **not implemented** (the interface reports it disabled). Original OpenAI crowd forecaster is retained separately. Before a real pilot: agree camera semantics and capacity, validate safe stops and route geometries, collect real passage/dwell/demand data, calibrate predictions/costs, and integrate terminal readiness. No hardware installation is required by this code.
