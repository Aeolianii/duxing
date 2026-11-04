'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearch}=require('./ai-service.cjs');
const {createClient}=require('./ai-client.js');
const {createServer}=require('./server.cjs');
const store={id:'amap-A',source:'amap',poiId:'A',name:'测试餐厅(南门店)',city:'广州市',address:'广州市南门路1号',category:'粤菜'};
const source={title:store.name,url:'https://example.com/branch-a',summary:'测试餐厅(南门店)位于广州市南门路1号，主营粤菜。'};
const model={matched:true,introduction:'这是一家粤菜餐厅。',selectionReason:'这家南门店主营粤菜，如果今天想尝试粤菜，可以把它作为这次用餐的一个选择。',reviewSummary:'暂无评价。',citations:[
  {index:0,quote:'主营粤菜',sentence:'这是一家粤菜餐厅。'},
  {index:0,quote:'主营粤菜',sentence:'这家南门店主营粤菜，如果今天想尝试粤菜，可以把它作为这次用餐的一个选择。'}
]};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const completion=value=>json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
const isSourceReview=body=>body.messages[0].content.startsWith('你只负责审核搜索来源');
const directReview={assessments:[{index:0,relevance:'DIRECT_RELEVANT',quote:'测试餐厅(南门店)位于广州市南门路1号'}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,5));

test('每店先搜索再整理，固定模型、真实来源、去重缓存且不传个人资料',async()=>{
  const calls=[];
  const research=createResearch({config:{deepseekKey:'private-test-secret',deepseekModel:'deepseek-flash'},fetcher:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    assert.equal(options.headers.Authorization,'Bearer private-test-secret');
    return url.endsWith('/search')?json({results:[source]}):completion(isSourceReview(JSON.parse(options.body))?directReview:model);
  }});
  const input={...store,origin:{location:[113,23]},visits:['私人反馈'],phone:'private-phone'};
  const [a,b]=await Promise.all([research(input),research(input)]);
  assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(a.evidence[0].url,source.url);
  assert.equal(a.selectionReason,model.selectionReason);
  assert.equal(calls.length,3);assert.ok(calls[0].url.endsWith('/v1/tools/search'));
  assert.equal(calls[1].body.model,'deepseek-flash');assert.equal(calls[1].body.thinking.type,'disabled');
  assert.doesNotMatch(JSON.stringify(calls),/私人|private-phone|origin|location/);
  await research(input);assert.equal(calls.length,3);
  await research({...input,address:'广州市北门路2号'});assert.equal(calls.length,6);
});

test('空搜索只补查一次，非同店或伪造来源不当作可靠资料',async()=>{
  for(const output of [null,{...model,matched:false},{...model,citations:[{index:0,quote:'编造的证据'}]}]){
    let calls=0;
    const research=createResearch({config:{deepseekKey:'test'},fetcher:async(url,options)=>{calls++;return url.endsWith('/search')?json({results:output?[source]:[]}):completion(isSourceReview(JSON.parse(options.body))?directReview:output);}});
    const result=await research(store);assert.equal(result.status,'empty');assert.equal(result.selectionReason,'');assert.deepEqual(result.evidence,[]);assert.equal(calls,output?6:2);
  }
});

test('美食与游玩分别生成解读且缓存不会混用活动模式',async()=>{
  const activities=[];
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async(url,options)=>{
    if(url.endsWith('/search'))return json({results:[source]});
    const body=JSON.parse(options.body);
    if(isSourceReview(body))return completion(directReview);
    const activity=JSON.parse(body.messages[1].content).store.activity;
    activities.push(activity);
    const selectionReason=activity==='play'?'游玩场馆解读：主营粤菜。':'美食门店解读：主营粤菜。';
    return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...model,selectionReason,citations:[
      {index:0,quote:'主营粤菜',sentence:'这是一家粤菜餐厅。'},
      {index:0,quote:'主营粤菜',sentence:selectionReason}
    ]})}}]});
  }});
  assert.equal((await research({...store,activity:'food'})).selectionReason,'美食门店解读：主营粤菜。');
  assert.equal((await research({...store,activity:'play'})).selectionReason,'游玩场馆解读：主营粤菜。');
  await research({...store,activity:'play'});assert.deepEqual(activities,['food','play']);
});

test('只在名单中提到门店的赛事报道不参与总结或来源展示',async()=>{
  const indirect={title:'电竞总决赛在广州落幕',url:'https://example.com/esports',summary:'活动联动陶陶居、茶月山等80多家门店推出套餐。'};
  const direct={title:'茶月山门店介绍',url:'https://example.com/tea',summary:'茶月山是潮汕单丛茶饮品牌，提供多种单丛茶饮。'};
  let summarySources;
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async(url,options)=>{
    if(url.endsWith('/search'))return json({results:[direct,indirect]});
    const body=JSON.parse(options.body);
    if(isSourceReview(body))return completion({assessments:[
      {index:0,relevance:'DIRECT_RELEVANT',quote:'茶月山是潮汕单丛茶饮品牌'},
      {index:1,relevance:'INDIRECT_MENTION',quote:''}
    ]});
    summarySources=JSON.parse(body.messages[1].content).sources;
    return completion({matched:true,introduction:'茶月山是潮汕单丛茶饮品牌。',selectionReason:'该品牌提供多种单丛茶饮，可以试试。',reviewSummary:'暂无评价。',citations:[
      {index:0,quote:'茶月山是潮汕单丛茶饮品牌',sentence:'茶月山是潮汕单丛茶饮品牌。'},
      {index:0,quote:'提供多种单丛茶饮',sentence:'该品牌提供多种单丛茶饮，可以试试。'},
      {index:1,quote:'活动联动陶陶居、茶月山',sentence:'该品牌提供多种单丛茶饮，可以试试。'}
    ]});
  }});
  const result=await research(store);
  assert.equal(result.status,'ready');
  assert.deepEqual(summarySources.map(s=>s.url),[direct.url]);
  assert.deepEqual([...new Set(result.evidence.map(s=>s.url))],[direct.url]);
});

test('来源审核没有直接相关证据时沿用空结果兜底',async()=>{
  let calls=0;
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async(url)=>{
    calls++;
    return url.endsWith('/search')?json({results:[source]}):completion({assessments:[{index:0,relevance:'DIRECT_RELEVANT',quote:'并不存在的介绍'}]});
  }});
  const result=await research(store);
  assert.equal(result.status,'empty');assert.deepEqual(result.evidence,[]);assert.equal(calls,4);
});

test('API 失败不泄露上游内容，错误可重试且不缓存',async()=>{
  let calls=0;
  const research=createResearch({config:{deepseekKey:'test'},fetcher:async()=>{calls++;return new Response('secret-key',{status:401});}});
  await assert.rejects(research(store),/密钥无效/);await assert.rejects(research(store),/密钥无效/);assert.equal(calls,2);
});

test('本地 API 拒绝跨站、手工项、无效 JSON，且不暴露密钥',async()=>{
  let calls=0;
  const server=createServer({config:{deepseekKey:'private-test-secret'},traceStore:{record(){}},fetcher:async()=>{calls++;return json({results:[]});}});
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
    assert.equal((await post(store)).status,200);assert.equal(calls,2);
  }finally{await new Promise(r=>server.close(r));}
});

test('客户端复用正在搜索的同店任务和有效缓存，手工项不联网',async()=>{
  const gate=deferred();let calls=0,now=Date.now();
  const client=createClient(async()=>{calls++;await gate.promise;return json({status:'ready',retrievedAt:new Date(now).toISOString()});},()=>now);
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
  const context={DouxWheel:require("./wheel-motion.js"),console,localStorage:{getItem(){return null}},window:{},document:{hidden:false,querySelector:s=>elements[s]||null,querySelectorAll:()=>[],addEventListener(){}},
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

test('前台超时降级展示仍保留中奖店优先权，任务结束前不查其他店',async()=>{
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

test('游玩结果区分景区门票与娱乐场馆人均',()=>{
  const h=harness(async()=>true);
  const tower=h.context.statsHTML({source:'amap',activity:'play',name:'广州塔',category:'风景名胜;风景名胜;国家级景点',type:'国家级景点',routeStatus:'missing-origin'});
  assert.match(tower,/门票以景区为准/);assert.match(tower,/门票/);assert.match(tower,/开放时间/);
  const ktv=h.context.statsHTML({source:'amap',activity:'play',name:'星聚会KTV',category:'体育休闲服务;娱乐场所;KTV',type:'KTV',price:88,routeStatus:'missing-origin'});
  assert.match(ktv,/¥88/);assert.match(ktv,/参考人均/);assert.doesNotMatch(ktv,/门票以景区为准/);
  const pricedTicket=h.context.statsHTML({source:'amap',activity:'play',name:'广州塔',category:'风景名胜;风景名胜;国家级景点',price:60,max:5,routeStatus:'ready'});
  assert.match(pricedTicket,/¥60/);assert.match(pricedTicket,/门票/);
  assert.match(h.context.statsHTML({source:'amap',activity:'play',name:'未知价场馆',category:'体育休闲服务;娱乐场所;KTV',routeStatus:'missing-origin'}),/人均未知/);
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

test('品牌兜底明确标注通用介绍，本店评价和随机抽取理由不冒用其他门店内容',()=>{
  const h=harness(async()=>true);
  const input={...store,ai:{status:'ready',scope:'brand',brandName:'测试餐厅',model:'deepseek-flash',introduction:'品牌菜系介绍',reviewSummary:'不应展示的其他门店评价',selectionReason:'不应采用的本店体验',evidence:[]}};
  const html=h.context.aiHTML(input),reason=h.context.selectionReasonHTML(input);
  assert.match(html,/品牌介绍/);assert.match(html,/通用资料/);assert.match(html,/暂无可核实的本店评价/);
  assert.doesNotMatch(html,/不应展示/);assert.match(reason,/随机抽中/);assert.match(reason,/品牌介绍/);assert.doesNotMatch(reason,/不应采用/);
});

test('结果来源展示逐字原文与控制字符转义，方便核对句子与出处',()=>{
  const h=harness(async()=>true);
  const ai={status:'ready',model:'deepseek-flash',introduction:'主营粤菜。',reviewSummary:'暂无相关评价。',evidence:[
    {title:'示例来源',url:'https://example.com/a',quote:'主营粤菜<script>alert(1)</script>'}
  ]};
  const html=h.context.aiHTML({...store,ai});
  assert.match(html,/原文：主营粤菜/);assert.match(html,/示例来源/);assert.ok(!html.includes('<script>'));
  assert.equal(h.context.aiHTML({...store,ai:{...ai,evidence:[{title:'旧格式',url:'https://example.com/b'}]}}).includes('原文：'),false);
});

test('同一篇文章的多条原文合并展示，来源链接只出现一次',()=>{
  const h=harness(async()=>true);
  const ai={status:'ready',model:'deepseek-flash',introduction:'主营粤菜。',reviewSummary:'暂无相关评价。',evidence:[
    {title:'同一来源',url:'https://example.com/a',quotes:[{quote:'主营粤菜'},{quote:'位于南门路1号'},{quote:'口碑不错'}]},
    {title:'另一来源',url:'https://example.com/b',quotes:[{quote:'顾客评价好'}]}
  ]};
  const html=h.context.aiHTML({...store,ai});
  assert.equal((html.match(/同一来源/g)||[]).length,1);
  assert.equal((html.match(/href="https:\/\/example\.com\/a"/g)||[]).length,1);
  assert.match(html,/3 条原文/);assert.match(html,/原文：主营粤菜/);assert.match(html,/原文：位于南门路1号/);assert.match(html,/原文：口碑不错/);
  assert.match(html,/原文：顾客评价好/);assert.doesNotMatch(html,/2 条原文/);
});

test('空资料显示原因，服务超时与分店不匹配不能显示成相同的无信息提示',()=>{
  const h=harness(async()=>true);
  const render=harness=>h.context.aiHTML({...store,ai:{status:'empty',harness}});
  assert.match(render({reason:'no_sources'}),/搜索没有返回/);
  assert.match(render({reason:'identity_unconfirmed'}),/找到了相关网页/);
  assert.match(render({reason:'invalid_citations'}),/整理结果未通过核对/);
  assert.match(render({reason:'timeout',serviceUnavailable:true}),/查询超时/);
  assert.match(render({reason:'upstream_503',serviceUnavailable:true}),/服务暂时不可用/);
});

test('通用转盘仅发送中奖名称，检索摘要后生成带来源的简要介绍',async()=>{
  const calls=[],summary='广州塔是广州的城市地标，可欣赏城市景观。';
  const server=createServer({config:{deepseekKey:'test'},traceStore:{record(){}},fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    return json(url.endsWith('/search')?{results:[{title:'广州塔',url:'https://example.com/tower',summary}]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify({matched:true,introduction:summary,citations:[{index:0,quote:'广州塔是广州的城市地标',sentence:summary}]})}}]});
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


function previewHarness(){
  const elements={'#nav':{},'#modal':{open:false,querySelector(){return null},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;}},'#modal-content':{innerHTML:''}};
  const modalClasses=new Set();
  elements['#modal'].classList={toggle(name,on){if(on)modalClasses.add(name);else modalClasses.delete(name);},contains(name){return modalClasses.has(name);}};
  elements['#modal'].querySelector=selector=>selector==='.result-topbar'&&elements['#modal-content'].innerHTML.includes('class="result-topbar"')?{}:null;
  const context={console,Doux:require('./core.js'),localStorage:{getItem(){return null},setItem(){}},window:{},document:{hidden:false,addEventListener(){},querySelector(selector){return elements[selector]||null;}},setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
  context.render=()=>{};context.toast=()=>{};
  return {context,elements,state:context.window.demo.state,html:()=>elements['#modal-content'].innerHTML};
}

test('美食与游玩预览去掉抽奖控件，自动生成资料并在原卡片更新',async()=>{
  for(const activity of ['food','play']){
    const h=previewHarness(),gate=deferred();let calls=0,updates=0;
    h.context.prepareMerchantDetails=async s=>{calls++;s.ai={status:'loading'};await gate.promise;s.ai={status:'ready',introduction:'可核对的地点介绍'};};
    h.context.updateAI=s=>{updates++;assert.equal(s.ai.introduction,'可核对的地点介绍');};
    h.context.updateStats=()=>{};
    h.context.detail({...store,activity});
    assert.equal(calls,1);assert.match(h.html(),/正在整理这个地点的介绍与资料来源/);
    assert.match(h.html(),/fold" open/);assert.match(h.html(),/id="aiDetails"/);
    assert.doesNotMatch(h.html(),/为什么选它|不太想|id="again"|id="record"|id="reject"|data-adjust/);
    assert.match(h.html(),/id="route"/);assert.match(h.html(),/data-fav/);
    gate.resolve();await tick();assert.equal(updates,1);
  }
});

test('预览响应在切换地点或关闭卡片后不再修改可见卡片',async()=>{
  for(const close of [false,true]){
    const h=previewHarness(),gate=deferred();let updates=0;
    h.context.prepareMerchantDetails=async s=>{s.ai={status:'loading'};await gate.promise;};
    h.context.updateAI=()=>updates++;h.context.updateStats=()=>{};
    h.context.detail({...store});
    if(close)h.elements['#modal'].open=false;else h.context.detail({...store,id:'other',poiId:'other'});
    gate.resolve();await tick();assert.equal(updates,close?0:1);
  }
});

test('抽奖结果保留加入行程与理由，不提前要求记录到访，收藏重绘仍保持结果场景',()=>{
  const h=previewHarness();let calls=0;
  h.context.window.DouxReviews={planButton:()=>'<button data-rv-plan>加入行程</button>',mount(){}};
  h.context.prepareMerchantDetails=()=>{calls++;};
  const s={...store,ai:{status:'ready',introduction:'简介',reviewSummary:'摘要',retrievedAt:new Date().toISOString(),evidence:[]}};
  h.state.catalog={[s.id]:s};
  h.context.detail(s,true);
  for(const pattern of [/为什么选它/,/id="again"/,/data-rv-plan/,/加入行程/,/不太想/])assert.match(h.html(),pattern);
  assert.doesNotMatch(h.html(),/id="record"/);
  assert.equal(calls,0);h.context.favorite(s.id);assert.equal(h.state.detailWon,true);assert.match(h.html(),/id="again"/);
});


function unifiedWheelHarness(){
  const h=previewHarness();
  h.context.crypto={randomUUID:()=>Math.random().toString()};
  h.context.document.body={classList:{add(){},toggle(){}}};
  h.elements['#view']={innerHTML:''};h.elements['#freeOptionName']={focus(){}};
  vm.runInContext(fs.readFileSync(__dirname+'/freewheel.js','utf8'),h.context);
  h.context.render=()=>h.context.renderFreeWheel();
  return {...h,items:()=>vm.runInContext('freeWheel.items',h.context)};
}

test('统一自定义转盘三种入口、文字地点收藏混合且去重，底栏移除自选',()=>{
  const h=unifiedWheelHarness();h.context.renderFreeWheel();
  assert.match(h.elements['#view'].innerHTML,/输入文字/);assert.match(h.elements['#view'].innerHTML,/地图选地点/);assert.match(h.elements['#view'].innerHTML,/从收藏添加/);
  assert.equal(vm.runInContext('navs.some(n=>n[0]==="custom")',h.context),false);
  assert.equal(h.context.insertFreeItem({name:'看电影'}),true);
  assert.equal(h.context.insertFreeItem(store),true);
  assert.equal(h.context.insertFreeItem({...store,id:'duplicate'}),false);
  h.state.favorites=[{...store,id:'B',poiId:'B',name:'公园',activity:'play'}];
  h.context.handleFreeWheelAction({dataset:{freeFavorite:'0'}});
  assert.equal(h.items().length,3);assert.equal(h.items()[1].poiId,'A');assert.equal(h.items()[2].activity,'play');
  h.context.handleFreeWheelAction({dataset:{freeFavorite:'0'}});assert.equal(h.items().length,3);
  h.context.handleFreeWheelAction({dataset:{freeRemove:h.items()[0].id}});assert.equal(h.items().length,2);
  h.context.handleFreeWheelAction({id:'freeReady',dataset:{}});assert.match(h.elements['#view'].innerHTML,/freeSpin/);
  h.context.handleFreeWheelAction({id:'freeEdit',dataset:{}});assert.match(h.elements['#view'].innerHTML,/从收藏添加/);
});

test('真实地点检索保留分店信息，超时后资料仍可更新结果卡片',async()=>{
  const h=unifiedWheelHarness();h.state.page='freewheel';h.state.last=store;h.elements['#modal'].open=true;
  vm.runInContext('freeWheel.round=1',h.context);let prepared=0,updated=0;
  h.context.prepareDetails=async winner=>{prepared++;assert.equal(winner.poiId,'A');winner.ai={status:'ready',introduction:'分店介绍'};};
  h.context.updateAI=()=>updated++;h.context.updateStats=()=>{};
  await h.context.researchFreeOption(store,1);assert.equal(prepared,1);assert.equal(updated,1);
  h.state.page='near';await h.context.researchFreeOption(store,1);assert.equal(updated,1);
});
