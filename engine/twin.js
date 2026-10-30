'use strict';
const {createHash}=require('crypto');
const {Engine}=require('./engine');
const {Operations}=require('./operations');
const worldMod=require('./world');
const SCENARIOS=Object.freeze({normal:{trafficScale:1,demandScale:1},bunching:{trafficScale:1,demandScale:1},traffic_heavy:{trafficScale:.65,demandScale:1},traffic_light:{trafficScale:1.35,demandScale:1},passengers_high:{trafficScale:1,demandScale:1.6},passengers_low:{trafficScale:1,demandScale:.5},late_departure:{trafficScale:1,demandScale:1,departureDelaySec:300},normal_weather:{trafficScale:1,demandScale:1,external:{speedFactor:1,dwellFactor:1,demandFactor:1}},light_rain:{trafficScale:1,demandScale:1,external:{speedFactor:.9,dwellFactor:1.1,demandFactor:1}},heavy_rain:{trafficScale:1,demandScale:1,external:{speedFactor:.72,dwellFactor:1.25,demandFactor:.9}},large_public_event:{trafficScale:1,demandScale:1,external:{speedFactor:.88,dwellFactor:1.1,demandFactor:1.3}},confirmed_road_closure:{trafficScale:1,demandScale:1,external:{speedFactor:.65,dwellFactor:1.15,demandFactor:1}},rain_public_event:{trafficScale:1,demandScale:1,external:{speedFactor:.68,dwellFactor:1.3,demandFactor:1.25}}});
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function distribution(xs){xs=xs.filter(Number.isFinite).sort((a,b)=>a-b);const avg=mean(xs),q=p=>xs.length?xs[Math.floor((xs.length-1)*p)]:null;return {n:xs.length,mean:avg,sd:xs.length?Math.sqrt(mean(xs.map(x=>(x-avg)**2))):null,min:xs[0]??null,p10:q(.1),median:q(.5),p90:q(.9),max:xs.at(-1)??null};}
function validateOptions(options={}){
  const {routeId='R1',seeds=['1','2','3'],durationSec=1800,holdingStopIds=[],scenario='normal'}=options;
  if(!require('./data').ROUTES[routeId])throw new Error('unknown route');
  if(!Array.isArray(seeds)||!seeds.length||seeds.length>100||seeds.some(s=>!['string','number'].includes(typeof s))||new Set(seeds.map(String)).size!==seeds.length)throw new Error('1-100 unique seeds required');
  if(!Number.isInteger(durationSec)||durationSec<120||durationSec>3600||durationSec%5)throw new Error('durationSec must be 120-3600, multiple of 5');
  if(!SCENARIOS[scenario])throw new Error('unknown simulation scenario');
  if(!Array.isArray(holdingStopIds)||holdingStopIds.some(id=>!require('./data').ROUTES[routeId].STOPS.some(s=>s.id===id)))throw new Error('unknown holding stop');
  return {routeId,seeds:seeds.map(String),durationSec,holdingStopIds,scenario};
}
function configure(e,scenario){
  const config=SCENARIOS[scenario],ctx=worldMod.routeCtx();e.trafficScale=config.trafficScale;e.demandScale=config.demandScale;e.externalAssumptions=config.external?{...config.external,scenario,classification:'simulation_assumption',calibrated:false}:null;e.ai.policy='baseline';e.autoApprove=false;
  for(const w of [e.ai,e.baseline]){
    if(scenario==='bunching'){
      const follower=w.buses[1],front=w.buses[2],s=ctx.S.stopS[ctx.STOPS[1].id];follower.pF=Math.max(0,s-650);front.pF=Math.max(0,s-50);front.dir=follower.dir=1;front.personalFactor*=.65;
      for(const b of [follower,front]){b.nextStopIdx=b.findNextStopIdx();b.lastSegIdx=b.segIndexAt();b.lastSegT=w.t;}
    }
    if(config.departureDelaySec){const b=w.buses[0];b.state='terminal';b.dir=1;b.pF=0;b.onboardTrue=b.onboardEst=0;b.stats.layoverStartT=w.t-ctx.ROUTE.minLayoverMin*60;b.availableAfterSec=w.t+config.departureDelaySec;b.nextStopIdx=1;w.depTimes['1']=[w.t-ctx.HEADWAY];}
  }
}
function runTwin(options={},onProgress=()=>{}){
  const {routeId,seeds,durationSec,holdingStopIds,scenario}=validateOptions(options),original=worldMod.routeCtx().ROUTE.id,results=[];
  try{
    for(const seed of seeds)for(const strategy of ['none','holding','dispatch','combined']){
      const e=new Engine({seed,routeId});configure(e,scenario);e.operations=new Operations(e);e.operations.allowedStops=holdingStopIds;e.operations.policy=strategy;
      const w=e.ai,ctx=worldMod.routeCtx();
      const baseInitialState={buses:w.buses.map(b=>({id:b.id,s:b.pF,dir:b.dir,load:b.onboardTrue,personalFactor:b.personalFactor,state:b.state,ready:b.availableAfterSec,rest:b.stats.layoverStartT})),queues:[...w.queues].map(([k,q])=>[k,q.waiting]),speeds:w.aiSegSpeed};
      const baseInitialStateHash=createHash('sha256').update(JSON.stringify(baseInitialState)).digest('hex');
      const initialStateHash=createHash('sha256').update(JSON.stringify({...baseInitialState,config:SCENARIOS[scenario]})).digest('hex');
      const tape=createHash('sha256');let arrivalCount=0;e.onExogenous=(kind,event)=>{tape.update(JSON.stringify([kind,event]));if(kind==='arrival'&&event.t<=7*3600+durationSec)arrivalCount++;};
      let waitingTime=0,onboardTime=0,holdDelay=0,bunchingEvents=0,eventIndex=0,departureIndex=0,headwayValues=[],errors=[],leadTimes=[];
      const active=new Set(),lastPass=new Map(),holds=new Set(),dispatches=new Map(),forecasts=new Map(),warnings=new Map(),actionLog=[];
      const classification={truePositive:0,falsePositive:0,falseNegative:0,trueNegative:0,uncoveredEvents:0,uncoveredPositive:0},initialOnboard=w.buses.reduce((a,b)=>a+b.onboardTrue,0);
      const riskClassification={truePositive:0,falsePositive:0,falseNegative:0,trueNegative:0,uncoveredEvents:0,uncoveredPositive:0},riskErrors=[],riskLeadTimes=[];
      for(let elapsed=0;elapsed<durationSec;elapsed+=5){
        const ops=e.operations.snapshot();
        for(const r of ops.recommendations){
          const b=w.buses.find(x=>x.id===r.busId);if(r.status!=='pending'||!b)continue;
          if(r.type==='holding'&&['holding','combined'].includes(strategy)){
            const key=`${b.id}:${b.lastArrival?.t}`;
            if(!holds.has(key)&&e.operations.decide(r.id,'approved','Digital Twin experiment').ok){holds.add(key);actionLog.push({type:'holding',busId:b.id,stopId:r.stopId,t:w.t,holdSec:r.holdSec,estimatedGain:r.estimatedGainPassengerSec??null});}
          }
          if(r.type==='dispatch'&&['dispatch','combined'].includes(strategy)){
            const key=`${b.id}:${b.stats.layoverStartT}`;
            if(!dispatches.has(key)){const baselineReleaseAtSec=w.releaseTime(b,false);if(e.operations.decide(r.id,'approved','Digital Twin experiment').ok)dispatches.set(key,{busId:b.id,baselineReleaseAtSec,requestedAtSec:r.releaseAtSec});}
          }
        }
        for(const p of ops.predictions){const row=ops.headways.find(h=>h.busId===p.busId),b=w.buses.find(x=>x.id===p.busId);if(row&&b&&Number.isFinite(p.predictedReferenceHeadwaySec)){const key=`${b.id}:${b.tripNo}:${row.referenceStopId}`;if(!forecasts.has(key))forecasts.set(key,{...p,t:w.t,dir:b.dir});const riskKey=`${b.id}:${b.tripNo}:${p.predictionStopId}`;if(p.predictionStopId&&!warnings.has(riskKey))warnings.set(riskKey,{...p,t:w.t,dir:b.dir});}}
        for(const b of w.buses){onboardTime+=b.onboardTrue*5;if(b.operationHoldUntil>w.t&&w.t>=b.dwellUntil)holdDelay+=b.onboardTrue*Math.min(5,b.operationHoldUntil-w.t);}
        for(const q of w.queues.values())waitingTime+=q.size*5;
        e.simSpeed=5;e.tick();
        for(const event of w.arrivalEvents.slice(eventIndex)){
          const key=`${event.dir}:${event.stopId}`,previous=lastPass.get(key);
          if(previous&&previous.busId!==event.busId){
            const gap=event.t-previous.t;headwayValues.push(gap);const pair=`${previous.busId}:${event.busId}:${event.dir}`,actualPositive=gap<ctx.HEADWAY*.5;
            if(actualPositive&&!active.has(pair)){bunchingEvents++;active.add(pair);}if(!actualPositive)active.delete(pair);
            const forecast=forecasts.get(`${event.busId}:${event.tripNo}:${event.stopId}`),covered=forecast&&forecast.frontBusId===previous.busId&&forecast.t<previous.t&&event.t-forecast.t>=30;
            if(covered){const predicted=forecast.predictedReferenceHeadwaySec,positive=predicted<ctx.HEADWAY*.5;errors.push(Math.abs(predicted-gap));classification[positive?(actualPositive?'truePositive':'falsePositive'):(actualPositive?'falseNegative':'trueNegative')]++;if(positive&&actualPositive)leadTimes.push(event.t-forecast.t);}
            else{classification.uncoveredEvents++;if(actualPositive){classification.falseNegative++;classification.uncoveredPositive++;}}
            const warning=warnings.get(`${event.busId}:${event.tripNo}:${event.stopId}`);
            const warningCovered=warning&&warning.frontBusId===previous.busId&&warning.t<previous.t&&event.t-warning.t>=30;
            if(warningCovered){const positive=warning.riskLevel==='high';riskErrors.push(Math.abs(warning.predictedHeadwaySec-gap));riskClassification[positive?(actualPositive?'truePositive':'falsePositive'):(actualPositive?'falseNegative':'trueNegative')]++;if(positive&&actualPositive)riskLeadTimes.push(event.t-warning.t);}
            else{riskClassification.uncoveredEvents++;if(actualPositive){riskClassification.falseNegative++;riskClassification.uncoveredPositive++;}}
          }
          lastPass.set(key,event);forecasts.delete(`${event.busId}:${event.tripNo}:${event.stopId}`);warnings.delete(`${event.busId}:${event.tripNo}:${event.stopId}`);
        }
        eventIndex=w.arrivalEvents.length;
        for(const departure of w.departureEvents.slice(departureIndex)){
          const request=[...dispatches.values()].find(x=>x.busId===departure.busId&&x.requestedAtSec===departure.requestedAtSec&&!x.departed);
          if(request){request.departed=true;if(Math.abs(departure.t-request.baselineReleaseAtSec)>=5)actionLog.push({type:'dispatch',busId:departure.busId,t:departure.t,baselineReleaseAtSec:request.baselineReleaseAtSec});}
        }
        departureIndex=w.departureEvents.length;
      }
      const avg=mean(headwayValues),ha=actionLog.filter(x=>x.type==='holding'),da=actionLog.filter(x=>x.type==='dispatch');
      const riskPrediction={...riskClassification,precision:riskClassification.truePositive+riskClassification.falsePositive?riskClassification.truePositive/(riskClassification.truePositive+riskClassification.falsePositive):null,recall:riskClassification.truePositive+riskClassification.falseNegative?riskClassification.truePositive/(riskClassification.truePositive+riskClassification.falseNegative):null,leadTimeSec:distribution(riskLeadTimes),maeSec:mean(riskErrors),samples:riskErrors.length,unresolvedForecasts:warnings.size};
      results.push({seed,strategy,scenario,mode:'simulation',durationSec,baseInitialStateHash,initialStateHash,externalContextAssumption:SCENARIOS[scenario].external?{...SCENARIOS[scenario].external,classification:'simulation_assumption',calibrated:false}:null,exogenousHash:tape.digest('hex'),exogenousArrivalCount:arrivalCount,averagePassengerWaitingTimeSec:mean(w.waits.map(x=>x.waitSec)),waitingPassengerTimeSec:waitingTime,onboardPassengerTimeSec:onboardTime,headwayVarianceSec2:avg==null?null:mean(headwayValues.map(x=>(x-avg)**2)),bunchingEvents,averageOnboardDelaySec:initialOnboard+w.boardedTotal?holdDelay/(initialOnboard+w.boardedTotal):null,totalPassengerTimeSec:waitingTime+onboardTime,holdingPassengerDelaySec:holdDelay,predictionMaeSec:mean(errors),predictionSamples:errors.length,prediction:{...classification,precision:classification.truePositive+classification.falsePositive?classification.truePositive/(classification.truePositive+classification.falsePositive):null,recall:classification.truePositive+classification.falseNegative?classification.truePositive/(classification.truePositive+classification.falseNegative):null,leadTimeSec:distribution(leadTimes),unresolvedForecasts:forecasts.size},passengersServed:w.paxServed,holdActions:ha.length,dispatchActions:da.length,dispatchApprovals:dispatches.size,interventions:actionLog.length,averageHoldingDurationSec:mean(ha.map(x=>x.holdSec)),actionLog});
      onProgress({completed:results.length,total:seeds.length*4,seed,strategy});
      results.at(-1).riskPrediction=riskPrediction;
    }
  }finally{worldMod.initRoute(original);}
  const metrics=['averagePassengerWaitingTimeSec','totalPassengerTimeSec','averageOnboardDelaySec','headwayVarianceSec2','bunchingEvents','interventions','averageHoldingDurationSec','predictionMaeSec'];
  const summary=['none','holding','dispatch','combined'].map(strategy=>({strategy,...Object.fromEntries(metrics.map(k=>[k,distribution(results.filter(r=>r.strategy===strategy).map(r=>r[k]))]))}));
  const paired=['holding','dispatch','combined'].map(strategy=>{const deltas=seeds.map(seed=>results.find(r=>r.seed===seed&&r.strategy===strategy).totalPassengerTimeSec-results.find(r=>r.seed===seed&&r.strategy==='none').totalPassengerTimeSec);return {strategy,deltaPassengerTimeSec:distribution(deltas),improved:deltas.filter(x=>x<0).length,worse:deltas.filter(x=>x>0).length,unchanged:deltas.filter(x=>x===0).length};});
  const matchedExogenous=seeds.every(seed=>new Set(results.filter(r=>r.seed===seed).map(r=>r.initialStateHash+':'+r.exogenousHash)).size===1);
  if(!matchedExogenous)throw new Error('experiment arms do not share identical initial/exogenous inputs');
  return {mode:'simulation',scenario,scenarioConfig:SCENARIOS[scenario],matchedExogenous,results,summary,paired,limitations:['Synthetic demand and traffic; no real-world validation','Waiting mean is for boarded passengers; total passenger time includes unfinished queue/onboard exposure','Prediction scores use forecasts saved before actual passage; uncovered positives count as missed detections','Prediction and passenger outcomes at the end of the experiment are censored','No guarantee of improvement; negative paired deltas mean improvement']};
}
module.exports={runTwin,validateOptions,SCENARIOS,distribution,configure};
