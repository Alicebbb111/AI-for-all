# พิมพ์เขียวและ Prompt สำหรับ Claude Code: อัปเกรดระบบเป็น "Mission Control Dispatcher Dashboard & Real-Time Anti-Bunching System" (ระดับชนะเลิศการประกวด — เข้ากันได้ 100% กับ Commit `5dc1e9e`)

เอกสารฉบับนี้ออกแบบมาให้เป็น **"ศูนย์บัญชาการปล่อยรถและป้องกันรถขาดระยะอัจฉริยะ (Intelligent Transit Mission Control)"** ที่รวมทุกฟีเจอร์ที่นายท่าต้องใช้ตัดสินใจหน้างานจริง และสร้างความตื่นตาตื่นใจให้กรรมการตัดสิน (Judge-Wow Factor) โดยใช้ข้อมูลจริงแบบเรียลไทม์ 100% จากกล้อง AI เหนือประตู, พิกัด GPS, สัญญาณไฟแดงรายแยก, กราฟวิถีการเดินรถ (Marey Diagram), เรดาร์ช่องไฟสด และผู้ช่วย AI Tactical Co-Pilot โดย **ไม่ทำให้ Automated Tests ทั้ง 91 ข้อ (`npm test`) พังแม้แต่ข้อเดียว**

---

## ส่วนที่ 1: 7 ฟีเจอร์เด็ดบนหน้า UX/UI นายท่าที่จะทำให้กรรมการ "ว้าว" ทันทีที่เปิดดู

| ลำดับ | ฟีเจอร์ระดับศูนย์ควบคุม (Mission Control UX/UI) | สิ่งที่นายท่าและกรรมการจะเห็นบนหน้าจอ | ข้อมูลจริงเบื้องหลังที่ใช้คำนวณ |
| :--- | :--- | :--- | :--- |
| **1** | **เรดาร์เส้นทางและไฟแดงอัจฉริยะกดดูได้ทุกป้าย (Interactive Corridor Ribbon & Traffic Signal Inspector)** | แผนผังเส้นทางแนวนอนแสดงรถทุกคันวิ่งสดๆ บนแกนถนน 13 ป้าย พร้อม **ไอคอนสัญญาณไฟจราจร 8 แยกหลัก** (`S03 สะพานควาย`, `S05 อนุสาวรีย์ฯ`, `S06 ราชวิถี`, `S07 ราชเทวี`, `S08 ประตูน้ำ`, `S09 สยาม`, `S10 สามย่าน`, `S11 สะพานเหลือง`) แสดงสี แดง/เขียว และเวลานับถอยหลังรอบไฟจราจรสด **เมื่อนายท่าคลิกที่ป้ายหรือไฟแดงใดๆ** จะเปิดแผงเจาะลึก (Stop & Signal Inspector Drawer) แสดง: เวลาไฟแดงคงเหลือ, ความเร็วรถผ่านแยก, คิวคนรอที่ป้าย, เวลาเปิดประตูเฉลี่ยที่ป้ายนั้น และรถคันถัดไปที่จะมาถึง! | พิกัด `s` จาก GPS + โมเดลวัฏจักรไฟจราจรแยกหลัก (Signal Phase Cycle 90–120 วิ) + ความเร็วรายโซน `aiSegSpeed` |
| **2** | **กราฟวิถีการเดินรถและพยากรณ์จุดรถชนกัน (Live Space-Time Marey Trajectory Chart)** | กราฟมาตรฐานวิศวกรรมขนส่งมวลชนระดับโลก (แกนนอน = เวลา, แกนตั้ง = ป้ายจอด S01–S13) วาดเส้นการวิ่งของรถทุกคันเป็นเส้นกราฟสด ถ้ารถ 2 คันกำลังบีบเข้าหากัน **เส้นกราฟจะพุ่งเข้าหากันและแสดงจุดตัดสีแดง (Collision/Bunching Point)** บอกล่วงหน้าทันทีว่ารถคันไหนจะตามทันกันที่ป้ายใด ในอีกกี่นาที! | ประวัติพิกัดรถ + สมการฟิสิกส์การเคลื่อนที่ผ่านโซนจราจรและเวลาเปิดประตูรับคนจริง |
| **3** | **มิเตอร์กล้อง AI เหนือประตูรายคัน (Real-Time Overhead Camera Occupancy & Door Flow HUD)** | รถทุกคันบนหน้าจอมีหลอดวัดจำนวนผู้โดยสารจริงจากกล้อง AI เหนือประตู (`onboardEst / legalMax คน`) แยกสีตามสัดส่วนที่นั่ง/พื้นที่ยืนจริงของรุ่นรถ (รถร้อน 80 คน / รถแอร์ 72 คน / รถ EV 58 คน) พร้อมป้ายบอก **ยอดคนก้าวขึ้น-ลงที่ป้ายล่าสุด (`+ขึ้น / -ลง`)** และ **เวลาเปิดประตูแช่ที่ป้ายจริง (`Dwell Sec`)** โดยไม่ต้องเดาหรือพยากรณ์คนล่วงหน้า | ข้อมูลจริงจาก `engine/telemetry.js` (`occupancy` และ `flow` จาก `sourceType: 'camera'`) + `engine/world.js` |
| **4** | **เครื่องคิดเลขสมการปล่อยรถแบบโปร่งใส (Interactive Dispatch Equation Cockpit & What-If Preview)** | ในโซนปล่อยรถต้นทาง (ทั้งขาไปจตุจักร และขากลับหัวลำโพง) นอกจากเวลานับถอยหลังขนาดใหญ่แล้ว ยังแสดง **ผังสมการคณิตศาสตร์สด (Live Formula Breakdown)** ที่ดึงค่าตัวแปรจริงมาแทนค่าให้ดูต่อหน้า: ช่องไฟคันหน้า ($H_{\text{front}}$), ช่องไฟคันหลัง ($H_{\text{back}}$), ยอดคนบนรถคันหน้า ($N_{\text{front}}$), เวลาติดไฟแดงสะสม ($\tau_{\text{signal}}$), และสภาพฝนจาก Open-Meteo พร้อม **แถบจำลองผลลัพธ์ก่อนกด (Before vs After Impact Bar)** บอกว่าถ้ากดอนุมัติตาม AI จะลดเวลารอผู้โดยสารรวมได้กี่คน-นาที! | สมการ Two-Sided Headway Control ถ่วงน้ำหนักผู้โดยสารจริง + Counterfactual Rollout (`engine/planning.js`) |
| **5** | **กราฟคลื่นความสม่ำเสมอของช่องไฟและดัชนีรถขาดระยะ (Real-Time Headway Stability Waveform & Bunching Radar)** | กราฟเส้นคู่และแผนภูมิแท่งเปรียบเทียบช่องไฟจริงของรถทุกคู่เทียบกับเส้นเป้าหมาย 8 นาที (480 วินาที) พร้อมโซนสีเขียว (ปกติ 6–10 นาที), สีเหลือง (เฝ้าระวัง), และสีแดง (วิกฤตขาดระยะ >11 นาที หรือวิ่งติดกัน <4 นาที) เห็นแนวโน้มทันทีว่าช่องไฟกำลังถ่างออกหรือบีบเข้า | ประวัติ `headwaySeries` + `frontHeadwaySec` / `backHeadwaySec` ใน `engine/bunching.js` |
| **6** | **การ์ดแจ้งเตือนยุทธวิธี AI พร้อมปุ่มตัดสินใจ 1 คลิก (Tactical AI Co-Pilot Alert Cards)** | เมื่อเกิดความเสี่ยงรถขาดระยะหรือรถวิ่งติดกัน ระบบจะเด้งการ์ดแจ้งเตือนพร้อมเสียงสัญญาณสังเคราะห์ สรุปสาเหตุครบ 5 มิติด้วยภาษาไทยที่นายท่าเข้าใจได้ใน 3 วินาที (เช่น *"รถ B04 ติดไฟแดงแยกประตูน้ำ + รับคนขึ้นจริง 19 คน ทำให้ออกช้ากว่ากำหนด 2.4 นาที ส่งผลให้ช่องไฟกับ B05 หดเหลือ 3.1 นาที — แนะนำหน่วงปล่อยรถที่อู่ 2 นาที"*) พร้อมปุ่มกดอนุมัติทันที | `engine/copilot.js` + `engine/operations.js` + `engine/world.js` |
| **7** | **แถบจำลองสถานการณ์วิกฤต 1 คลิกสำหรับโชว์กรรมการ (Judge Demo Quick-Trigger Bar)** | แถบปุ่มลัดพิเศษด้านบนหน้านายท่า ให้ผู้สาธิตหรือกรรมการกดจำลองเหตุการณ์จริงได้ในคลิกเดียว เช่น **[จำลองรถติดหนักแยกประตูน้ำ]**, **[จำลองฝนตกหนัก Open-Meteo]**, **[จำลองคนทะลักขึ้นรถที่อนุสาวรีย์ฯ]**, **[จำลองรถคันหน้าเสียกะทันหัน]** แล้วดูกราฟไฟแดง สมการปล่อยรถ และคำแนะนำ AI เปลี่ยนแปลงและแก้ปัญหาสดๆ ต่อหน้ากรรมการ! | เชื่อมกับ `/api/control` ที่มีอยู่แล้วในเซิร์ฟเวอร์ |

---

## ส่วนที่ 2: Prompt ฉบับสมบูรณ์สำหรับคัดลอกไปสั่ง Claude Code

คัดลอกข้อความในกล่องด้านล่างนี้ทั้งหมดไปวางให้ **Claude Code** รันในโฟลเดอร์โปรเจกต์ `/Users/bowornnan/work space/antigarvity/ai-forall` ได้เลยครับ:

```markdown
คุณคือ Principal Transit Control Systems Engineer, Data Visualization Architect และ Full-Stack Node.js Developer ระดับแนวหน้า
ภารกิจของคุณคือการอัปเกรดระบบ Evenflow ในโปรเจกต์นี้ (Commit ล่าสุด `5dc1e9e`) ให้เป็น **"ศูนย์บัญชาการควบคุมการปล่อยรถและป้องกันรถขาดระยะอัจฉริยะระดับชนะเลิศการประกวด (Judge-Wow Real-Time Anti-Bunching & Dispatch Mission Control)"**

แนวคิดหลักที่เปลี่ยนใหม่:
- **เลิกใช้การพยากรณ์จำนวนคนบนรถล่วงหน้าบน UI** เพราะรถทุกคันติดตั้ง **กล้อง AI มุมกด 90° เหนือประตูรถ (Overhead Edge-AI Vision Counter)** ทำให้เรารู้จำนวนคนขึ้นจริง ($B_i$), คนลงจริง ($A_i$), และยอดคนคงเหลือบนรถจริง ($N_i = \text{onboardEst}$) แบบเรียลไทม์ 100% อยู่แล้ว
- **ทุ่มจุดเน้นทั้งหมดไปที่ "การแก้ปัญหารถขาดระยะและรถวิ่งตามก้นกัน (Anti-Bunching & Optimal Dispatch Control)"** สำหรับหน้านายท่า (`dispatcher.html`) โดยใช้สมการคณิตศาสตร์ + AI วิเคราะห์ข้อมูลจริง 5 มิติ (ระยะห่าง GPS, จำนวนคนจริงจากกล้อง, เวลาเปิดประตูรับคน, สัญญาณไฟแดงรายแยก/รถติด, และสภาพอากาศสดจาก Open-Meteo) พร้อมแสดงกราฟวิถีการเดินรถ, แผนผังไฟแดงรายป้ายที่คลิกดูเวลาได้, มิเตอร์คนบนรถ และปุ่มกดตัดสินใจปล่อยรถในคลิกเดียว

---

### กฎเหล็ก (STRICT INVARIANTS — ห้ามละเมิดเด็ดขาด)
1. **ห้ามทำให้ Automated Tests เดิมทั้ง 91 ข้อพังเด็ดขาด**:
   - เมื่อรัน `npm test` (`node --test tests/*.test.js` ได้แก่ `tests/api.test.js`, `tests/context.test.js`, `tests/operations.test.js`, `tests/optimization.test.js`) ทุกข้อต้อง PASS 100% (`fail 0`)
   - ห้ามลบหรือเปลี่ยนชื่อฟังก์ชัน/พร็อพเพอร์ตี้เดิมที่ถูกตรวจสอบใน `tests/*.test.js` ให้ใช้วิธี **Additive Upgrade** (เพิ่มฟิลด์ใหม่เข้าไปใน Object ที่ Return โดยคงฟิลด์เดิมและพฤติกรรมเดิมที่ Test ตรวจไว้ทั้งหมด)
2. **Zero External Dependencies**: ใช้เฉพาะ Built-in Node.js modules และ Vanilla JS / SVG / HTML5 Canvas เท่านั้น ห้ามติดตั้ง npm package เพิ่ม
3. **Design & UI Rules**:
   - **ห้ามใช้อีโมจิ (Zero Emojis)** ในโค้ดและหน้าเว็บทั้งหมด ใช้เฉพาะ Inline SVG คมชัด (`OT.icon(...)` หรือวาด SVG ใหม่) และป้ายสถานะสี (`tag`, `chip`)
   - ใช้ฟอนต์ `IBM Plex Sans Thai` และตัวเลขแบบ `font-variant-numeric: tabular-nums`
   - โทนสี Industrial Transit Control (พื้นหลัง `#f6f5f1`, กรอบคมชัด, สีเขียว `#0ca30c`, สีเหลืองอำพัน `#d97706`, สีแดงวิกฤต `#d03b3b`, สีน้ำเงิน `#2a78d6`)
4. **รักษา DOM IDs เดิมที่สคริปต์และ Test อ้างอิง**:
   - ใน `public/dispatcher.html` ต้องมี `#ot-nav`, `#main`, `#countdown-area`, `#audio-alert`, `#auto-approve`, `#disp-clock`, `#cd-1`, `#cd-1-sub`, `#cd--1`, `#cd--1-sub`, `#dispatcher-alert`, `#rec-area`, `#operations-panel`, `#fleet-table`, `#fleet-adequacy`, `#fleet-table-el`, `#audit-log`, `#ot-footer` ครบถ้วน

---

### รายละเอียดการอัปเกรดรายไฟล์ (Step-by-Step Implementation Plan)

#### 1. อัปเกรด `engine/world.js` (เพิ่มข้อมูลไฟแดงสดรายป้าย, โซนจราจร, และตัวแปรสมการปล่อยรถต้นทาง)
1. **สร้างเมธอดใหม่ `signalStateAt(stopIdx, tSec = this.t)` ในคลาส `World`**:
   - สำหรับป้ายที่มีไฟแดงแยกหลัก (`st.signal === true` ได้แก่ S03 สะพานควาย, S05 อนุสาวรีย์ชัยฯ, S06 แยกราชวิถี, S07 แยกราชเทวี, S08 ประตูน้ำ-ราชประสงค์, S09 สยาม/MBK, S10 สามย่าน, S11 แยกสะพานเหลือง):
   - คำนวณสถานะไฟจราจรแบบ Deterministic ตามเวลาจำลอง `tSec` และความหนาแน่นจราจร:
     - รอบสัญญาณไฟเต็มรอบ `cycleSec = 100 + (stopIdx % 3) * 15` (เช่น 100, 115, 130 วินาที)
     - สัดส่วนไฟแดง `redDurationSec = Math.round(cycleSec * (this.lastEnv?.rush ? 0.62 : 0.52))`
     - เฟสปัจจุบัน `phaseSec = Math.floor((tSec + stopIdx * 23) % cycleSec)`
     - สถานะ `color = phaseSec < redDurationSec ? 'red' : (phaseSec < redDurationSec + 5 ? 'amber' : 'green')`
     - เวลาคงเหลือในสีปัจจุบัน `remainingSec = color === 'red' ? (redDurationSec - phaseSec) : (cycleSec - phaseSec)`
     - เวลาหน่วงไฟแดงคาดการณ์เฉลี่ย `expectedDelaySec = color === 'red' ? Math.round(remainingSec * 0.65) : 4`
   - คืนค่า `{ hasSignal: !!st.signal, color: st.signal ? color : 'none', remainingSec: st.signal ? remainingSec : 0, cycleSec: st.signal ? cycleSec : 0, redDurationSec: st.signal ? redDurationSec : 0, expectedDelaySec: st.signal ? expectedDelaySec : 0 }`
2. **ใน `snapshot(includeOps)` ของ `engine/world.js`**:
   - ในการสร้าง `stops`: เพิ่มฟิลด์ข้อมูลให้แต่ละป้ายเพื่อนำไปแสดงบนเรดาร์หน้านายท่า:
     - `s: Math.round(S.stopS[st.id] || 0)`
     - `signal: !!st.signal`
     - `signalState: this.signalStateAt(idx, this.t)`
     - `zoneSpeedKmh: +this.aiSegSpeed[zoneIndexAt(S.stopS[st.id] || 0)].toFixed(1)`
     - `baseRate: st.baseRate`, `alightProb: st.alight`
   - ในการสร้าง `buses`: เพิ่มฟิลด์ข้อมูลจริงจากกล้อง AI และสถานะจราจรรายคัน:
     - `actualDwellSec: b.state === 'dwell' ? Math.round(this.t - (b._arriveT || this.t)) : (b.lastArrival ? Math.round(8 + b.lastArrival.board * 1.3 + b.lastArrival.alight * 0.9) : 0)`
     - `remainingDwellSec: b.state === 'dwell' ? Math.max(0, Math.round(Math.max(b.dwellUntil, b.operationHoldUntil || 0) - this.t)) : 0`
     - `zoneSpeedKmh: +this.aiSegSpeed[b.segIndexAt()].toFixed(1)`
     - `nextSignalState: this.signalStateAt(b.nextStopIdx, this.t)`
   - ใน `includeOps === true`:
     - เพิ่ม `zoneSpeeds: this.aiSegSpeed.map((v, i) => ({ zone: i, fromS: Math.round(i * ZONE_LEN), toS: Math.round(Math.min(S.totalLen, (i + 1) * ZONE_LEN)), speedKmh: +v.toFixed(1) }))`
     - เพิ่ม `recentArrivals: this.arrivalEvents.slice(-80)` เพื่อใช้พล็อตกราฟวิถีการเดินรถ (Marey Space-Time Chart) บนหน้านายท่า
3. **ใน `holdRecommendation(dir)` ของ `engine/world.js`**:
   - รักษาฟิลด์เดิม (`busId`, `dir`, `H_frontMin`, `H_backMin`, `H_targetMin`, `rawHoldMin`, `holdMin`, `frontBusId`, `backBusId`, `layoverRemainingMin`) ไว้ 100%
   - เพิ่มฟิลด์ใหม่เพื่อแสดงในเครื่องคิดเลขสมการปล่อยรถของนายท่า:
     - `frontGapMeters: fa ? Math.round(fa.gap) : null`
     - `backGapMeters: bk ? Math.round(bk.gap) : null`
     - `frontBusLoad: fa ? Math.round(fa.x.onboardEst || 0) : null`
     - `frontBusCapacity: fa ? fa.x.model.legalMax : null`
     - `frontBusSpeedKmh: fa ? +(fa.x.speedKmh || 0).toFixed(1) : null`
     - `corridorAvgSpeedKmh: +(this.aiSegSpeed.reduce((a, c) => a + c, 0) / this.aiSegSpeed.length).toFixed(1)`
     - `redLightsActiveCount: STOPS.filter((s, idx) => s.signal && this.signalStateAt(idx, this.t).color === 'red').length`
     - `totalSignalStops: STOPS.filter(s => s.signal).length`
     - `originQueuePax: this.queues.get((dir === 1 ? STOPS[0].id : STOPS[STOPS.length - 1].id) + ':' + dir)?.size || 0`
     - `loadWeightedHoldMin: +(rawHoldMin * (1 / (1 + 0.5 * ((fa ? (fa.x.onboardEst || 0) / fa.x.model.legalMax : 0))))).toFixed(2)`

---

#### 2. อัปเกรด `engine/bunching.js`, `engine/operations.js`, และ `engine/copilot.js`
1. **ใน `engine/bunching.js`**:
   - รักษาพฤติกรรมและฟิลด์ที่ return เดิมทุกตัวของ `headways`, `predict`, `holding`, `dispatch` เพื่อให้ผ่าน `tests/operations.test.js` และ `tests/optimization.test.js` 100%
   - ใน `headways()`: เพิ่ม `frontGapMeters = front ? Math.max(0, Math.round(dir * (front.s - b.s))) : null`, `backGapMeters = back ? Math.max(0, Math.round(dir * (b.s - back.s))) : null`, และ `headwayRatio = finite(current) ? +(current / 480).toFixed(2) : null`
   - ใน `predict()`: เมื่อข้อมูลเพียงพอ ให้เพิ่ม:
     - `headwayCompressionRate: +trend.toFixed(3)`
     - `kinematicTtbSec: trend < -0.02 ? Math.max(0, Math.round((row.frontHeadwaySec - threshold) / (-trend))) : null`
     - `bunchingSeverityIndex: +Math.min(1, Math.max(0, (Math.abs(targetSec - min.headwaySec) / targetSec) * 0.6 + Math.max(0, -trend) * 0.4)).toFixed(2)`
     - `loadRatio: row.vehicle?.capacity ? +((row.vehicle.onboardEst ?? 0) / row.vehicle.capacity).toFixed(2) : null`
     - `delayBreakdown: { dwellSec: Math.round(row.vehicle?.remainingDwellSec || row.vehicle?.dwellEstimateSec || 0), trafficSec: Math.round(row.vehicle?.trafficDelaySec || 0), signalSec: Math.round(row.vehicle?.signalDelaySec || 0) }`
2. **ใน `engine/operations.js`**:
   - ใน `snapshot(mode, runId)`:
     - เพิ่มข้อมูลรายคันใน `vehicles` สำหรับโหมด `simulation`: `boardLast: b.lastArrival?.board ?? 0`, `alightLast: b.lastArrival?.alight ?? 0`, `signalDelaySec: ctx.STOPS[b.nextStopIdx]?.signal ? w.signalStateAt(b.nextStopIdx, w.t).expectedDelaySec : 0`, `trafficDelaySec: w.trafficFactor(b, e.env) < 1 ? Math.round((1 - w.trafficFactor(b, e.env)) * 45) : 0`, `nextStopName: ctx.STOPS[b.nextStopIdx]?.name || '-'`, `nextSignalColor: w.signalStateAt(b.nextStopIdx, w.t).color`, `nextSignalRemainingSec: w.signalStateAt(b.nextStopIdx, w.t).remainingSec`
     - เพิ่ม `corridorSummary` ใน `data` ที่ return: สรุปจำนวนรถที่เสี่ยงขาดระยะ/วิ่งติดกัน (`highRiskCount`, `mediumRiskCount`), ค่าเฉลี่ยช่องไฟทั้งสาย (`avgHeadwaySec`), ยอดคนบนรถจริงรวมทั้งสายจากกล้อง AI (`totalOnboardCamera`), และจำนวนแยกที่ติดไฟแดงขณะนั้น
3. **ใน `engine/copilot.js`**:
   - รักษา `{ provider: 'local', mode: operations.mode, modelVersion: 'local-explanation-v1.1', text: ..., recommendations: ..., bedrock: ... }` ไว้ครบถ้วน
   - อัปเกรดข้อความใน `text` และเพิ่มฟิลด์ `structuredInsights` ให้เป็นรายงานวิเคราะห์ยุทธวิธีสำหรับนายท่าที่ระบุชัดเจน:
     1) **สรุปสถานการณ์ช่องไฟและการเดินรถสด**
     2) **วิเคราะห์สาเหตุรายคัน (กล้อง AI นับคนจริง + เวลาเปิดประตู + ไฟแดงแยกหลัก + ความเร็วถนน)**
     3) **คำแนะนำการปล่อยรถ/ชะลอรถ พร้อมตัวเลขเวลาผู้โดยสารที่ประหยัดได้จริง (คน-วินาที)**

---

#### 3. ยกระดับหน้า UX/UI นายท่า (`public/dispatcher.html`, `public/js/dispatcher.js`, `public/js/operations.js`, `public/css/operations.css`)
ออกแบบหน้า `dispatcher.html` ให้เป็น **Mission Control Dashboard** ที่ครบเครื่องที่สุด โดยแสดงข้อมูลจริงทุกมิติแบบ Interactive:

1. **แถบจำลองสถานการณ์สดสำหรับสาธิตกรรมการ (Judge Live Scenario Trigger Bar — ด้านบนสุดของ `#main`)**:
   - สร้างแถบควบคุมด่วน (Quick Simulation Triggers) ที่เชื่อมกับ `/api/control` เพื่อให้นายท่าหรือกรรมการกดทดสอบระบบได้ทันทีในคลิกเดียว:
     - ปุ่มสลับ **[ฝนตกหนัก (Open-Meteo Rain Impact)]** (`action: 'rain'`)
     - ปุ่มสลับ **[ชั่วโมงเร่งด่วน (Peak Demand & Signal Delay)]** (`action: 'rush'`)
     - ปุ่ม **[จำลองรถติดหนัก/อุบัติเหตุกลางสาย]** (`action: 'slowzone'`)
     - ปุ่ม **[จำลองรถคันหน้าเสียกะทันหัน]** (`action: 'breakdown'`)
     - ปุ่มความเร็วจำลอง `1x`, `2x`, `5x`, `10x` (`action: 'speed'`) เพื่อเร่งดูผลลัพธ์การแก้รถขาดระยะได้ทันใจ

2. **โซนที่ 1: ศูนย์ควบคุมการปล่อยรถต้นทาง & เครื่องคิดเลขสมการสด (`#countdown-area`)**:
   - แสดงนาฬิกานับถอยหลังรอบปล่อยรถทั้ง **ขาไป (จตุจักร → หัวลำโพง)** และ **ขากลับ (หัวลำโพง → จตุจักร)**
   - ใต้แต่ละทิศ แสดง **แผงผ่าสมการคำนวณการปล่อยรถสด (Live Dispatch Formula Telemetry Grid)**:
     - **ช่องไฟคันหน้า ($H_{\text{front}}$)**: แสดงนาที + ระยะห่างเป็นเมตร + แถบสีเทียบเป้าหมาย 8 นาที
     - **ช่องไฟคันหลัง ($H_{\text{back}}$)**: แสดงนาที + ระยะห่างเป็นเมตร
     - **ยอดคนจริงบนรถคันหน้า (จากกล้อง AI)**: `frontBusLoad / frontBusCapacity คน` + คิวคนรอที่ต้นสาย (`originQueuePax คน`)
     - **สภาพถนน & ไฟแดงข้างหน้า**: ความเร็วเฉลี่ย `corridorAvgSpeedKmh กม./ชม.` + จำนวนแยกที่ติดไฟแดงสด (`redLightsActiveCount / 8 แยก`)
     - **กล่องสมการคำนวณสด**: แสดงการแทนค่าตัวเลขจริงลงในสมการ Daganzo & Load-Weighted Control:
       `Δt = 0.5·(H_target − H_front) + 0.25·(H_back − H_front)` พร้อมป้ายสรุปชัดเจนว่า **"แนะนำปล่อยตามเวลาเดิม"**, **"แนะนำหน่วงเวลาปล่อย +X นาที (แก้รถวิ่งติดกัน)"**, หรือ **"แนะนำดึงเวลาปล่อยเร็วขึ้น -X นาที (แก้รถขาดระยะ)"**

3. **โซนที่ 2: การ์ดแจ้งเตือนวิกฤตและปุ่มตัดสินใจนายท่า 1 คลิก (`#rec-area`)**:
   - เมื่อมีคำแนะนำรอตัดสินใจ (`delay_next`, `early_next` หรือคำแนะนำจากโมดูล Operations):
     - แสดงการ์ดแจ้งเตือนขนาดใหญ่ โดดเด่น มีแถบสีสถานะชัดเจน
     - แสดง **4 กล่องหลักฐานจริง (4-Pillar Evidence Chips)**:
       1. *ระยะห่าง & ช่องไฟ*: `H_front` นาที (`frontGapMeters` ม.) vs เป้าหมาย 8 นาที
       2. *กล้อง AI นับคนจริง*: คันหน้ามีผู้โดยสาร `frontBusLoad/frontBusCapacity` คน · คิวรอที่อู่ `originQueuePax` คน
       3. *ไฟแดง & การจราจร*: ความเร็วเฉลี่ยบนสาย `corridorAvgSpeedKmh` กม./ชม. · ติดไฟแดง `redLightsActiveCount` แยก
       4. *ผลลัพธ์สมการ*: ปรับเวลาปล่อย `shiftMin` นาที (อยู่ในกรอบปลอดภัย ไม่ตัดเวลาพักคนขับขั้นต่ำ 6 นาที)
     - ปุ่มกดขนาดใหญ่ 2 ปุ่ม: **"อนุมัติปล่อยรถตามคำแนะนำ"** และ **"คงเวลาปล่อยเดิม"**

4. **โซนที่ 3: เรดาร์เส้นทางและสัญญาณไฟแดงรายป้ายแบบคลิกดูได้ (Interactive Corridor, Traffic Signals & Bus Telemetry Ribbon)**:
   - วาด **Interactive SVG/HTML Corridor Schematic** แสดงป้ายจอดทั้ง 13 ป้าย (`S01 จตุจักร` ถึง `S13 หัวลำโพง`) เรียงตามระยะทางจริง:
     - **แสดงสีความเร็วถนนรายโซน (Traffic Speed Heatmap Segments)** บนเส้นทาง (เขียว = คล่องตัว, เหลือง = ชะลอตัว, แดง = รถติดหนัก)
     - **แสดงไอคอนไฟจราจรสดบน 8 ป้ายแยกหลัก (`signal: true`)**: มีจุดไฟสีแดง/เหลือง/เขียว ตามสถานะจริง พร้อมตัวเลขวินาทีนับถอยหลัง (`remainingSec วิ`) กำกับอยู่ใต้ป้าย!
     - **แสดงไอคอนรถเมล์ทุกคันวิ่งสดๆ บนเส้นทาง (แยกเลนขาไป/ขากลับ)**: บนตัวรถแสดงรหัสรถ (`B01`), ความเร็ว (`กม./ชม.`), และป้ายจำนวนคนจริงจากกล้อง AI (`28/72 คน`) พร้อมเส้นโยงบอกระยะห่าง (วินาทีและเมตร) กับรถคันหน้า ถ้ารถบีบเข้าใกล้กันต่ำกว่า 4 นาที ให้เส้นโยงเป็นสีแดงกะพริบ!
     - **คลิกที่ป้ายจอดหรือไฟแดงใดก็ได้ (Interactive Stop & Signal Inspector Drawer)**:
       เมื่อนายท่าคลิกที่ป้ายใดๆ บนเรดาร์ จะแสดงการ์ดเจาะลึกของป้ายนั้นทันที:
       - ชื่อป้าย + รหัสป้าย + ระยะทางจากต้นสาย (กม.)
       - **สถานะสัญญาณไฟจราจรแยกนั้น**: สีไฟปัจจุบัน (แดง/เหลือง/เขียว), เวลานับถอยหลังเปลี่ยนสี (`remainingSec` วินาที), รอบไฟเต็ม (`cycleSec` วินาที), และเวลาหน่วงไฟแดงเฉลี่ย (`expectedDelaySec` วินาที)
       - **ความเร็วกระแสจราจรหน้าป้าย**: `zoneSpeedKmh` กม./ชม.
       - **จำนวนผู้โดยสารรอที่ป้ายขณะนั้น**: ขาไป `wait1` คน / ขากลับ `waitN1` คน
       - **รถคันถัดไปที่กำลังมุ่งหน้ามาป้ายนี้**: ระบุเลขรถ, ETA (นาที/วินาที), และจำนวนคนบนรถจริงจากกล้อง AI!

5. **โซนที่ 4: กราฟวิเคราะห์วิศวกรรมการเดินรถ 2 กราฟคู่ (Engineering Visual Analytics Grid)**:
   - **กราฟที่ 1: กราฟวิถีการเดินรถและจุดรถวิ่งชนกัน (Live Space-Time Marey Diagram — วาดด้วย SVG คมชัด)**:
     - แกนนอน = เวลาจำลอง (ย้อนหลัง 15 นาที ถึง ล่วงหน้า 10 นาที), แกนตั้ง = ป้ายจอด S01 ถึง S13
     - พล็อตเส้นการเคลื่อนที่จริงของรถแต่ละคันจากประวัติและทิศทางปัจจุบัน พร้อมเส้นประคาดการณ์ข้างหน้า ถ้ารถ 2 คันมีอัตราบีบอัดช่องไฟจนเส้นกราฟเข้าใกล้กัน ให้วงกลมจุดเสี่ยงรถติดกันสีแดงบนกราฟทันที
   - **กราฟที่ 2: กราฟคลื่นช่องไฟและภาระผู้โดยสารจริงรายคัน (Headway Regularity vs Camera Load Chart — วาดด้วย SVG)**:
     - ด้านบนแสดงกราฟแท่ง/เส้นเปรียบเทียบช่องไฟปัจจุบันของรถแต่ละคันเทียบกับเส้นประเป้าหมาย 8 นาที (480 วินาที)
     - ด้านล่างแสดงกราฟแท่งยอดผู้โดยสารจริงจากกล้อง AI ของรถทั้ง 10 คัน เทียบกับความจุตามกฎหมาย (`legalMax`) พร้อมตัวเลขคนขึ้น/ลงป้ายล่าสุด (`+B / -A`)

6. **โซนที่ 5: แผงวิเคราะห์ Bus Bunching AI, แผนที่จริง & Digital Twin (`#operations-panel` ใน `public/js/operations.js`)**:
   - อัปเกรดตารางใน `#operations-panel` ให้แสดงครบ 8 คอลัมน์:
     1) รถ & ทิศทาง
     2) ช่องไฟหน้า / หลัง (วินาที & เมตร)
     3) อัตราบีบอัด ($\frac{dH}{dt}$) & คาดการณ์ช่องไฟต่ำสุด (วิ)
     4) เวลาถึงจุดวิกฤต ($TTB$) & ดัชนี $BSI$
     5) ยอดคนจริงจากกล้อง AI (`onboardEst / capacity` + ขึ้น/ลงล่าสุด)
     6) ปัจจัยหน่วงจริง (จอดเปิดประตู / ไฟแดงหน้า / รถติด)
     7) ความเสี่ยง (`high` / `medium` / `low`)
     8) คุณภาพข้อมูลกล้อง/GPS
   - บนแผนที่ Leaflet (`#ops-map`): นอกจากหมุดตำแหน่งรถแล้ว ให้เพิ่มหมุดแสดงสถานะไฟแดง-ไฟเขียวของป้ายแยกหลัก และเมื่อคลิกที่รถจะแสดง Popup บอกยอดคนจริงจากกล้อง AI, ช่องไฟหน้า-หลัง และเวลาหน่วงไฟแดง
   - แสดงกล่องคำแนะนำ **AI Tactical Co-Pilot (`#ops-copilot`)** ตกแต่งให้อ่านง่าย ชัดเจน พร้อมระบบ Digital Twin เปรียบเทียบ 4 นโยบายเหมือนเดิมครบถ้วน

7. **โซนที่ 6: ตารางสถานะรถทั้งสาย 10 คัน (`#fleet-table-el`) & หน้าผู้โดยสาร (`public/js/passenger.js`)**:
   - ในตาราง `#fleet-table-el` หน้านายท่า: แสดงหลอดความจุผู้โดยสารจริงจากกล้อง AI (`onboardEst / legalMax คน`), ยอดขึ้น-ลงป้ายล่าสุด (`+ขึ้น / -ลง`), เวลาเปิดประตูที่ป้ายล่าสุด (`actualDwellSec วิ`), และสถานะไฟแดงป้ายถัดไป
   - ในหน้าผู้โดยสาร (`public/js/passenger.js`): ปรับข้อความให้เน้นว่าตัวเลขคนบนรถมาจาก **"กล้อง AI เหนือประตูแบบเรียลไทม์ 100% (ไม่ต้องคาดเดา)"** และซ่อนส่วนพยากรณ์จำนวนคนล่วงหน้าข้ามป้าย ($\pm \sigma$) บน UI ผู้โดยสาร

---

### ขั้นตอนการตรวจสอบความถูกต้อง (Verification Checklist)
1. รัน `npm test` — ต้องผ่านครบทั้ง 91 ข้อ (`fail 0`) โดยไม่มีข้อใดพัง
2. ทดสอบเปิดเซิร์ฟเวอร์และตรวจสอบว่า `/dispatcher.html` และ `/api/state`, `/api/operations/state`, `/api/operations/copilot` ทำงานได้โดยไม่มี JavaScript error
3. ตรวจสอบว่าไม่มีอีโมจิหลุดเข้าไปในไฟล์ HTML/JS/CSS เลยแม้แต่ตัวเดียว
4. สรุปรายการฟีเจอร์ที่เพิ่มและผลการรัน Test ให้ฉันทราบ
```

---

## ส่วนที่ 3: จุดเด่นที่จะทำให้กรรมการประทับใจที่สุดเมื่อรัน Prompt นี้

1. **กดดูไฟแดงและข้อมูลเจาะลึกได้ทุกป้าย (Interactive Signal & Stop Inspector)**:
   - กรรมการสามารถคลิกที่ป้ายแยกไฟแดง (เช่น แยกประตูน้ำ, อนุสาวรีย์ชัยฯ, สยาม) บนแผนผังเส้นทาง แล้วเห็นทันทีว่า **ไฟแดงแยกนั้นเหลืออีกกี่วินาที**, รถแถวนั้นวิ่งได้กี่ กม./ชม., มีคนรอที่ป้ายกี่คน และรถเมล์คันไหนกำลังจะวิ่งมาติดไฟแดงนี้
2. **เห็นกราฟวิถีการเดินรถ (Space-Time Marey Chart) แบบเดียวกับห้องควบคุมรถไฟฟ้า**:
   - ไม่ใช่แค่ตารางตัวเลข แต่เห็นเส้นกราฟการวิ่งของรถเมล์ทุกคันว่าคันไหนกำลังวิ่งไล่กวดคันหน้าจนเส้นกราฟกำลังจะชนกัน (Bunching Collision Point)
3. **เห็นสมการคณิตศาสตร์แทนค่าตัวเลขจริงสดๆ ต่อหน้า**:
   - เห็นชัดๆ ว่ากล้อง AI นับคนบนรถได้กี่คน ไฟแดงหน่วงกี่วินาที ช่องไฟห่างกี่เมตร แล้วสมการคำนวณออกมาเป็นคำแนะนำให้นายท่ากดปุ่มอนุมัติในคลิกเดียว
4. **มีปุ่มจำลองเหตุการณ์วิกฤต 1 คลิก (Judge Demo Bar)**:
   - ตอนนำเสนอ กรรมการอยากลองแกล้งระบบ เช่น กดให้ฝนตกหนัก + รถติดแยกประตูน้ำ ระบบจะคำนวณสมการใหม่ทันทีและเด้งการ์ดแจ้งเตือนให้นายท่ากดแก้รถขาดระยะได้ต่อหน้าต่อตา

> ผมได้บันทึก Prompt ฉบับจัดเต็มนี้ลงในไฟล์ [CLAUDE_CODE_ANTI_BUNCHING_PROMPT.md](file:///Users/bowornnan/work%20space/antigarvity/ai-forall/CLAUDE_CODE_ANTI_BUNCHING_PROMPT.md) ในโปรเจกต์ของคุณเรียบร้อยแล้ว สามารถคัดลอกไปวางให้ Claude Code ทำได้เลยครับ หรือถ้าต้องการให้ผมเขียนโค้ดอัปเกรดทั้งหมดนี้ลงในโปรเจกต์และ Deploy ขึ้น Vercel ให้ดูสดๆ ตอนนี้เลย ก็บอกได้ทันทีครับ!
