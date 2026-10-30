'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
test('HTTP integration: old endpoints, SSE, authorization, validation, operations and twin',async(t)=>{
  const child=spawn(process.execPath,['server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'18987',NODE_ENV:'production',TELEMETRY_TOKEN:'ingest-test',OPERATIONS_TOKEN:'ops-test',OPENAI_API_KEY:'',HOLDING_STOP_IDS:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  t.after(async()=>{child.kill();if(child.exitCode===null)await once(child,'exit');});
  const base='http://127.0.0.1:18987';let ready=false;
  for(let i=0;i<80;i++){try{const r=await fetch(base+'/healthz');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}
  assert.ok(ready,logs);
  for(const url of ['/healthz','/api/state?scope=public','/api/routes','/api/route.geo.json','/api/timetable','/api/gtfs-rt','/api/ai/status','/dispatcher.html'])assert.equal((await fetch(base+url)).status,200,url);
  for(const url of ['/api/context/weather?refresh=0','/api/context/events','/api/context/impacts','/api/context/state','/api/context/scenarios'])assert.equal((await fetch(base+url)).status,200,url);
  for(const name of ['headways','predictions','recommendations','copilot','state'])assert.equal((await fetch(base+'/api/operations/'+name)).status,200);
  const post=(url,body,token)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  assert.equal((await post('/api/telemetry/passenger',{})).status,401);
  assert.equal((await post('/api/telemetry/passenger',{},'ingest-test')).status,400);
  assert.equal((await post('/api/control',{action:'rain',value:true})).status,401);
  assert.equal((await post('/api/control',{action:'rain',value:true},'ingest-test')).status,401);
  assert.equal((await post('/api/control',{action:'rain',value:true},'ops-test')).status,200);
  const manualEvent={eventName:'API Test Concert',eventType:'concert',eventDate:'2026-11-15',startTime:'18:00',eventStatus:'planned',location:'Test Venue',verificationStatus:'needs_review',sourceUrl:'https://example.test/event',publishedAt:'2026-10-28T10:00:00+07:00'};
  assert.equal((await post('/api/context/events/manual',manualEvent)).status,401);
  assert.equal((await post('/api/context/events/manual',manualEvent,'ingest-test')).status,401);
  const imported=await post('/api/context/events/manual',manualEvent,'ops-test');assert.equal(imported.status,200);assert.equal((await imported.json()).results.length,1);
  const contextState=await (await fetch(base+'/api/context/state')).json();assert.equal(contextState.upcomingEvents.length,0);assert.equal(contextState.advisoryOnly,true);
  const body={schemaVersion:'1.0',eventId:'api-1',sourceId:'camera',sourceType:'camera',mode:'live',observedAt:new Date().toISOString(),busId:'B01',routeId:'R1',tripId:'trip',direction:1,measurementType:'occupancy',onboard:22};
  assert.equal((await post('/api/telemetry/passenger',body,'ingest-test')).status,200);
  assert.equal((await (await post('/api/telemetry/passenger',body,'ingest-test')).json()).duplicate,true);
  const mock=await require('node:util').promisify(require('node:child_process').execFile)(process.execPath,['scripts/send_mock_telemetry.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,API_URL:base,TELEMETRY_TOKEN:'ingest-test'}});
  const run=mock.stdout.match(/Replay run: (\S+)/)[1];
  const replay=await (await fetch(base+'/api/operations/state?mode=replay&runId='+run)).json();assert.equal(replay.vehicles.length,2);assert.equal(replay.mode,'replay');assert.equal(replay.vehicles.find(v=>v.busId==='B01').onboardEst,40);
  const replayFeed=await fetch(base+'/api/events?scope=public&mode=replay&runId='+run),replayReader=replayFeed.body.getReader();let replayText='';
  for(let i=0;i<3&&!replayText.includes('event: state');i++){const chunk=await replayReader.read();replayText+=Buffer.from(chunk.value).toString();}
  assert.match(replayText,/"mode":"replay"/);await replayReader.cancel();
  const sse=await fetch(base+'/api/events?scope=public');assert.match(sse.headers.get('content-type'),/event-stream/);const reader=sse.body.getReader();const first=await reader.read();assert.match(Buffer.from(first.value).toString(),/state|retry/);await reader.cancel();
  const twin=await post('/api/operations/twin',{seeds:['api'],durationSec:120},'ops-test');assert.equal(twin.status,200);assert.equal((await twin.json()).results.length,4);
});
