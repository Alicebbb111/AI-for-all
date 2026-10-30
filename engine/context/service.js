'use strict';
const {OpenMeteoProvider}=require('./weather');
const {GdeltProvider,EventStore,ruleExtract,routeImpact}=require('./events');
class ContextService {
  constructor(routes,{weather,gdelt,now=()=>Date.now()}={}){this.routes=routes;this.weatherProvider=weather||new OpenMeteoProvider();this.gdelt=gdelt||new GdeltProvider();this.store=new EventStore();this.now=now;this.revision=0;this.weatherByRoute=new Map();this.newsStatus={provider:'gdelt-doc-2.0',status:'not_loaded',articles:[],lastUpdated:null};}
  async refreshWeather(routeId,{force=false}={}){const route=this.routes[routeId];if(!route)throw new Error('unknown route');const result=await this.weatherProvider.route(routeId,route,{force});this.weatherByRoute.set(routeId,result);this.revision++;return result;}
  weather(routeId){return this.weatherByRoute.get(routeId)||{routeId,source:'open-meteo',status:'not_loaded',lastUpdated:null,points:[],current:null};}
  import(raw){const result=this.store.upsert({...raw,provider:raw.provider||'manual'});this.revision++;return result;}
  async refreshEvents({force=false}={}){const result=await this.gdelt.articles({force});this.newsStatus=result;for(const a of result.articles){const e=ruleExtract({title:a.title,text:a.title,url:a.url,seendate:a.seendate,publishedAt:a.seendate,provider:'gdelt'});if(e.eventType!=='other_traffic_disruption')this.store.upsert({...e,provider:'gdelt'});}this.revision++;return this.events();}
  events(){return {source:'gdelt-doc-2.0 + manual',providerStatus:this.newsStatus.status,lastUpdated:this.newsStatus.lastUpdated,error:this.newsStatus.error||null,events:this.store.list()};}
  impacts(routeId,radiusM=1000){if(!Number.isFinite(radiusM)||radiusM<100||radiusM>5000)throw new Error('radiusM must be 100-5000');const route=this.routes[routeId];if(!route)throw new Error('unknown route');return {routeId,generatedAt:new Date(this.now()).toISOString(),analysisRadiusM:radiusM,impacts:this.store.list().map(e=>({...routeImpact(e,routeId,route,radiusM),event:e}))};}
  context(routeId,at=new Date(this.now()).toISOString()){const day=at.slice(0,10),weather=this.weather(routeId),impacts=this.impacts(routeId).impacts.filter(x=>['possible','confirmed'].includes(x.impactLevel)&&!['cancelled','no_road_closure'].includes(x.event.eventStatus)&&x.event.eventDate&&x.event.eventDate>=day&&(!x.event.publishedAt||Date.parse(x.event.publishedAt)<=Date.parse(at)));return {routeId,asOf:at,weather,upcomingEvents:impacts,dataQuality:{weather:weather.status,events:this.newsStatus.status},advisoryOnly:true,note:'External context is a contributing signal; it does not directly command holding or dispatch'};}
}
module.exports={ContextService};
