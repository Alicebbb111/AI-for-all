'use strict';
const {parentPort,workerData}=require('worker_threads');
try {
  const result=require('./twin').runTwin(workerData,progress=>parentPort.postMessage({type:'progress',progress}));
  parentPort.postMessage({type:'result',result});
}catch(error){parentPort.postMessage({type:'error',error:error.message});}
