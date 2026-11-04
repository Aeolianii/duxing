const test=require('node:test');
const assert=require('node:assert/strict');
const {createVisitPicker}=require('./visit-picker.js');
function fixture(search=async()=>[]){
  const elements={'#modal':{open:true},'#recordSearch':{value:'',focus(){}},'#recordSearchStatus':{textContent:''},'#recordPick':{value:'',innerHTML:'',disabled:false}};
  const state={visitTab:'food',live:true,mapConfigured:true,catalog:{},favorites:[],visits:[],outings:[],origin:{location:[113,23]},config:{limit:5,budget:1}};
  const chosen=[];
  const picker=createVisitPicker({state,core:{stores:[],playStores:[]},maps:{search,playTypes:['博物馆'],matchesPlay:s=>s.category==='博物馆',decoratePlay:s=>({...s,activity:'play',emoji:'🎡'})},node:id=>elements[id],showModal(){elements['#modal'].open=true},modalTop:title=>title,recordForm:store=>chosen.push(store)});
  picker.open();return {picker,state,elements,chosen};
}
const restaurant={id:'amap-B001',poiId:'B001',source:'amap',name:'北京远方餐厅',category:'餐饮服务;中餐厅',address:'北京市测试路1号',location:[116.4,39.9],price:500};
test('搜索远方门店使用全国文本搜索，不带当前位置或半径，不受预算与路程筛选',async()=>{
  const calls=[];const h=fixture(async(...args)=>{calls.push(args);return [restaurant]});
  h.elements['#recordSearch'].value='北京 远方餐厅';await h.picker.search();
  assert.deepEqual(calls,[['北京 远方餐厅',null]]);
  assert.match(h.elements['#recordPick'].innerHTML,/北京市测试路1号/);
  h.picker.choose(restaurant.id);assert.equal(h.chosen[0].poiId,'B001');assert.equal(h.chosen[0].activity,'food');assert.deepEqual(h.chosen[0].location,restaurant.location);
});
test('新查询先返回时，旧查询不能覆盖下拉结果或写入地点缓存',async()=>{
  let finish;const first=new Promise(resolve=>finish=resolve);
  const h=fixture(query=>query==='旧店'?first:Promise.resolve([{...restaurant,id:'amap-B002',poiId:'B002',name:'新店'}]));
  h.elements['#recordSearch'].value='旧店';const old=h.picker.search();
  h.elements['#recordSearch'].value='新店';await h.picker.search();finish([restaurant]);await old;
  assert.match(h.elements['#recordPick'].innerHTML,/新店/);assert.equal(h.state.catalog[restaurant.id],undefined);
});
test('关闭弹窗后搜索响应不会更新下拉结果',async()=>{
  let finish;const h=fixture(()=>new Promise(resolve=>finish=resolve));h.elements['#recordSearch'].value='远方餐厅';
  const pending=h.picker.search();h.elements['#modal'].open=false;finish([restaurant]);await pending;
  assert.equal(h.state.catalog[restaurant.id],undefined);
});
test('没有地图配置时仍能筛选已保存地点，名字和地址中的特殊字符正确转义',async()=>{
  const h=fixture(()=>{throw Error('不应联网')});h.state.mapConfigured=false;h.state.favorites=[{...restaurant,name:'远方 <餐厅>',address:'A&B 路'}];
  h.elements['#recordSearch'].value='远方';await h.picker.search();assert.match(h.elements['#recordPick'].innerHTML,/&lt;餐厅&gt;/);assert.match(h.elements['#recordPick'].innerHTML,/A&amp;B/);
});
test('游玩补录独立筛选场馆，不混入餐厅，选中后保留真实 POI',async()=>{
  const museum={...restaurant,id:'amap-M001',poiId:'M001',name:'远方博物馆',category:'博物馆'};
  const h=fixture(async()=>[restaurant,museum]);h.state.visitTab='play';h.picker.open();h.elements['#recordSearch'].value='博物馆';await h.picker.search();
  assert.doesNotMatch(h.elements['#recordPick'].innerHTML,/远方餐厅/);h.picker.choose(museum.id);assert.equal(h.chosen[0].activity,'play');assert.equal(h.chosen[0].poiId,'M001');
});
test('返回搜索页恢复查询和结果后，仍能选择先前搜索到的远方地点',async()=>{
  const h=fixture(async()=>[restaurant]);h.elements['#recordSearch'].value='北京';await h.picker.search();const snapshot=h.picker.snapshot();
  h.picker.open();h.picker.restore(snapshot);h.picker.choose(restaurant.id);assert.equal(h.chosen[0].poiId,'B001');assert.equal(h.elements['#recordSearch'].value,'北京');
});
