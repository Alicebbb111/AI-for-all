'use strict';
// Integration fixture only: REPLAY aggregates, no video and no actual camera connection.
const {buildPath,pointAtS,ROUTES}=require('../engine/data');
async function main() {
  const base=process.env.API_URL||'http://127.0.0.1:8787',runId=`mock-${Date.now()}`;
  const path=buildPath(ROUTES.R1.ROUTE_POINTS);
  let sequence=0;
  async function send(kind,body) {
    const e={schemaVersion:'1.0',eventId:`${runId}-${++sequence}`,sourceId:'mock-camera-gps',sourceType:'mock',mode:'replay',simulationRunId:runId,observedAt:new Date().toISOString(),routeId:'R1',tripId:'mock-out-1',direction:1,...body};
    const r=await fetch(`${base}/api/telemetry/${kind}`,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.TELEMETRY_TOKEN?{Authorization:`Bearer ${process.env.TELEMETRY_TOKEN}`}:{})},body:JSON.stringify(e)});
    const result=await r.json();if(!r.ok)throw new Error(JSON.stringify(result));
  }
  for(const simTimeSec of [0,30]) {
    for(const [busId,s,speedKmh] of [['B01',2400+simTimeSec*3,12],['B02',1400+simTimeSec*8,28]]) {
      const p=pointAtS(path,s);
      await send('position',{busId,simTimeSec,latitude:p.lat,longitude:p.lng,speedKmh,accuracyM:10});
      await send('passenger',{busId,simTimeSec,measurementType:'occupancy',onboard:busId==='B01'?40:15});
    }
    await fetch(`${base}/api/operations/state?mode=replay&runId=${runId}`);
  }
  console.log(`Replay run: ${runId}\nGET ${base}/api/operations/state?mode=replay&runId=${runId}\nSelect Replay and enter this run ID in Dispatcher.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
