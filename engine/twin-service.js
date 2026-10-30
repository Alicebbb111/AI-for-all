'use strict';
const {Worker}=require('worker_threads');
const path=require('path');
const {validateOptions}=require('./twin');
class TwinJobs {
  constructor(){this.active=false;this.latest={mode:'simulation',status:'idle',results:[],note:'No experiment run yet'};}
  async run(raw){
    const options=validateOptions(raw);
    if(this.active){const error=new Error('an experiment is already running');error.status=409;throw error;}
    this.active=true;this.latest={mode:'simulation',status:'running',progress:{completed:0,total:options.seeds.length*4},results:[]};
    try {
      const result=await new Promise((resolve,reject)=>{
        const worker=new Worker(path.join(__dirname,'twin-worker.js'),{workerData:options});let done=false;
        const timer=setTimeout(()=>{worker.terminate();reject(new Error('experiment exceeded 180 seconds'));},180000);timer.unref();
        const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(result);};
        worker.on('message',message=>{if(message.type==='progress')this.latest.progress=message.progress;else if(message.type==='result')finish(null,message.result);else if(message.type==='error')finish(new Error(message.error));});
        worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!done)finish(new Error(`experiment worker exited (${code})`));});
      });
      this.latest={...result,status:'complete'};return this.latest;
    }catch(error){this.latest={mode:'simulation',status:'failed',error:error.message,results:[]};throw error;}
    finally{this.active=false;}
  }
}
module.exports={TwinJobs};
