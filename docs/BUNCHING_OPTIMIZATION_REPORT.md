# Bus Bunching Optimization — verified experiment report

วันที่ประเมิน: 28–30 ตุลาคม 2026  
ขอบเขต: Simulation เท่านั้น ยังไม่ใช่ผลยืนยันจากการเดินรถจริง

## สรุปผล

ระบบใหม่เลิกบังคับ Holding เมื่อทางเลือกนั้นเพียงทำให้ Headway ดูสม่ำเสมอขึ้น แต่เพิ่มเวลาผู้โดยสาร ในสถานการณ์ `bunching` เดิม Holding ก่อนแก้เพิ่ม Total Passenger Time เฉลี่ย **652.83 คน-วินาที** และแย่กว่า No Intervention ทั้ง 30/30 seeds หลังแก้ระบบเลือก No Intervention ทั้ง 30 seeds จึงไม่เพิ่มเวลาผู้โดยสาร แต่ก็ยังไม่ลด Bunching ใน fixture นี้

Smart Dispatch ให้ประโยชน์ที่วัดได้เฉพาะ `late_departure`: ลด Total Passenger Time เฉลี่ย **660 คน-วินาที** ทุก 30/30 seeds หลังแก้ ส่วนสถานการณ์อื่น Total Passenger Time เท่า Baseline แม้บางครั้งเวลาออกและ Headway variance เปลี่ยน จึงไม่ถือว่าเป็นประโยชน์ด้านเวลารวม

## สาเหตุจากโค้ดเดิม

1. Holding cost ใช้ค่าต่ำสุดระหว่าง Headway ปัจจุบันกับค่าคาดการณ์จากคนละเวลา/จุดอ้างอิง และลงโทษค่าติดลบแบบยกกำลังสอง ทำให้ regularity penalty มีน้ำหนักมากกว่าต้นทุนผู้โดยสาร
2. ต้นทุนรอป้ายประเมินจาก demand เพียงจุดเดียว ไม่ได้จำลอง queue และรถคันหน้า/หลังตลอดช่วงตัดสินใจ จึงไม่ตรงกับ World ที่รันจริง
3. เหตุการณ์ผู้โดยสารถูกใส่ queue ล่วงหน้าทั้งนาที ทำให้คนที่ยังมาไม่ถึงสามารถถูกนับหรือขึ้นรถได้
4. Random draw ของ alighting/APC ผูกกับเวลานาฬิกา การทำ intervention จึงเปลี่ยนสภาวะภายนอกที่นโยบายได้รับ แม้ใช้ seed เดียวกัน
5. Prediction extrapolate trend ซ้ำบน Headway ที่เป็น ETA ณ จุดร่วมในอนาคตอยู่แล้ว ทำให้ค่าคาดการณ์ต่ำเกินจริง
6. Digital Twin เดิมทำงานบน main thread และบล็อก HTTP/SSE

## การแก้ Algorithm

- Holding เปรียบเทียบ `0, 30, 60, 90, 120, 180` วินาที โดย `0` คือ No Intervention จริง
- ใช้ counterfactual rollout ผ่าน `World.step` เดียวกับ Simulation Engine รวม queue time และ onboard time ทุก 5 วินาที
- ต้องให้ Total Passenger Time ดีขึ้นเกิน safety margin และผ่านทั้ง horizon ที่ยาวขึ้นกับ demand 75%/125%; ไม่ผ่านข้อใดให้ No Intervention
- ไม่อนุญาต Holding เมื่อจุดไม่อยู่ใน allowlist, รถไม่ได้ dwell, ข้อมูลไม่พอ, หรือทำ Back Headway ต่ำกว่า 60 วินาที
- การอนุมัติของเจ้าหน้าที่ revalidate ตำแหน่ง สถานะ ช่องไฟ และประโยชน์อีกครั้ง ไม่มีคำสั่งรถจริงอัตโนมัติ
- Dispatch เปรียบเทียบเวลา baseline กับทางเลือกที่เคารพรถพร้อมใช้, minimum rest, minimum departure headway, pending reservation และประเมิน downstream passenger time
- เหตุการณ์ผู้โดยสารเปิดให้ใช้เมื่อถึง `observedAt` เท่านั้น; random exogenous draw ผูกกับ bus/trip/stop visit
- ทุก arm เก็บ hash ของ initial state และ exogenous event tape และยกเลิกการทดลองถ้าไม่ตรงกัน
- Digital Twin ย้ายไป Worker Thread; API เดิมยังรอผลและตอบรูปแบบเดิม ส่วน GET ใช้ดู progress

## Protocol และผล 4 นโยบาย

ใช้ 30 seeds × 7 สถานการณ์ × 4 นโยบาย = **840 runs**, run ละ 1,800 วินาที สถานการณ์คือ normal, bunching, traffic heavy/light, passengers high/low และ late departure ทุกคู่ before/after มี initial/exogenous hash ตรงกันครบ **840/840**

ค่าเฉลี่ยรวมให้น้ำหนักแต่ละสถานการณ์เท่ากัน (210 runs ต่อนโยบาย):

| นโยบาย | Waiting mean ± SD (วินาที) | Total passenger time mean ± SD (คน-วินาที) | Headway variance mean (n=189) | Bunching/run | Interventions/run | Holding เฉลี่ย |
|---|---:|---:|---:|---:|---:|---:|
| No Intervention | 599.60 ± 70.58 | 881,257.50 ± 195,977.57 | 53,574.02 | 0.257 | 0 | ไม่มี Holding |
| Smart Holding | 599.60 ± 70.58 | 881,257.50 ± 195,977.57 | 53,574.02 | 0.257 | 0 | ไม่มี Holding |
| Smart Dispatch | 598.73 ± 71.20 | 881,163.21 ± 195,990.24 | 51,791.00 | 0.257 | 0.929 | ไม่มี Holding |
| Holding + Dispatch | 598.73 ± 71.20 | 881,163.21 ± 195,990.24 | 51,791.00 | 0.257 | 0.929 | ไม่มี Holding |

Headway variance มีข้อมูล 189/210 runs เท่านั้น และบาง traffic-heavy run มี passage gap เพียงหนึ่งค่า จึงห้ามตีความค่า 0 ว่า regularity สมบูรณ์ Average Onboard Delay จาก Holding เป็น 0 เพราะ optimizer ไม่อนุมัติ Holding ใน protocol นี้

ผลแยกสถานการณ์ที่สำคัญ:

| สถานการณ์ | Baseline TPT mean ± SD | Holding ΔTPT | Dispatch ΔTPT | ผล |
|---|---:|---:|---:|---|
| bunching | 879,354.83 ± 34,834.38 | 0 | 0 | Holding abstain; Bunching 1.8/run ยังไม่ลด |
| traffic light | 800,326.67 ± 31,103.83 | 0 | 0 | Dispatch ลด waiting mean 473.87 → 471.46 แต่ TPT ถูกย้ายระหว่าง queue/onboard ไม่ได้ลด |
| late departure | 851,542.33 ± 32,702.77 | 0 | **-660.00** | Dispatch ดีขึ้น 30/30 seeds, waiting 615.24 → 611.51 |
| อีก 4 สถานการณ์ | — | 0 | 0 | ไม่มีหลักฐานว่า intervention ลด TPT |

ก่อนแก้ Dispatch ใน late-departure ลดได้ 1,080.17 คน-วินาที จึงดีกว่าเวอร์ชันใหม่ใน fixture นี้ ระบบใหม่จงใจเข้มงวดขึ้นและไม่ได้ชนะทุก metric; ต้องใช้ข้อมูลจริงปรับ margin/horizon ก่อนใช้งาน

## Prediction

เป็น **baseline heuristic** รุ่น `reference-eta-v1.1` ไม่ใช่ Machine Learning และไม่ใช้ LLM สร้างตัวเลข Prediction บันทึกก่อนเหตุการณ์จริงเท่านั้น

- ตัวเตือนความเสี่ยงที่แสดงจริง: TP 60, FP 0, FN 30, TN 83, precision 1.00, recall 0.667, MAE 78.21 วินาที, mean lead time 516.17 วินาที
- มีเหตุการณ์ที่ไม่มี forecast coverage 1,693 จุด และในนั้นเป็น positive 30 จุด ซึ่งนับเป็น false negative แล้ว
- ตัวเลข precision สูงมาจาก Synthetic bunching fixture และ coverage จำกัดมาก ไม่ใช่หลักฐานความแม่นยำในโลกจริง
- Reference-headway diagnostic ดีขึ้นจาก MAE 120.32 เป็น 80.45 วินาทีบน 173 matched passages แต่ไม่ควรปนกับตัวเตือน min-headway ที่ผู้ใช้เห็น

## Performance และ Regression

การยิง Digital Twin 30 seeds ก่อนใช้ Worker ทำให้ `/healthz` รอ 13,304.71 ms และ SSE มี gap สูงสุด 13,596.42 ms หลังใช้ Worker `/healthz` ใช้ 2.47 ms, SSE gap สูงสุด 1,014.34 ms และได้รับ 21 frames ระหว่างงาน (ค่าขึ้นกับเครื่อง)

Automated tests ล่าสุด: **72 ผ่าน, 0 ไม่ผ่าน** ครอบคลุม API เดิม, SSE, auth, duplicate passenger event, live/simulation isolation, safety allowlist, No Intervention, deterministic/exogenous matching, prediction leakage guard และ Worker main-loop progress

## ไฟล์หลักและการทำซ้ำ

- Raw before: `experiments/before.json`
- Raw after: `experiments/after.json`
- Machine-readable summary: `experiments/optimization-summary.json`
- Responsiveness: `experiments/http-before.json`, `experiments/http-after.json`

คำสั่ง:

```powershell
npm test
npm run benchmark:bunching
npm run report:bunching
node scripts/benchmark_responsiveness.js experiments/http-after.json
```

`benchmark:bunching` ใช้เวลาหลายนาทีและเขียนทับ `experiments/after.json`; ควรเก็บ artifact เดิมก่อนถ้าต้องการเปรียบเทียบอีกชุด

## ข้อจำกัดคงเหลือ

- ไม่มี GPS/APC, safe holding points, terminal readiness หรือ demand ที่ยืนยันจากระบบจริง
- ผล 30 seeds เป็น Synthetic และ horizon 30 นาที censor การเดินทางที่ยังไม่จบ
- Waiting mean วัดผู้โดยสารที่ขึ้นรถแล้ว ส่วน TPT integrate ทุกคนที่รอและอยู่บนรถ จึงควรใช้ TPT เป็น objective หลัก
- Holding ใหม่เลือก No Intervention อย่างปลอดภัย แต่ยังไม่พิสูจน์ว่าสามารถลด Bunching ได้ใน scenario ที่ทดสอบ
- ไม่มี probability calibration หรือ ML training; ต้องเก็บ passage/dwell/demand จริงแล้วทำ time-split validation ก่อน
- Fixture S02/S03/S05/S07/S09/S11 เป็นจุดทดลองเสมือน ไม่ใช่การรับรองว่าปลอดภัยในโลกจริง
