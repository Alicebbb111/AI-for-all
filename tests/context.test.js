'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CachedJsonProvider}=require('../engine/context/http');
const {OpenMeteoProvider,parseHourly,impact}=require('../engine/context/weather');
const {ruleExtract,EventStore,routeImpact,GdeltProvider}=require('../engine/context/events');
const {ContextService}=require('../engine/context/service');
const {ROUTES}=require('../engine/data');
const {Engine}=require('../engine/engine');
const {Operations}=require('../engine/operations');
const {runTwin}=require('../engine/twin');
const {OptionalAiExtractionProvider}=require('../engine/context/extractor');
const {parseManualPayload}=require('../engine/context/manual');

function weatherPayload(overrides={}){return {current:{time:'2026-11-15T18:00',temperature_2m:29,precipitation:4.5,rain:4.5,weather_code:63,wind_speed_10m:12},hourly:{time:['2026-11-15T18:00','2026-11-15T19:00'],temperature_2m:[29,28],precipitation:[4.5,1],precipitation_probability:[80,55],rain:[4.5,1],weather_code:[63,61],wind_speed_10m:[12,10]},...overrides};}
function jsonResponse(value,status=200){return {ok:status>=200&&status<300,status,json:async()=>value};}

test('Open-Meteo normal response maps current and multiple hourly periods',async()=>{
  const client=new CachedJsonProvider({fetchImpl:async()=>jsonResponse(weatherPayload()),minIntervalMs:0,retries:0});
  const result=await new OpenMeteoProvider({client}).route('R1',ROUTES.R1);
  assert.equal(result.status,'available');assert.equal(result.points.length,3);assert.equal(result.current.precipitationProbability,80);assert.equal(result.points[0].hourly.length,2);assert.equal(result.current.weatherImpactLevel,'medium');
});
test('weather timeout produces unavailable and never assumes clear sky',async()=>{
  const client=new CachedJsonProvider({fetchImpl:async()=>{throw new Error('timeout')},minIntervalMs:0,retries:1});
  const result=await new OpenMeteoProvider({client}).route('R1',ROUTES.R1);assert.equal(result.status,'unavailable');assert.equal(result.current,null);assert.match(result.points[0].error,/timeout/);
});
test('incomplete rain data is explicitly unknown',()=>{assert.equal(impact({precipitationMm:null,rainMm:null,weatherCode:null,precipitationProbability:null}).weatherImpactLevel,'unknown');assert.deepEqual(parseHourly({hourly:{time:['x']}})[0].precipitationMm,null);});
test('expired weather cache is returned stale if refresh fails',async()=>{
  let now=0,fail=false;const client=new CachedJsonProvider({now:()=>now,ttlMs:10,minIntervalMs:0,retries:0,fetchImpl:async()=>{if(fail)throw new Error('offline');return jsonResponse(weatherPayload());}}),provider=new OpenMeteoProvider({client});
  await provider.route('R1',ROUTES.R1);now=20;fail=true;const result=await provider.route('R1',ROUTES.R1);assert.equal(result.status,'stale');assert.equal(result.current.weatherCondition,'rain');
});
test('weather samples representative points along the selected route',async()=>{const client=new CachedJsonProvider({fetchImpl:async()=>jsonResponse(weatherPayload()),minIntervalMs:0,retries:0}),r=await new OpenMeteoProvider({client}).route('R2',ROUTES.R2);assert.equal(r.routeId,'R2');assert.notEqual(r.points[0].longitude,r.points[2].longitude);});

test('rule extraction finds a future event without replacing event date by publication date',()=>{const e=ruleExtract({title:'Confirmed Bangkok concert 2026-11-15 18:00',publishedAt:'2026-10-28T10:00:00+07:00'});assert.equal(e.eventDate,'2026-11-15');assert.equal(e.publishedAt,'2026-10-28T03:00:00.000Z');assert.equal(e.eventType,'concert');});
test('article without event date remains needs review and null date',()=>{const e=ruleExtract({title:'Bangkok concert announced today',publishedAt:'2026-10-28T10:00:00+07:00'});assert.equal(e.eventDate,null);assert.equal(e.verificationStatus,'needs_review');});
test('cancelled, postponed and no-road-closure statuses are distinct',()=>{assert.equal(ruleExtract({title:'Concert 2026-11-15 cancelled'}).eventStatus,'cancelled');assert.equal(ruleExtract({title:'Marathon 2026-11-15 postponed'}).eventStatus,'postponed');assert.equal(ruleExtract({title:'Concert 2026-11-15 no road closure'}).eventStatus,'no_road_closure');});
test('duplicate event merges source references',()=>{const s=new EventStore(),base={eventName:'A Concert',eventType:'concert',eventDate:'2026-11-15',eventStatus:'planned',location:'Venue',verificationStatus:'needs_review'};s.upsert({...base,sourceUrl:'https://one.example/a'});const second=s.upsert({...base,sourceUrl:'https://two.example/b'});assert.equal(second.duplicate,true);assert.equal(s.list()[0].sourceReferences.length,2);});
test('unverified place never invents or accepts coordinates',()=>{const e=new EventStore().upsert({eventName:'Possible event',eventType:'public_event',eventDate:null,eventStatus:'possible',location:'Somewhere',latitude:13.7,longitude:100.5,verificationStatus:'needs_review'}).event;assert.equal(e.latitude,null);assert.equal(e.longitude,null);});
test('far event is outside route analysis and near verified closure is confirmed',()=>{const far={eventId:'far',latitude:14.5,longitude:101.5,eventStatus:'planned',roadClosureConfirmed:false,verificationStatus:'verified'},near={...far,eventId:'near',latitude:ROUTES.R1.ROUTE_POINTS[0][0],longitude:ROUTES.R1.ROUTE_POINTS[0][1],roadClosureConfirmed:true};assert.equal(routeImpact(far,'R1',ROUTES.R1).impactLevel,'none');assert.equal(routeImpact(near,'R1',ROUTES.R1).impactLevel,'confirmed');});
test('GDELT outage is an unavailable provider result',async()=>{const client=new CachedJsonProvider({fetchImpl:async()=>{throw new Error('network down')},minIntervalMs:0,retries:0}),r=await new GdeltProvider({client}).articles();assert.equal(r.status,'unavailable');assert.deepEqual(r.articles,[]);});
test('manual CSV import and disabled optional AI remain offline-safe',async()=>{const rows=parseManualPayload({format:'csv',data:'eventName,eventType,eventDate,eventStatus,verificationStatus\n"City, Run",marathon,2026-11-15,planned,needs_review'});assert.equal(rows[0].eventName,'City, Run');const e=await new OptionalAiExtractionProvider().extract({title:'Ambiguous Bangkok activity'});assert.equal(e.aiProvider,'disabled');assert.equal(e.verificationStatus,'needs_review');});

test('weather plus event context enriches prediction without commanding operations',async()=>{
  const weather={route:async()=>({routeId:'R1',status:'available',source:'mock',current:{weatherCondition:'rain',weatherImpactLevel:'medium'},points:[]})},gdelt={articles:async()=>({provider:'mock',status:'unavailable',articles:[]})},service=new ContextService(ROUTES,{weather,gdelt});await service.refreshWeather('R1');service.import({eventName:'Closure',eventType:'road_closure',eventDate:'2026-11-15',eventStatus:'confirmed',roadClosureConfirmed:true,location:'R1',locationVerified:true,latitude:ROUTES.R1.ROUTE_POINTS[0][0],longitude:ROUTES.R1.ROUTE_POINTS[0][1],verificationStatus:'verified',publishedAt:'2026-10-01T00:00:00Z'});
  const e=new Engine({seed:'context'});e.operations=new Operations(e);e.operations.contextService=service;const s=e.operations.snapshot();assert.equal(s.externalContext.weather.status,'available');assert.equal(s.externalContext.advisoryOnly,true);assert.ok(s.predictions.every(p=>p.contextMode==='advisory_only'||p.riskLevel==='unknown'));assert.equal(s.recommendations.some(r=>r.source==='external_context'),false);
});
test('event published after prediction as-of is excluded to prevent future leakage',()=>{const service=new ContextService(ROUTES,{now:()=>Date.parse('2026-10-30T00:00:00Z'),weather:{route:async()=>({status:'not_loaded'})},gdelt:{articles:async()=>({status:'not_loaded',articles:[]})}});service.import({eventName:'Later News',eventType:'road_closure',eventDate:'2026-11-15',eventStatus:'confirmed',roadClosureConfirmed:true,location:'R1',locationVerified:true,latitude:ROUTES.R1.ROUTE_POINTS[0][0],longitude:ROUTES.R1.ROUTE_POINTS[0][1],verificationStatus:'verified',publishedAt:'2026-11-01T00:00:00Z'});assert.equal(service.context('R1','2026-10-30T12:00:00Z').upcomingEvents.length,0);assert.equal(service.context('R1','2026-11-02T12:00:00Z').upcomingEvents.length,1);});
test('context never mutates passenger or GPS telemetry stores',async()=>{const e=new Engine({seed:'isolation'});e.operations=new Operations(e);const before=e.operations.telemetry.revision;const service=new ContextService(ROUTES,{weather:{route:async()=>({routeId:'R1',status:'unavailable',current:null,points:[]})},gdelt:{articles:async()=>({status:'unavailable',articles:[]})}});e.operations.contextService=service;await service.refreshWeather('R1');service.import({eventName:'Review',eventType:'public_event',eventDate:null,eventStatus:'possible',verificationStatus:'needs_review'});e.operations.snapshot();assert.equal(e.operations.telemetry.revision,before);});
test('external-context Digital Twin is deterministic for the same seed',()=>{const options={routeId:'R1',seeds:['weather-seed'],durationSec:120,scenario:'heavy_rain',holdingStopIds:[]},a=runTwin(options),b=runTwin(options);assert.deepEqual(a.results.map(x=>x.totalPassengerTimeSec),b.results.map(x=>x.totalPassengerTimeSec));assert.equal(a.matchedExogenous,true);assert.equal(a.scenarioConfig.external.calibrated,undefined);});
test('context scenarios preserve the same base initial state for a seed',()=>{const a=runTwin({routeId:'R1',seeds:['same-base'],durationSec:120,scenario:'light_rain'}),b=runTwin({routeId:'R1',seeds:['same-base'],durationSec:120,scenario:'large_public_event'});assert.equal(a.results[0].baseInitialStateHash,b.results[0].baseInitialStateHash);assert.equal(a.results[0].externalContextAssumption.calibrated,false);});
test('base scenario remains available without internet, AWS, weather or events',()=>{const result=runTwin({routeId:'R1',seeds:['offline'],durationSec:120,scenario:'normal',holdingStopIds:[]});assert.equal(result.results.length,4);assert.equal(result.matchedExogenous,true);});
