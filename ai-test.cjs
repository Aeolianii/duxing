'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearch}=require('./ai-service.cjs');
const {createClient}=require('./ai-client.js');
const {createServer}=require('./server.cjs');
const store={id:'amap-A',source:'amap',poiId:'A',name:'测试餐厅(南门店)',city:'广州市',address:'广州市南门路1号',category:'粤菜'};
const source={title:store.name,url:'https://example.com/branch-a',summary:'测试餐厅(南门店)位于广州市南门路1号，主营粤菜。'};
const model={matched:true,introduction:'这是一家粤菜餐厅。',selectionReason:'这家南门店主营粤菜，如果今天想尝试粤菜，可以把它作为这次用餐的一个选择。',reviewSummary:'暂无评价。',citations:[{index:0,quote:'主营粤菜'}]};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,5));

test('每店先搜索再整理，固定模型、真实来源、去重缓存且不传个人资料',async()=>{
  const calls=[];
  const research=createResearch({config:{deepseekKey:'private-test-secret',deepseekModel:'deepseek-flash'},fetcher:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    assert.equal(options.headers.Authorization,'Bearer private-test-secret');
    return json(url.endsWith('/search')?{results:[source]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(model)}}]});
  }});
  const input={...store,origin:{location:[113,23]},visits:['私人反馈'],phone:'private-phone'};
  const [a,b]=await Promise.all([research(input),research(input)]);
  assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(a.evidence[0].url,source.url);
  assert.equal(a.selectionReason,model.selectionReason);
  assert.equal(calls.length,2);assert.ok(calls[0].url.endsWith('/v1/tools/search'));
  assert.equal(calls[1].body.model,'deepseek-flash');assert.equal(calls[1].body.thinking.type,'disabled');
  assert.doesNotMatch(JSON.stringify(calls),/私人|private-phone|origin|location/);
  await research(input);assert.equal(calls.length,2);
  await research({...input,address:'广州市北门路2号'});assert.equal(calls.length,4);
});

test('空搜索不调用模型，非同店或伪造来源不当作可靠资料',async()=>{
  for(const output of [null,{...model,matched:false},{...model,citations:[{index:0,quote:'编造的证据'}]}]){
    let calls=0;
    const research=createResearch({config:{deepseekKey:'test'},fetcher:async url=>{calls++;return json(url.endsWith('/search')?{results:output?[source]:[]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});}});
    const result=await research(store);assert.equal(result.status,'empty');assert.equal(result.selectionReason,'');assert.deepEqual(result.evidence,[]);assert.equal(calls,output?2:1);
  }
});

test('美食与游玩分别生成解读且缓存不会混用活动模式',async()=>{
  const activities=[];
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async(url,options)=>{
    if(url.endsWith('/search'))return json({results:[source]});
    const body=JSON.parse(options.body),activity=JSON.parse(body.messages[1].content).store.activity;
    activities.push(activity);
    return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...model,selectionReason:activity==='play'?'游玩场馆解读':'美食门店解读'})}}]});
  }});
  assert.equal((await research({...store,activity:'food'})).selectionReason,'美食门店解读');
  assert.equal((await research({...store,activity:'play'})).selectionReason,'游玩场馆解读');
  await research({...store,activity:'play'});assert.deepEqual(activities,['food','play']);
});

test('API 失败不泄露上游内容，错误可重试且不缓存',async()=>{
  let calls=0;
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async()=>{calls++;return new Response('secret-key',{status:401});}});
  await assert.rejects(research(store),/密钥无效/);await assert.rejects(research(store),/密钥无效/);assert.equal(calls,2);
});

test('本地 API 拒绝跨站、手工项、无效 JSON，且不暴露密钥',async()=>{
  let calls=0;
  const server=createServer({config:{deepseekKey:'private-test-secret'},fetcher:async()=>{calls++;return json({results:[]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const post=(body,headers={})=>fetch(base+'/api/store-research',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  try{
    const config=await (await fetch(base+'/api/ai-config')).json();assert.deepEqual(config,{configured:true,model:'deepseek-flash'});
    assert.equal((await post(store,{Origin:'https://evil.example'})).status,403);
    assert.equal((await post({...store,manual:true})).status,400);
    assert.equal((await post(store,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await fetch(base+'/.env')).status,404);
    assert.equal((await fetch(base+'/ai-service.cjs')).status,404);
    assert.equal((await fetch(base+'/api/store-research',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
    assert.equal(calls,0);
    assert.equal((await post(store)).status,200);assert.equal(calls,1);
  }finally{await new Promise(r=>server.close(r));}
});

test('客户端复用正在搜索的同店任务和有效缓存，手工项不联网',async()=>{
  const gate=deferred();let calls=0,now=Date.now();
  const client=createClient(async()=>{calls++;await gate.promise;return json({status:'empty',retrievedAt:new Date(now).toISOString()});},()=>now);
  const a=client.research({...store,location:[113,23],visits:['秘密']}),b=client.research(store);assert.equal(a,b);assert.equal(calls,1);
  gate.resolve();await a;await client.research(store);assert.equal(calls,1);
  assert.equal(await client.research({manual:true}),null);
  assert.equal(client.payload({...store,poiName:'真实分店',name:'显示别名'}).name,'真实分店');
  now+=900001;await client.research(store);assert.equal(calls,2);
});

function harness(load){
  const modal={open:false,addEventListener(){},close(){this.open=false}},status={},disc={style:{},animate(){return {cancel(){}}},getBoundingClientRect(){}};
  const elements={'#modal':modal,'#status':status,'#disc':disc,'#nav':{},'#bgStatus':{}};
  let deadline;
  const context={console,localStorage:{getItem(){return null}},window:{},document:{hidden:false,querySelector:s=>elements[s]||null,querySelectorAll:()=>[],addEventListener(){}},
    setTimeout:(fn,ms)=>ms===11000?(deadline=fn,100000):setTimeout(fn,0),clearTimeout,
    DOMMatrix:class{constructor(){this.a=1;this.b=0}},getComputedStyle:()=>({transform:''}),matchMedia:()=>({matches:true}),prepareDetails:load};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
  vm.runInContext('render=()=>{};detail=(s)=>{state.bg++;state.last=s;$("#modal").open=true;};updateAI=()=>{};',context);
  const state=context.window.demo.state;state.candidates=[{...store},{...store,id:'amap-B',poiId:'B'},{...store,id:'amap-C',poiId:'C'}];
  vm.runInContext('Math.random=()=>0',context);
  return {context,state,modal,deadline:()=>deadline()};
}

test('中奖请求结束且结果展示后才串行搜索其他店；关闭后暂停',async()=>{
  const gates=[deferred(),deferred(),deferred()],calls=[];
  const h=harness(s=>{calls.push(s.id);return gates[calls.length-1].promise;});
  const round=h.context.spin();assert.deepEqual(calls,['amap-A']);assert.equal(h.state.last.id,'amap-A');assert.equal(h.modal.open,false);
  gates[0].resolve(true);await round;assert.equal(h.modal.open,true);assert.deepEqual(calls,['amap-A','amap-B']);
  const events=h.state.events.map(e=>e.type);assert.ok(events.indexOf('result-visible')<events.indexOf('background-start'));
  h.modal.open=false;h.state.bg++;gates[1].resolve(true);await tick();assert.equal(calls.length,2);
});

test('12 秒降级展示仍保留中奖店优先权，任务结束前不查其他店',async()=>{
  const gate=deferred(),calls=[];const h=harness(s=>{calls.push(s.id);return s.id==='amap-A'?gate.promise:Promise.resolve(true);});
  const round=h.context.spin();h.deadline();await tick();assert.equal(h.modal.open,true);assert.deepEqual(calls,['amap-A']);
  gate.resolve(true);await round;await tick();assert.deepEqual(calls,['amap-A','amap-B','amap-C']);
});

test('新抽取优先启动，旧后台响应不再调度剩余店',async()=>{
  const old=deferred(),calls=[];const h=harness(s=>{calls.push(s.id);return calls.length===2?old.promise:Promise.resolve(true);});
  await h.context.spin();assert.deepEqual(calls,['amap-A','amap-B']);
  h.state.excluded.add('amap-B');await h.context.spin();assert.equal(calls[2],'amap-C');
  old.resolve(true);await tick();assert.deepEqual(calls,['amap-A','amap-B','amap-C']);
});

test('中奖店服务失败或页面隐藏时不启动背景队列',async()=>{
  const calls=[];let h=harness(s=>{calls.push(s.id);return Promise.resolve(false);});
  await h.context.spin();assert.deepEqual(calls,['amap-A']);assert.equal(h.modal.open,true);
  calls.length=0;h=harness(s=>{calls.push(s.id);return Promise.resolve(true);});h.context.document.hidden=true;
  await h.context.spin();assert.deepEqual(calls,['amap-A']);
});

test('详情卡片区分缺失商业数据、缺少起点和路线错误，并显示有效值',()=>{
  const h=harness(async()=>true);
  assert.match(h.context.statsHTML({source:'amap',routeStatus:'missing-origin'}),/高德未提供/);
  assert.match(h.context.statsHTML({source:'amap',routeStatus:'missing-origin'}),/请先选择出发点/);
  assert.match(h.context.statsHTML({source:'amap',routeStatus:'error'}),/路线获取失败/);
  const html=h.context.statsHTML({source:'amap',rating:4.8,price:90,max:12,routeStatus:'ready',routeMode:'步行'});
  for(const value of ['4.8','¥90','12 分钟','步行'])assert.ok(html.includes(value));
});


test('结果理由展示真实 AI 段落、转义内容，并随当前路程变化更新',()=>{
  const h=harness(async()=>true);
  const food={...store,routeStatus:'ready',routeMode:'步行',times:[8],max:8,ai:{status:'ready',selectionReason:'可以试试这家粤菜馆，<script>不能执行</script>。'}};
  let html=h.context.selectionReasonHTML(food);
  assert.match(html,/AI 解读/);assert.match(html,/可以试试这家粤菜馆/);assert.ok(!html.includes('<script>'));assert.match(html,/步行约 8 分钟/);
  food.max=12;html=h.context.selectionReasonHTML(food);assert.match(html,/步行约 12 分钟/);assert.doesNotMatch(html,/8 分钟/);
  assert.match(h.context.selectionReasonHTML({...food,activity:'play',ai:{status:'ready',selectionReason:'可以去这家场馆体验桌游。'}}),/体验桌游/);
  assert.match(h.context.selectionReasonHTML({...food,ai:{status:'loading'}}),/正在结合公开资料/);
  assert.match(h.context.selectionReasonHTML({...food,ai:{status:'error'}}),/重试资料/);
  assert.match(h.context.selectionReasonHTML({...food,ai:{status:'empty',selectionReason:'不能采用的无证据解读'}}),/可靠资料有限/);
  assert.doesNotMatch(h.context.selectionReasonHTML({...food,ai:{status:'empty',selectionReason:'不能采用的无证据解读'}}),/不能采用/);
});

test('通用转盘仅发送中奖名称，检索摘要后生成带来源的简要介绍',async()=>{
  const calls=[],summary='广州塔是广州的城市地标，可欣赏城市景观。';
  const server=createServer({config:{deepseekKey:'test'},fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    return json(url.endsWith('/search')?{results:[{title:'广州塔',url:'https://example.com/tower',summary}]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({matched:true,introduction:summary,citations:[{index:0,quote:'广州塔是广州的城市地标'}]})}}]});
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  const post=body=>fetch(base+'/api/option-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await post({name:'  '})).status,400);
    const result=await (await post({name:'广州塔',origin:'private-origin',candidates:['private-other-option']})).json();
    assert.equal(result.status,'ready');assert.equal(result.introduction,summary);assert.equal(result.evidence.length,1);
    assert.doesNotMatch(JSON.stringify(calls),/private-origin|private-other-option/);
    assert.equal(JSON.parse(calls[1].messages[1].content).store.source,'custom');
    await post({name:'广州塔'});assert.equal(calls.length,2);
  }finally{await new Promise(r=>server.close(r));}
});
