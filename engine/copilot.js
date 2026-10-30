'use strict';
// Numbers originate exclusively in deterministic operations. No cloud credentials required.
function explain(operations) {
  const decision=operations.decision;
  const decisionText=decision?`${decision.label}: ${decision.reason} (${[...decision.holdingReasons,...decision.dispatchReasons].join(', ')})\n`:'';
  return {provider:'local',mode:operations.mode,modelVersion:'local-explanation-v1.1',text:decisionText+(operations.predictions.map(p=>`รถ ${p.busId}: ความเสี่ยง ${p.riskLevel} ช่องไฟคาดการณ์ ${p.predictedHeadwaySec==null?'ไม่มีข้อมูล':Math.round(p.predictedHeadwaySec)+' วินาที'} ภายใน ${Math.round(p.predictionHorizonSec)} วินาที (${p.factors.join(', ')})`).join('\n')||'ข้อมูลยังไม่เพียงพอสำหรับคาดการณ์ ไม่แนะนำการควบคุมรถ'),recommendations:operations.recommendations.map(r=>({id:r.id,busId:r.busId,type:r.type,holdSec:r.holdSec??null,releaseAtSec:r.releaseAtSec??null})),bedrock:{enabled:false,note:'Optional provider interface reserved; AWS integration is not configured. Local explanation remains available.'}};
}
module.exports={explain};
