'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createResearch}=require('./ai-service.cjs');
const {createClient}=require('./ai-client.js');
const {createTraceStore,summarizeTraces,MAX_CALLS}=require('./ai-harness.cjs');
const {createServer}=require('./server.cjs');

const store={source:'amap',poiId:'A',name:'测试餐厅(南门店)',city:'广州市',address:'广州市南门路1号'};
const source={title:store.name,url:'https://example.com/branch-a',summary:'测试餐厅(南门店)位于广州市南门路1号，主营粤菜。'};
const review={assessments:[{index:0,relevance:'DIRECT_RELEVANT',quote:'测试餐厅(南门店)位于广州市南门路1号'}]};
const draft={matched:true,introduction:'这是一家主营粤菜的餐厅。',selectionReason:'这家店主营粤菜，可以作为这次用餐的选择。',citations:[{index:0,quote:'主营粤菜'}]};
const json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
const complete=v=>json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(v)}}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}});
function fixture(handler,extra={}) {
  const calls=[],traces=[];
  const research=createResearch({config:{deepseekKey:'private-secret'},onTrace:t=>traces.push(t),fetcher:async(url,options)=>{
    const body=JSON.parse(options.body),stage=url.endsWith('/search')?'search':body.messages[0].content.startsWith('你只负责审核搜索来源')?'review':'summary';
    calls.push({stage,body,signal:options.signal});
    return await handler?.({stage,body,calls}) || (stage==='search'?json({results:[source]}):complete(stage==='review'?review:draft));
  },...extra});
  return {research,calls,traces};
}

test('直接成功返回校验元数据，执行记录只包含计数且成功请求复用缓存',async()=>{
  const h=fixture();
  const [a,b]=await Promise.all([h.research({...store,origin:'private-origin',phone:'private-phone'}),h.research(store)]);
  assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(a.harness.validationPassed,true);
  assert.equal(a.harness.attempts,1);assert.equal(a.harness.toolCalls,3);assert.equal(h.traces.length,1);
  assert.deepEqual(h.traces[0].tokens,{prompt:20,completion:10,total:30});
  assert.equal((await h.research(store)).harness.traceId,a.harness.traceId);assert.equal(h.calls.length,3);
  assert.doesNotMatch(JSON.stringify(h.traces),/private-|南门|广州市|example\.com|messages|Authorization/);
  assert.doesNotMatch(JSON.stringify(h.calls),/private-origin|private-phone/);
});

test('首轮无资料时换查询补查一次，并把校验反馈带入重新整理',async()=>{
  let searches=0;
  const h=fixture(({stage})=>stage==='search'&&++searches===1?json({results:[]}):null);
  const result=await h.research(store);
  assert.equal(result.status,'ready');assert.equal(result.harness.repaired,true);assert.equal(searches,2);
  const queries=h.calls.filter(c=>c.stage==='search').map(c=>c.body.query);assert.notEqual(queries[0],queries[1]);
  const input=JSON.parse(h.calls.find(c=>c.stage==='summary').body.messages[1].content);
  assert.equal(input.validationFeedback.reason,'no_sources');
  assert.equal(result.harness.toolCalls,4);assert.equal(h.traces[0].steps.at(-1).reason,'passed');
});

test('伪造引用不能出结果，第二轮接受纠正后的有效引用',async()=>{
  let summaries=0;
  const h=fixture(({stage,body})=>{
    if(stage!=='summary')return;
    if(++summaries===1)return complete({...draft,introduction:'未经核实的内容',citations:[{index:0,quote:'不存在的证据'}]});
    assert.equal(JSON.parse(body.messages[1].content).validationFeedback.reason,'invalid_citations');
  });
  const result=await h.research(store);
  assert.equal(result.status,'ready');assert.equal(result.introduction,draft.introduction);
  assert.equal(result.harness.attempts,2);assert.equal(result.harness.toolCalls,6);
});

test('同名异店或无关来源两轮仍未通过时降级，不生成介绍、不缓存空结果',async()=>{
  const h=fixture(({stage})=>stage==='review'?complete({assessments:[{index:0,relevance:'IRRELEVANT',quote:''}]}):null);
  for(let i=0;i<2;i++) {
    const result=await h.research(store);
    assert.equal(result.status,'empty');assert.equal(result.introduction,'');assert.deepEqual(result.evidence,[]);
    assert.equal(result.harness.reason,'no_relevant_sources');assert.equal(result.harness.attempts,2);
    assert.equal(result.harness.validationPassed,false);assert.equal(result.harness.toolCalls,4);
  }
  assert.equal(h.calls.length,8);assert.equal(h.traces.length,2);assert.ok(h.calls.every(c=>c.stage!=='summary'));
});

test('损坏的模型输出、空介绍与错误字段类型均可进入有限修正',async()=>{
  for(const invalid of [null,[],{...draft,introduction:''},{...draft,introduction:'暂无可核实资料。'},{...draft,reviewSummary:{}},{...draft,citations:[null]}]) {
    let summaries=0;
    const h=fixture(({stage})=>stage==='summary'&&++summaries===1?complete(invalid):null);
    const result=await h.research(store);
    assert.equal(result.status,'ready');assert.equal(result.harness.attempts,2);assert.ok(h.calls.length<=MAX_CALLS);
  }
});

test('损坏的 JSON、未完成的模型响应和无效搜索结构不能绕过校验',async()=>{
  for(const bad of [()=>json({choices:[{finish_reason:'length',message:{content:'{}'}}]}),()=>json({choices:[{finish_reason:'stop',message:{content:'{'}}]})]) {
    const h=fixture(({stage})=>stage==='summary'?bad():null);
    const result=await h.research(store);assert.equal(result.status,'empty');assert.equal(result.harness.reason,'invalid_summary');assert.equal(result.harness.toolCalls,6);
  }
  const h=fixture(({stage})=>stage==='search'?json({results:[null,{},'unexpected',{url:'javascript:alert(1)',summary:'bad'}]}):null);
  assert.equal((await h.research(store)).harness.reason,'no_sources');assert.equal(h.calls.length,2);
});

test('上游临时失败最多重试一次，恢复后仍完成校验',async()=>{
  for(const status of [429,503]) {
    const h=fixture(({calls})=>calls.length===1?new Response('private-secret',{status}):null);
    const result=await h.research(store);
    assert.equal(result.status,'ready');assert.equal(result.harness.retries,1);assert.equal(result.harness.toolCalls,4);
    assert.equal(h.traces[0].steps[0].reason,'upstream_'+status);
  }
});

test('持续网络异常降级且可再次请求，密钥错误不重试也不泄露上游内容',async()=>{
  const h=fixture(()=>new Response('private-secret',{status:503}));
  const a=await h.research(store),b=await h.research(store);
  assert.equal(a.status,'empty');assert.equal(a.harness.reason,'upstream_503');assert.equal(a.harness.toolCalls,2);
  assert.equal(a.harness.serviceUnavailable,true);
  assert.notEqual(a.harness.traceId,b.harness.traceId);assert.equal(h.calls.length,4);
  for(const status of [401,402,403,404]) {
    const broken=fixture(()=>new Response('private-secret',{status}));
    await assert.rejects(broken.research(store),e=>e.status===502&&e.harness.outcome==='error'&&!e.message.includes('private-secret'));
    assert.equal(broken.calls.length,1);assert.equal(broken.traces[0].outcome,'error');
  }
});

test('同一总超时覆盖请求与响应解码，不会在超时后继续补查',async()=>{
  for(const decode of [false,true]) {
    // Keep one real timer alive: AbortSignal.timeout alone is unrefed by Node.
    const transport=()=>new Promise(resolve=>setTimeout(()=>resolve(json({results:[]})),50));
    const h=fixture(()=>decode?{ok:true,json:transport}:transport(),{timeoutMs:10});
    const result=await h.research(store);
    assert.equal(result.status,'empty');assert.equal(result.harness.reason,'timeout');assert.equal(result.harness.toolCalls,1);
    assert.equal(result.harness.serviceUnavailable,true);
    await new Promise(r=>setTimeout(r,55));assert.equal(h.calls.length,1);assert.equal(h.traces.length,1);
  }
});

test('自定义选项也使用补查与引用校验，不上传输入中的额外个人字段',async()=>{
  let searches=0;
  const h=fixture(({stage})=>stage==='search'&&++searches===1?json({results:[]}):null,{allowOptions:true});
  const result=await h.research({name:'看电影',origin:'private-origin',visits:['private-visits']});
  assert.equal(result.status,'ready');assert.equal(result.harness.attempts,2);assert.equal(h.calls.length,3);
  assert.ok(h.calls.every(c=>c.stage!=='review'));assert.doesNotMatch(JSON.stringify(h.calls),/private-origin|private-visits/);
});

test('客户端不缓存降级结果，随后恢复成功可正常复用',async()=>{
  let calls=0;
  const client=createClient(async()=>json({status:++calls===1?'empty':'ready',retrievedAt:new Date().toISOString()}));
  assert.equal((await client.research(store)).status,'empty');assert.equal((await client.research(store)).status,'ready');
  await client.research(store);assert.equal(calls,2);
});

test('执行记录写入失败不影响资料结果，也不打印失败对象中的敏感内容',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const h=fixture(null,{onTrace:()=>{throw new Error('private-secret');}});
  const result=await h.research(store);
  assert.equal(result.status,'ready');assert.equal(warn.mock.calls.length,1);
  assert.doesNotMatch(JSON.stringify(warn.mock.calls.map(c=>c.arguments)),/private-secret/);
});

test('本地记录限量、可跨进程读取且字段白名单阻止保存个人资料',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'doux-harness-')),file=path.join(directory,'ai-traces.json');
  const trace={version:'research-v1',traceId:'test-run',kind:'store',startedAt:new Date().toISOString(),outcome:'ready',reason:'passed',attempts:2,toolCalls:6,retries:0,elapsedMs:20,tokens:{prompt:10,completion:5,total:15},steps:[],prompt:'private-secret',origin:'private-origin',name:store.name};
  try {
    const saved=createTraceStore(file,2);
    for(let i=0;i<3;i++)saved.record({...trace,traceId:'test-'+i});
    const records=createTraceStore(file,2).list();assert.deepEqual(records.map(t=>t.traceId),['test-1','test-2']);
    assert.doesNotMatch(fs.readFileSync(file,'utf8'),/private-|南门/);
    const summary=summarizeTraces([...records,{...trace,outcome:'empty',reason:'no_sources',attempts:1}]);
    assert.equal(summary.runs,3);assert.equal(summary.repaired,2);assert.equal(summary.readyRate,2/3);
    assert.equal(summary.failureReasons.no_sources,1);assert.equal(summary.tokens.total,45);
    fs.writeFileSync(file,'corrupt data');assert.throws(()=>createTraceStore(file).record(trace));
    assert.equal(fs.readFileSync(file,'utf8'),'corrupt data');
  } finally {
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('doux-harness-'));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('服务端接入执行记录，诊断文件与脚本不会成为公开静态资源',async()=>{
  const traces=[];
  const server=createServer({config:{deepseekKey:'test'},traceStore:{record:t=>traces.push(t)},fetcher:async()=>json({results:[]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try {
    for(const [route,input] of [['store-research',store],['option-research',{name:'看电影'}]]) {
      const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      assert.equal(response.status,200);const result=await response.json();assert.equal(result.harness.attempts,2);assert.equal(result.status,'empty');
    }
    assert.deepEqual(traces.map(t=>t.kind),['store','option']);
    for(const name of ['data/ai-traces.json','ai-harness.cjs','ai-eval.cjs'])assert.equal((await fetch(base+'/'+name)).status,404);
  } finally { await new Promise(r=>server.close(r)); }
});
