'use strict';
// Optional live smoke test. Not part of npm test and never required for offline operation.
const fs=require('fs');
const {OpenMeteoProvider}=require('../engine/context/weather');
const {GdeltProvider}=require('../engine/context/events');
const {ROUTES}=require('../engine/data');
(async()=>{
  const startedAt=new Date().toISOString(),weather=await new OpenMeteoProvider().route('R1',ROUTES.R1,{force:true}),events=await new GdeltProvider().articles({force:true});
  const result={startedAt,finishedAt:new Date().toISOString(),weather:{status:weather.status,source:weather.source,lastUpdated:weather.lastUpdated,current:weather.current,points:weather.points.map(p=>({latitude:p.latitude,longitude:p.longitude,status:p.status,error:p.error}))},gdelt:{status:events.status,provider:events.provider,lastUpdated:events.lastUpdated,error:events.error,articleCount:events.articles.length,sample:events.articles.slice(0,3).map(a=>({title:a.title,url:a.url,seendate:a.seendate}))}};
  fs.mkdirSync('experiments',{recursive:true});fs.writeFileSync('experiments/context-live.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
