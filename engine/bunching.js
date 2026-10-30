'use strict';
const MODEL_VERSION = 'reference-eta-v1.1';
const finite = Number.isFinite;
function headways(vehicles, stops, nowSec, history = new Map()) {
  const rows = [];
  for (const dir of [1, -1]) {
    const group = vehicles.filter(b => b.direction === dir && b.gpsOk && finite(b.s) && finite(b.speedKmh) && b.speedKmh > 0 && !['terminal', 'out', 'broken'].includes(b.state)).sort((a,b) => dir * (b.s - a.s));
    for (let i = 0; i < group.length; i++) {
      const b = group[i], front = group[i - 1], back = group[i + 1];
      const reference = stops.filter(s => dir * (s.s - b.s) > 1 && (!front || dir * (s.s - front.s) > 1)).sort((a,c) => dir * (a.s-c.s))[0];
      if (!reference) continue;
      const observedTime = x => x.observedAt ? (x.mode==='live'?Date.parse(x.observedAt)/1000:x.simTimeSec) : nowSec;
      const eta = x => x.etaAt ? x.etaAt(reference.id) : observedTime(x)-nowSec + Math.max(0, dir * (reference.s - x.s)) / (x.speedKmh / 3.6) + (x.remainingDwellSec || 0) + (x.trafficDelaySec || 0);
      const own = eta(b), frontEta = front ? eta(front) : null;
      const current = finite(frontEta) ? own - frontEta : null;
      const backH = back && dir * (reference.s - back.s) > 0 ? eta(back) - own : null;
      const key = `${b.mode}:${b.simulationRunId || ''}:${b.routeId}:${b.busId}:${b.tripId||''}:${front?.busId || ''}:${dir}:${reference.id}`;
      const samples = history.get(key) || [];
      const sampleTime=Math.max(observedTime(b),front?observedTime(front):observedTime(b));
      const previous = samples.filter(x => x.t < sampleTime).at(-1);
      if (finite(current) && (!samples.length || sampleTime > samples.at(-1).t)) { samples.push({t:sampleTime,h:current}); if(samples.length>120)samples.shift(); history.set(key,samples); }
      const trend = previous && sampleTime > previous.t ? (current - previous.h) / (sampleTime - previous.t) : null;
      rows.push({ busId:b.busId, frontBusId:front?.busId || null, backBusId:back?.busId || null, direction:dir, referenceStopId:reference.id, referenceEtaSec:own, frontHeadwaySec:current, backHeadwaySec:backH, previousHeadwaySec:previous?.h ?? null, trendSecPerSec:trend, sampleCount:samples.length, history:samples.slice(-20), vehicle:b,
        // Mission Control: ระยะห่างจริงเป็นเมตร + สัดส่วนช่องไฟเทียบเป้าหมายอ้างอิง 480 วินาที
        frontGapMeters: front ? Math.max(0, Math.round(dir * (front.s - b.s))) : null,
        backGapMeters: back ? Math.max(0, Math.round(dir * (b.s - back.s))) : null,
        headwayRatio: finite(current) ? +(current / 480).toFixed(2) : null });
    }
  }
  if (history.size > 3000) history.delete(history.keys().next().value);
  return rows;
}
function predict(row, targetSec, future = [], { maxRefEtaSec = 600 } = {}) {
  const horizonSec = Math.min(maxRefEtaSec, Math.max(0, row.referenceEtaSec || 0));
  const factors = [];
  if (!finite(row.frontHeadwaySec) || row.sampleCount < 2 || !finite(row.trendSecPerSec) || !horizonSec || row.referenceEtaSec>maxRefEtaSec) return { busId:row.busId, riskLevel:'unknown', predictedHeadwaySec:null, estimatedTimeToBunchingSec:null, predictionHorizonSec:horizonSec, dataQuality:'insufficient', factors:[row.referenceEtaSec>maxRefEtaSec?'reference_beyond_horizon':'insufficient_headway_history'], modelVersion:MODEL_VERSION };
  const trend = Math.max(-.5, Math.min(.5, row.trendSecPerSec));
  // Headway here is already a future common-stop ETA difference. Do not extrapolate it a second time.
  const projected = Math.max(0,row.frontHeadwaySec);
  const points = [{ headwaySec:projected, etaSec:horizonSec,stopId:row.referenceStopId }, ...future.filter(x => finite(x.headwaySec) && x.etaSec > 0 && x.etaSec <= 600).map(x=>({...x,headwaySec:Math.max(0,x.headwaySec)}))];
  const min = points.reduce((a,b) => b.headwaySec<a.headwaySec?b:a);
  const threshold = targetSec * 0.5;
  if (trend < -0.01) factors.push('headway_decreasing');
  if ((row.vehicle.onboardEst ?? 0) > (row.vehicle.capacity || Infinity)*0.75) factors.push('high_occupancy');
  if (row.vehicle.remainingDwellSec > 0) factors.push('dwell_delay');
  if (row.vehicle.trafficDelaySec > 0 || row.vehicle.trafficDelayActive) factors.push('traffic_delay');
  if (future.length) factors.push('stop_by_stop_passenger_eta');
  if (finite(row.vehicle.dwellEstimateSec)) factors.push('last_flow_dwell_proxy');
  return { busId:row.busId, frontBusId:row.frontBusId, referenceStopId:row.referenceStopId,predictionStopId:min.stopId||row.referenceStopId, predictedReferenceHeadwaySec:projected, currentHeadwaySec:row.frontHeadwaySec, predictedHeadwaySec:min.headwaySec, riskLevel:min.headwaySec < threshold?'high':min.headwaySec < targetSec*0.75?'medium':'low', estimatedTimeToBunchingSec:min.headwaySec<threshold?min.etaSec:null, predictionHorizonSec:min.etaSec, dataQuality:row.vehicle.onboardEst == null?'limited_passenger_data':'synthetic_or_unvalidated', factors, modelVersion:MODEL_VERSION,
    // Mission Control: อัตราบีบอัดช่องไฟ + เวลาถึงจุดวิกฤตเชิงจลน์ศาสตร์ + ดัชนีความรุนแรง + ภาระผู้โดยสาร + แยกย่อยความหน่วง
    headwayCompressionRate: +trend.toFixed(3),
    kinematicTtbSec: trend < -0.02 ? Math.max(0, Math.round((row.frontHeadwaySec - threshold) / (-trend))) : null,
    bunchingSeverityIndex: +Math.min(1, Math.max(0, (Math.abs(targetSec - min.headwaySec) / targetSec) * 0.6 + Math.max(0, -trend) * 0.4)).toFixed(2),
    loadRatio: row.vehicle?.capacity ? +((row.vehicle.onboardEst ?? 0) / row.vehicle.capacity).toFixed(2) : null,
    delayBreakdown: { dwellSec: Math.round(row.vehicle?.remainingDwellSec || row.vehicle?.dwellEstimateSec || 0), trafficSec: Math.round(row.vehicle?.trafficDelaySec || 0), signalSec: Math.round(row.vehicle?.signalDelaySec || 0) } };
}
function holding(row, prediction, { allowedStops = [], stopId, targetSec, demandPerSec, occupancy, maxHoldSec = 180, evaluate, busId=row.busId, uncertaintyPeople=0 } = {}) {
  if (!allowedStops.includes(stopId)) return { available:false, holdSec:0, action:'none',reason:'no_approved_holding_point', candidates:[] };
  if (!finite(occupancy) || !finite(demandPerSec) || !finite(row.frontHeadwaySec) || !finite(row.backHeadwaySec) || !finite(prediction.predictedHeadwaySec)) return { available:false,holdSec:0,action:'none',reason:'insufficient_data',candidates:[] };
  const candidates=[0,30,60,90,120,180].filter(h=>h<=maxHoldSec).map(holdSec=>({holdSec,passengerDelaySec:occupancy*holdSec,frontHeadwayAfterSec:row.frontHeadwaySec+holdSec,backHeadwayAfterSec:row.backHeadwaySec-holdSec,headwayDeviationSec2:(row.frontHeadwaySec+holdSec-targetSec)**2+(row.backHeadwaySec-holdSec-targetSec)**2,safe:holdSec===0||row.backHeadwaySec-holdSec>=60,cost:null}));
  if(!evaluate)return {available:false,holdSec:0,action:'none',reason:'counterfactual_model_unavailable',candidates};
  const baseline=evaluate(null),zero=candidates[0];zero.cost=baseline.cost;
  for(const c of candidates.slice(1))if(c.safe){const result=evaluate({type:'holding',busId,holdSec:c.holdSec});c.cost=result.cost;c.queuePassengerSec=result.queuePassengerSec;c.onboardPassengerSec=result.onboardPassengerSec;}
  const best=candidates.filter(c=>c.safe&&finite(c.cost)).reduce((a,b)=>b.cost<a.cost||(b.cost===a.cost&&a.holdSec>0&&b.headwayDeviationSec2<a.headwayDeviationSec2)?b:a);
  const gain=baseline.cost-best.cost,margin=Math.max(30,occupancy*5,uncertaintyPeople*best.holdSec);
  if(!best.holdSec||gain<=margin)return {available:true,...zero,action:'none',stopId,estimatedGainPassengerSec:0,reason:'no_robust_passenger_time_improvement',candidates};
  // Check a longer horizon and lower/higher demand without seeing actual future RNG/events.
  const checks=[[1200,1],[600,.75],[600,1.25]].map(([horizon,scale])=>({horizonSec:horizon,arrivalScale:scale,gain:evaluate(null,horizon,scale).cost-evaluate({type:'holding',busId,holdSec:best.holdSec},horizon,scale).cost}));
  const robust=checks.every(x=>x.gain>margin);
  return {available:true,...(robust?best:zero),action:robust?'holding':'none',stopId,estimatedGainPassengerSec:robust?gain:0,minimumGainPassengerSec:margin,checks,reason:robust?'robust_total_passenger_time_improvement':'horizon_or_demand_uncertainty',candidates};
}
function dispatch({ buses, nowSec, targetSec, minLayoverSec, lastDepartureSec, demandPerSec, predictedHeadwaySec, trafficFactor = 1, evaluate }) {
  const ready=buses.filter(b=>b.state==='terminal'&&b.layoverStartSec!=null&&b.layoverStartSec+minLayoverSec<=nowSec&&(b.availableAfterSec||0)<=nowSec&&!b.pendingOverride).sort((a,b)=>a.layoverStartSec-b.layoverStartSec);
  if(!ready.length)return {available:false,action:'none',reason:'no_ready_bus',readyCount:0};
  const b=ready[0],baselineAt=b.baselineReleaseAtSec??Math.max(nowSec,lastDepartureSec==null?nowSec:lastDepartureSec+targetSec);
  const earliest=Math.max(nowSec,lastDepartureSec==null?nowSec:lastDepartureSec+360);
  const times=[...new Set([baselineAt,...[0,30,60,90,120,180].map(d=>earliest+d)])].filter(t=>Math.abs(t-baselineAt)<=300);
  const candidates=times.map(releaseAtSec=>({releaseAtSec,delaySec:releaseAtSec-nowSec,cost:null}));
  if(!evaluate)return {available:false,action:'none',reason:'counterfactual_model_unavailable',readyCount:ready.length,releaseAtSec:baselineAt,candidates};
  // Include travel to downstream boarding points: a 10-minute window can value every departure identically.
  const baseline=evaluate(null,1200);for(const c of candidates)c.cost=c.releaseAtSec===baselineAt?baseline.cost:evaluate({type:'dispatch',busId:b.id,releaseAtSec:c.releaseAtSec},1200).cost;
  const best=candidates.reduce((a,c)=>c.cost<a.cost?c:a),gain=baseline.cost-best.cost,margin=Math.max(30,(b.onboardEst??0)*5);
  const checks=best.releaseAtSec===baselineAt||gain<=margin?[]:[[1800,1],[1200,.75],[1200,1.25]].map(([horizon,scale])=>({horizonSec:horizon,arrivalScale:scale,gain:evaluate(null,horizon,scale).cost-evaluate({type:'dispatch',busId:b.id,releaseAtSec:best.releaseAtSec},horizon,scale).cost}));
  const change=checks.length>0&&checks.every(x=>x.gain>margin);
  return {available:true,action:change?'dispatch':'none',reason:change?'robust_total_passenger_time_improvement':'keep_original_dispatch',busId:b.id,readyCount:ready.length,releaseAtSec:change?best.releaseAtSec:baselineAt,delaySec:(change?best.releaseAtSec:baselineAt)-nowSec,baselineReleaseAtSec:baselineAt,estimatedGainPassengerSec:change?gain:0,checks,candidates};
}
module.exports = {headways,predict,holding,dispatch,MODEL_VERSION};
