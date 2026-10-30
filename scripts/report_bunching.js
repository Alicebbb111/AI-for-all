'use strict';
const fs=require('fs');
const path=require('path');

const beforePath=process.argv[2]||'experiments/before.json';
const afterPath=process.argv[3]||'experiments/after.json';
const outPath=process.argv[4]||'experiments/optimization-summary.json';
const before=JSON.parse(fs.readFileSync(beforePath));
const after=JSON.parse(fs.readFileSync(afterPath));
const policies=['none','holding','dispatch','combined'];
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const distribution=xs=>{xs=xs.filter(Number.isFinite).sort((a,b)=>a-b);const m=mean(xs),q=p=>xs.length?xs[Math.floor((xs.length-1)*p)]:null;return {n:xs.length,mean:m,sd:xs.length?Math.sqrt(mean(xs.map(x=>(x-m)**2))):null,min:xs[0]??null,p10:q(.1),median:q(.5),p90:q(.9),max:xs.at(-1)??null};};
const flat=data=>data.scenarios.flatMap(x=>x.results);
function summarize(data){
  const rows=flat(data);
  const metrics=['averagePassengerWaitingTimeSec','totalPassengerTimeSec','averageOnboardDelaySec','headwayVarianceSec2','bunchingEvents','interventions','averageHoldingDurationSec'];
  const overall=Object.fromEntries(policies.map(p=>[p,Object.fromEntries(metrics.map(k=>[k,distribution(rows.filter(r=>r.strategy===p).map(r=>r[k]))]))]));
  const scenarios=Object.fromEntries(data.scenarios.map(s=>[s.scenario,{policies:Object.fromEntries(policies.map(p=>[p,Object.fromEntries(metrics.map(k=>[k,distribution(s.results.filter(r=>r.strategy===p).map(r=>r[k]))]))])),paired:s.paired}]));
  return {overall,scenarios};
}
function prediction(data,key='riskPrediction'){
  const rows=flat(data).filter(r=>r.strategy==='none'),totals={truePositive:0,falsePositive:0,falseNegative:0,trueNegative:0,uncoveredEvents:0,uncoveredPositive:0,samples:0,absoluteErrorSec:0,leadCount:0,leadSumSec:0};
  for(const r of rows){const p=key==='prediction'?r.prediction:r[key];if(!p)continue;for(const k of ['truePositive','falsePositive','falseNegative','trueNegative','uncoveredEvents','uncoveredPositive'])totals[k]+=p[k]||0;const n=key==='prediction'?(r.predictionSamples||0):(p.samples||0),mae=key==='prediction'?r.predictionMaeSec:p.maeSec;totals.samples+=n;if(Number.isFinite(mae))totals.absoluteErrorSec+=mae*n;const lead=p.leadTimeSec;if(lead?.n){totals.leadCount+=lead.n;totals.leadSumSec+=lead.mean*lead.n;}}
  totals.precision=totals.truePositive+totals.falsePositive?totals.truePositive/(totals.truePositive+totals.falsePositive):null;
  totals.recall=totals.truePositive+totals.falseNegative?totals.truePositive/(totals.truePositive+totals.falseNegative):null;
  totals.maeSec=totals.samples?totals.absoluteErrorSec/totals.samples:null;totals.meanLeadTimeSec=totals.leadCount?totals.leadSumSec/totals.leadCount:null;return totals;
}
function matching(){
  const failures=[];
  for(const a of after.scenarios){const b=before.scenarios.find(x=>x.scenario===a.scenario);for(const r of a.results){const old=b?.results.find(x=>x.seed===r.seed&&x.strategy===r.strategy);if(!old||old.initialStateHash!==r.initialStateHash||old.exogenousHash!==r.exogenousHash)failures.push(`${a.scenario}:${r.seed}:${r.strategy}`);}}
  return {checked:flat(after).length,matched:failures.length===0,failures};
}
const result={generatedAt:new Date().toISOString(),protocol:after.protocol,matching:matching(),before:summarize(before),after:summarize(after),prediction:{referenceBefore:prediction(before,'prediction'),referenceAfter:prediction(after,'prediction'),displayedRiskAfter:prediction(after,'riskPrediction')},responsiveness:{before:JSON.parse(fs.readFileSync('experiments/http-before.json')),after:JSON.parse(fs.readFileSync('experiments/http-after.json'))}};
fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,JSON.stringify(result,null,2));
console.log(JSON.stringify({output:outPath,matching:result.matching,prediction:result.prediction,afterOverall:result.after.overall},null,2));
