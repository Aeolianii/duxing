const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('./review-model.js');

test('真实门店与旧足迹使用同一评价键，不把高德评分当成我的评分',()=>{
  assert.equal(Model.keyOf({id:'amap-B001',rating:4.8}),Model.keyOf({storeId:'amap-B001'}));
  assert.equal(Model.keyOf({poiId:'B001',id:'amap-B001'}),'B001');
  assert.equal(Model.get([],{id:'amap-B001',rating:4}),null);
});
test('同店修改只更新一份我的评价，其他店不变',()=>{
  let rows=Model.put([],{id:'amap-B001'},{rating:4,content:'第一次体验'});
  rows=Model.put(rows,{id:'B002'},{rating:2,content:'另一家店'});
  rows=Model.put(rows,{poiId:'B001'},{rating:5,content:'修改后的体验'});
  assert.equal(rows.length,2);assert.equal(Model.get(rows,{storeId:'amap-B001'}).rating,5);
  assert.equal(Model.get(rows,{id:'B002'}).rating,2);
});
test('旧足迹不推算星级，修改时保留感受、日期与未知字段',()=>{
  const old={id:'v1',storeId:'amap-B001',feeling:'喜欢',date:'2026-01-01',price:80,note:'私密备注',legacy:true};
  assert.equal(Model.rating(old.rating),0);
  const next=Model.visit([old],{id:'amap-B001',name:'测试店'},{date:old.date,price:old.price,note:old.note},old);
  assert.equal(next.length,1);assert.equal(next[0].feeling,'喜欢');assert.equal(next[0].legacy,true);
  assert.equal(next[0].reviewKey,'B001');assert.equal(next[0].date,old.date);assert.equal(old.reviewKey,undefined);
});
test('同店可以多次到访，所有到访关联同一份评分',()=>{
  let visits=Model.visit([],{id:'amap-B001'},{id:'v1',date:'2026-01-01',price:30,note:''});
  visits=Model.visit(visits,{poiId:'B001',id:'amap-B001'},{id:'v2',date:'2026-02-01',price:50,note:''});
  assert.equal(visits.length,2);assert.equal(visits[0].reviewKey,visits[1].reviewKey);
  assert.notEqual(visits[0].price,visits[1].price);
});
test('本机保存中途失败会恢复原评价和足迹',()=>{
  const data=new Map([['doux-my-reviews-v1','old-review'],['doux-visits','old-visit']]);let failed=false;
  const storage={getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem(key,value){if(key==='doux-visits'&&!failed){failed=true;throw Error('quota');}data.set(key,value);}};
  assert.throws(()=>Model.commit(storage,[{rating:5}],[{id:'v'}]),/quota/);
  assert.equal(data.get('doux-my-reviews-v1'),'old-review');assert.equal(data.get('doux-visits'),'old-visit');
});


test('加入行程只产生待出发记录，同一地点不重复加入',()=>{
  const store={id:'amap-B001',poiId:'B001',name:'测试店',rating:4.8};
  const first=Model.plan([],store,{id:'p1',createdAt:'2026-11-04'});
  const same=Model.plan(first,{...store,id:'B001'},{id:'p2',createdAt:'2026-11-04'});
  assert.equal(same.length,1);assert.equal(same[0].status,'planned');assert.equal(same[0].visitId,undefined);
  assert.equal(Model.get([],store),null);
});
test('确认到访只完成对应行程，完成后允许再次计划同一地点',()=>{
  const first=Model.plan([],{id:'B001',name:'第一家'},{id:'p1'});
  const both=Model.plan(first,{id:'B002',name:'第二家'},{id:'p2'});
  const done=Model.finishPlan(both,'p1','v1');
  assert.equal(done[0].status,'visited');assert.equal(done[0].visitId,'v1');assert.equal(done[1].status,'planned');
  assert.equal(first[0].status,'planned');
  assert.equal(Model.plan(done,{id:'B001'},{id:'p3'}).length,3);
});
test('移除待出发行程保留原记录，不改变已到访行程',()=>{
  const plans=[{id:'p1',status:'planned'},{id:'p2',status:'visited',visitId:'v2'}];
  const next=Model.cancelPlan(plans,'p1');assert.equal(next.length,2);assert.equal(next[0].status,'cancelled');
  assert.deepEqual(Model.cancelPlan(next,'p2'),next);
});
test('完成行程落盘失败时，评分、足迹与行程一起恢复',()=>{
  const data=new Map([['doux-my-reviews-v1','old-review'],['doux-visits','old-visit'],['doux-outings-v1','old-plan']]);let failed=false;
  const storage={getItem:key=>data.get(key)??null,removeItem:key=>data.delete(key),setItem(key,value){if(key==='doux-outings-v1'&&!failed){failed=true;throw Error('quota');}data.set(key,value);}};
  assert.throws(()=>Model.commit(storage,[{rating:5}],[{id:'v'}],[{status:'visited'}]),/quota/);
  assert.equal(data.get('doux-my-reviews-v1'),'old-review');assert.equal(data.get('doux-visits'),'old-visit');assert.equal(data.get('doux-outings-v1'),'old-plan');
});
