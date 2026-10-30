# External Context Intelligence

ระบบนี้เพิ่ม Weather-Aware และ Event-Aware context บน Node.js/REST/SSE/Leaflet เดิม ไม่มีฐานข้อมูลหรือ cloud dependency ใหม่ และไม่ให้ข่าว, weather provider หรือ LLM สั่งรถโดยตรง

## Providers

### Open-Meteo

`OpenMeteoProvider` เรียก `https://api.open-meteo.com/v1/forecast` ตามเอกสารปัจจุบัน โดยขอ current และ hourly `temperature_2m`, `precipitation`, `precipitation_probability`, `rain`, `weather_code`, `wind_speed_10m` พร้อม `timezone=Asia/Bangkok` ใช้จุดตัวแทน 3 จุดตามแนวเส้นทาง ไม่เรียกตามรถทุกคัน

- Cache 15 นาที
- Timeout 5 วินาที
- Retry 1 ครั้งแบบจำกัด
- อย่างน้อย 800 ms ระหว่าง upstream requests
- Cache เก่าถูกระบุ `stale`; ไม่มี cache ให้ระบุ `unavailable`; ไม่แทนค่าด้วยอากาศแจ่มใส
- Attribution: Weather data by Open-Meteo.com

เอกสารต้นทาง: <https://open-meteo.com/en/docs>

### GDELT DOC 2.0

`GdeltProvider` ใช้ Article List JSON, `maxrecords=25`, `timespan=1week`, cache 30 นาที และ query เฉพาะคำเกี่ยวกับ Bangkok traffic/closure/concert/marathon ทั้งไทยและอังกฤษ เมื่อ upstream ล้มเหลวจะตอบ `unavailable` โดยระบบหลักทำงานต่อ

เอกสารต้นทาง: <https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/>

การตรวจสดเมื่อพัฒนา: Open-Meteo ตอบสำเร็จ ส่วน GDELT ไม่สามารถเข้าถึงจากเครื่องทดสอบในครั้งล่าสุด จึงไม่อ้างว่าเชื่อมสดสำเร็จ ดู artifact `experiments/context-live.json`

Greener Bangkok, JS100 และ FM91 ยังไม่ถูกเชื่อมอัตโนมัติ เพราะรอบนี้ยังไม่ยืนยัน API/RSS และสิทธิ์นำข้อมูลมาใช้ที่เหมาะสม ไม่มี scraper หรือการหลบระบบป้องกัน ให้ใช้ Manual Import แทน

## API

| Method | Endpoint | สิทธิ์ | ความหมาย |
|---|---|---|---|
| GET | `/api/context/weather?routeId=R1` | อ่าน | ดึง/อ่าน current + hourly Open-Meteo; cache ป้องกันคำขอซ้ำ |
| GET | `/api/context/weather?routeId=R1&refresh=0` | อ่าน | อ่านสถานะในหน่วยความจำ ไม่เรียก Internet |
| GET | `/api/context/events` | อ่าน | กิจกรรมที่นำเข้าแล้วและสถานะ GDELT |
| GET | `/api/context/events?refresh=1` | อ่าน | ทดลอง refresh GDELT |
| GET | `/api/context/impacts?routeId=R1&radiusM=1000` | อ่าน | ระยะจากเส้นทางและเหตุผล impact |
| GET | `/api/context/state?routeId=R1` | อ่าน | context ที่พร้อม enrich prediction ณ เวลาปัจจุบัน |
| GET | `/api/context/scenarios` | อ่าน | สมมติฐาน Digital Twin; ไม่ใช่ค่าที่ calibrate แล้ว |
| POST | `/api/context/events/manual` | Operations token | JSON event, `{events:[...]}` หรือ `{format:"csv",data:"..."}` |

Production write endpoint ต้องส่ง `Authorization: Bearer <OPERATIONS_TOKEN>` ขนาด body จำกัด 100 KB และสูงสุด 100 events ต่อครั้ง

### Weather response example

```json
{
  "routeId": "R1",
  "timezone": "Asia/Bangkok",
  "source": "open-meteo",
  "status": "available",
  "lastUpdated": "2026-10-30T13:15:00.000Z",
  "current": {
    "forecastTime": "2026-10-30T20:15",
    "temperatureC": 27.9,
    "precipitationMm": 0,
    "precipitationProbability": 29,
    "weatherCode": 1,
    "windSpeedKmh": 5.6,
    "weatherCondition": "no_rain_detected",
    "weatherImpactLevel": "low"
  }
}
```

ตัวเลขเป็นตัวอย่างรูปแบบ response เท่านั้น ค่าใช้งานจริงต้องอ่านจาก API ในเวลาที่ทดลอง

### Manual event example

```json
{
  "eventName": "ตัวอย่างกิจกรรม",
  "eventType": "concert",
  "eventDate": "2026-11-15",
  "startTime": "18:00",
  "endTime": null,
  "location": "สถานที่ที่ผู้ดูแลตรวจสอบแล้ว",
  "locationVerified": true,
  "latitude": 13.7466,
  "longitude": 100.5347,
  "affectedRoads": [],
  "eventStatus": "planned",
  "roadClosureConfirmed": false,
  "verificationStatus": "verified",
  "sourceUrl": "https://example.org/source",
  "publishedAt": "2026-10-28T10:00:00+07:00",
  "extractionConfidence": 1
}
```

พิกัด manual จะถูกเก็บเฉพาะเมื่อ `locationVerified:true` หรือ `verificationStatus:"verified"`; URL ต้องเป็น HTTP(S) ข่าวที่ไม่มีวันจัดงานคง `eventDate:null` และ `needs_review` ไม่ใช้วันเผยแพร่แทน

## Extraction, deduplication และ route impact

- `RuleBasedExtractionProvider` แยกประเภท/สถานะ/วันที่ ISO/เวลาเมื่อข้อความมีรูปแบบชัดเจน
- `OptionalAiExtractionProvider` เป็น interface สำหรับ Bedrock/AI ในอนาคต แต่เมื่อไม่มี adapter จะใช้ rules และส่ง `needs_review`
- ไม่มีการสร้างพิกัด ชื่อถนน วันที่ หรือเวลาเอง
- Dedup key มาจากชื่อกิจกรรม + ประเภท + วันกิจกรรม + สถานที่ และรวม source references หลายสำนัก
- ระยะ 100–5,000 เมตรเป็น proximity screening เท่านั้น `possible` ไม่แปลว่าจะติดแน่นอน
- `confirmed` ต้องมีพิกัดยืนยัน อยู่ใน radius และ source/import ระบุ road closure confirmed

## Prediction และ Optimization

Prediction เดิมยังเป็นตัวเลขหลัก External Context เพิ่ม `externalContextUsed`, `contextMode:"advisory_only"` และสาม variants:

1. without external context
2. with weather context
3. with weather + event context

จนกว่าจะมีข้อมูลจริงสำหรับ calibration ทั้งสาม variant จะไม่แก้ตัวเลข headway และบอกเหตุผลตรง ๆ ว่าไม่มี calibrated adjustment ข่าวที่เผยแพร่หลัง `asOf` และกิจกรรมที่ไม่มีวันจัดงานจะไม่ถูกนำเข้า upcoming prediction context

Holding/Dispatch ยังต้องผ่าน counterfactual optimization, safety constraints และ operator approval เดิม Context ไม่มีทางสร้าง recommendation โดยตรง

## Digital Twin assumptions

สถานการณ์ใหม่: `normal_weather`, `light_rain`, `heavy_rain`, `large_public_event`, `confirmed_road_closure`, `rain_public_event` ใช้ Engine/World เดิม ค่าตัวคูณ speed/dwell/demand อยู่ใน `SCENARIOS` และ API ติดป้าย `simulation_assumptions`, `calibrated:false` ค่านี้เป็นสมมติฐานเพื่อ sensitivity testing ไม่ใช่ข้อเท็จจริงด้านผลกระทบ

## Run and test

```powershell
npm start
npm test
npm run test:context-live
```

`npm test` ใช้ mock response และทำงาน offline ส่วน `test:context-live` เป็น smoke test แยกต่างหากและเขียนผลที่ `experiments/context-live.json`
