'use strict';
// Numbers originate exclusively in deterministic operations. No cloud credentials required.
function fmtSec(v){return Number.isFinite(v)?Math.round(v)+' วินาที':'ไม่มีข้อมูล';}
function explain(operations) {
  const vehicles = operations.vehicles || [], predictions = operations.predictions || [];
  const summary = operations.corridorSummary || null;

  // 1. ภาพรวม
  let s1;
  if (summary) {
    const avgMin = summary.avgHeadwaySec != null ? Math.round(summary.avgHeadwaySec / 60) : null;
    const speed = Number(summary.corridorAvgSpeedKmh || 0).toFixed(1);
    s1 = `[ภาพรวม] รถ ${vehicles.length} คัน · คนบนรถรวม ${summary.totalOnboardCamera} คน · ช่องไฟเฉลี่ย ${avgMin != null ? '~' + avgMin + ' นาที' : 'ปกติ'} · ความเร็วเฉลี่ย ${speed} กม./ชม.`;
  } else {
    s1 = `[ภาพรวม] รถ ${vehicles.length} คัน · สถานการณ์เดินรถปกติ`;
  }

  // 2. วิเคราะห์จุดเฝ้าระวัง (แสดงเฉพาะคันที่เสี่ยงจริง high/medium ไม่เกิน 2 คัน)
  const risky = vehicles.filter(v => {
    const p = predictions.find(x => x.busId === v.busId);
    return p && (p.riskLevel === 'high' || p.riskLevel === 'medium');
  });

  let s2;
  if (risky.length > 0) {
    const lines = risky.slice(0, 2).map(v => {
      const p = predictions.find(x => x.busId === v.busId);
      const hwMin = p && Number.isFinite(p.predictedHeadwaySec) ? Math.max(0, Math.round(p.predictedHeadwaySec / 60)) : null;
      const tag = p.riskLevel === 'high' ? 'เสี่ยงจี้ท้าย' : 'เริ่มชิดคันหน้า';
      return `• คัน ${v.busId} (${v.nextStopName || 'ป้ายถัดไป'}): ${tag}${hwMin != null ? ` (ช่องไฟ ~${hwMin} นาที)` : ''} · คนบนรถ ${v.onboardEst ?? '?'}/${v.capacity || 72} คน`;
    });
    s2 = `[จุดเฝ้าระวัง]\n${lines.join('\n')}`;
  } else {
    s2 = '[จุดเฝ้าระวัง] รถทุกคันรักษาระยะช่องไฟสม่ำเสมอ ยังไม่พบความเสี่ยงวิ่งติดกันหรือขาดระยะ';
  }

  // 3. คำแนะนำนายท่า
  let s3;
  if (operations.recommendations && operations.recommendations.length > 0) {
    const recs = operations.recommendations.slice(0, 2).map(r => {
      const gain = Math.round(r.estimatedGainPassengerSec || 0);
      return r.type === 'holding'
        ? `• แนะนำหน่วงรถ ${r.busId} ที่ป้าย ${r.stopId} ${r.holdSec} วินาที (ประหยัดเวลาผู้โดยสารรวม ~${gain} คน-วิ)`
        : `• ปรับจังหวะปล่อยรถ ${r.busId} ต้นสาย ${Math.round(r.delaySec || 0)} วินาที`;
    });
    s3 = `[คำแนะนำ]\n${recs.join('\n')}`;
  } else {
    s3 = '[คำแนะนำ] เดินรถตามตารางปกติ — คงแผนเดิม ไม่ต้องแทรกแซง';
  }

  const text = [s1, s2, s3].join('\n');
  return {
    provider: 'local',
    mode: operations.mode,
    modelVersion: 'local-explanation-v1.1',
    text,
    structuredInsights: {
      situation: s1.replace('[ภาพรวม] ', ''),
      perVehicleCauses: vehicles.map(v => {
        const p = predictions.find(x => x.busId === v.busId);
        return {
          busId: v.busId,
          cameraOnboard: v.onboardEst ?? null,
          capacity: v.capacity ?? null,
          boardLast: v.boardLast ?? 0,
          alightLast: v.alightLast ?? 0,
          dwellDelaySec: p?.delayBreakdown?.dwellSec ?? v.remainingDwellSec ?? 0,
          signalDelaySec: p?.delayBreakdown?.signalSec ?? v.signalDelaySec ?? 0,
          trafficDelaySec: p?.delayBreakdown?.trafficSec ?? v.trafficDelaySec ?? 0,
          nextStop: v.nextStopName || null,
          nextSignalColor: v.nextSignalColor || null,
          riskLevel: p?.riskLevel || 'unknown'
        };
      }),
      recommendations: (operations.recommendations || []).map(r => ({
        id: r.id,
        busId: r.busId,
        type: r.type,
        holdSec: r.holdSec ?? null,
        releaseAtSec: r.releaseAtSec ?? null,
        estimatedGainPassengerSec: r.estimatedGainPassengerSec ?? 0
      }))
    },
    recommendations: (operations.recommendations || []).map(r => ({
      id: r.id,
      busId: r.busId,
      type: r.type,
      holdSec: r.holdSec ?? null,
      releaseAtSec: r.releaseAtSec ?? null
    })),
    bedrock: { enabled: false, note: 'Optional provider interface reserved. Local explanation remains available.' }
  };
}

/** นักวิเคราะห์สถานการณ์สด — มี Key: OpenAI วิเคราะห์จากตัวเลขจริง (Hybrid: ห้ามแต่งตัวเลข)
 *  ไม่มี Key/ยิงไม่สำเร็จ: ใช้รายงานท้องถิ่นจากสมการทันที — shape เดียวกับ explain() เสมอ */
async function explainWithAI(operations, ai) {
  const local = explain(operations);
  try {
    if (!ai || !ai.status || !ai.status().configured) return local;
    const cs = operations.corridorSummary || {};
    const rows = (operations.vehicles || []).slice(0, 12).map((v) => {
      const p = (operations.predictions || []).find((x) => x.busId === v.busId);
      const h = (operations.headways || []).find((x) => x.busId === v.busId);
      return {
        busId: v.busId, direction: v.direction, speedKmh: v.speedKmh || 0, state: v.state,
        cameraOnboard: v.onboardEst ?? null, capacity: v.capacity ?? null,
        boardLast: v.boardLast ?? 0, alightLast: v.alightLast ?? 0,
        actualDwellSec: v.actualDwellSec ?? 0,
        frontHeadwaySec: h && Number.isFinite(h.frontHeadwaySec) ? Math.round(h.frontHeadwaySec) : null,
        frontGapMeters: h?.frontGapMeters ?? null,
        nextStop: v.nextStopName || null,
        nextSignal: { color: v.nextSignalColor || null, remainingSec: v.nextSignalRemainingSec ?? 0 },
        delayBreakdown: p?.delayBreakdown || null,
        riskLevel: p?.riskLevel || 'unknown',
      };
    });
    const payload = {
      clockSec: operations.clockSec, mode: operations.mode,
      corridorSummary: cs,
      decision: operations.decision || null,
      recommendations: (operations.recommendations || []).map((r) => ({ type: r.type, busId: r.busId, holdSec: r.holdSec ?? null, releaseAtSec: r.releaseAtSec ?? null, estimatedGainPassengerSec: r.estimatedGainPassengerSec ?? 0 })),
      vehicles: rows,
    };
    const system = [
      'คุณคือนักวิเคราะห์ปฏิบัติการรถโดยสารของศูนย์บัญชาการนายท่า กรุงเทพฯ',
      'รับข้อมูล operations JSON แล้วเขียนสรุปภาษาไทยแบบกระชับ ตรงประเด็นสำหรับนายท่า ไม่เกิน 3 บรรทัด (ห้ามเกิน 60 คำ):',
      '1. [ภาพรวม] รถกี่คัน คนรวมกี่คน ช่องไฟเฉลี่ยกี่นาที',
      '2. [จุดเฝ้าระวัง] คันที่เสี่ยงจี้ท้ายหรือขาดระยะ (ถ้าปกติให้ระบุว่าระยะสม่ำเสมอทุกคัน)',
      '3. [คำแนะนำ] หน่วงรถคันไหน หรือให้เดินรถตามตารางปกติ',
      'ใช้ตัวเลขจาก JSON เท่านั้น ห้ามแต่งตัวเลข ห้ามทักทาย ไม่ใช้ markdown ดอกจัน',
    ].join('\n');
    const r = await ai.chat(system, JSON.stringify(payload), { temperature: 0.3 });
    if (!r.ok) return { ...local, aiRequested: true, aiError: r.error };
    return { ...local, provider: 'openai', modelVersion: ai.status().model, text: r.text, aiRequested: true };
  } catch (e) {
    return { ...local, aiRequested: true, aiError: String(e && e.message || e) };
  }
}
module.exports = { explain, explainWithAI };

