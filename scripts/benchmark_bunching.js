'use strict';
// Fixed paired protocol, shared before/after. All routes are virtual; holding points are experiment fixtures.
const fs=require('fs');
const path=require('path');
const {createHash}=require('crypto');
const {runTwin,SCENARIOS}=require('../engine/twin');
const output=process.argv[2]||'experiments/after.json';
const seedCount=Number(process.env.BENCHMARK_SEEDS||30),durationSec=Number(process.env.BENCHMARK_DURATION||1800);
const seeds=Array.from({length:seedCount},(_,i)=>String(i+1));
const defaultScenarios=['normal','bunching','traffic_heavy','traffic_light','passengers_high','passengers_low','late_departure'];
const selected=(process.env.BENCHMARK_SCENARIOS||'').split(',').filter(Boolean);
const scenariosToRun=selected.length?selected:defaultScenarios;
if(scenariosToRun.some(x=>!SCENARIOS[x]))throw new Error('unknown BENCHMARK_SCENARIOS entry');
const protocol={routeId:'R1',seeds,durationSec,holdingStopIds:['S02','S03','S05','S07','S09','S11'],scenarios:scenariosToRun};
const sourceSha256=Object.fromEntries(['engine/world.js','engine/engine.js','engine/bunching.js','engine/operations.js','engine/twin.js','engine/planning.js'].filter(p=>fs.existsSync(p)).map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const scenarios=[];
for(const scenario of protocol.scenarios){
  const start=performance.now();
  const result=runTwin({...protocol,scenario});scenarios.push(result);
  console.log(JSON.stringify({scenario,seeds:seeds.length,seconds:+((performance.now()-start)/1000).toFixed(2),paired:result.paired.map(x=>({strategy:x.strategy,delta:x.deltaPassengerTimeSec.mean,improved:x.improved,worse:x.worse}))}));
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({protocol,sourceSha256,scenarios},null,2));
console.log(`Saved ${output}`);
