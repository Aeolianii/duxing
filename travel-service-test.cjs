const test=require('node:test'),assert=require('node:assert/strict'),{travelAPI}=require('./travel-service.cjs');
const input={cityId:'dest-广州',city:{name:'广州',spots:['沙面']},conditions:{origin:'上海',date:'2026-11-15',days:1,mode:'铁路',people:1,budget:900,themes:[],arrival:'12:00',leave:'17:00',members:[{tags:['艺术'],ticket:'学生票'}]}};
test('AI 接收成员条件和开放资料，并拒绝抵达前活动',async()=>{
 let start='13:00';const fetcher=async(url,req)=>{if(url.endsWith('/search'))return Response.json({results:[{url:'https://example.org/spot',title:'开放',summary:'下午开放'}]});assert.match(req.body,/学生票/);assert.match(req.body,/下午开放/);return Response.json({choices:[{message:{content:JSON.stringify({days:[{spots:[{name:'沙面',start,end:'15:00',activity:'散步',transport:'步行',minutes:10}]}]})}}]});};
 const run=()=>travelAPI('plan',input,{deepseekKey:'test'},fetcher);assert.match((await run()).days[0].spots[0].stay,/13:00/);start='09:00';await assert.rejects(run,/冲突/);
});

const citySpots=['沙面','陈家祠','越秀公园','广州塔','白云山','沙湾古镇'];
const base={cityId:'dest-广州',city:{name:'广州',spots:citySpots},conditions:{origin:'上海',date:'2026-11-15',days:4,mode:'铁路',people:1,budget:3000,themes:[]}};
const spot=(name,start,end)=>({name,start,end,activity:'游览',transport:'步行',minutes:10});
const reply=days=>Response.json({choices:[{message:{content:JSON.stringify({days:days.map(spots=>({spots}))})}}]});
function stub(rounds){
 let chat=0;const sent=[];
 const fetcher=async(url,req)=>{
  if(url.endsWith('/search'))return Response.json({results:[]});
  chat++;sent.push(JSON.parse(req.body));
  return reply(rounds[Math.min(chat,rounds.length)-1]);
 };
 return {fetcher,sent,chat:()=>chat};
}
test('景点在每天之间平均分配：拒绝集中到中间两天，并带修正提示重试',async()=>{
 const clustered=[[],[spot('沙面','09:00','10:00'),spot('陈家祠','10:30','11:30'),spot('越秀公园','13:00','14:00')],[spot('广州塔','09:00','10:00'),spot('白云山','10:30','11:30'),spot('沙湾古镇','13:00','14:00')],[]];
 const balanced=[[spot('沙面','09:00','10:00'),spot('陈家祠','10:30','11:30')],[spot('越秀公园','09:00','10:00'),spot('广州塔','10:30','11:30')],[spot('白云山','09:00','10:00')],[spot('沙湾古镇','09:00','10:00')]];
 const {fetcher,sent,chat}=stub([clustered,balanced]);
 const plan=await travelAPI('plan',base,{deepseekKey:'test'},fetcher);
 assert.deepEqual(plan.days.map(d=>d.spots.length),[2,2,1,1]);
 assert.equal(chat(),2);
 const retry=sent[1].messages.at(-1).content;
 assert.match(retry,/上一版行程不能使用/);assert.match(retry,/平均/);
});
test('必去景点优先且分散到不同日期，重排时先满足必去再补普通景点',async()=>{
 const mustGo=['沙面','广州塔','沙湾古镇'];
 const crowded=[[spot('沙面','09:00','10:00'),spot('广州塔','10:30','11:30'),spot('沙湾古镇','13:00','14:00')],[spot('陈家祠','09:00','10:00')],[spot('越秀公园','09:00','10:00')],[spot('白云山','09:00','10:00')]];
 const spread=[[spot('沙面','09:00','10:00'),spot('陈家祠','10:30','11:30')],[spot('广州塔','09:00','10:00'),spot('越秀公园','10:30','11:30')],[spot('沙湾古镇','09:00','10:00')],[spot('白云山','09:00','10:00')]];
 const {fetcher,sent,chat}=stub([crowded,spread]);
 const plan=await travelAPI('plan',{...base,mustGo},{deepseekKey:'test'},fetcher);
 assert.deepEqual(plan.days.flatMap(d=>d.spots).filter(s=>s.must).map(s=>s.name).sort(),[...mustGo].sort());
 assert.ok(plan.days.filter(d=>d.spots.some(s=>s.must)).length>=2);
 assert.equal(chat(),2);
 assert.match(JSON.stringify(sent[0]),/沙湾古镇/);
});
test('单日时间冲突会带反馈重试，修正后返回可用行程',async()=>{
 const base2={...base,conditions:{...base.conditions,days:2}};
 const conflict=[[spot('沙面','09:00','11:00'),spot('陈家祠','10:00','12:00')],[spot('越秀公园','09:00','10:00')]];
 const fixed=[[spot('沙面','09:00','10:00'),spot('陈家祠','10:30','11:30')],[spot('越秀公园','09:00','10:00'),spot('广州塔','10:30','11:30')]];
 const {fetcher,sent,chat}=stub([conflict,fixed]);
 const plan=await travelAPI('plan',base2,{deepseekKey:'test'},fetcher);
 assert.equal(chat(),2);
 assert.deepEqual(plan.days.map(d=>d.spots.length),[2,2]);
 assert.match(sent[1].messages.at(-1).content,/时间/);
});
