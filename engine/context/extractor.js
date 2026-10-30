'use strict';
const {ruleExtract}=require('./events');
class EventExtractionProvider {async extract(){throw new Error('extract() not implemented');}}
class RuleBasedExtractionProvider extends EventExtractionProvider {async extract(article){return ruleExtract(article);}}
class OptionalAiExtractionProvider extends EventExtractionProvider {
  constructor(adapter=null){super();this.adapter=adapter;}
  status(){return {enabled:!!this.adapter,note:this.adapter?'Optional adapter configured':'No AWS/AI credentials required; ambiguous events remain needs_review'};}
  async extract(article){if(!this.adapter)return {...ruleExtract(article),verificationStatus:'needs_review',aiProvider:'disabled'};return this.adapter.extract(article);}
}
module.exports={EventExtractionProvider,RuleBasedExtractionProvider,OptionalAiExtractionProvider};
