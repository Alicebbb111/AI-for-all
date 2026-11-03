# Evenflow v5 — Executive Strategy, Market Landscape & De-Risked Depot Pilot Plan
> **Project Title:** Evenflow — Real-Time AI Depot Dispatch & Headway Optimization System for Transit Dispatchers (ระบบ AI ผู้ช่วยนายท่าวางแผนและปรับตารางปล่อยรถเมล์จากอู่แบบเรียลไทม์)  
> **Strategic Pillar:** Smart Mobility & Cities (Traffic efficiency · Reliable public transit operations · Fleet & passenger-load optimization)  
> **Project Classification:** Brownfield Working MVP Advancing to Phase 1 Depot Field Pilot (`brownfield`)  
> **Target Users:** **100% B2B/B2G Transit Operations Only** — Depot Dispatchers (`นายท่าปล่อยรถ`), Route Supervisors (`หัวหน้าสายเดินรถ`), and Fleet Operations Managers *(No consumer/passenger app required)*  
> **Live Working Prototype:** https://ai-forall-eight.vercel.app · **Repository:** https://github.com/Alicebbb111/AI-for-all  
> **Owner / Lead Engineer:** Bowornnan  
> **Last Verified:** November 1, 2026  

---

## 1. Executive Vision & Core Value Proposition (Zero-Skepticism Operator Focus)

**One-Line Vision:**  
Evenflow is an AI-powered **Depot Dispatch Decision-Support System** that helps bus terminal dispatchers (`นายท่า`) dynamically adjust departure schedules at the depot using real-time operational, traffic, weather, and passenger-load data—eliminating service gaps (`รถขาดระยะ`), preventing bus bunching (`รถวิ่งกระจุกติดกัน`), and smoothing peak passenger crowding onboard (`ลดความหนาแน่นของคนบนรถ`) without requiring any passenger-facing app or street-stop hardware.

**Why Evenflow Exists & Why It Is 100% Practical in Thailand:**  
In Bangkok and major Thai cities, public bus timetables are planned statically on paper or spreadsheets (e.g., "depart every 15 minutes"). In reality, the moment buses leave the depot (`อู่รถเมล์`), mixed traffic, 3–5 minute manual police intersection holds, sudden tropical rain, and uneven passenger boarding cause severe **headway collapse (bus bunching)**:
- **The Operational Spiral:** A delayed lead bus faces a longer queue of waiting commuters. Because boarding takes `1.6–2.2 seconds/passenger` and cabin crowding above `75%` capacity slows alighting by **`1.35×`**, the lead bus dwells longer at every stop and becomes packed (`>85–95%` capacity). Meanwhile, the next bus dispatched from the depot on a rigid clock schedule encounters recently cleared stops, speeds up, and catches the lead bus—resulting in **2–3 buses running bumper-to-bumper (wasting fuel/EV battery on half-empty trailing buses) followed by a 25–35 minute service gap (`รถขาดระยะ`)**.
- **The Dispatcher's Blind Spot (`ปัญหาของนายท่าที่อู่รถเมล์`):** Today, Thai depot dispatchers (`นายท่า`) only see raw GPS dots or paper logs. They cannot mentally calculate how a traffic jam 6 km downstream, a rain surge, and a late turnaround bus returning to the depot interact—nor do they know whether shifting the next departure by `-2 minutes` (earlier) or `+3 minutes` (later) will smooth passenger loads or accidentally violate driver rest rules.

**How Evenflow Solves This (100% Dispatcher-Centric, Zero Commuter App Friction):**  
Evenflow does **not** ask passengers to download a new app, scan QR codes at bus stops, or change their boarding behavior, and it does **not** require city sidewalk permits. Instead, it operates **100% inside the bus depot (`ห้องนายท่า`)** as a **Human-in-the-Loop AI Dispatch Advisor**:
1. **Multi-Source Real-Time Operational Ingestion:** Fuses existing fleet **GPS/AVL kinematics**, **90° Overhead Edge-AI Camera Passenger Counting (`กล้อง AI มุมสูงนับคนขึ้น-ลงประตูรถเพื่อคำนวณความหนาแน่นคนบนรถแบบเรียลไทม์ PDPA 100%` + Bayesian door-dwell cross-check)**, **intersection traffic/signal delays**, and **live rainfall/event feeds**.
2. **Counterfactual AI Dispatch Optimization (`Digital Twin จำลองตารางปล่อยรถจากอู่`):** Predicts downstream headway gaps and bunching **~8.6 minutes (516 seconds) in advance (`1.00` precision)** and runs parallel Worker-Thread Digital Twin simulations (`2.47 ms` latency) to find the **optimal depot departure time adjustment (`±1 to 5 minutes`)** that minimizes passenger waiting time and caps peak onboard crowding—verified across **840 SHA-256 hash-matched simulation runs** to save **`-660.00 person-seconds` (`30/30` disrupted seeds, `100%` consistency)** and reduce corridor headway variance by **`-3.3%`** with **`0%` mid-route passenger harm**.
3. **1-Click Dispatcher Approval with Hard Operational Guardrails:** Presents the dispatcher (`นายท่า`) with a clear Thai recommendation card showing exact why/when/impact metrics, while strictly enforcing **Depot Bus Availability**, **Driver Minimum Turnaround Rest (`≥ 6 minutes`)**, **EV Battery Readiness (`SoC ≥ 35%`)**, and **No-Blame Driver Protection (`ไม่หักเงินอัตโนมัติ · ไม่เสียค่าเที่ยว`)**.

---

## 2. Deep Problem Framing: Five Real Operational Gaps in Thai Bus Depot Dispatching

Empirical studies by the **Thailand Development Research Institute (TDRI)** and **Office of Transport and Traffic Policy and Planning (OTP)** show Bangkok bus riders face **15 to 30+ minute unpredictable gaps**, pushing **wait-time predictability satisfaction below 20%** `[source: TDRI & OTP public transit studies]`. Auditing current depot operations and global transit systems reveals five critical gaps that Evenflow closes without any unrealistic assumptions:

- **Gap 1 — Static Paper Timetables vs. Dynamic Bangkok Road Reality:** Dispatchers at BMTA (`ขสมก.`), private EV depots (`Thai Smile Bus`), and campus shuttles still release buses on fixed clock intervals or ad-hoc visual judgment. When Bus #1 is delayed 5 minutes at Pratunam or Victory Monument, releasing Bus #2 strictly "on the clock" guarantees Bus #2 will catch Bus #1 mid-route while leaving a huge gap behind Bus #2. *Evenflow Fix:* **Dynamic Two-Sided Depot Dispatch Scheduling** continuously recalculates optimal departure spacing based on live downstream corridor spacing and returning turnaround buses.
- **Gap 2 — Naive Mid-Route Holding Hurts Onboard Passengers (`Singapore LTA EWT Loophole`):** Academic literature and **Singapore LTA's Bus Service Reliability Framework (BSRF)** often rely on holding buses mid-route (`จอดแช่รอเวลาที่ป้ายกลางทาง`) to fix clock `Excess Wait Time (EWT)` `[source: Singapore LTA BSRF evaluations]`. However, in Bangkok, holding a bus mid-route blocks narrow traffic lanes, angers 35+ onboard passengers, and—as proven in our **840-run Digital Twin benchmark**—actually **worsens Total Passenger Time by `+652.83 person-seconds`**. *Evenflow Fix:* **Shifts control to Origin/Destination Depot Dispatch (`ปล่อยรถจากอู่ต้นสาย-ปลายสาย`)**, where `0` passengers are sitting onboard waiting to get home (`0%` onboard passenger harm), saving **`-660.00 person-seconds` across `30/30` disrupted seeds**.
- **Gap 3 — GPS & Ticket Logs Are Blind to Real-Time Onboard Passenger Crowding (`ทำไมต้องใช้กล้อง AI วัดความหนาแน่นคนบนรถ`):** Standard GPS fleet trackers only show vehicle location on a map, while cash/ticket sales cannot measure real-time cabin crowding because Thai buses lack tap-out when passengers alight (`ไม่มีการแตะบัตรขาลง จึงไม่รู้ว่าคนลงไปกี่คนและเหลือคนอัดแน่นบนรถกี่คน`). Dispatchers cannot see whether Bus #1 is at `95%` crush load (causing `1.35×` slower boarding/alighting at every downstream stop) while Bus #2 is at `20%` load. *Evenflow Fix:* **90° Top-Down Edge-AI Vision (`YOLOv8-Nano + ByteTrack`) + Bayesian Door-Dwell Cross-Check** counts boarding (`+In`) and alighting (`-Out`) silhouettes in volatile RAM (100% PDPA-safe, zero facial capture) so the AI knows exact live cabin crowding and schedules depot departures specifically to relieve overcrowded corridor segments.
- **Gap 4 — Turnaround Exhaustion, EV Charging & Driver Labor Friction (`ปัญหาคนขับพักไม่พอและดราม่าหักเงิน`):** When inbound buses arrive late at the terminal due to heavy traffic, naive re-scheduling either cuts driver turnaround rest to zero or triggers punitive automated GPS fines—which previously sparked real **EV bus driver strikes in Bangkok** `[source: Manager Online transit labor reports]`. *Evenflow Fix:* Built-in **Hard Operational Constraints** verify physical bus presence in the depot, lock **mandatory driver rest (`≥ 6 minutes`)**, check **EV battery `SoC ≥ 35%`**, and enforce a **No-Blame Charter (`ไม่หักเงิน · ไม่ตัดโควตาค่าเที่ยวคนขับ`)**.
- **Gap 5 — Prohibitive Cost & Foreign Assumptions of Western Dispatch SaaS (`Swiftly` / `Optibus`):** Imported enterprise platforms charge `~$150–$300+/bus/month` (`~฿6M–12M+/year` per fleet) in USD licensing and require `฿120,000–200,000+/bus` proprietary 3D sensors. *Evenflow Fix:* **Zero-dependency core engine** paired with a low-cost (`~฿22,000` pilot BOM) plug-and-play 90° Edge-AI camera kit, delivering **~80% lower Total Cost of Ownership**.

---

## 3. Stakeholder Map & Target Beneficiaries (100% Operator-Driven)

| Stakeholder Group | Role in Ecosystem | Key Operational Pain Today | Value Delivered by Evenflow |
| :--- | :--- | :--- | :--- |
| **Depot Dispatchers (`นายท่าปล่อยรถต้นสาย-ปลายสาย`)** | **Primary direct users** operating the system at bus terminals | Must guess departure adjustments from raw GPS dots, phone calls, and paper sheets; blamed when gaps occur | **1-Second Color-Coded Corridor Ribbon**, live **Edge-AI Cabin Crowding (`%`)**, clear Thai AI Dispatch Recommendations (`ขยับเวลาปล่อย ±1–5 นาที`), **1-Click Approval**, **Emergency Kill Switch** |
| **Route Supervisors & Operations Managers (`หัวหน้าสายเดินรถ / ฝ่ายเดินรถ`)** | Secondary users monitoring multi-depot performance & SLAs | Lack objective data on why bunching occurred or whether dispatch adjustments reduced crowding | **Dual-World A/B KPI Dashboard (`kpi.html`)** proving headway regularity (`-3.3%` variance), wait-time savings (`-660 person-sec`), peak crowding reduction, and immutable Audit Logs |
| **Bus Drivers (`พนักงานขับรถเมล์`)** | Frontline vehicle operators receiving departure times at the depot | Lose rest breaks when returning late from traffic; penalized by rigid schedules or unfair GPS fines; stressed by crush-loaded buses | **Guaranteed `≥ 6 min` turnaround rest lock**; **No-Blame `ค่าเที่ยว` trip-credit protection**; Edge-AI boarding proof exonerating heavy-crowd delays; more balanced passenger loads |
| **Transit Fleet Operators** (`Campus EV Shuttles`, `Thai Smile Bus`, `BMTA ขสมก.`) | System buyers & pilot hosts | Fuel/EV energy wasted when 2–3 buses run together half-empty; high cost of foreign dispatch software & 3D APCs | Low-cost plug-and-play **90° Edge-AI Vision + Depot Dispatch Console** optimizing fleet utilization and EV battery cycles at **`< 20%` of Western SaaS cost** |
| **Daily Bus Passengers** *(Indirect Beneficiaries — Zero App Required)* | End beneficiaries riding the bus network | Endure 25–35 min gaps (`รถขาดระยะ`) and dangerously overcrowded lead buses | Automatically experience **more regular bus arrivals (`รถไม่ขาดระยะ`)** and **lower onboard crowding (`คนไม่ล้นคันแรก`)** purely from smarter depot dispatching—without needing to open any app |

---

## 4. Competitive Landscape & Build-vs-Buy Analysis

### 4.1 Comparison of Depot Dispatch & Fleet Management Approaches

| Solution / Approach | Category | What It Does Today | Critical Limitation for Thai Depot Dispatch | How Evenflow Wins |
| :--- | :--- | :--- | :--- | :--- |
| **Manual Paper Timetables + Raw GPS Map (`ระบบนายท่าปัจจุบัน + กล่อง GPS ขนส่งฯ`)** | Current Thai depot baseline | Shows bus dots on a screen and fixed clock departure times | Zero predictive lookahead; blind to real-time onboard passenger crowding; cannot compute how rain and traffic affect downstream spacing | Adds **90° Edge-AI cabin crowding**, **8.6-min bunching prediction (`1.00` precision)**, and **Counterfactual Digital Twin departure optimization** |
| **Consumer Tracking Apps (`ViaBus` / `TSB Go Plus`)** | Passenger map apps | Displays bus locations to commuters | Not a dispatcher optimization tool; does not count real-time boarding/alighting or calculate depot departure adjustments | Focuses **100% on the Depot Dispatcher (`นายท่า`)** with real-time Edge-AI crowding + Digital Twin dispatch scheduling at the source (`อู่ปล่อยรถ`) |
| **Western Enterprise Dispatch SaaS (`Swiftly` / `Optibus`)** | Imported cloud transit suites | Schedule planning and headway dashboards for US/EU agencies | Expensive USD SaaS (`$150–$300+/bus/mo`) + `฿150k+` 3D APCs; relies on mid-route holding that blocks Bangkok lanes; lacks Thai `ค่าเที่ยว`/turnaround rules | **Depot-first dispatch control (`0%` mid-route harm)**, low-cost `฿22k–45k` 90° Edge-AI camera, native Thai Copilot UX, **~80% lower TCO** |
| **Black-Box Deep Reinforcement Learning (DRL)** | Academic simulation papers | Theoretical speed/holding control in synthetic grids | Unexplainable black-box actions; requires months of clean training data; ignores depot bay availability and driver rest locks | **Explainable Daganzo physics + Counterfactual Digital Twin Rollouts**—auditable Day 1 with hard fleet & labor constraints |

### 4.2 Build vs. Buy Evaluation
- **Option A — Buy Foreign Transit SaaS + Imported 3D APCs (Rejected):** Prohibitive USD subscription fees, `฿120,000–200,000+/bus` proprietary sensors, vendor lock-in, and mismatch with Thai depot turnaround workflows.
- **Option B — Build Custom Enterprise System from Scratch (High Delay Risk):** Typically takes 9–12 months before dispatchers can test a single simulation.
- **Option C — Deploy & Scale Evenflow v5 Working Core (Selected — High Confidence):** Leverage our **already-working, zero-dependency Evenflow v5 engine** (`91/91` passing tests, `840`-run verified Digital Twin, live Bangkok OSRM road geometry) paired with off-the-shelf **90° Overhead Edge-AI Camera Kits (`YOLOv8-Nano + ByteTrack`)**, **True 5G IoT**, and **AWS (IoT Core, Timestream, ECS Fargate, Amazon Bedrock)**.

---

## 5. De-Risked 3-Ring Rollout & Beachhead Depot Pilot Strategy (Zero Bureaucratic Delay)

Because Evenflow is an **internal depot tool for dispatchers (`นายท่า`)** rather than a public consumer app, deployment does **not** require public marketing campaigns or BMA street-furniture permits:

### Ring 1 — Working Dispatcher MVP & 840-Run Verified Digital Twin (COMPLETED TODAY ✅)
- **Status:** Deployed and live at `https://ai-forall-eight.vercel.app` (`91/91` automated tests passing in `1.02s`).
- **Capabilities Ready Now:** Real-time **Dispatcher Control Center (`dispatcher.html`)**, **90° Edge-AI Overhead Camera Simulator (`spotter.html`)**, **Dual-World A/B KPI & Crowding Comparison (`kpi.html`)**, **AI Predictor & Counterfactual Evaluation (`aieval.html`)**, **Corridor Disruption Stress-Test (`sim.html`)**, and **Governance & Labor Charter (`governance.html`)**, modeled on real Bangkok OSRM corridors (Flagship **R1: Chatuchak ↔ Victory Monument ↔ Pratunam ↔ Siam ↔ Sam Yan ↔ Hua Lamphong**, 13 stops, 728 WGS84 road vertices, plus R2 Sukhumvit, R3 Lat Phrao, R4 Rama IV) at **฿0/month** infrastructure cost.

### Ring 2 — 12-Week Depot Field Pilot (Months 1–3)
- **Target Beachhead Depot (Fast 2–3 Week Sign-Off):** Closed-loop **University Campus Shuttle Depot** (e.g., **Thammasat University Rangsit EV/NGV Shuttle Terminal**, `5–8` buses, directly aligned with academic partner **TU-RAC**) or a **Private Feeder/EV Bus Depot** (`5–10` buses on 1 high-frequency route).
- **2-Stage Frictionless Depot Rollout:**
  - *Weeks 1–3 (Stage A — Depot Console Setup & Ruggedized 90° Edge-AI Camera Mounting):* Set up `dispatcher.html` in the depot control room (`ห้องนายท่า`), connect existing fleet GPS + door-dwell logs, and mount **5–8 non-invasive 90° Overhead Edge-AI Vision Kits** (`YOLOv8-Nano + ByteTrack`, `9–36V` automotive surge-protected, `<10W` 45°C heatsink, 100% PDPA-safe non-facial counting in RAM) streaming real-time cabin crowding (`ความหนาแน่นคนบนรถ`) over **True 5G IoT → AWS IoT Core**.
  - *Weeks 4–12 (Stage B — Active AI-Assisted Depot Dispatch & A/B Field Trial):* Dispatchers use Evenflow's **1-Click Dispatch Recommendations** during peak hours to adjust depot release times (`±1 to 5 min`) based on live spacing and Edge-AI crowding data, measuring wait-time and crowding reduction across alternating A/B test weeks.

### Ring 3 — Commercial Multi-Depot Fleet Scale (Months 4–18)
- **Expansion Targets:** Private EV bus concessionaires (e.g., Thai Smile Bus depots), **BMTA (`ขสมก.`)** zone depots backed by Ring 2 audited wait-time & crowding ROI, and regional transit operators (Chiang Mai, Khon Kaen, Phuket).
- **Enterprise Cloud Stack:** Multi-depot **AWS ECS Fargate** Digital Twin workers, **Amazon Timestream** historical performance analytics, and **Amazon Bedrock (Claude + Guardrails)** Thai Dispatcher Copilot.

---

## 6. Realistic Budget & B2B/B2G Unit Economics

| Phase | Scope | One-Time Setup / Hardware Cost | Monthly Cloud & Connectivity | Funding / Revenue Model |
| :--- | :--- | :--- | :--- | :--- |
| **Ring 1 (Current MVP)** | Dispatcher web console, Edge-AI camera simulator, 4 Bangkok routes, 840-run Digital Twin | **฿0** (Zero npm dependencies; runs in any depot web browser) | **฿0 / month** (Serverless free tier) | Completed / Self-funded |
| **Ring 2 (12-Week Depot Pilot — 1 Depot, 6–8 Buses)** | 1× Depot Dispatcher Tablet/Monitor (`~฿15,000`) + **6–8× Plug-and-Play 90° Edge-AI Vision Camera Kits (`~฿22,000/bus` BOM + rugged `9–36V` mount)** | **~฿147,000 – ฿191,000** one-time pilot hardware & depot setup | **~฿4,500 / month** (`8×` True 5G IoT SIMs + AWS IoT Core, Timestream, ECS & Bedrock) | Hackathon Incubation Grant (`< ฿210,000` total 3-month all-in pilot) |
| **Ring 3 (Commercial Depot Scale)** | Turnkey 90° Edge-AI Camera Kit + Depot Dispatch SaaS across 100–1,000+ buses | Turnkey Edge-AI Camera Kit: **`฿45,000 / bus`** (~70% cheaper than imported 3D APCs) | Covered by SaaS recurring margin (`>80%` gross margin) | **SaaS: `฿1,200 / bus / month`** (~80% cheaper than Western SaaS) |

---

## 7. Team Composition & "AI for All" Execution Model (RACI)

| Role | Assigned Member / Partner | Core Responsibilities | RACI (Engine / Depot Pilot / Ops / Cloud) |
| :--- | :--- | :--- | :--- |
| **Founder, Product Owner & Lead Systems Architect** | **Bowornnan** | End-to-end dispatch math & Counterfactual Digital Twin engine, full-stack Node.js/ES6 codebase, 91-test verification suite, dispatcher UX, pilot execution | **R/A** across Product, Engine, Dispatcher UX & Pilot Delivery |
| **AI-DLC Engineering & QA Co-Worker** | **AI Coding & Verification Agents (Claude / AI-DLC)** | Worker-thread concurrency (`5,386×` latency reduction to `2.47 ms`), JSON Schema 2020-12 contracts, automated regression suite | **R** (Code Acceleration & QA), **C** (Architecture) |
| **Market & Feasibility Co-Worker** | **Amazon Quick (AI-DLC v2 Ideation)** | Competitive dispatch research, RAID feasibility auditing, traceable evidence synthesis | **R** (Ideation & Market Audit), **I** (Scope Gate) |
| **Depot Operations & Dispatcher Lead** | **Pilot Depot Partner (`นายท่า / หัวหน้าอู่รถรับส่ง มธ. รังสิต หรืออู่รถร่วม EV`)** | Operates 1-Click Dispatch Console during peak shifts, validates turnaround rest rules (`≥ 6 min`), co-evaluates headway & crowding KPIs | **C/A** (Depot Operations & Safety Sign-off) |
| **Cloud & Telemetry Advisors** | **AWS, True 5G & Arise Incubation Mentors** | Reviews AWS IoT Core / Timestream ingestion, Amazon Bedrock Guardrails, and enterprise security | **C** (Cloud Scale & Governance) |
