const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('./server.cjs');
const T=require('./travel-core.js');
const conditions={origin:'北京',days:2,date:'2026-11-12',people:2,budget:1000,mode:'铁路',themes:[]};
const city={name:'上海',spots:['外滩']};
async function fixture(t,fetcher){
 const server=createServer({config:{deepseekKey:'test',quoteURL:'https://example.invalid'},fetcher});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 return (route,body,headers={})=>fetch(base+'/api/travel/'+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
}
test('并发畸形输入和安全边界：不调用供应方，后续正常请求仍可用',async t=>{
 let calls=0;
 const post=await fixture(t,async()=>{calls++;return Response.json({offers:[]});});
 const cases=[['{',{},400],['null',{},400],['[]',{},400],['x'.repeat(17000),{},413],['{}',{'Content-Type':'text/plain'},415],['{}',{Origin:'https://example.org'},403]];
 await Promise.all(Array.from({length:30},async(_,i)=>{const [body,headers,status]=cases[i%cases.length];assert.equal((await post('quote',body,headers)).status,status);}));
 assert.equal(calls,0);
 const r=await post('quote',JSON.stringify({city,cityId:'dest-上海',conditions}));assert.equal(r.status,200);assert.equal((await r.json()).status,'empty');
});
test('库存接口故障与真实无票分开，恢复后可重试',async t=>{
 const replies=[()=>{throw Error('offline')},()=>new Response('bad gateway',{status:502}),()=>new Response('<html>'),()=>Response.json({offers:[]})];
 const post=await fixture(t,async()=>replies.shift()());
 for(const status of [400,400,400,200]){const r=await post('quote',JSON.stringify({city,cityId:'dest-上海',conditions}));assert.equal(r.status,status);const body=await r.json();if(status===200)assert.equal(body.status,'empty');else assert.ok(body.error);}
});
test('损坏的本地行程条目应被跳过，不能阻止页面启动',()=>{
 T.cities.push({id:'dest-上海'});
 for(const days of [[null,null],[{},null],[{spots:[null]},{spots:[]}]])assert.ok(!T.validPlan({id:'p',cityId:'dest-上海',conditions,days,checklist:{}}));
});
