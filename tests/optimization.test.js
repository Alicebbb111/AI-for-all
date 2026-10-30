'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Engine}=require('../engine/engine');
const {Operations}=require('../engine/operations');
const {holding,dispatch,predict}=require('../engine/bunching');
const {rollout,forkObserved}=require('../engine/planning');
const {runTwin,validateOptions,configure}=require('../engine/twin');
const {TwinJobs}=require('../engine/twin-service');
const row={busId:'B01',frontHeadwaySec:100,backHeadwaySec:500};
const prediction={predictedHeadwaySec:100};
const opts={allowedStops:['S02'],stopId:'S02',targetSec:480,demandPerSec:.2,occupancy:20};
test('No Intervention retained even when the back bus is already too close',()=>{
  const r=holding({...row,backHeadwaySec:20},prediction,{...opts,evaluate:()=>({cost:1000})});
  assert.equal(r.action,'none');assert.equal(r.holdSec,0);assert.ok(r.candidates.find(c=>c.holdSec===0).safe);
});
test('headway regularity cannot outweigh an increase in passenger time',()=>{
  const r=holding(row,prediction,{...opts,evaluate:action=>({cost:1000+(action?.holdSec||0)*20})});
  assert.equal(r.action,'none');assert.equal(r.cost,1000);
});
test('holding selected only for robust passenger time improvement',()=>{
  const r=holding(row,prediction,{...opts,evaluate:action=>({cost:10000-(action?.holdSec||0)*10})});
  assert.equal(r.action,'holding');assert.equal(r.holdSec,180);assert.equal(r.passengerDelaySec,3600);assert.ok(r.checks.every(x=>x.gain>0));
});
test('longer horizon can veto a short-term holding gain',()=>{
  const r=holding(row,prediction,{...opts,evaluate:(action,horizon=600)=>({cost:10000+(action?(horizon>600?1000:-2000):0)})});
  assert.equal(r.action,'none');assert.equal(r.reason,'horizon_or_demand_uncertainty');
});
test('demand uncertainty can veto holding',()=>{
  const r=holding(row,prediction,{...opts,evaluate:(action,horizon=600,scale=1)=>({cost:10000+(action?(scale<1?2000:-2000):0)})});
  assert.equal(r.action,'none');
});
test('unsafe holding points never invoke forward simulation',()=>{
  const r=holding(row,prediction,{...opts,allowedStops:[],evaluate:()=>{throw new Error('unsafe rollout');}});assert.equal(r.available,false);
});
test('holding never shrinks following headway below its safety bound',()=>{
  const r=holding({...row,backHeadwaySec:100},prediction,{...opts,evaluate:a=>({cost:10000-(a?.holdSec||0)*100})});
  assert.ok(r.holdSec<=40);assert.ok(r.backHeadwayAfterSec>=60);
});
test('missing observations or counterfactual model cause explicit abstention',()=>{
  assert.equal(holding(row,prediction,{...opts,occupancy:null}).available,false);
  assert.equal(holding(row,prediction,opts).reason,'counterfactual_model_unavailable');
});
test('queue cannot board passengers before their observation time',()=>{
  const e=new Engine(),q=e.ai.queues.values().next().value;q.waiting=[];q.now=e.ai.t;q.push(e.ai.t+30);
  assert.equal(q.size,0);assert.deepEqual(q.take(10,e.ai.t),[]);q.now+=30;assert.equal(q.size,1);assert.deepEqual(q.take(1,q.now),[0]);
});
test('demand scheduled in advance remains unavailable until arrival',()=>{
  const e=new Engine({seed:'1'});e.generateDemand();for(const q of e.ai.queues.values())assert.ok(q.take(q.size,e.ai.t).every(w=>w>=0));
});
test('visit-specific random alighting does not change with policy-induced time shift',()=>{
  const e=new Engine({seed:'shared'}),b=e.ai.buses[0];b.onboardTrue=50;b.pF=6000;const a=e.ai.alightCount(b,3);e.ai.t+=500;assert.equal(e.ai.alightCount(b,3),a);
});
test('forecast strips known future arrivals and does not mutate the real world',()=>{
  const e=new Engine(),before=rollout(e.ai,null,{horizonSec:60,arrivalScale:0});
  const q=e.ai.queues.values().next().value;q.push(e.ai.t+20);
  const after=rollout(e.ai,null,{horizonSec:60,arrivalScale:0});assert.equal(before.cost,after.cost);assert.equal(q.waiting.at(-1),e.ai.t+20);assert.equal(e.ai.t,25200);
});
test('forecast uses passenger observations instead of hidden synthetic truth',()=>{
  const e=new Engine(),a=rollout(e.ai,null,{horizonSec:60});e.ai.buses.forEach(b=>{b.onboardTrue+=40;});const b=rollout(e.ai,null,{horizonSec:60});assert.equal(a.cost,b.cost);
});
test('forecast does not draw from the real future seed',()=>{
  const e=new Engine(),a=rollout(e.ai,null,{horizonSec:120});e.ai.seed='secret future RNG changed';const b=rollout(e.ai,null,{horizonSec:120});assert.equal(a.cost,b.cost);
});
test('observed World fork preserves bus and queue prototypes and independent state',()=>{
  const e=new Engine(),fork=forkObserved(e.ai);assert.equal(typeof fork.buses[0].distanceToStop,'function');fork.buses[0].onboardTrue=0;assert.notEqual(e.ai.buses[0].onboardTrue,0);fork.queues.values().next().value.waiting=[];assert.ok(e.ai.queues.values().next().value.size>0);
});
test('forecast and actual World stepping agree when no unobserved arrivals or alighting occur',()=>{
  const e=new Engine(),w=e.ai;w.buses=w.buses.slice(0,1);const b=w.buses[0];b.onboardTrue=b.onboardEst=20;
  const predicted=rollout(w,null,{horizonSec:20,arrivalScale:0});let cost=0;for(let i=0;i<4;i++){cost+=(w.buses.reduce((a,b)=>a+b.onboardTrue,0)+[...w.queues.values()].reduce((a,q)=>a+q.size,0))*5;w.step(5,{});}assert.equal(cost,predicted.cost);
});
test('prediction does not extrapolate an already predicted ETA headway twice',()=>{
  const r=predict({busId:'b',frontHeadwaySec:300,trendSecPerSec:-1,sampleCount:10,referenceEtaSec:500,vehicle:{onboardEst:20}},480);
  assert.equal(r.predictedReferenceHeadwaySec,300);assert.equal(r.riskLevel,'medium');
});
test('prediction never exposes negative headways as waiting intervals',()=>{
  const r=predict({busId:'b',frontHeadwaySec:-100,trendSecPerSec:-1,sampleCount:10,referenceEtaSec:200,vehicle:{}},480);assert.equal(r.predictedReferenceHeadwaySec,0);
});
test('dispatch retains baseline when no candidate saves passenger time',()=>{
  const r=dispatch({buses:[{id:'b',state:'terminal',layoverStartSec:0,baselineReleaseAtSec:900}],nowSec:600,targetSec:480,minLayoverSec:360,lastDepartureSec:200,evaluate:()=>({cost:1000})});assert.equal(r.action,'none');assert.equal(r.releaseAtSec,900);
});
test('dispatch honors unavailable vehicles and pending release reservations',()=>{
  for(const extra of [{availableAfterSec:800},{pendingOverride:true}]){const r=dispatch({buses:[{id:'b',state:'terminal',layoverStartSec:0,...extra}],nowSec:600,minLayoverSec:360});assert.equal(r.reason,'no_ready_bus');}
});
test('dispatch compares downstream passenger time over more than the first stop travel time',()=>{
  const r=dispatch({buses:[{id:'b',state:'terminal',layoverStartSec:0,baselineReleaseAtSec:900}],nowSec:600,targetSec:480,minLayoverSec:360,lastDepartureSec:0,evaluate:(action,horizon)=>({cost:10000-(action&&horizon>=1200?(900-action.releaseAtSec)*10:0)})});assert.equal(r.action,'dispatch');assert.ok(r.releaseAtSec>=360);assert.ok(r.releaseAtSec>=600);
});
test('30 unique seeds are supported, duplicated seeds rejected',()=>{assert.equal(validateOptions({seeds:Array.from({length:30},(_,i)=>String(i))}).seeds.length,30);assert.throws(()=>validateOptions({seeds:['1','1']}),/unique/);});
test('matched exogenous tapes and initial states are verified for every policy',()=>{
  const r=runTwin({seeds:['check'],durationSec:600,scenario:'late_departure'});assert.equal(r.matchedExogenous,true);assert.equal(new Set(r.results.map(x=>x.exogenousHash)).size,1);assert.equal(new Set(r.results.map(x=>x.initialStateHash)).size,1);assert.equal(r.summary.length,4);
});
test('worker permits event-loop progress and never changes the interactive route state',async()=>{
  const e=new Engine({routeId:'R3'}),before=e.ai.buses.map(b=>b.pF),jobs=new TwinJobs();const work=jobs.run({routeId:'R1',seeds:['a','b','c','d','e','f'],durationSec:600});
  await new Promise(r=>setImmediate(r));assert.equal(jobs.active,true);await assert.rejects(()=>jobs.run({seeds:['other'],durationSec:120}),/already running/);
  const result=await work;assert.equal(result.status,'complete');assert.deepEqual(e.ai.buses.map(b=>b.pF),before);assert.equal(require('../engine/world').routeCtx().ROUTE.id,'R3');
});
test('prediction misses and uncovered positive events are included in recall',()=>{
  const r=runTwin({seeds:['score'],durationSec:900,scenario:'bunching'}).results[0],p=r.prediction;
  assert.ok(p.falseNegative>=p.uncoveredPositive);if(p.truePositive+p.falseNegative)assert.equal(p.recall,p.truePositive/(p.truePositive+p.falseNegative));
});
