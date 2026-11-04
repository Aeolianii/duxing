'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const travelCore=require('./travel-core.js');
const conditions={origin:'广州',date:'2026-11-07',days:2,budget:1500,mode:'高铁',themes:['美食'],people:2,children:false,elders:false,excludeVisited:true};
const city=name=>travelCore.cities.find(c=>c.name===name);
test('景点查询不把近似名餐饮店或异地同名景点当作目的地',()=>{
  const base={location:city('厦门').location,city:'厦门市',address:'厦门市思明区'};
  assert.equal(travelCore.matchesPOI(city('厦门'),'八市',{...base,name:'八市阿杰五香(大元路店)'}),false);
  assert.equal(travelCore.matchesPOI(city('厦门'),'八市',{...base,name:'厦门第八市场'}),true);
  assert.equal(travelCore.matchesPOI(city('厦门'),'中山路步行街',{...base,name:'中山路步行街(东段)'}),true);
  assert.equal(travelCore.matchesPOI(city('厦门'),'中山路步行街',{...base,city:'南京市',address:'南京市',name:'中山路步行街'}),false);
});
test('城市候选排除出发地、去过及移除城市，并匹配至少一个兴趣',()=>{
  const result=travelCore.candidates(conditions,{visited:[city('长沙').id],removed:[city('厦门').id],random:()=>.5});
  assert.equal(result.length,6);assert.equal(new Set(result.map(c=>c.id)).size,6);
  for(const c of result){assert.ok(!['广州','长沙','厦门'].includes(c.name));assert.ok(c.tags.includes('美食'));}
  assert.deepEqual(travelCore.candidates(conditions,{visited:travelCore.cities.map(c=>c.id)}),[]);
});
test('换一批优先未展示候选，未知出发城市也不会制造交通和报价',()=>{
  const first=travelCore.candidates({...conditions,themes:[]},{random:()=>.5});
  const next=travelCore.candidates({...conditions,themes:[]},{previous:first.map(c=>c.id),random:()=>.5});
  assert.ok(next.every(c=>!first.some(p=>p.id===c.id)));
  const result=travelCore.candidates({...conditions,origin:'东莞'});assert.ok(result.length);
  for(const c of result){assert.equal(c.price,undefined);assert.equal(c.minutes,undefined);}
});
test('主题乐园独占一天，亲子减少景点，长行程不重复凑数',()=>{
  const plan=travelCore.createPlan(city('上海'),{...conditions,themes:['主题乐园']},'p');
  assert.equal(plan.days[0].spots.length,1);assert.match(plan.days[0].spots[0].name,/迪士尼/);
  const slow=travelCore.createPlan(city('成都'),{...conditions,children:true,days:7},'p');
  assert.ok(slow.days.every(d=>d.spots.length<=1));const ids=slow.days.flatMap(d=>d.spots.map(s=>s.id));assert.equal(ids.length,new Set(ids).size);
});
test('替换景点不重复其他天，保存快照隔离后续编辑，坏存档被拒绝',()=>{
  const c=city('杭州'),plan=travelCore.createPlan(c,conditions,'p');
  const otherDay=JSON.stringify(plan.days[1]);plan.days[0].spots[0]={...travelCore.replacement(c,plan,0,0)};
  assert.equal(JSON.stringify(plan.days[1]),otherDay);assert.equal(new Set(plan.days.flatMap(d=>d.spots.map(s=>s.id))).size,4);
  const saved=JSON.parse(JSON.stringify(plan));plan.days[0].spots[0].name='已修改';assert.notEqual(saved.days[0].spots[0].name,'已修改');
  assert.ok(travelCore.validPlan(saved));assert.ok(!travelCore.validPlan({...saved,days:null}));assert.ok(!travelCore.validPlan({...saved,cityId:'unknown'}));
  assert.equal(travelCore.validConditions({...conditions,date:'2026-02-30'}),false);assert.equal(travelCore.validConditions({...conditions,days:0}),false);
});
function harness(fetcher=async()=>new Response(JSON.stringify({status:'empty'})),stored=[]){
  const handlers={},saved=[],nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',disabled:false,style:{},getBoundingClientRect(){return{};}});
  const document={querySelectorAll:()=>[],addEventListener:(type,handler)=>handlers[type]=handler,createElement:()=>element()};
  for(const id of ['#travelDisc','#travelSpinStatus','#backHome','#help'])nodes.set(id,element());
  const context=vm.createContext({DouxWheel:require("./wheel-motion.js"),DouxTravel:travelCore,read:()=>stored,save:(key,value)=>{saved.push(JSON.parse(JSON.stringify(value)));return true;},today:()=>conditions.date,document,window:{addEventListener(){}},$:id=>nodes.get(id)||null,esc:s=>String(s),state:{page:'travel',busy:false,mapConfigured:false},fetch:fetcher,AbortSignal,Date,JSON,Map,Set,Math,Promise,setTimeout,clearTimeout,console,wait:async()=>{},matchMedia:()=>({matches:true}),getComputedStyle:()=>({transform:''}),DOMMatrix:class{constructor(){this.a=1;this.b=0;}},render(){},showModal(){},modalTop:()=>'',toast(){}});
  vm.runInContext(fs.readFileSync('travel.js','utf8')+';globalThis.t=travel;',context);context.showTravelResult=()=>{};
  return {context,t:context.t,handlers,saved};
}
test('点击开始先锁定中奖项，仅请求这一城市，本轮不重复',async()=>{
  const calls=[],h=harness(async(url,options)=>{calls.push(JSON.parse(options.body));assert.ok(h.t.last);return new Response(JSON.stringify({status:'empty'}));});
  h.t.candidates=[city('厦门'),city('长沙')];await h.context.spinTravel();const first=h.t.last.id;
  await h.context.spinTravel();assert.notEqual(h.t.last.id,first);assert.equal(h.context.travelAvailable().length,0);
  assert.equal(calls.length,2);assert.deepEqual(Object.keys(calls[0]),['name']);assert.equal(h.context.state.busy,false);
});
test('旧城市延迟资料不能覆盖新城市资料，失败可继续规划',async()=>{
  let resolve;const first=new Promise(r=>resolve=r);let calls=0;
  const h=harness(async()=>++calls===1?first:new Response(JSON.stringify({status:'ready',introduction:'新城市'})));
  h.t.round=1;const task=h.context.researchTravel(city('厦门'),1);h.t.round=2;await h.context.researchTravel(city('长沙'),2);
  resolve(new Response(JSON.stringify({status:'ready',introduction:'旧城市'})));await task;assert.equal(h.t.info.introduction,'新城市');
  h.context.fetch=async()=>{throw new Error('offline');};await h.context.researchTravel(city('长沙'),2);assert.equal(h.t.info.status,'error');
});
test('自动保留草稿，刷新恢复编辑；保存快照后清除草稿但保留清单',()=>{
  const h=harness();h.t.plan=travelCore.createPlan(city('厦门'),conditions,'p');h.t.conditions=conditions;h.t.plan.checklist[0]=true;
  h.context.markTravelDirty();assert.equal(h.saved.at(-1).draft.id,'p');
  const restored=harness(undefined,h.saved.at(-1));assert.equal(restored.t.plan.id,'p');assert.equal(restored.t.dirty,true);
  restored.context.saveTravelPlan();const snapshot=restored.saved.at(-1);assert.equal(snapshot.draft,null);assert.equal(snapshot.plans[0].checklist[0],true);assert.ok(snapshot.plans[0].savedAt);
});
test('放轻松保留必去地点，修改不会波及其他天',()=>{
  const h=harness();h.t.plan=travelCore.createPlan(city('厦门'),conditions,'p');h.t.plan.days[0].spots.push({id:'must',name:'必去地点',must:true});const other=JSON.stringify(h.t.plan.days[1]);
  h.context.handleTravelAction({id:'travelLight',dataset:{}});assert.deepEqual(Array.from(h.t.plan.days[0].spots,s=>s.name),['必去地点']);assert.equal(JSON.stringify(h.t.plan.days[1]),other);
});


test('24 座城市的 1～7 天行程每天都有景点，慢节奏与整日景区约束保留',()=>{
  for(const c of travelCore.cities)for(let days=1;days<=7;days++)for(const slow of [false,true]){
    const plan=travelCore.createPlan(c,{...conditions,days,children:slow,themes:['主题乐园']},'p');
    assert.equal(plan.days.length,days);
    for(const day of plan.days){assert.ok(day.spots.length>0,`${c.name} ${days}天`);if(slow||day.spots.some(s=>s.fullDay))assert.equal(day.spots.length,1);}
    const ids=plan.days.flatMap(d=>d.spots.map(s=>s.id));assert.equal(new Set(ids).size,ids.length);
  }
});
test('旧行程可补全空白天且不改动已有安排、必去地点和保存快照',()=>{
  const h=harness();h.t.plan=travelCore.createPlan(city('厦门'),{...conditions,days:7},'legacy');
  h.t.plan.days[0].spots[0].must=true;
  h.t.plan.days[4].spots=[];h.t.plan.days[5].spots=[];h.t.plan.days[6].spots=[];
  h.t.plans=[JSON.parse(JSON.stringify(h.t.plan))];const first=JSON.stringify(h.t.plan.days[0]),saved=JSON.stringify(h.t.plans);
  h.context.handleTravelAction({id:'travelFillDays',dataset:{}});
  assert.ok(h.t.plan.days.every(d=>d.spots.length));assert.equal(JSON.stringify(h.t.plan.days[0]),first);assert.equal(JSON.stringify(h.t.plans),saved);assert.ok(h.t.dirty);
});
test('旅游足迹参与排除去过城市，删除记录后取消排除，旧城市标记独立保留',()=>{
  const h=harness();h.t.visited=[city('杭州').id];h.context.state.visits=[{activity:'travel',storeId:city('厦门').id},{activity:'food',storeId:'restaurant'}];
  assert.deepEqual(Array.from(h.context.travelVisitedIds()).sort(),[city('杭州').id,city('厦门').id].sort());
  h.context.state.visits=[];assert.deepEqual(Array.from(h.context.travelVisitedIds()),[city('杭州').id]);
});


test('旅游记录保存、编辑、删除和清空仅作用于当前分类，刷新可恢复',()=>{
  const listeners={},storage=new Map(),nodes=new Map();
  const element=()=>({addEventListener(){},classList:{add(){},remove(){},toggle(){}},close(){},textContent:'',innerHTML:'',style:{}});
  const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,element());return nodes.get(s);},addEventListener:(type,handler)=>{(listeners[type]||=[]).push(handler);},body:element()};
  const context=vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Doux:require('./core.js'),DouxTravel:travelCore,crypto:require('node:crypto').webcrypto,Date,console,Set,Map,setTimeout:()=>0,clearTimeout(){},confirm:()=>true,FormData:class{constructor(form){this.values=form.values;}get(k){return this.values[k];}}});
  vm.runInContext(fs.readFileSync('app.js','utf8')+';globalThis.s=state;',context);
  vm.runInContext(fs.readFileSync('travel.js','utf8'),context);
  context.render=()=>{};context.travelRecordStore=id=>({id,name:'桂林',activity:'travel',emoji:'🧳'});
  for(const key of ['handleTravelAction','handleFreeWheelAction','handleHomeAction','handleDiscoveryAction','handleCompactAction'])context[key]=()=>false;
  context.s.visits=[{id:'food',activity:'food',name:'餐厅'},{id:'play',activity:'play',name:'场馆'}];
  const photo='data:image/png;base64,aGVsbG8=';
  const form={id:'visitForm',dataset:{store:'city-4',activity:'travel',visit:''},values:{note:'旅行回忆'},images:[photo],querySelectorAll(){return this.images.map(src=>({getAttribute:()=>src}));}};
  const submit=()=>listeners.submit.forEach(fn=>fn({target:form,preventDefault(){}}));
  submit();assert.equal(context.s.visits.length,3);const saved=context.s.visits[2];assert.equal(saved.activity,'travel');assert.equal(saved.name,'桂林');assert.equal(saved.price,undefined);assert.equal(saved.rating,undefined);assert.equal(saved.date,context.today());assert.deepEqual(Array.from(saved.images),[photo]);
  saved.price=1200;saved.rating=4;saved.feeling='喜欢';form.dataset.visit=saved.id;form.values.note='已编辑';submit();assert.equal(context.s.visits.length,3);assert.equal(context.s.visits[2].note,'已编辑');assert.equal(context.s.visits[2].price,1200);assert.equal(context.s.visits[2].rating,4);assert.deepEqual(Array.from(context.s.visits[2].images),[photo]);
  context.s.visitTab='travel';context.renderVisits();const html=nodes.get('#view').innerHTML;assert.ok(html.includes('旅行回忆'));assert.ok(html.includes('旅行照 1'));assert.doesNotMatch(html,/人均|待评分|4 星|原感受/);
  context.showModal=html=>document.querySelector('#modal-content').innerHTML=html;context.openTravelRecordForm({id:'city-4',name:'桂林'},context.s.visits[2]);const formHTML=nodes.get('#modal-content').innerHTML;assert.match(formHTML,/添加旅行照/);assert.doesNotMatch(formHTML,/name="(?:rating|price|date)"|type="checkbox"|确认|实际/);
  form.values.note='';form.images=[];submit();assert.equal(context.s.visits[2].note,'已编辑');
  form.images=[photo];submit();assert.equal(context.s.visits[2].note,'');assert.equal(context.s.visits[2].images.length,1);
  form.images=[];form.values.note='文字记录';submit();assert.equal(context.s.visits[2].images.length,0);
  assert.equal(JSON.parse(storage.get('doux-visits'))[2].activity,'travel');
  const write=context.localStorage.setItem;context.localStorage.setItem=()=>{throw Error('quota');};form.values.note='不能覆盖原记录';submit();assert.equal(context.s.visits[2].note,'文字记录');context.localStorage.setItem=write;
  const click=button=>listeners.click.forEach(fn=>fn({target:{closest:()=>button}}));
  click({dataset:{deleteVisit:saved.id}});assert.deepEqual(Array.from(context.s.visits,v=>v.id),['food','play']);
  form.dataset.visit='';submit();context.s.visitTab='travel';click({id:'clearVisits',dataset:{}});assert.deepEqual(Array.from(context.s.visits,v=>v.id),['food','play']);
});
