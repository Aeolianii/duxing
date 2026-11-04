const test=require('node:test'),assert=require('node:assert/strict'),{travelAPI}=require('./travel-service.cjs');
const input={cityId:'dest-广州',city:{name:'广州',spots:['沙面']},conditions:{origin:'上海',date:'2026-11-15',days:1,mode:'铁路',people:1,budget:900,themes:[],arrival:'12:00',leave:'17:00',members:[{tags:['艺术'],ticket:'学生票'}]}};
test('AI 接收成员条件和开放资料，并拒绝抵达前活动',async()=>{
 let start='13:00';const fetcher=async(url,req)=>{if(url.endsWith('/search'))return Response.json({results:[{url:'https://example.org/spot',title:'开放',summary:'下午开放'}]});assert.match(req.body,/学生票/);assert.match(req.body,/下午开放/);return Response.json({choices:[{message:{content:JSON.stringify({days:[{spots:[{name:'沙面',start,end:'15:00',activity:'散步',transport:'步行',minutes:10}]}]})}}]});};
 const run=()=>travelAPI('plan',input,{deepseekKey:'test'},fetcher);assert.match((await run()).days[0].spots[0].stay,/13:00/);start='09:00';await assert.rejects(run,/冲突/);
});
