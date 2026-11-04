const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const empty={total:0,summary:{count:0,average:0,histogram:{1:0,2:0,3:0,4:0,5:0},photos:0,tags:[]},reviews:[],myReview:null,hasMore:false};
function fixture(data=empty,fail=false){
  const body={innerHTML:''},own={innerHTML:''},calls=[],writes=[];
  const panel={innerHTML:'',dataset:{},isConnected:true,querySelector:selector=>selector==='.rv-body'?body:selector==='.rv-my-review'?own:null};
  const root={DouxReviewModel:require('./review-model.js'),read:()=>[],addEventListener(){}};
  const context={window:root,state:{username:'测试用户',visits:[],outings:[],page:'near'},document:{addEventListener(){},getElementById:id=>id==='storeReviews'?panel:null},localStorage:{getItem:key=>key==='doux-device'?'sample-device-123':null,setItem:(...args)=>writes.push(args)},URLSearchParams,AbortSignal,Date,console,setTimeout,clearTimeout,
    fetch:async(url,options)=>{calls.push({url,method:options?.method||'GET'});if(fail)throw Error('测试网络失败');return new Response(JSON.stringify(data));}};
  vm.runInNewContext(fs.readFileSync(__dirname+'/reviews.js','utf8'),context);
  return {api:root.DouxReviews,body,panel,calls,writes};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('美食中奖结果展示一条带星级、人均、配图和标签的示例，不写入真实数据',async()=>{
  const h=fixture();h.api.mount({id:'B001',activity:'food'},{won:true});await settle();
  assert.equal((h.body.innerHTML.match(/<section class="rv-example"/g)||[]).length,1);
  for(const text of ['示例评价','仅用于界面展示','示例评分','示例人均 ¥58','assets/food.webp','味道好','环境舒服'])assert.ok(h.body.innerHTML.includes(text),text);
  assert.doesNotMatch(h.body.innerHTML,/data-rv-like="food-example"/);
  assert.equal(h.api.snapshot().list.data.total,0);assert.equal(h.api.snapshot().list.data.summary.count,0);
  assert.equal(h.api.snapshot().list.data.reviews.length,0);assert.equal(h.writes.length,0);assert.ok(h.calls.every(call=>call.method==='GET'));
});
test('游玩中奖和美食地点预览都不展示示例评价',async()=>{
  for(const [activity,won]of [['play',true],['food',false],['travel',true]]){
    const h=fixture();h.api.mount({id:'B001',activity},{won});await settle();assert.doesNotMatch(h.body.innerHTML,/rv-example/);assert.match(h.body.innerHTML,/还没有人评价过这里/);
  }
});
test('已有真实评价时示例单独展示，不改变真实数量、评分和点赞',async()=>{
  const data={...empty,total:1,summary:{...empty.summary,count:1,average:4,histogram:{1:0,2:0,3:0,4:1,5:0}},reviews:[{id:'real-1',rating:4,actualPrice:88,author:{name:'真实用户'},content:'真实提交的体验',createdAt:'2026-11-05T00:00:00Z',images:[],tags:[],likes:2,liked:false}]};
  const h=fixture(data);h.api.mount({id:'B001',activity:'food'},{won:true});await settle();
  assert.match(h.body.innerHTML,/真实用户/);assert.match(h.body.innerHTML,/站内平均分 · 1 条评价/);assert.match(h.body.innerHTML,/示例评价/);
  assert.equal(h.api.snapshot().list.data.summary.average,4);assert.equal(h.api.snapshot().list.data.reviews.length,1);assert.equal(h.api.snapshot().list.data.reviews[0].likes,2);
});
test('历史恢复保留美食中奖的示例标志，不因切换游玩而串场',async()=>{
  const h=fixture();h.api.mount({id:'food-1',activity:'food'},{won:true});await settle();const snapshot=h.api.snapshot();
  h.api.mount({id:'play-1',activity:'play'},{won:true});await settle();assert.doesNotMatch(h.body.innerHTML,/rv-example/);
  h.api.restore(snapshot);await settle();assert.match(h.body.innerHTML,/rv-example/);assert.equal(h.api.snapshot().list.showExample,true);
});
test('真实评价读取失败时仍可展示美食结果的示例界面',async()=>{
  const h=fixture(empty,true);h.api.mount({id:'B001',activity:'food'},{won:true});await settle();assert.match(h.body.innerHTML,/rv-example/);assert.match(h.body.innerHTML,/评价暂时读取失败/);
});
