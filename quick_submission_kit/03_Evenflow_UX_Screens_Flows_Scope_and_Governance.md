# Evenflow v5 — Dispatcher UX Screens, Operational Flows, Journey, MoSCoW Scope & Governance
> **System Focus:** **100% Depot Dispatcher & Transit Operations Console (`ระบบหน้าจอสำหรับนายท่าและฝ่ายเดินรถที่อู่รถเมล์เท่านั้น — ไม่มีส่วนของผู้โดยสารทั่วไป`)**  
> **Live Prototype:** https://ai-forall-eight.vercel.app  
> **Design System:** High-clarity operational dark/light themes, IBM Plex Sans Thai typography, 1-second glanceable status ribbons, 1-click approval cards, zero framework bloat (`60 fps` performance on standard depot PCs and tablets)  

---

## 1. Dispatcher Operational Journey: Current Depot Baseline vs. Evenflow To-Be Workflow

| Operational Touchpoint | Current State at Thai Bus Depots ("Before" Baseline) | Dispatcher Emotion | Evenflow To-Be Depot Workflow ("After" Experience) | Dispatcher Emotion | Operational Pain Resolved & Value Delivered |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Pre-Shift & Depot Queue Check (`ตรวจคิวรถและคนขับในอู่`)** | Dispatcher (`นายท่า`) checks paper clipboard for fixed departure times (e.g., every 15 min) and asks drivers verbally who is ready to depart. | 😐 Routine / Blind to Route | Dispatcher opens **Depot Dispatch Console (`dispatcher.html`)** showing live **Depot Bay Readiness Queue** (`รถที่จอดพร้อมในอู่`, driver turnaround rest timer `≥ 6 min`, EV battery `SoC %`) alongside live route conditions. | 😊 Prepared / Clear | Eliminates manual clipboard tracking and guarantees every bus in the dispatch queue meets driver rest and EV battery rules. |
| **2. Monitoring Active Buses on the Route (`ติดตามระยะห่างและความหนาแน่นคนบนรถ`)** | Dispatcher sees raw GPS dots on a map; cannot tell if two buses are about to bunch 8 minutes ahead at Siam or which bus is crush-loaded (`คนแน่นล้นคัน`). | 😰 Reactive / Guessing | Dispatcher glances for **1 second** at the **Color-Coded Linear Corridor Ribbon**: `🟢 10–22m ปกติ`, `🟠 22–28m เริ่มห่าง`, `🟣 >28m ขาดระยะ`, `🔴 <5m กระจุกติดกัน` + live **Onboard Crowding Bar (`ความหนาแน่นคนบนรถ %`)** per vehicle. | 😎 In Control / Proactive | Spots developing service gaps (`รถขาดระยะ`) and overcrowded buses **`8.6 minutes` in advance (`1.00` precision)** without mental math. |
| **3. AI Dispatch Simulation & Recommendation (`AI คำนวณปรับเวลาปล่อยรถจากอู่`)** | When Bus #1 gets stuck in rain/traffic and crowds build up, dispatcher still releases Bus #2 on the old clock time—causing Bus #2 to catch Bus #1 and leave a 30-min gap behind. | 😣 Helpless / Rigid Schedule | **Worker-Thread Digital Twin (`2.47 ms`)** simulates candidate departure shifts (`-3 to +5 min`) across `75%/100%/125%` demand. **Thai AI Copilot** recommends: *"ขยับเวลาปล่อยรถ B04 ที่อู่จตุจักรเป็น 08:13 น. (+3 นาที) เพื่อกันรถวิ่งไปกระจุกติด B03 และเกลี่ยความหนาแน่นคนช่วงอนุสาวรีย์ฯ (ประหยัดเวลารอสะสม ~660 คน-วินาที · เวลาพักคนขับ 8 นาที ≥ 6 นาที)"*. | 💡 Confident / Data-Backed | Replaces guesswork with counterfactual math proven to save `-660 person-sec` (`30/30` seeds) with `0%` onboard passenger harm. |
| **4. 1-Click Dispatcher Decision & Driver Dispatch (`นายท่ากดอนุมัติสั่งปล่อยรถ`)** | Last-minute radio orders confuse drivers or cause arguments over lost rest time or cut trip quotas (`กลัวเสียค่าเที่ยว`). | 😬 Tense / Friction | Dispatcher clicks **`[ ✅ อนุมัติปรับเวลาปล่อยรถ ]`** (or **`[ ข้าม / คงตารางเดิม ]`**). Updated departure countdown appears on the depot bay screen with **`🛡️ ไม่หักค่าเที่ยว · พักคนขับครบเกณฑ์`**, logged in the **Immutable Audit Trail** (with instant **Kill Switch** available). | 🤝 Trusted by Dispatcher & Driver | Keeps the human `นายท่า` 100% in command while protecting driver welfare and trip credits. |
| **5. End-of-Shift Performance & Crowding Review (`สรุปผลความสม่ำเสมอและลดความแออัด`)** | Depot manager has no objective report showing why gaps happened or how well dispatch adjustments smoothed passenger crowding. | 🤷 Unaccountable | **Dual-World A/B KPI Dashboard (`kpi.html`)** compares `ตารางปล่อยรถเดิม (Fixed Timetable)` vs. `ตารางปล่อยรถ AI (Evenflow)` on identical demand: Headway Variance (`-3.3%`), Wait-Time Saved (`-660 person-sec`), and Peak Cabin Crowding Reduction. | 📈 Proven Operational ROI | Provides auditable KPI proof for depot management, BMTA/TSB executives, and transport regulators. |

---

## 2. Focused Suite of Operator & Dispatcher Interfaces (100% B2B/B2G Internal Tools)

1. **Primary Interface — Live Depot Dispatch & Corridor Control Center (`/dispatcher.html`):**  
   The main workstation for the depot dispatcher (`นายท่า`). Features top operational KPIs, the **1-Second Color-Coded Linear Corridor Ribbon**, **Live Vehicle Crowding & Pairwise Headway Table**, **Depot Bay Readiness & Turnaround Rest Queue**, **Grounded Thai AI Dispatch Copilot** with 1-Click Approve/Dismiss buttons, **Emergency Kill Switch**, telemetry source selector (`Live / Replay / Simulation`), and **Immutable Audit Log**.
2. **Schedule & Scenario Stress-Test Console (`/sim.html`):**  
   Allows dispatchers and route planners to test how the AI dispatch schedule responds to sudden Bangkok disruptions (**heavy rainstorms, rush-hour passenger surges, intersection signal gridlock, late depot turnarounds, and >90s GPS dropouts**).
3. **Dual-World A/B KPI & Crowding Impact Dashboard (`/kpi.html`):**  
   Side-by-side operational comparison between an unmanaged `Fixed-Timetable Baseline World` and the `AI-Dispatched Evenflow World` under identical passenger demand—tracking Headway Variance (`-3.3%`), Total Passenger Wait-Time Savings (`-660 person-sec`), and Peak Onboard Crowding (`% of trips >85% load`).
4. **AI Predictor Evaluation & Governance Console (`/aieval.html` + `/governance.html`):**  
   Displays bunching/gap prediction confusion matrix (`Precision 1.00`, `Lead Time 516s`), headway MAE (`78.21s`), model promotion guardrails, PDPA data-privacy rules, and the **No-Blame Driver Labor Charter (`พักคนขับ ≥ 6 นาที · ไม่หักค่าเที่ยว`)**.

*(Note: While the repository also contains optional sandbox modules created during early prototyping, the production operational workflow for this initiative is strictly scoped 100% to the **Depot Dispatcher & Fleet Operations Suite** above—with zero consumer/passenger app dependency.)*

---

## 3. Detailed Prose Specifications for Core Operational Flows (For Stage 6 & Stage 8b Mermaid Rendering)

### Flow 1 — Real-Time GPS & 90° Edge-AI Camera Crowding Ingestion Flow
- **Entry Node (🔵 Entry):** Every 15 seconds, the depot engine ingests schema-validated operational data (`JSON Schema 2020-12`): live vehicle GPS coordinates, **90° top-down Edge-AI camera boarding/alighting counts (`+In / -Out` silhouettes in RAM, 100% PDPA-safe)**, door-open dwell duration at each stop ($\tau_{\text{actual}}$), and live Open-Meteo rainfall / corridor traffic context.
- **Staleness Decision Node (🟡 Decision):** Is vehicle telemetry fresh (`age ≤ 90 seconds`)?
  - **If No (🔴 Abstain/Fallback):** Trigger **90-Second Honest Abstention**—mark vehicle as `"Telemetry Stale (>90s)"`, fall back to static depot timetable for that vehicle, and block automated schedule shifts.
  - **If Yes:** Snap GPS onto the 728-vertex OSRM Bangkok road corridor and cross-check **90° Edge-AI Camera counts** with door-dwell physics (`0.85·B_cam + 0.15·B_implied`) to calculate exact live **Onboard Passenger Crowding (`ความหนาแน่นคนบนรถ %`)** and `1.35×` crowding dwell penalty.
- **Output Node (🟢 Success):** Update real-time vehicle positions, Edge-AI cabin crowding bars, and inbound depot turnaround ETAs on the Dispatcher Console within `1 second` via Server-Sent Events (SSE).

### Flow 2 — AI Counterfactual Depot Dispatch Optimization Flow
- **Entry Node (🔵 Entry):** Predictor `reference-eta-v1.1` scans all active buses and upcoming depot departures across an **`8.6-minute (516s)` lookahead window**.
- **Spacing & Crowding Risk Check (🟡 Decision):** Is a downstream headway gap (`รถขาดระยะ > 22 min`), bus bunching (`รถวิ่งติดกัน < 5 min`), or severe cabin overcrowding (`กล้อง AI วัดคนบนรถ > 85%`) predicted to occur?
  - **If Normal (`10–22 min` Green Zone & Balanced Load) (🟢 Keep Schedule):** Maintain current planned depot departure time (`คงเวลาปล่อยรถตามตารางปกติ`).
  - **If Gap / Bunching / Overcrowding Detected:** Launch parallel **Worker-Thread Counterfactual Digital Twin Rollouts (`2.47 ms` latency)** testing candidate depot departure adjustments (`ขยับเวลาปล่อยรถที่อู่ -3 ถึง +5 นาที`) across `75% / 100% / 125%` demand envelopes.
- **Depot Readiness & Driver Welfare Gate (🟡 Decision):** Does the best dispatch adjustment: (1) reduce Total Passenger Waiting Time & peak crowding across all 3 demand envelopes, (2) use a bus physically ready in the depot bay (`EV SoC ≥ 35%`), AND (3) preserve **Driver Minimum Turnaround Rest (`≥ 6 minutes`)** without cutting per-trip `ค่าเที่ยว` credits?
  - **If No (🔴 Safety Abstention):** Reject invalid schedule shift (`0%` harmful interventions) and hold baseline schedule (or alert dispatcher if a reserve bus is needed).
  - **If Yes (🟠 Surface AI Recommendation):** Generate a grounded **3-part Thai Dispatcher Briefing Card** showing exact recommended departure time, reason, and projected wait/crowding improvement.

### Flow 3 — Dispatcher Human-in-the-Loop Approval & Execution Flow
- **Entry Node (🔵 Entry):** Dispatcher (`นายท่า`) views the highlighted **AI Dispatch Recommendation Card** on `dispatcher.html` alongside the 1-second Color-Coded Corridor Ribbon.
- **Dispatcher Decision Node (🟡 Decision):** Does the dispatcher click **`[ ✅ อนุมัติปรับเวลาปล่อยรถ ]`**, **`[ ข้าม / คงตารางเดิม ]`**, or toggle the **`[ ⛔ KILL SWITCH ]`**?
  - **If Kill Switch Triggered (🔴 Emergency Override):** Immediately halt all AI schedule recommendations globally and lock depot to standard manual timetable.
  - **If Dismissed (🟡 Manual Keep):** Keep original departure slot and record dispatcher dismissal reason in the Audit Log for model learning.
  - **If Approved (🟢 Execute Dispatch Shift):** Re-verify bus bay state (`stale-state guard`), update the official **Depot Departure Board / Driver Turnaround Countdown (`ไม่หักค่าเที่ยว · พักครบ ≥ 6 นาที`)**, and record the timestamped approval in the **Immutable Audit Log**.

---

## 4. Detailed 375px Wireframe Screen Specifications (For Stage 6 & Stage 8b Visual Wireframes — 100% Dispatcher Views)

### Screen Mockup 1 — Depot Dispatcher Live Corridor & AI Dispatch Console (`dispatcher.html`, 375px Compact Operator Tablet View)
- **Top Operator Header:** Depot badge `อู่ปล่อยรถต้นสายจตุจักร (สาย R1 → หัวลำโพง)` · Mode badge `LIVE TELEMETRY (<15s)` · Prominent red emergency button **`[ ⛔ KILL SWITCH: AI ON ]`**.
- **Top 4 Operational KPI Tiles:** `รถกำลังวิ่ง: 6 คัน` · `รถพร้อมในอู่: 2 คัน` · `ระยะห่างเฉลี่ย: 14.2 นาที [🟢 ปกติ]` · `คิวเตือนจัดตารางใหม่: 1 รายการ`.
- **1-Second Color-Coded Linear Corridor Ribbon:** Horizontal route track (`อู่จตุจักร → อนุสาวรีย์ฯ → ประตูน้ำ → สยาม → หัวลำโพง`) showing bus icons with **live Edge-AI Camera crowding badges** (`B01: กล้อง AI วัดคนแน่น 88%`, `B02: 74%`, `B03: 32%`) and spacing color legend (`🟢 10–22m สม่ำเสมอ` · `🟠 22–28m เริ่มห่าง` · `🟣 >28m ขาดระยะ` · `🔴 <5m กระจุกติดกัน`).
- **Grounded Thai AI Dispatch Recommendation Card (Hero Element for นายท่า):**
  - *Alert Header:* `⚡ แนะนำปรับเวลาปล่อยรถคันถัดไปจากอู่ (เตือนล่วงหน้า 8.6 นาที)`
  - *AI Analysis:* `"รถ B02 ติดไฟแดงแยกพญาไทและกล้อง AI บนรถตรวจพบความหนาแน่นผู้โดยสารสูงถึง 88% ทำให้ B03 วิ่งไล่จี้เหลือห่างเพียง 4.1 นาที หากปล่อย B04 ตามตารางเดิม (08:10 น.) รถจะวิ่งไปกระจุกติดกัน 3 คันและเกิดช่วงขาดระยะท้ายขบวน"`
  - *Recommended Action:* **`"แนะนำขยับเวลาปล่อยรถ B04 ที่อู่จตุจักร จาก 08:10 น. → เป็น 08:13 น. (+3 นาที)"`**
  - *Verified Impact & Guardrails:* `✅ ลดเวลารอสะสม ~660 คน-วินาที` · `✅ ลดความแออัดเฉลี่ยคันหน้าลงเหลือ ~68%` · `🛡️ เวลาพักคนขับ 9 นาที (ผ่านเกณฑ์ ≥6 นาที · ไม่เสียค่าเที่ยว)`
  - *Action Buttons:* Green primary **`[ ✅ อนุมัติปล่อย B04 เวลา 08:13 น. ]`** + secondary **`[ คงเวลาเดิม 08:10 น. ]`**.

### Screen Mockup 2 — Depot Departure Schedule & Turnaround Bay Planner (`ตารางคิวปล่อยรถในอู่`, 375px Tablet View)
- **Header:** `ตารางคิวปล่อยรถจากอู่จตุจักร (Static Timetable vs. AI Real-Time Schedule)` · Weather chip `🌧️ ฝนตกปานกลาง (เวลาจอดรับคน +20%)`.
- **Depot Bay Queue Rows (Comparing Old Schedule vs. AI Schedule):**
  - *Bay 1 — Bus B04 (EV-31):* `จอดพร้อมในอู่ · 🔋 แบต 78% · พักคนขับแล้ว 9 นาที` | ตารางเดิม `08:10 น.` → **AI แนะนำ `08:13 น. (+3 นาที · อนุมัติแล้ว ✅)`** (`เหตุผล: กันรถกระจุกติด B03`).
  - *Bay 2 — Bus B05 (EV-31):* `จอดพร้อมในอู่ · 🔋 แบต 64% · พักคนขับแล้ว 12 นาที` | ตารางเดิม `08:25 น.` → **AI แนะนำ `08:23 น. (-2 นาที · รออนุมัติ 🟠)`** (`เหตุผล: กล้อง AI พบคนสะสมช่วงอนุสาวรีย์ฯ สูง จึงปล่อยเร็วขึ้นเพื่อช่วยแบ่งเบาความหนาแน่น`).
  - *Inbound Returning — Bus B01:* `กำลังกลับเข้าอู่ (ถึงใน 11 นาที)` | `คำนวณเวลาพักขั้นต่ำ +6 นาที → พร้อมปล่อยรอบถัดไป 08:40 น.`.
- **Bottom Guardrail Status:** `🔒 ระบบล็อกอัตโนมัติ: ห้ามสั่งปล่อยรถที่พักไม่ครบ 6 นาที หรือแบต EV < 35%`.

### Screen Mockup 3 — Dual-World A/B KPI & Crowding Reduction Scorecard (`kpi.html`, 375px Supervisor View)
- **Header:** `ผลลัพธ์การเดินรถ: ตารางเดิม (Baseline) vs. ตาราง AI Evenflow (840 Runs Verified)`.
- **4 Core Operational Impact Cards:**
  - *1. ลดเวลารอเมื่อรถคลาดเคลื่อน (Wait-Time Saved):* **`-660 คน-วินาที / รอบ`** (`ชนะตารางเดิม 30/30 Seeds · 100%`).
  - *2. ความสม่ำเสมอของระยะห่างรถ (Headway Variance):* **`53,574 → 51,791 (-3.3% ลดรถขาดระยะ)`**.
  - *3. ลดความหนาแน่นคนล้นคันจากกล้อง AI (Peak Crowding Relief):* **ลดสัดส่วนรถที่อัดแน่นเกิน 85% ลงจาก `38% → เหลือ 22%`** (เกลี่ยคนเข้าสู่คันถัดไปที่ปล่อยมาได้จังหวะพอดี).
  - *4. ความปลอดภัยต่อผู้โดยสารและคนขับ:* **`0%` การกักรถกลางทางที่ทำร้ายคนบนรถ** · **`100%` คนขับได้พัก ≥ 6 นาที**.
- **Audit Trail Preview:** `08:09:12 — นายท่าอนุมัติ B04 (+3 นาที) · บันทึกเข้าระบบตรวจสอบแล้ว`.

### Screen Mockup 4 — 90° Edge-AI Camera Calibration, Predictor Diagnostics & Governance (`spotter.html` + `aieval.html` + `governance.html`, 375px View)
- **Header:** `กล้อง AI วัดความหนาแน่นคนบนรถ & ความแม่นยำโมเดล (Edge-AI Vision & Diagnostics)`.
- **90° Overhead Camera Status (`spotter.html`):** `กล้อง AI มุมสูงประตูรถ (YOLOv8-Nano + ByteTrack)` · `นับคนขึ้น +In / คนลง -Out แบบเรียลไทม์` · `Bayesian Dwell Cross-Check Active` · `PDPA 100% (ลบภาพใน RAM ทันที ไม่เห็นใบหน้า)`.
- **Predictor Scorecard (`aieval.html`):** `Precision เตือนรถกระจุก/ขาดระยะ: 1.00 (ไม่มีเตือนมั่ว)` · `เตือนนายท่าล่วงหน้า: 8.6 นาที (516 วินาที)` · `ความคลาดเคลื่อนช่องไฟ (MAE): 78.21 วินาที` · `Worker Thread Latency: 2.47 ms`.
- **Governance & Labor Badge (`governance.html`):** `🛡️ กติกา No-Blame ไม่หักเงิน/ไม่ตัดค่าเที่ยวคนขับ · ล็อกเวลาพัก ≥ 6 นาที`.

---

## 5. Scope Definition (MoSCoW Backlog — 100% Dispatcher & Depot Scope)

### P0 — Must-Have (Core Scope: Delivered in Ring 1 MVP + Validated in Ring 2 Depot Pilot)
- **P0.1 — Real-Time GPS & 90° Edge-AI Camera Crowding Ingestion Engine** *(Traces to: Real-time operational & AI camera crowding input)* — Delivered in `engine/telemetry.js`, `spotter.html` & `engine/world.js` (fuses GPS kinematics, 90° top-down Edge-AI passenger counts `+In/-Out`, and stop door-dwell duration with a 90-second staleness fail-safe).
- **P0.2 — AI Headway-Gap & Onboard-Crowding Early Warning (`~8.6 min` Lookahead)** *(Traces to: Predicting service gaps & overcrowding before they happen)* — Delivered in `engine/bunching.js` (`1.00` precision, `516s` lead time across 728 real Bangkok road vertices, 8 intersections, and live Open-Meteo rain context).
- **P0.3 — Counterfactual Digital Twin Depot Dispatch Optimizer** *(Traces to: AI analyzing data to find the best dispatch schedule)* — Delivered in `engine/operations.js` & Worker-Thread `engine/twin.js` (`2.47 ms` latency, evaluating `-3 to +5 min` depot departure adjustments across `75%/100%/125%` demand envelopes; verified across `840` runs saving `-660 person-sec` across `30/30` disrupted seeds).
- **P0.4 — Depot Bay Readiness, Driver Rest (`≥ 6 min`) & No-Blame Guardrails** *(Traces to: Realistic depot operations that dispatchers and drivers trust)* — Enforces physical bus availability in bay, `≥ 6 min` driver turnaround rest lock, `EV SoC ≥ 35%`, and zero automated wage/trip-credit deductions.
- **P0.5 — Human-in-the-Loop Dispatcher Console (`dispatcher.html`) & A/B KPI Dashboard (`kpi.html`)** *(Traces to: Built specifically for นายท่า to review and approve dispatch schedules)* — Includes 1-second Color-Coded Corridor Ribbon, Thai AI Copilot recommendation cards, 1-Click Approve/Dismiss, Emergency Kill Switch, and Immutable Audit Log.

### P1 — Should-Have (Ring 2 Depot Field Pilot Enhancements)
- **P1.1 — Ruggedized 90° Overhead Edge-AI Vision Camera Kits (`6–8` Pilot Buses) + True 5G → AWS IoT Core / Timestream:** Mounts non-invasive `9–36V` top-down door cameras on pilot campus/feeder buses streaming real-time cabin crowding to the depot console.
- **P1.2 — Amazon Bedrock (Claude) Thai Dispatcher Copilot with Guardrails:** Enterprise LLM wrapper explaining multi-bus turnaround trade-offs in natural Thai with zero hallucinated numbers.
- **P1.3 — Route-Specific Dwell & Crowding Parameter Calibration:** Automatically fits stop-specific $\alpha, \beta, \gamma_{\text{crowd}}$ curves from live Edge-AI camera and GPS logs during the pilot.

### P2 — Could-Have (Ring 3 Multi-Depot Commercial Expansion)
- **P2.1 — Two-Terminal Bi-Directional Depot Synchronization:** Coordinates origin depot (`อู่ต้นสาย`) and destination depot (`อู่ปลายสาย`) departure schedules simultaneously across long cross-city routes.
- **P2.2 — Automated Reserve-Bus & Shift-Handover Planner:** Suggests optimal timing to inject a standby reserve bus (`รถสำรองในอู่`) when severe city-wide flooding or gridlock delays all inbound turnarounds.

### Explicit Out-of-Scope (Eliminating Unnecessary Complexity & "เอ๊ะ" Factors)
- ❌ **No Consumer / Passenger Mobile App or Public Bus-Stop QR Screens:** Passengers do **not** need to install any app, scan any QR code, or change their behavior—they benefit automatically from buses arriving evenly spaced and less crowded.
- ❌ **No BMA Street Sidewalk Construction or Public Kiosk Permits:** Zero street hardware installation outside the bus operator's own depot and vehicles.
- ❌ **No Ticket / Farebox Revenue System Integration Needed:** Crowding is measured directly by the non-invasive 90° Edge-AI camera above the doors, never touching cash or fare payment systems.
- ❌ **No Uncontrolled Autonomous Dispatching or Facial Recognition:** The AI never dispatches a bus without `นายท่า` approval and never captures passenger faces.

---

## 6. Measurable Success Criteria & KPI Targets

| # | Metric / Success Criterion | Ring 1 Verified Baseline (Today) | Ring 2 Depot Field Pilot Target (12 Weeks, 1 Depot / 6–8 Buses) | Verification Method |
| :--- | :--- | :--- | :--- | :--- |
| **SC1** | **Passenger Wait-Time Reduction Under Disrupted Turnarounds** | **`-660.00 person-seconds`** saved per 30-min run (`30/30` seeds · `100%` win rate) | **`≥ 12%` reduction** in P90 passenger waiting time & Excess Wait Time (`EWT`) along the route | Alternating A/B weeks (Fixed Timetable weeks vs. AI-Assisted Depot Dispatch weeks in `kpi.html`) |
| **SC2** | **Corridor Headway Regularity (`ลดรถขาดระยะ / รถวิ่งติดกัน`)** | **`-3.3%`** headway variance reduction (`53,574 → 51,791` across 840 runs) | **`≥ 15%` reduction** in severe headway gaps (`> 22 min`) and bus bunching pairs (`< 5 min`) | Automated corridor GPS passage headway logs |
| **SC3** | **90° Edge-AI Crowding Accuracy & Peak Crowding Reduction (`ลดความหนาแน่นคนบนรถ`)** | Bayesian camera-dwell cross-check + `1.35×` crowding physics active | **`≥ 95%` camera count accuracy** (`≤ ±2 pax`) & **`≥ 15%` reduction** in peak trips exceeding `85%` crush load | Manual spotter audit (`spotter.html`) & onboard Edge-AI occupancy logs |
| **SC4** | **AI Early-Warning Precision & Lookahead Lead Time for นายท่า** | **`1.00` Precision (`FP=0`)** · **`516.17s (~8.6 min)`** mean warning lead time | **`≥ 0.85` Precision** · **`≥ 6–8 min`** advance warning before downstream gap/bunching occurs | Time-split backtesting on live route telemetry (`aieval.html`) |
| **SC5** | **Dispatcher Adoption & Decision Speed (`การใช้งานจริงของนายท่า`)** | 1-Click Approval UI + **`2.47 ms`** non-blocking Worker-Thread latency | **`≥ 70%` dispatcher approval rate** on AI recommendations · **`< 5 seconds`** review time per dispatch | Immutable Audit Log timestamps & weekly dispatcher usability feedback |
| **SC6** | **Zero Mid-Route Passenger Harm & 100% Driver Rest Compliance** | **`0.0%` (`0 / 840` runs)** net passenger harm · **`100%`** `≥ 6 min` rest lock | **`0`** approved dispatches violating `≥ 6 min` driver rest or `ค่าเที่ยว` credits · **`100%`** PDPA compliance | Depot turnaround audit log (`governance.html`) |
