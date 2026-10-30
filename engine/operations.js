'use strict';
const { Telemetry } = require('./telemetry');
const { ROUTES, demandMultiplier, trafficMultiplier, pointAtS } = require('./data');
const worldMod = require('./world');
const { headways, predict, holding, dispatch,MODEL_VERSION } = require('./bunching');
const { evaluator } = require('./planning');
const { randomUUID } = require('crypto');
class Operations {
  constructor(engine) {
    this.engine=engine; this.telemetry=new Telemetry(ROUTES); this.history=new Map(); this.runId=randomUUID();
    this.cache=null; this.sequence=0; this.requests=new Map();
    this.evaluations=new Map();this.policy='combined';
    this.contextService=null;
    // Empty by design: only an operator-approved stop may be used for holding.
    this.allowedStops=(process.env.HOLDING_STOP_IDS||'').split(',').filter(Boolean);
  }
  reset() {this.runId=randomUUID();this.history.clear();this.cache=null;this.requests.clear();this.evaluations.clear();}
  ingest(body,kind) {const result=this.telemetry.ingest(body,kind);this.cache=null;return result;}
  snapshot(mode='simulation',runId=null) {
    if(!['simulation','live','replay'].includes(mode))throw new Error('invalid mode');
    if(mode==='replay'&&!runId)throw new Error('replay requires runId');
    const e=this.engine,w=e.ai,ctx=worldMod.routeCtx();
    const t=mode==='simulation'?w.t:mode==='live'?Date.now()/1000:Math.max(0,...this.telemetry.vehicles(mode,e.routeId,runId).map(v=>v.simTimeSec));
    const key=`${mode}:${runId}:${e.routeId}:${t}:${this.telemetry.revision}:${this.contextService?.revision||0}`;
    if(this.cache?.key===key)return this.cache.data;
    const stops=ctx.STOPS.map(s=>({...s,s:ctx.S.stopS[s.id]}));
    let vehicles;
    if(mode==='simulation') vehicles=w.buses.map(b=>({
      busId:b.id,tripId:String(b.tripNo),routeId:e.routeId,mode,simulationRunId:this.runId,direction:b.dir,
      s:b.pF,...pointAtS(ctx.S,b.pF),
      speedKmh:b.speedKmh || (b.state==='dwell'?w.aiSegSpeed[b.segIndexAt()]:0),
      state:b.state,gpsOk:b.gpsOk,onboardEst:w.publicCrowding(b).onboardEst,
      capacity:b.model.legalMax,remainingDwellSec:Math.max(0,b.dwellUntil-w.t),
      trafficDelayActive:w.trafficFactor(b,e.env)<1,
      etaAt:id=>w.predictSeconds(b,ctx.STOPS.findIndex(s=>s.id===id),'ai') + (b.state==='dwell'?Math.max(0,Math.max(b.dwellUntil,b.operationHoldUntil||0)-w.t):0)
    }));
    else vehicles=this.telemetry.vehicles(mode,e.routeId,runId).map(v=>{
      // Historical flow is an explicitly labelled dwell proxy, never a claim of measured future boarding.
      const dwell=v.lastFlow ? 9+1.3*v.lastFlow.board+0.9*v.lastFlow.alight : null;
      return {...v,dwellEstimateSec:dwell,etaAt:id=>{
        if(!v.speedKmh)return null;
        const target=stops.find(s=>s.id===id);
        const intermediate=stops.filter(s=>v.direction*(s.s-v.s)>1&&v.direction*(target.s-s.s)>1).length;
        const sourceTime=mode==='live'?Date.parse(v.observedAt)/1000:v.simTimeSec;
        return sourceTime-t+Math.max(0,v.direction*(target.s-v.s))/(v.speedKmh/3.6)+intermediate*(dwell??0)*(v.onboardEst!=null&&v.capacity&&v.onboardEst/v.capacity>0.75?1.35:1);
      }};
    });
    const hs=headways(vehicles,stops,t,this.history);
    const externalContext=this.contextService?.context(e.routeId,new Date().toISOString())||null;
    const contextFactors=[];
    if(externalContext?.weather?.current?.weatherCondition==='rain')contextFactors.push('weather_rain_context');
    if(externalContext?.upcomingEvents?.some(x=>x.roadClosureConfirmed))contextFactors.push('confirmed_road_closure_context');
    else if(externalContext?.upcomingEvents?.length)contextFactors.push('nearby_event_context');
    const predictions=hs.map(row=>{
      const front=vehicles.find(v=>v.busId===row.frontBusId);
      const future=row.vehicle.etaAt&&front?.etaAt?stops.filter(s=>row.direction*(s.s-front.s)>1).sort((a,b)=>row.direction*(a.s-b.s)).slice(0,3).map(s=>({stopId:s.id,etaSec:row.vehicle.etaAt(s.id),headwaySec:row.vehicle.etaAt(s.id)-front.etaAt(s.id)})):[];
      const base=predict(row,ctx.HEADWAY,future);return {...base,externalContextUsed:contextFactors,contextMode:'advisory_only',contextVariants:{withoutExternalContext:base.predictedHeadwaySec,withWeatherContext:base.predictedHeadwaySec,withWeatherAndEventContext:base.predictedHeadwaySec,note:'No calibrated numeric adjustment; contexts are explanatory/advisory only'},factors:[...(base.factors||[]),...contextFactors]};
    });
    for(const v of vehicles)if(!predictions.some(p=>p.busId===v.busId))predictions.push({busId:v.busId,riskLevel:'unknown',predictedHeadwaySec:null,estimatedTimeToBunchingSec:null,predictionHorizonSec:0,dataQuality:'insufficient',externalContextUsed:contextFactors,contextMode:'advisory_only',contextVariants:{withoutExternalContext:null,withWeatherContext:null,withWeatherAndEventContext:null,note:'Insufficient operational data; external context does not fill missing headway'},factors:[!v.gpsOk?'gps_stale':'no_common_reference_or_speed',...contextFactors],modelVersion:MODEL_VERSION});
    const recommendations=[],holdingEvaluations=[];
    const evaluate=evaluator(w,{demandScale:e.demandScale??1,env:{...e.env,trafficScale:e.trafficScale??1}});
    for(const row of hs) {
      const b=w.buses.find(x=>x.id===row.busId),stop=mode==='simulation'&&b?.state==='dwell'?ctx.STOPS[b.lastArrival?.stopIdx]:null;
      const visit=`hold:${b?.id}:${b?.tripNo}:${b?.lastArrival?.t}`;
      const eligible=mode==='simulation'&&['holding','combined'].includes(this.policy)&&b?.state==='dwell'&&b.lastHoldingVisit!==visit;
      let result=eligible?this.evaluations.get(visit):null;
      if(!result) {
        result=holding(row,predictions.find(p=>p.busId===row.busId),{allowedStops:this.allowedStops,stopId:stop?.id,targetSec:ctx.HEADWAY,demandPerSec:stop?stop.baseRate*demandMultiplier(t)/60:null,occupancy:row.vehicle.onboardEst,evaluate:eligible?evaluate:null,uncertaintyPeople:b?.sigma||0});
        if(eligible&&result.available)this.evaluations.set(visit,result);
      }
      holdingEvaluations.push({busId:row.busId,...result});
      if(eligible&&result.available&&result.holdSec>0)recommendations.push(this.recommend('holding',mode,t,{busId:row.busId,direction:row.direction,visit,...result}));
    }
    const dispatches=[];
    if(mode==='simulation'&&['dispatch','combined'].includes(this.policy))for(const direction of [1,-1]) {
      const origin=direction===1?ctx.STOPS[0]:ctx.STOPS.at(-1);
      const pr=predictions.filter(p=>hs.find(h=>h.busId===p.busId)?.direction===direction).find(p=>Number.isFinite(p.predictedHeadwaySec));
      const buses=w.buses.filter(b=>b.dir===direction).map(b=>({id:b.id,state:b.state,layoverStartSec:b.stats.layoverStartT,onboardEst:b.onboardEst,availableAfterSec:b.availableAfterSec,pendingOverride:b.operationReleaseAt!=null,baselineReleaseAtSec:b.state==='terminal'?w.releaseTime(b,false):null}));
      const oldest=buses.filter(b=>b.state==='terminal'&&b.layoverStartSec+ctx.ROUTE.minLayoverMin*60<=t&&(b.availableAfterSec||0)<=t&&!b.pendingOverride).sort((a,b)=>a.layoverStartSec-b.layoverStartSec)[0];
      const visit=`dispatch:${oldest?.id}:${oldest?.layoverStartSec}:${Math.floor(t/30)}`;
      let result=this.evaluations.get(visit);
      if(!result){result=dispatch({buses,nowSec:t,targetSec:ctx.HEADWAY,minLayoverSec:ctx.ROUTE.minLayoverMin*60,lastDepartureSec:w.depTimes[String(direction)].at(-1),demandPerSec:origin.baseRate*demandMultiplier(t)/60,predictedHeadwaySec:pr?.predictedHeadwaySec,trafficFactor:trafficMultiplier(t),evaluate});if(result.available)this.evaluations.set(visit,result);}
      dispatches.push({direction,...result});
      if(result.available&&result.action==='dispatch')recommendations.push(this.recommend('dispatch',mode,t,{direction,...result}));
    }
    // A single counterfactual is approved at a time: avoid summing independent plans as if additive.
    recommendations.sort((a,b)=>(b.estimatedGainPassengerSec||0)-(a.estimatedGainPassengerSec||0));
    recommendations.splice(1);
    if(this.evaluations.size>300)this.evaluations.delete(this.evaluations.keys().next().value);
    const data={mode,simulationRunId:mode==='simulation'?this.runId:runId,simulation:mode==='simulation',clockSec:t,limitations:'Baseline algorithm; external context is advisory and not calibrated as causal impact. Live holding/dispatch unavailable until approved stops, demand and terminal readiness are supplied.',externalContext,vehicles:vehicles.map(({etaAt,...v})=>v),headways:hs.map(({vehicle,...row})=>row),predictions,recommendations,holdingEvaluations,dispatches,approvedHoldingStops:this.allowedStops,cameraStatus:mode==='simulation'?'Simulation APC; no camera connected':vehicles.some(v=>v.passenger)?'External aggregate passenger data':'No passenger data'};
    data.decision={action:recommendations[0]?.type||'none',label:recommendations.length?'Operator approval required':'No Intervention',reason:recommendations.length?recommendations[0].reason:'No robust passenger-time improvement established for an eligible action',holdingReasons:[...new Set(holdingEvaluations.map(x=>x.reason))],dispatchReasons:[...new Set(dispatches.map(x=>x.reason))]};
    this.cache={key,data}; return data;
  }
  recommend(type,mode,t,body) {
    const signature=`${mode}:${type}:${body.busId}:${body.stopId||body.direction}`;
    let rec=this.requests.get(signature);
    if(!rec||rec.expiresAtSec<t||rec.status!=='pending') {
      if(rec&&rec.expiresAtSec>=t)return rec;
      rec={id:`OPS${++this.sequence}`,type,mode,createdAtSec:t,expiresAtSec:t+60,status:'pending',...body};this.requests.set(signature,rec);
      if(this.requests.size>300)this.requests.delete(this.requests.keys().next().value);
    }
    return rec;
  }
  decide(id,decision,note) {
    const rec=[...this.requests.values()].find(r=>r.id===id),e=this.engine;
    if(!rec||rec.status!=='pending')return {ok:false,error:'recommendation not pending'};
    if(!['approved','rejected'].includes(decision))return {ok:false,error:'invalid decision'};
    if(e.mode==='stopped'||rec.expiresAtSec<e.ai.t)return {ok:false,error:'stopped or expired recommendation'};
    if(rec.mode!=='simulation')return {ok:false,error:'external operations are advisory only'};
    const b=e.ai.buses.find(x=>x.id===rec.busId);
    if(!b||b.dir!==rec.direction)return {ok:false,error:'vehicle state changed'};
    if(decision==='approved') {
      if(rec.type==='holding') {
        const stop=worldMod.routeCtx().STOPS[b.lastArrival?.stopIdx];
        if(b.state!=='dwell'||stop?.id!==rec.stopId||!this.allowedStops.includes(rec.stopId))return {ok:false,error:'vehicle is no longer at approved holding stop'};
        if(rec.visit&&b.lastHoldingVisit===rec.visit)return {ok:false,error:'holding already applied at this visit'};
        if(rec.estimatedGainPassengerSec!=null&&e.ai.t>rec.createdAtSec){
          const state=this.snapshot(),row=state.headways.find(x=>x.busId===b.id);
          const evaluate=evaluator(e.ai,{demandScale:e.demandScale??1,env:e.env});
          const gain=evaluate(null).cost-evaluate({type:'holding',busId:b.id,holdSec:rec.holdSec}).cost;
          if(!row||row.backHeadwaySec-rec.holdSec<60||gain<=(rec.minimumGainPassengerSec||0))return {ok:false,error:'conditions changed; refresh recommendation'};
        }
        b.operationHoldUntil=Math.max(e.ai.t,b.dwellUntil)+rec.holdSec;
        b.lastHoldingVisit=rec.visit;
      } else {
        const ctx=worldMod.routeCtx();
        if(b.state!=='terminal'||b.stats.layoverStartT+ctx.ROUTE.minLayoverMin*60>e.ai.t||(b.availableAfterSec||0)>e.ai.t||b.operationReleaseAt!=null)return {ok:false,error:'bus not ready or already scheduled'};
        b.operationReleaseAt=Math.max(e.ai.t,rec.releaseAtSec);
      }
    }
    rec.status=decision;this.cache=null;
    e.auditPush('นายท่า',`${decision} ${rec.id}`,`${rec.type} ${rec.busId}; Simulation only; ${String(note||'').slice(0,300)}`);
    return {ok:true,recommendation:rec};
  }
}
module.exports={Operations};
