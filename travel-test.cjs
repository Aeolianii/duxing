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
  const context=vm.createContext({DouxTravel:travelCore,read:()=>stored,save:(key,value)=>{saved.push(JSON.parse(JSON.stringify(value)));return true;},today:()=>conditions.date,document,window:{addEventListener(){}},$:id=>nodes.get(id)||null,esc:s=>String(s),state:{page:'travel',busy:false,mapConfigured:false},fetch:fetcher,AbortSignal,Date,JSON,Map,Set,Math,Promise,setTimeout,clearTimeout,console,wait:async()=>{},matchMedia:()=>({matches:true}),getComputedStyle:()=>({transform:''}),DOMMatrix:class{constructor(){this.a=1;this.b=0;}},render(){},showModal(){},modalTop:()=>'',toast(){}});
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
