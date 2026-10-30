'use strict';
// Numbers originate exclusively in deterministic operations. No cloud credentials required.
function fmtSec(v){return Number.isFinite(v)?Math.round(v)+' วินาที':'ไม่มีข้อมูล';}
function explain(operations) {
  const vehicles=operations.vehicles||[],predictions=operations.predictions||[];
  const decision=operations.decision;
  const decisionText=decision?`${decision.label}: ${decision.reason} (${[...decision.holdingReasons,...decision.dispatchReasons].join(', ')})\n`:'';
  const summary=operations.corridorSummary||null;
  // ── รายงานยุทธวิธี 3 ส่วนสำหรับนายท่า (ตัวเลขจาก operations เชิงกำหนดเท่านั้น) ──
  const s1=summary
    ?`[1] สถานการณ์สด: รถ ${operations.vehicles.length} คัน · คนบนรถจริงจากกล้อง AI รวม ${summary.totalOnboardCamera} คน · ช่องไฟเฉลี่ย ${summary.avgHeadwaySec==null?'ไม่มีข้อมูล':Math.round(summary.avgHeadwaySec)+' วินาที'} · เสี่ยงขาดระยะระดับสูง ${summary.highRiskCount} คัน / ปานกลาง ${summary.mediumRiskCount} คัน · จราจรเฉลี่ย ${summary.corridorAvgSpeedKmh} กม./ชม. · ติดไฟแดง ${summary.redLightsActiveNow}/${summary.totalSignalStops} แยก`
    :'[1] สถานการณ์สด: ยังไม่มีข้อมูลสรุประดับสาย';
  const ranked=[...vehicles].sort((a,b)=>{
    const rank=(x)=>{const p=predictions.find(y=>y.busId===x.busId);return p?(p.riskLevel==='high'?0:p.riskLevel==='medium'?1:p.riskLevel==='unknown'?3:2):3;};
    return rank(a)-rank(b);
  });
  const causes=ranked.slice(0,6).map(v=>{
    const p=predictions.find(x=>x.busId===v.busId);
    const bits=[`คัน ${v.busId} (ป้ายถัดไป ${v.nextStopName||'-'} · ${v.speedKmh?v.speedKmh+' กม./ชม.':'จอด'})`];
    bits.push(`กล้อง AI นับจริง ${v.onboardEst??'?'} / ${v.capacity} คน (ล่าสุด +${v.boardLast??0} / -${v.alightLast??0})`);
    const d=p?.delayBreakdown;
    if(d)bits.push(`หน่วง: เปิดประตู ${d.dwellSec} วิ + ไฟแดงหน้า ${d.signalSec} วิ + จราจร ${d.trafficSec} วิ`);
    else bits.push(`ไฟแดงป้ายหน้า ${v.nextSignalColor==='none'?'ไม่มี':v.nextSignalColor+' ' + v.nextSignalRemainingSec + ' วิ'} · จราจรหน่วง ${v.trafficDelaySec||0} วิ`);
    if(p&&p.riskLevel!=='unknown')bits.push(`ช่องไฟคาดการณ์ ${fmtSec(p.predictedHeadwaySec)} · ความเสี่ยง ${p.riskLevel}`);
    return '- '+bits.join(' · ');
  }).join('\n');
  const hidden=vehicles.length-Math.min(6,vehicles.length);
  const s2=`[2] วิเคราะห์รายคัน (เรียงตามความเสี่ยง${hidden>0?` · แสดง 6/${vehicles.length} คัน`:''}):\n${causes}`;
  const s3=operations.recommendations.length
    ?'[3] คำแนะนำ:\n'+operations.recommendations.map(r=>{
      const gain=r.estimatedGainPassengerSec;
      return r.type==='holding'
        ?`- หน่วงรถ ${r.busId} ที่ป้าย ${r.stopId} ${r.holdSec} วินาที — ประหยัดเวลาผู้โดยสารรวม ~${Math.round(gain||0)} คน-วินาที (อยู่ในเกณฑ์ robust แล้ว)`
        :`- ปล่อยรถ ${r.busId} ตามกรอบเวลาใหม่ (หน่วงจากต้นสาย ${Math.round(r.delaySec||0)} วินาที) — ประหยัด ~${Math.round(gain||0)} คน-วินาที`;
    }).join('\n')
    :'[3] คำแนะนำ: ไม่มีมาตรการที่พิสูจน์แล้วว่าลดเวลาผู้โดยสารได้จริง — คงแผนเดิม (No Intervention)';
  const text=[decisionText+'[รายงานยุทธวิธี Anti-Bunching]',s1,s2,s3].join('\n');
  return {provider:'local',mode:operations.mode,modelVersion:'local-explanation-v1.1',text,
    structuredInsights:{
      situation:s1.replace('[1] ',''),
      perVehicleCauses:vehicles.map(v=>{
        const p=predictions.find(x=>x.busId===v.busId);
        return {busId:v.busId,cameraOnboard:v.onboardEst??null,capacity:v.capacity??null,boardLast:v.boardLast??0,alightLast:v.alightLast??0,
          dwellDelaySec:p?.delayBreakdown?.dwellSec??v.remainingDwellSec??0,signalDelaySec:p?.delayBreakdown?.signalSec??v.signalDelaySec??0,trafficDelaySec:p?.delayBreakdown?.trafficSec??v.trafficDelaySec??0,
          nextStop:v.nextStopName||null,nextSignalColor:v.nextSignalColor||null,riskLevel:p?.riskLevel||'unknown'};
      }),
      recommendations:operations.recommendations.map(r=>({id:r.id,busId:r.busId,type:r.type,holdSec:r.holdSec??null,releaseAtSec:r.releaseAtSec??null,estimatedGainPassengerSec:r.estimatedGainPassengerSec??0}))
    },
    recommendations:operations.recommendations.map(r=>({id:r.id,busId:r.busId,type:r.type,holdSec:r.holdSec??null,releaseAtSec:r.releaseAtSec??null})),bedrock:{enabled:false,note:'Optional provider interface reserved; AWS integration is not configured. Local explanation remains available.'}};
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
      'รับข้อมูล operations JSON (ตำแหน่งรถ, ยอดคนจริงจากกล้อง AI เหนือประตู, ช่องไฟหน้า-หลัง, ไฟแดงรายแยก, ความเร็วถนน, ความเสี่ยง bunching)',
      'เขียนบรีฟสถานการณ์ภาษาไทยสำหรับนายท่า 3 ย่อหน้าสั้นๆ: (1) สถานการณ์ช่องไฟและการเดินรถตอนนี้ (2) รถคันที่น่ากังวลที่สุดพร้อมสาเหตุจากตัวเลขจริง (3) สิ่งที่นายท่าควรทำตอนนี้',
      'ใช้ตัวเลขจาก JSON เท่านั้น ห้ามแต่งตัวเลข ห้ามเดา ห้ามเกิน 120 คำ ไม่ต้องทักทาย ไม่ใช้ markdown',
    ].join('\n');
    const r = await ai.chat(system, JSON.stringify(payload), { temperature: 0.3 });
    if (!r.ok) return { ...local, aiRequested: true, aiError: r.error };
    return { ...local, provider: 'openai', modelVersion: ai.status().model, text: r.text, aiRequested: true };
  } catch (e) {
    return { ...local, aiRequested: true, aiError: String(e && e.message || e) };
  }
}
module.exports={explain,explainWithAI};
