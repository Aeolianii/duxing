'use strict';

// Explicit opt-in: this script uses the configured DeepSeek account and incurs API usage.
const fs=require('node:fs'),path=require('node:path');
const {createServer,loadConfig}=require('./server.cjs');
const {createTraceStore,summarizeTraces}=require('./ai-harness.cjs');

// Public POI identity/address verified through the application's AMap JS API on 2026-11-05.
const cases=[
  {label:'真实餐厅',endpoint:'store-research',expected:'ready',input:{source:'amap',poiId:'B0FFG2O3RL',name:'陶陶居酒家(正佳广场店)',city:'广州市',address:'广州市天河区天河路228号正佳广场6层C059铺',activity:'food'}},
  {label:'真实景点',endpoint:'store-research',expected:'ready',input:{source:'amap',poiId:'B00140WBI1',name:'广州塔',city:'广州市',address:'广州市海珠区阅江西路222号',activity:'play'}},
  {label:'自定义选项',endpoint:'option-research',expected:'ready',input:{name:'广州塔'}},
  {label:'不存在名称（合成负例）',endpoint:'option-research',expected:'empty',input:{name:'都行实测不存在的场馆ZXQ20261105'}}
];

async function main() {
  if(!process.argv.includes('--live')) {
    console.log('用法：node ai-live-check.cjs --live（会使用已配置的 DeepSeek API 额度）');
    return;
  }
  const config=loadConfig();
  if(!config.deepseekKey)throw new Error('missing_config');
  const directory=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data');
  const saved=createTraceStore(path.join(directory,'ai-traces.json')),traces=[],calls=[],samples=[];
  const fetcher=async(url,options)=>{
    const start=Date.now(),body=JSON.parse(options.body);
    const stage=String(url).endsWith('/search')?'search':body.messages[0].content.startsWith('你只负责审核搜索来源')?'source_review':'summarize';
    try {
      const response=await fetch(url,options);let data;
      try {data=await response.clone().json();}catch{}
      calls.push({stage,http:response.status,elapsedMs:Date.now()-start,
        resultCount:Array.isArray(data?.results)?data.results.length:null,
        finishReason:data?.choices?.[0]?.finish_reason||null});
      return response;
    }catch(error) {
      calls.push({stage,http:null,elapsedMs:Date.now()-start,error:options.signal.aborted?'timeout':'network_error'});
      throw error;
    }
  };
  const server=createServer({config,fetcher,traceStore:{record:t=>{traces.push(t);saved.record(t);}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const checkedAt=new Date().toISOString();
  try {
    for(const item of cases) {
      const start=Date.now(),before=calls.length;
      const post=()=>fetch(base+'/api/'+item.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(item.input),signal:AbortSignal.timeout(30000)});
      const response=await post(),result=await response.json();
      const sample={...item,http:response.status,elapsedMs:Date.now()-start,result,callRange:[before,calls.length]};
      sample.checks={httpOK:response.ok,expectedStatus:result.status===item.expected,
        content:result.status==='ready'?Boolean(result.introduction&&result.evidence?.length):result.introduction===''&&result.evidence?.length===0};
      if(result.status==='ready') {
        const count=calls.length,cachedResponse=await post(),cached=await cachedResponse.json();
        sample.cacheCheck={sameTrace:cached.harness?.traceId===result.harness?.traceId,additionalCalls:calls.length-count};
        sample.checks.cache=cachedResponse.ok&&sample.cacheCheck.sameTrace&&sample.cacheCheck.additionalCalls===0;
      }
      if(item.expected==='empty')sample.checks.boundedRepair=result.harness?.attempts===2;
      sample.passed=Object.values(sample.checks).every(Boolean);
      samples.push(sample);
      console.log(JSON.stringify({label:item.label,status:result.status,elapsedMs:sample.elapsedMs,calls:result.harness?.toolCalls,passed:sample.passed}));
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(samples.length) {
      const report={checkedAt,model:config.deepseekModel,mode:'live',allPassed:samples.length===cases.length&&samples.every(s=>s.passed),
        note:'Automated checks cover transport, output structure, expected fallback and caching; generated facts still need source review.',
        samples,calls,traces,metrics:summarizeTraces(traces)};
      const file=path.join(directory,'deepseek-live-'+checkedAt.replace(/[:.]/g,'-')+'.json');
      fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n','utf8');
      console.log(JSON.stringify({report:file,allPassed:report.allPassed,metrics:report.metrics},null,2));
      if(!report.allPassed)process.exitCode=1;
    }
  }
}

if(require.main===module)main().catch(()=>{
  console.error('实网检查未完成，请检查配置、网络及已经保存的样本报告。');process.exitCode=1;
});
