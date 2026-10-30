'use strict';
class CachedJsonProvider {
  constructor({ttlMs=15*60_000,timeoutMs=5000,retries=1,minIntervalMs=1000,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){this.ttlMs=ttlMs;this.timeoutMs=timeoutMs;this.retries=retries;this.minIntervalMs=minIntervalMs;this.fetch=fetchImpl;this.now=now;this.cache=new Map();this.inflight=new Map();this.lastRequestAt=0;}
  async get(key,url,{force=false}={}){
    const cached=this.cache.get(key),age=cached?this.now()-cached.fetchedAt:Infinity;
    if(!force&&cached&&age<this.ttlMs)return {...cached,cache:'hit',stale:false};
    if(this.inflight.has(key))return this.inflight.get(key);
    const work=this.request(key,url,cached).finally(()=>this.inflight.delete(key));this.inflight.set(key,work);return work;
  }
  async request(key,url,cached){
    const wait=Math.max(0,this.minIntervalMs-(this.now()-this.lastRequestAt));if(wait)await new Promise(r=>setTimeout(r,wait));
    let error;
    for(let attempt=0;attempt<=this.retries;attempt++)try{
      this.lastRequestAt=this.now();const response=await this.fetch(url,{headers:{Accept:'application/json','User-Agent':'OmniTransit-Hackathon/1.0'},signal:AbortSignal.timeout(this.timeoutMs)});
      if(!response.ok)throw new Error(`upstream HTTP ${response.status}`);const value=await response.json(),entry={value,fetchedAt:this.now(),sourceUrl:url};this.cache.set(key,entry);return {...entry,cache:'miss',stale:false};
    }catch(e){error=e;if(attempt<this.retries)await new Promise(r=>setTimeout(r,150*(attempt+1)));}
    if(cached)return {...cached,cache:'stale',stale:true,error:error.message};
    return {value:null,fetchedAt:null,cache:'unavailable',stale:true,error:error?.message||'provider unavailable',sourceUrl:url};
  }
}
module.exports={CachedJsonProvider};
