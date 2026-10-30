'use strict';
const fs=require('fs');
const {runTwin}=require('../engine/twin');
const scenarios=['normal_weather','light_rain','heavy_rain','large_public_event','confirmed_road_closure','rain_public_event'];
const seeds=Array.from({length:Number(process.env.CONTEXT_SEEDS||3)},(_,i)=>`context-${i+1}`),durationSec=Number(process.env.CONTEXT_DURATION||600),runs=[];
for(const scenario of scenarios){const result=runTwin({routeId:'R1',seeds,durationSec,scenario,holdingStopIds:[]});runs.push({scenario,scenarioConfig:result.scenarioConfig,matchedExogenousWithinPolicyComparison:result.matchedExogenous,summary:result.summary,paired:result.paired,results:result.results.map(r=>({seed:r.seed,strategy:r.strategy,baseInitialStateHash:r.baseInitialStateHash,initialStateHash:r.initialStateHash,externalContextAssumption:r.externalContextAssumption,totalPassengerTimeSec:r.totalPassengerTimeSec,bunchingEvents:r.bunchingEvents,interventions:r.interventions}))});}
const sameBase=seeds.every(seed=>new Set(runs.flatMap(x=>x.results.filter(r=>r.seed===seed&&r.strategy==='none').map(r=>r.baseInitialStateHash))).size===1);
const output={generatedAt:new Date().toISOString(),classification:'synthetic scenario experiment; not real-world effectiveness',seeds,durationSec,sameBaseInitialStateAcrossScenarios:sameBase,runs};fs.mkdirSync('experiments',{recursive:true});fs.writeFileSync('experiments/context-scenarios.json',JSON.stringify(output,null,2));console.log(JSON.stringify({scenarios:runs.length,seeds:seeds.length,durationSec,sameBase,output:'experiments/context-scenarios.json'}));
