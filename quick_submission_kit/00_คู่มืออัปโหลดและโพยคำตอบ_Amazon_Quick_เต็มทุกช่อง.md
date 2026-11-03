# 🏆 คู่มือชนะรางวัล AI FOR ALL Hackathon (เวอชั่นโฟกัส "นายท่าปล่อยรถจากอู่ 100%" — ไม่มีแอปผู้โดยสาร ไร้จุดเอ๊ะ!)

ชุดเอกสารนี้ถูกปรับจูนใหม่ทั้งหมดให้ตรงกับโจทย์ของคุณแบบ **100% คือ "ระบบ AI ผู้ช่วยนายท่าวางแผนและปรับตารางปล่อยรถเมล์จากอู่แบบเรียลไทม์ เพื่อแก้ปัญหารถขาดระยะและลดความหนาแน่นของคนบนรถ (โดยไม่มีส่วนของ User ผู้โดยสารทั่วไป)"** ซึ่งเป็นการตัดสินใจที่ฉลาดและคมมาก เพราะ:
1. **ตัดจุดที่กรรมการจะ "เอ๊ะ" ทิ้งได้ 100%:** ไม่ต้องพึ่งให้ผู้โดยสารโหลดแอปใหม่ ไม่ต้องกลัวคนไม่สแกน QR ป้ายรถเมล์ และไม่ต้องขออนุญาต กทม. ติดตั้งป้ายข้างถนน 5,000 ป้าย เพราะระบบทำงานอยู่ใน **"ห้องนายท่าที่อู่รถเมล์"** ที่ผู้เดินรถควบคุมเองได้ 100% ตั้งแต่วันแรก!
2. **ตรงกับผลพิสูจน์ทางคณิตศาสตร์ที่ชนะขาดในโค้ดของเรา (`840` รอบจำลอง):** ในผลการทดลองของเรา การกักรถกลางทาง (`Mid-route holding` ตอนมีคนนั่งอยู่บนรถ) ทำให้ผู้โดยสารเสียเวลาเพิ่ม `+652.83 คน-วินาที` แต่ **การจัดตารางปล่อยรถจากอู่ต้นสาย (`Smart Depot Dispatch` ตอนรถยังว่างก่อนออกจากอู่) ชนะ `30 / 30` Seeds (`100%`) ช่วยประหยัดเวลารอรวม `-660.00 คน-วินาที` และลดความแปรปรวนของช่องไฟรถลง `-3.3%` โดยไม่ทำร้ายคนบนรถเลย (`0%` Harm)!**

---

## 🚀 ขั้นตอนที่ 1: อัปเดตไฟล์ใน Space บน `quick.aws.com` ใหม่ (ใช้เวลา 30 วินาที)

1. เข้าไปที่ **`quick.aws.com`** → ไปที่เมนู **Spaces** → เปิด Space ของคุณ
2. **ลบไฟล์เก่าใน Space ออกให้หมด** แล้วอัปโหลด **4 ไฟล์เวอชั่นใหม่ล่าสุดนี้** (อยู่ในโฟลเดอร์ `quick_submission_kit/`) เข้าไปแทน:
   - ✅ `01_Evenflow_Executive_Strategy_Market_and_Pilot_Plan.md`
   - ✅ `02_Evenflow_Architecture_AI_Engine_and_Validation_Report.md`
   - ✅ `03_Evenflow_UX_Screens_Flows_Scope_and_Governance.md`
   - ✅ `04_Evenflow_Global_Research_Loophole_Analysis_and_Adaptations.md`
   *(❌ ไม่ต้องอัปโหลดไฟล์คู่มือ `00_...` ไฟล์นี้นะครับ)*
3. กดเริ่ม **New Chat** ใน Space นี้ แล้วเรียกใช้งาน Skill **`AI for All Thailand: Ideation`**

---

## 🎯 ขั้นตอนที่ 2: โพยคำตอบสำหรับก๊อปปี้ไปวางทีละด่าน (Step 0 ถึง Stage 8b)

### ด่าน Step 0.1 — เลือกหัวข้อหลัก (Pillar Selection)
เมื่อ Quick แสดงการ์ด 6 หัวข้อ ให้คลิกเลือก:
👉 **`🚍 Smart Mobility & Cities`**

---

### ด่าน Step 0.2 — อธิบายปัญหาและไอเดีย (The Problem & Your Idea — โฟกัสนายท่าปล่อยรถจากอู่ 100% ไม่มีส่วนผู้โดยสาร)
ก๊อปปี้กล่องด้านล่างนี้ไปวางได้เลยครับ:

```text
1. The problem as I see it
In Bangkok and major Thai cities, public bus commuters endure 15 to 30+ minute unpredictable service gaps (OTP transit surveys), driving wait-time predictability satisfaction below 20% (TDRI public transit research). The root operational cause lies at the bus depot ("อู่ปล่อยรถเมล์"): today, depot dispatchers ("นายท่า") release buses using static paper timetables (e.g., fixed 15-minute clock intervals) or raw GPS dots without predictive analytics.

Once buses leave the depot into congested corridors (like Chatuchak to Victory Monument, Pratunam, Siam, and Hua Lamphong), traffic delays, 3-5 minute intersection holds, and sudden rain disrupt spacing. Because passenger boarding takes 1.6-2.2s/rider and cabin crowding above 75% slows alighting by 1.35x, a slightly delayed lead bus faces growing passenger queues, becomes crush-loaded (>85-95% capacity), and dwells longer at every stop. Meanwhile, if the depot dispatcher blindly releases the next bus on the fixed clock schedule, it meets empty stops, catches the lead bus, and causes 2-3 buses to run bumper-to-bumper—wasting fuel/EV battery on half-empty trailing buses while leaving a 25-35 minute service gap ("รถขาดระยะ") behind them.

Existing solutions have critical operational loopholes in Thailand:
- Raw GPS fleet screens only show where buses are right now; dispatchers cannot mentally calculate how traffic across 8 intersections, rain, stop dwell times, onboard passenger crowding, and late inbound turnaround buses returning to the depot interact 8-15 minutes ahead.
- Mid-route bus holding (like Singapore LTA's clock-based Excess Wait Time holding) forces buses to wait at mid-route stops while 35+ passengers are already onboard—which blocks narrow Bangkok lanes and actually worsened Total Passenger Time by +652.83 person-seconds in our 840-run Digital Twin benchmark.
- Consumer tracking apps only show passengers that buses are already bunched; they do not fix depot departure scheduling, while imported Western dispatch SaaS (Swiftly/Optibus) costs $150-$300+/bus/month plus costly 3D hardware and ignores Thai depot turnaround rest and driver per-trip ("ค่าเที่ยว") wage rules.

2. My idea
I built and propose Evenflow (v5 working prototype live at https://ai-forall-eight.vercel.app, open-source repo https://github.com/Alicebbb111/AI-for-all with 91/91 passing automated tests), a 100% B2B/B2G Real-Time AI Depot Dispatch and Headway-Planning Decision-Support System built exclusively for bus depot dispatchers ("นายท่า") and fleet operations managers—with ZERO consumer/passenger app dependency:

- How it works (3-Step Dispatcher Decision-Support Workflow at the Depot):
  1) Multi-Source Real-Time Operational & Edge-AI Crowding Ingestion: Ingests existing fleet GPS/AVL kinematics (snapped to 728 real Bangkok OSRM road points and 8 signalized intersections), stop door-open dwell durations, real-time onboard passenger crowding from a 90-degree top-down Overhead Edge-AI Camera (YOLOv8-Nano + ByteTrack counting +In/-Out head-shoulder silhouettes in volatile RAM and deleting frames instantly — 100% PDPA safe, needed because Thai buses lack tap-out so ticket machines cannot know how many riders remain onboard, cross-checked via Bayesian door-dwell physics), live Open-Meteo rainfall, and inbound depot turnaround arrival ETAs—protected by a 90-Second Honest Abstention fail-safe when telemetry is stale.
  2) AI Early Warning & Counterfactual Digital Twin Dispatch Optimization: Predicts downstream service gaps and bus bunching ~8.6 minutes (516 seconds) in advance (1.00 precision, zero false alarms). Before the next bus leaves the depot, Node.js Worker Threads (2.47ms latency) simulate candidate departure schedule adjustments (-3 to +5 minutes from the static timetable) across 75%/100%/125% passenger demand scenarios:
     - If a lead bus is delayed and its Edge-AI camera shows high crowding (>85% load), the AI recommends advancing the next ready depot bus (-1 to -3 min) or pacing remaining depot buses when inbound turnarounds are delayed—preventing long service gaps and sharing passenger load.
     - If a lead bus was just held up near the depot exit, the AI recommends holding the next bus at the depot (+2 to +4 min) where 0 passengers are onboard (0% onboard passenger harm), preventing buses from bunching mid-route. Across 840 SHA-256 hash-verified simulation runs, our Depot Dispatch optimization saved -660.00 person-seconds across 30/30 disrupted seeds (100% win rate) and reduced corridor headway variance by -3.3%.
  3) Human-in-the-Loop Dispatcher Console & Hard Thai Depot Guardrails: The depot dispatcher ("นายท่า") views a 1-second Color-Coded Corridor Ribbon, live Edge-AI cabin crowding bars, a Depot Bay Readiness Queue, and a grounded Thai AI Copilot recommendation card with 1-Click Approve/Dismiss, Emergency Kill Switch, and Immutable Audit Log. Every AI schedule recommendation strictly enforces Physical Bus Availability in the depot bay, EV Battery readiness (SoC >=35%), Mandatory Driver Turnaround Rest (>=6 minutes), and a No-Blame Driver Charter (zero automated pay deductions and 100% protected per-trip "ค่าเที่ยว" credits).

- Who benefits:
  Depot dispatchers ("นายท่า" — clear 1-click AI departure scheduling instead of guesswork); route supervisors and fleet operators (BMTA ขสมก., private EV operators like Thai Smile Bus, and university/corporate shuttle depots — better fleet/EV energy utilization at ~80% lower cost than Western SaaS); bus drivers (guaranteed >=6 min turnaround rest, protected "ค่าเที่ยว" pay, and less crush-loaded trips); and daily bus passengers (who automatically experience regular bus arrivals without gaps and lower onboard crowding—without needing to install or use any passenger app).
```

---

### ด่าน Step 0.3 — ตอบคำถามเจาะลึก 3 ข้อของ Quick (Follow-Up Questions)
ก๊อปปี้คำตอบด้านล่างนี้ไปวางได้เลยครับ (ตอบครบทั้งพิกัดทดลอง 12 สัปดาห์ → 12 เดือน → 3 ปี, ความโปร่งใสเรื่องสถานะการทดสอบระบบปัจจุบัน, และวิธีทลายอุปสรรคใหญ่สุดในการขยายผล):

```text
1. Target Geography & Timeline (12-Week Depot Pilot -> 12 Months -> 3 Years)
- First 12-Week Beachhead Depot Pilot (Months 1-3):
  Because Evenflow is an internal depot tool for dispatchers ("นายท่า") with zero consumer app or street-sidewalk hardware needed, we target a single-authority **University Campus Shuttle Depot (Thammasat University Rangsit EV/NGV Shuttle Terminal, 6-8 buses, directly aligned with academic partner TU-RAC)** or a **Private EV Feeder Depot** (2-3 week sign-off), while running passive GPS shadow benchmarking on Bangkok Flagship Urban Corridor **R1 (Chatuchak Depot <-> Victory Monument <-> Pratunam <-> Siam <-> Sam Yan <-> Hua Lamphong Depot, 13 stops, 728 OSRM road vertices)**.
  *12-Week Depot Pilot Success (<210,000 THB all-in budget for depot tablet + 6-8 ruggedized 90-degree Edge-AI camera kits):* >=95% anti-drift Edge-AI passenger count accuracy, >=70% dispatcher approval rate on AI departure recommendations (<5s review time), >=12% reduction in P90 passenger wait time & Excess Wait Time (EWT), >=15% reduction in severe service gaps (>22 min) and peak trips exceeding 85% crush crowding, 0% mid-route passenger harm, and 0 violations of the >=6-minute driver turnaround rest rule.
- 12-Month Success (Year 1 — Commercial Bangkok Multi-Depot Rollout):
  Backed by audited 12-week depot ROI, expand to **5-10 bus depots managing 150-300 active urban buses** across private EV bus concessionaires (e.g., Thai Smile Bus depots) and an initial **BMTA (ขสมก.) zone depot MOU**, orchestrated on **True 5G IoT + AWS (IoT Core, Timestream, ECS Fargate, Amazon Bedrock)**.
- 3-Year Success (Year 3 — National B2B/B2G Transit Dispatch Standard):
  Scale across **30+ depots (1,000-1,500+ buses)** in Bangkok and major regional transit networks (Chiang Mai, Khon Kaen, Phuket) at **~80% lower TCO** than imported Western dispatch SaaS (45,000 THB turnkey 90-degree Edge-AI camera kit + 1,200 THB/bus/month SaaS).

2. Current Prototype Validation (What Is Verified Today vs. Field Depot Status)
- Honest Field Status: We have **not yet deployed the console and physical Edge-AI camera kits inside a live commercial bus depot for active shift dispatching**—running that controlled 12-week live depot trial is the exact goal of our Ring 2 Pilot.
- Four Layers of Real-World Validation Already Completed Today:
  1) **Live Bangkok Corridor Geometry & Real-Time Context Feeds:** Evenflow v5 (https://ai-forall-eight.vercel.app) runs on actual **OpenStreetMap/OSRM Bangkok road geometry** (728 WGS84 road points & 13 real stops on R1, plus Sukhumvit R2, Lat Phrao R3, Rama IV R4), live Bangkok rainfall (**Open-Meteo API**), and live disruption feeds (**GDELT**). All **91/91 automated verification tests** pass (1.02s), including JSON Schema 2020-12 telemetry validation, 90s GPS blackout fallback, and Node.js Worker Threads cutting health latency under 30-seed simulation load from 13,304.71 ms down to **2.47 ms**.
  2) **840-Run Hash-Verified Digital Twin Discovery (Why We Focused 100% on Depot Dispatch):** Across 30 seeds x 7 disruption scenarios x 4 policies (840 SHA-256 hash-matched runs), our benchmark proved that holding buses mid-route while passengers are onboard worsened Total Passenger Time by **+652.83 person-seconds**, whereas **Depot Dispatch Optimization ("Smart Dispatch" at the terminal before boarding)** saved **-660.00 person-seconds across 30/30 disrupted seeds (100% win rate)** and cut corridor headway variance by **-3.3% (53,574 -> 51,791)** with **0% onboard passenger harm**.
  3) **Workflow Grounded in Real Thai Depot & Driver Constraints:** Analyzing real Thai depot workflows and Bangkok EV driver strike reports showed that dispatchers reject complex academic Marey charts and drivers boycott systems that cut turnaround rest or dock per-trip ("ค่าเที่ยว") pay—driving our **1-second 4-color Linear Corridor Ribbon**, **Inbound Turnaround Pacing Mode** (handling days when all buses return late from traffic), **>=6-min rest lock**, and **No-Blame Charter**.
  4) **Non-Invasive Stage A Depot & Edge-AI Onboarding:** In Weeks 1-3 of the pilot, the depot sets up `dispatcher.html` on a standard depot tablet and mounts plug-and-play `9-36V` **90-degree Overhead Edge-AI Vision Kits** above bus doors in **Shadow Mode** to calibrate stop dwell and crowding curves before dispatchers begin clicking Approve in Weeks 4-12.

3. Single Biggest Obstacle Beyond a Pilot & How We Overcome It
- Single Biggest Obstacle: **Frontline Dispatcher & Driver Resistance Combined with B2G Procurement Friction**—specifically: (a) veteran dispatchers ("นายท่า") and drivers fearing that dynamic departure adjustments will reduce driver rest, cut credited daily trip quotas ("เสียค่าเที่ยว"), or fail when all inbound buses are delayed by Bangkok gridlock, and (b) slow 12-18 month state procurement if pitching expensive foreign suites.
- Our 3-Part Structural Solution:
  1) **100% Depot-Internal, Zero-Commuter-Dependency Architecture:** By eliminating public street hardware and passenger apps completely, operators need zero BMA sidewalk permits and zero consumer marketing—a depot only mounts non-invasive 90-degree top-down door cameras (`~22,000 THB` pilot BOM, 100% PDPA-safe) and opens a web browser in the dispatcher room.
  2) **Hard Turnaround Reality & "No-Blame" Labor Protection:** When all inbound buses are delayed by heavy traffic, the AI automatically switches to **Proactive Pre-Gap Pacing** (spacing out remaining depot buses + alerting when a reserve bus is needed) while strictly locking **>=6 minutes driver rest** and guaranteeing **zero automated fines and 100% protected "ค่าเที่ยว" trip credits**.
  3) **Bottom-Up Campus/Private Depot Proof -> State BMTA Scaling:** Proving measurable headway, crowding, and EV/fuel opex ROI first at a **TU Rangsit Campus / Private EV Depot** (<210,000 THB pilot, 2-week sign-off) gives us audited Thai operational proof to scale across private EV fleets and BMTA depots at 1,200 THB/bus/month (~80% cheaper than Western SaaS).
```

---

### ด่าน Stage 1 — Intent Capture & Project Type (`01 — Intent Capture`)
เมื่อ Quick สรุป `01 — Intent Capture` เสร็จและถามว่าจะไปต่ออย่างไร **ห้ามกดข้ามด่าน 5 หรือ 6 เด็ดขาด!** ให้เลือก **Option 1 (`✏️ Other / Type your own input`)** หรือวางข้อความนี้:

```text
I confirm all Stage 1 assumptions as [status: confirmed]. Please classify Project Type as "brownfield" (an existing working MVP advancing to a Phase 1 Depot Field Pilot and Commercial B2B/B2G Depot Dispatch SaaS — strictly 100% focused on Depot Dispatchers "นายท่า" and Fleet Operations with ZERO passenger/consumer app scope) and run ALL workflow stages in full — Stage 2 (Market Research using Deep Research + all 4 Space documents), Stage 3 (Feasibility & Constraints across all 5 dimensions), Stage 4 (Scope Definition), Stage 5 (Team Formation — do NOT skip), Stage 6 (Rough Mockups with Mermaid flowcharts and 375px operator tablet/mobile wireframes — do NOT skip), Stage 7 (Initiative Brief), Stage 8a (Content Document), and Stage 8b (Summary Presentation). Proceed to Stage 2 now.
```

---

### ด่าน Stage 2 → Stage 3 → Stage 4 → Stage 5 → Stage 6
ก๊อปปี้ข้อความสั้นๆ ตามด่านด้านล่างนี้ส่งไปทีละด่านเมื่อ Quick ถามครับ:

- **หลังจบ Stage 2 (เพื่อไป Stage 3 — Feasibility):**
  ```text
  Approved Stage 2. Proceed to Stage 3 (Feasibility & Constraints). Please evaluate all 5 dimensions (Technical & Cloud, Data & 90-Degree Edge-AI Camera Hardware, Algorithmic & AI Safety, Depot Operational/Labor/PDPA, and Budget & Timeline) using the verified evidence in our Space documents (100% B2B/B2G depot-internal scope requiring zero street permits and zero passenger app adoption, real-time onboard crowding measured via 90-degree top-down PDPA-safe Edge-AI Camera + Bayesian door-dwell cross-check, 91/91 passing tests, 840-run hash-verified Digital Twin proving -660 person-sec savings and 0% passenger harm via depot dispatch, 2.47ms Worker Thread latency, Inbound Turnaround Pacing when buses return late, >=6m driver rest & No-Blame "ค่าเที่ยว" protection, and <210,000 THB 12-week campus/private depot pilot), and include the full Constraint Register and RAID Log.
  ```

- **หลังจบ Stage 3 (เพื่อไป Stage 4 — Scope Definition):**
  ```text
  Approved Stage 3. Proceed to Stage 4 (Scope Definition) with complete MoSCoW prioritization (P0 Must-Have, P1 Should-Have, P2 Could-Have, and Explicit Out-of-Scope clearly stating NO consumer/passenger app, NO street-stop hardware, and NO ticket/farebox integration) traced back to Stage 1 Intent, plus all 6 measurable Success Criteria covering both Ring 1 verified baselines and Ring 2 12-week depot pilot targets.
  ```

- **หลังจบ Stage 4 (เพื่อไป Stage 5 — Team Formation):**
  ```text
  Approve Scope Definition. Proceed to Stage 5 (Team Formation) — include the full Skills Assessment, AI-Augmented Lead Architect + AI-DLC Agents + Pilot Depot Dispatcher Lead ("นายท่า") & Cloud Advisors composition, complete RACI Matrix, and lean-team mitigations.
  ```

- **หลังจบ Stage 5 (เพื่อไป Stage 6 — Rough Mockups & Visual Wireframes):**
  ```text
  Approved Stage 5. Proceed to Stage 6 (Rough Mockups). Remember this system has ZERO passenger app — all screens and flows are 100% for Depot Dispatchers ("นายท่า") and Fleet Supervisors. Please produce: (A) Visual Mermaid flowcharts for all 3 core operational flows (1. Real-Time GPS & 90-Degree Edge-AI Camera Crowding Ingestion & 90s Honest Abstention Flow, 2. AI 8.6-Min Lookahead & Counterfactual Digital Twin Depot Dispatch Optimization Flow, 3. Dispatcher 1-Click Approval, Depot Bay Readiness/Driver Rest Check & Execution Flow), (B) Interactive 375px operator tablet/mobile HTML wireframes for our 4 dispatcher interfaces (Screen 1: Depot Dispatcher Live Corridor Ribbon, Edge-AI Crowding Badges & AI Dispatch Recommendation Card, Screen 2: Static Timetable vs. AI Real-Time Depot Bay Departure Queue & Inbound Turnaround Tracker, Screen 3: Dual-World A/B KPI & Peak Crowding Reduction Scorecard, Screen 4: 90-Degree Edge-AI Camera Status, Predictor Diagnostics & No-Blame Driver Governance Console), and (C) Current State vs. To-Be Depot Dispatcher Operational Journey table. Ensure the Carry-Forward (Stage 1.6) block describes every flow and screen clearly in words for Stage 8.
  ```

- **หลังจบ Stage 6 (เพื่อไป Stage 7 — Initiative Brief & Reviewer Pass):**
  ```text
  Approved Stage 6. Proceed to Stage 7 (Approval & Handoff). Confirm all assumptions as resolved/confirmed (zero unconfirmed assumptions remaining), execute the full Product Lead Reviewer Pass (Completeness, Consistency, Traceability, Feasibility Alignment), and produce "07 — Initiative Brief" with the complete Decision Log and Go/No-Go verdict.
  ```

---

### ด่านสำคัญที่สุด: Stage 7 → Stage 8a และ Stage 8b (แยกเป็น 2 เทิร์น ห้ามรวบ!)

1. **เมื่อจบ Stage 7 (สั่งเริ่ม Stage 1.8a เท่านั้น):**
   ```text
   ✅ Approve Initiative Brief! Now proceed ONLY to Stage 1.8a — produce the complete "Evenflow — Content Document" in plain Markdown containing ALL 17 numbered ## sections (1. Overview through 17. Evidence & Sources, zero omitted sections), preserving every exact metric, inline [source: ...] tag, and full prose descriptions of all 3 dispatcher flows and 4 operator wireframe screens in Section 7 (Screens & Flows), followed by the "## Stage 1.8a check" gate block. Stop after Stage 1.8a so I can download the Markdown document before Stage 1.8b.
   ```
   👉 **กด Download ไฟล์ `.md` ของ Stage 1.8a เก็บไว้ทันที!**

2. **เมื่อดาวน์โหลดไฟล์ `.md` จาก 8a แล้ว (สั่งเริ่ม Stage 1.8b เพื่อให้ได้สไลด์ HTML ครบ 17+ สไลด์):**
   ```text
   continue — Proceed to Stage 1.8b and generate "Evenflow — Summary Presentation" as a self-contained, polished HTML presentation deck built strictly from the Stage 1.8a Content Document. Requirements:
   1. First index all 17 ## headings verbatim from Stage 1.8a.
   2. Render EVERY ONE of the 17 sections into at least one dedicated slide (minimum 17+ slides so M = N = 17 — do NOT merge or drop any section).
   3. Include interactive Prev/Next slide navigation, keyboard arrow controls, slide progress indicator, and a clean "View All / Print" toggle.
   4. Visually render Section 7 (Screens & Flows) inside the deck using Mermaid.js CDN diagrams for the 3 dispatcher operational flows AND realistic 375px operator-frame HTML/CSS UI wireframes for the 4 depot dispatcher screens (strictly operator-facing, no passenger app screens).
   5. Include data visualizations (5-dimension HIGH feasibility chart, MoSCoW scope matrix, 840-run Digital Twin & crowding KPI comparison cards, 3-Ring depot roadmap).
   6. After the HTML artifact, output the complete "## Stage 1.8b coverage check" table quoting exact verbatim strings for all 17 sections (M = 17, N = 17) and the "## Ready to submit" checklist.
   ```
   👉 **กด Download ไฟล์ `.html` ของ Stage 1.8b เก็บไว้คู่กับไฟล์ `.md` ได้เลยครับ!**
