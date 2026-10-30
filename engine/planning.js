'use strict';
// Finite-horizon counterfactuals reuse World.step, queues, capacity and terminal constraints.
// Forecasts use current observations + expected arrivals, never the experiment's future event tape.
const {demandMultiplier}=require('./data');
const worldMod=require('./world');
function forkObserved(world){
  const fork=Object.assign(Object.create(Object.getPrototypeOf(world)),world);
  fork.buses=world.buses.map(b=>Object.assign(Object.create(Object.getPrototypeOf(b)),b,{
    stats:{...b.stats},lastArrival:b.lastArrival?{...b.lastArrival}:null,
    onboardTrue:Math.max(0,b.onboardEst),brokenUntil:b.state==='broken'?Infinity:b.brokenUntil,
    personalFactor:(b.lastRunningSpeedKmh||world.aiSegSpeed[b.segIndexAt()])/(b.model.baseKmh*Math.max(.05,world.trafficFactor(b,world.lastEnv||{})))
  }));
  fork.queues=new Map([...world.queues].map(([k,q])=>[k,Object.assign(Object.create(Object.getPrototypeOf(q)),{waiting:q.waiting.filter(t=>t<=world.t),now:world.t})]));
  fork.aiSegSpeed=[...world.aiSegSpeed];fork.depTimes={'1':[...world.depTimes['1']],'-1':[...world.depTimes['-1']]};fork.terminalShift={...world.terminalShift};
  // Persist only currently observed congestion; do not read future random slowdown events.
  fork.slowZone=world.slowZone&&world.slowZone.untilT>world.t?{...world.slowZone,untilT:Infinity}:null;
  for(const k of ['arrivalEvents','departureEvents','waits','passUps','incidents','recommendations','headwaySeries','propSamples'])fork[k]=[];
  fork.waitsByStop={};fork.pendingEta=new Map();fork.etaSamples={hist:[],ai:[]};fork.confusion=[[0,0,0],[0,0,0],[0,0,0]];fork.crowdEvents={total:0,serious:0,unknown:0};
  for(const k of ['predictNextStops','finalizeEtaAt','scoreCrowdPrediction','trimWindows','recordHeadway','pushIncident','learnSegment'])fork[k]=()=>{};
  // Expected alighting replaces the actual seed's unobserved visit-specific random draw.
  fork.alightCount=(b)=>{const p=b.pos/worldMod.routeCtx().S.totalLen;return Math.min(b.onboardTrue,Math.round(b.onboardTrue*(p<.15?.05:p<.5?.18:p<.8?.38:.62)));};
  fork.applyApcCount=(b,board,alight)=>{b.onboardEst=Math.max(0,b.onboardEst+board-alight);return {board,alight};};
  return fork;
}
function rollout(world,action,{horizonSec=600,demandScale=1,arrivalScale=1,env=world.lastEnv||{}}={}){
  const fork=forkObserved(world),ctx=worldMod.routeCtx(),carry=new Map(),step=5;
  if(action){const b=fork.buses.find(x=>x.id===action.busId);if(action.type==='holding')b.operationHoldUntil=Math.max(fork.t,b.dwellUntil)+action.holdSec;else b.operationReleaseAt=action.releaseAtSec;}
  let queueTime=0,onboardTime=0;
  for(let elapsed=0;elapsed<horizonSec;elapsed+=step){
    for(const q of fork.queues.values())queueTime+=q.size*step;
    for(const b of fork.buses)onboardTime+=b.onboardTrue*step;
    for(const stop of ctx.STOPS)for(const dir of [1,-1]){
      const k=`${stop.id}:${dir}`,rate=stop.baseRate*(dir===1?.6:.4)*demandMultiplier(fork.t)*(env.rush?1.5:1)*(env.rain?.85:1)*(env.contextDemandFactor??1)*demandScale*arrivalScale/60;
      let count=(carry.get(k)||0)+rate*step;
      while(count>=1){fork.queues.get(k).push(fork.t+step);count--;}
      carry.set(k,count);
    }
    fork.step(step,env);
  }
  return {cost:queueTime+onboardTime,queuePassengerSec:queueTime,onboardPassengerSec:onboardTime,horizonSec,arrivals:fork.arrivalEvents};
}
function evaluator(world,options={}){
  const cached=new Map();
  return (action,horizonSec=600,arrivalScale=1)=>{
    const key=JSON.stringify([action,horizonSec,arrivalScale]);
    if(!cached.has(key))cached.set(key,rollout(world,action,{...options,horizonSec,arrivalScale}));
    return cached.get(key);
  };
}
module.exports={forkObserved,rollout,evaluator};
