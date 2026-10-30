'use strict';
const {spawn}=require('child_process');
const {once}=require('events');
const fs=require('fs');
async function main(){
  const port=18990,base=`http://127.0.0.1:${port}`,output=process.argv[2]||'experiments/http-after.json';
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',OPERATIONS_TOKEN:'benchmark-local',OPENAI_API_KEY:''},stdio:['ignore','ignore','pipe']});
  let logs='';child.stderr.on('data',x=>logs+=x);
  try{
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}
    if(!ready)throw new Error(logs||'server did not start');
    const controller=new AbortController(),stream=await fetch(base+'/api/events?scope=public',{signal:controller.signal});
    const reader=stream.body.getReader(),frames=[];
    const reading=(async()=>{try{let text='';while(true){const {value,done}=await reader.read();if(done)break;text+=Buffer.from(value).toString();let end;while((end=text.indexOf('\n\n'))>=0){if(text.slice(0,end).startsWith('event: state'))frames.push(performance.now());text=text.slice(end+2);}}}catch{}})();
    await new Promise(r=>setTimeout(r,1100));
    const start=performance.now();
    const work=fetch(base+'/api/operations/twin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer benchmark-local'},body:JSON.stringify({seeds:Array.from({length:30},(_,i)=>String(i+1)),durationSec:1800,scenario:'bunching'})});
    await new Promise(r=>setTimeout(r,100));
    const probeStart=performance.now(),health=await fetch(base+'/healthz'),healthLatencyMs=performance.now()-probeStart;
    let response=await work,result=await response.json();
    if(response.status===202){while(['queued','running'].includes(result.status)){await new Promise(r=>setTimeout(r,200));result=await (await fetch(base+'/api/operations/twin')).json();}}
    await new Promise(r=>setTimeout(r,1100));controller.abort();await reading;
    if(result.error)throw new Error(result.error);
    const gaps=frames.slice(1).map((v,i)=>v-frames[i]);
    const report={healthStatus:health.status,healthLatencyMs,maxSseGapMs:gaps.length?Math.max(...gaps):null,sseFrames:frames.length,elapsedMs:performance.now()-start,seeds:30};
    fs.mkdirSync(require('path').dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }finally{child.kill();if(child.exitCode===null)await once(child,'exit');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
