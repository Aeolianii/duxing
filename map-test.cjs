const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createServer}=require('./server.cjs');
const adapter=require('./amap-client.js');
const core=require('./core.js');
const test=require('node:test');

test('POI 缺失字段、照片与坐标不会制造评分或位置',()=>{
  const p=adapter.normalize({id:'B123',name:'餐厅',location:{lng:113,lat:23},biz_ext:{rating:[],cost:[]},photos:[{url:'javascript:alert(1)'},{url:'https://example.test/a.jpg'}]});
  assert.equal(p.rating,null);assert.equal(p.price,null);assert.equal(p.hours,null);
  assert.deepEqual(p.location,[113,23]);assert.deepEqual(p.photos,['https://example.test/a.jpg']);
  assert.equal(adapter.coordinates('not-a-coordinate'),null);
  assert.equal(adapter.routeMinutes({routes:[{time:601}]}),11);
  assert.equal(adapter.routeMinutes({routes:[]}),null);
});
test('真实路线时间和未知营业必须满足全部限制',()=>{
  const cfg={budget:50,unknownPrice:false,open:false};
  assert.equal(adapter.eligible({price:45},cfg,[10,31],[15,30]),false);
  assert.equal(adapter.eligible({price:45},cfg,[10,null],[15,30]),false);
  assert.equal(adapter.eligible({price:45},cfg,[10,25],[15,30]),true);
  assert.equal(adapter.eligible({price:null},cfg,[10],[15]),false);
  assert.equal(adapter.eligible({price:null},{...cfg,unknownPrice:true},[10],[15]),true);
  assert.equal(adapter.eligible({price:45},{...cfg,open:true},[10],[15]),false);
  assert.equal(adapter.eligible({price:45},{...cfg,open:true,unknownHours:true},[10],[15]),true);
});
test('SDK 回调处理失败、无数据与超时',async()=>{
  assert.equal(await adapter.call(done=>done('no_data')),null);
  await assert.rejects(adapter.call(done=>done('error')));
  await assert.rejects(adapter.call(()=>{},5),/超时/);
});
test('公交时间包含全程且排除出租车及铁路方案',()=>{
  assert.equal(adapter.transitMinutes({plans:[{time:601,segments:[{transit_mode:'WALK'},{transit_mode:'SUBWAY'}]},{time:100,segments:[{transit_mode:'TAXI'}]},{time:120,segments:[{transit_mode:'RAILWAY'}]}]}),11);
  assert.equal(adapter.transitMinutes({plans:[]}),null);
  assert.equal(adapter.transitMinutes(null),null);
});
test('公交适配传入城市并在无换乘方案时核对真实步行',async()=>{
  let options,walking=0;
  const AMap={plugin(_names,done){done();},TransferPolicy:{LEAST_TIME:0},
    Transfer:class{constructor(value){options=value;}search(_from,_to,done){done('complete',{info:'NO_DATA',plans:[]});}},
    Walking:class{search(_from,_to,done){walking++;done('complete',{routes:[{time:361}]});}}};
  const context={window:{AMap},location:{origin:'http://localhost'},document:{createElement:()=>({remove(){}}),head:{append(script){script.onload();}}},fetch:async()=>({ok:true,json:async()=>({configured:true,key:'test'})}),AbortSignal,setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/amap-client.js','utf8'),context);
  assert.equal(await context.window.DouxMap.route([113,23],[113.01,23.01],'公共交通',{city:'广州',cityd:'广州'}),7);
  assert.equal(options.city,'广州');assert.equal(options.cityd,'广州');assert.equal(walking,1);
});
test('JSONP 代理使用可执行 MIME，同时拒绝无效回调',async()=>{
  const server=createServer({config:{key:'test-key',security:'test-code'},fetcher:async()=>new Response('AMap.test({"status":"1"})',{headers:{'Content-Type':'application/json'}})});
  const base=await listen(server);
  try{
    const response=await fetch(base+'/_AMapService/v3/place/around?callback=AMap.test');
    assert.match(response.headers.get('content-type'),/^application\/javascript/);
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(await response.text(),'AMap.test({"status":"1"})');
    assert.equal((await fetch(base+'/_AMapService/v3/place/around?callback=alert(1)')).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('菜系映射区分西餐、东南亚与烧烤，不能把地方菜当烧烤',()=>{
  assert.equal(adapter.matchesCuisine({typecode:'050204',category:'法式菜品餐厅'},['西餐']),true);
  assert.equal(adapter.matchesCuisine({typecode:'050204',category:'法式菜品餐厅'},['东南亚']),false);
  assert.equal(adapter.matchesCuisine({typecode:'050206',category:'泰国/越南菜品餐厅'},['东南亚']),true);
  assert.equal(adapter.matchesCuisine({typecode:'050118',category:'特色/地方风味餐厅',name:'家常菜'},['烧烤']),false);
  assert.equal(adapter.matchesCuisine({typecode:'050118',name:'小院烧烤'},['烧烤']),true);
  assert.equal(adapter.matchesCuisine({name:'巷口奶茶',category:'餐饮服务'},['奶茶']),true);
  assert.equal(adapter.matchesCuisine({name:'喜茶(广场店)',category:'餐饮服务'},['奶茶']),true);
  assert.equal(adapter.matchesCuisine({name:'家常菜',category:'中餐厅'},['奶茶']),false);
});
test('游玩分类按类型或名称匹配，不能把写字楼当电影院',()=>{
  assert.equal(adapter.matchesPlay({name:'金逸空中电影城',category:'体育休闲服务;影剧院;电影院'},['看电影']),true);
  assert.equal(adapter.matchesPlay({name:'天德荟商务公馆',category:'商务住宅;楼宇;商务写字楼'},['看电影']),false);
  assert.equal(adapter.matchesPlay({name:'Time Travel密室体验馆',category:'体育休闲服务;体育休闲服务场所;体育休闲服务场所'},['密室逃脱']),true);
  assert.equal(adapter.matchesPlay({name:'剧汇推理社剧本杀',category:'体育休闲服务;娱乐场所;娱乐场所'},['剧本杀']),true);
  assert.equal(adapter.matchesPlay({name:'星聚会KTV黑金店',category:'体育休闲服务;娱乐场所;KTV'},['唱K']),true);
  assert.equal(adapter.matchesPlay({name:'声音共和Livehouse',category:'体育休闲服务;娱乐场所;酒吧'},['酒吧']),true);
  assert.equal(adapter.matchesPlay({name:'广州塔剧场',category:'体育休闲服务;影剧院;剧场'},['看演出']),true);
  assert.equal(adapter.matchesPlay({name:'随便一家小店',category:'餐饮服务'},[]),true);
});
test('游玩附近搜索逐个分类请求，只保留匹配场馆并带场馆表情',async()=>{
  const calls=[];
  const poi=(id,name,type,typecode)=>({id,name,type,typecode,location:'113.3,23.1',biz_ext:{}});
  const AMap={plugin(_names,done){done();},
    PlaceSearch:class{constructor(options){this.options=options;}
      searchNearBy(keyword,_center,_radius,done){
        calls.push({type:this.options.type,keyword});
        const pois=this.options.type==='080601'?[poi('A1','金逸空中电影城','体育休闲服务;影剧院;电影院','080601'),poi('A2','某写字楼','商务住宅;写字楼','120201')]:
          [poi('B1','迷雾密室逃脱','体育休闲服务;娱乐场所','080000'),poi('B2','某咖啡馆','餐饮服务;咖啡厅','050500')];
        done('complete',{poiList:{pois}});
      }}};
  const context={window:{AMap},location:{origin:'http://localhost'},document:{createElement:()=>({remove(){}}),head:{append(script){script.onload();}}},fetch:async()=>({ok:true,json:async()=>({configured:true,key:'test'})}),AbortSignal,setTimeout,clearTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/amap-client.js','utf8'),context);
  const movies=await context.window.DouxMap.nearby([113.3,23.1],{limit:15,mode:'步行',types:['看电影'],activity:'play'});
  assert.deepEqual(calls,[{type:'080601',keyword:''}]);
  assert.deepEqual(Array.from(movies,s=>s.name),['金逸空中电影城']);
  assert.equal(movies[0].activity,'play');assert.equal(movies[0].emoji,'🎬');
  calls.length=0;
  const escapes=await context.window.DouxMap.nearby([113.3,23.1],{limit:15,mode:'步行',types:['密室逃脱'],activity:'play'});
  assert.deepEqual(calls,[{type:'080000',keyword:'密室逃脱|密室|逃脱'}]);
  assert.deepEqual(Array.from(escapes,s=>s.name),['迷雾密室逃脱']);
  assert.equal(escapes[0].emoji,'🗝️');
});
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
test('本地服务不暴露配置文件，未配置时不代理',async()=>{
  let calls=0;const server=createServer({config:{key:'',security:''},fetcher:()=>calls++});const base=await listen(server);
  try{
    assert.deepEqual(await (await fetch(base+'/api/map-config')).json(),{configured:false,key:''});
    for(const name of ['.env','.git/config','server.cjs','.env.example','%2eenv'])assert.equal((await fetch(base+'/'+name)).status,404);
    assert.equal((await fetch(base+'/_AMapService/v3/place/around')).status,503);assert.equal(calls,0);
    assert.equal((await fetch(base+'/app.js')).status,200);
    assert.equal((await fetch(base+'/api/map-config',{headers:{Origin:'https://evil.example'}})).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('安全代理固定高德上游，覆盖伪造凭证并隐藏安全密钥',async()=>{
  let forwarded;
  const server=createServer({config:{key:'public-test-key',security:'private-test-code'},fetcher:async(url)=>{forwarded=url;return new Response('{"status":"1","echo":"private-test-code"}',{headers:{'Content-Type':'application/json'}});}});
  const base=await listen(server);
  try{
    const config=await (await fetch(base+'/api/map-config')).json();assert.equal(config.security,undefined);
    const response=await fetch(base+'/_AMapService/v3/place/around?key=wrong&jscode=wrong&location=113,23');
    assert.equal(forwarded.origin,'https://restapi.amap.com');assert.equal(forwarded.searchParams.get('key'),'public-test-key');
    assert.equal(forwarded.searchParams.get('jscode'),'private-test-code');assert.ok(!(await response.text()).includes('private-test-code'));
    assert.equal((await fetch(base+'/_AMapService/https://evil.example')).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

function harness(map){
  const element={addEventListener(){},innerHTML:'',textContent:'',open:false,style:{},parentElement:{setAttribute(){}},close(){},showModal(){}};
  const context={state:{page:'near',origin:{name:'测试起点',location:[113,23]},config:{mode:'步行',limit:15,budget:0,types:[],count:6,activity:'food'},people:[],excluded:new Set(),drawn:new Set(),repeat:false,request:0,custom:[],catalog:{}},
    DouxMap:{...adapter,...map},Doux:core,document:{addEventListener(){},querySelector(){return element;}},$:()=>element,generate(){},render(){},toast(){},openCustom(){},fetch:async()=>({ok:false}),AbortSignal,console,setTimeout,clearTimeout,window:{scrollTo(){}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/discovery.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/map-ui.js','utf8'),context);context.state.live=true;
  return context;
}
test('较旧的候选请求不能覆盖新条件的结果',async()=>{
  let resolveOld,count=0;
  const restaurant=id=>({id,source:'amap',location:[113.1,23.1],price:30});
  const h=harness({nearby:()=>++count===1?new Promise(resolve=>resolveOld=resolve):Promise.resolve([restaurant('new')]),route:async()=>10});
  const old=h.refreshCandidates();await h.refreshCandidates();resolveOld([restaurant('old')]);await old;
  assert.equal(h.state.candidates[0].id,'new');assert.equal(h.state.loading,false);
  assert.equal(h.state.stage,'wheel');
});
test('取消生成后旧请求不会跳回转盘，无结果留在地图',async()=>{
  let finish;
  const h=harness({nearby:()=>new Promise(resolve=>finish=resolve),route:async()=>10});
  const pending=h.refreshCandidates();assert.equal(h.state.stage,'loading');h.returnToMap();
  finish([{id:'old',location:[113,23],price:30}]);await pending;
  assert.equal(h.state.stage,'map');assert.equal(h.state.loading,false);assert.equal(h.state.candidates.length,0);
  const empty=harness({nearby:async()=>[]});await empty.refreshCandidates();assert.equal(empty.state.stage,'map');
});
test('公平集合按真实多起点耗时排序且排除超时店',async()=>{
  const h=harness({nearby:async()=>[1,2,3].map(n=>({id:'store'+n,location:[n,23],price:30})),route:async(from,to)=>({1:[10,30],2:[20,20],3:[10,40]}[to[0]][from[0]-1])});
  h.state.page='fair';h.state.people=[{origin:{location:[1,23]},mode:'步行',limit:30},{origin:{location:[2,23]},mode:'驾车',limit:30}];
  await h.refreshCandidates();assert.deepEqual(Array.from(h.state.candidates,s=>s.id),['store2','store1']);
});
test('自选校验只按路程与预算，不再按类别二次筛选',async()=>{
  const h=harness({route:async()=>8});
  h.state.live=true;h.state.activity='play';
  h.state.config={mode:'步行',limit:20,budget:0,types:[],count:6,activity:'play'};
  h.state.custom=[
    {id:'cinema',source:'amap',location:[113.31,23.11],category:'体育休闲服务;影剧院;电影院',name:'金逸影城'},
    {id:'restaurant',source:'amap',location:[113.31,23.11],category:'餐饮服务;中餐厅',name:'某餐厅'},
    {id:'manual',manual:true,name:'自组局'}
  ];
  await h.validateCustom();
  assert.deepEqual(Array.from(h.state.candidates,s=>s.id),['cinema','restaurant'],'手动挑选的候选不再被类别筛掉');
});
test('详情请求失败保留真实基础资料而非填入演示介绍',async()=>{
  const h=harness({details:async()=>{throw new Error('offline')}}),store={id:'real',source:'amap',name:'真实店'};
  await h.prepareDetails(store,0);assert.equal(store.name,'真实店');assert.equal(store.detailError,true);assert.equal(store.intro,undefined);
});

test('共享及缓存资料不会覆盖新路线或自定义显示名称',async()=>{
  let finish,calls=0;
  const h=harness({details:s=>{calls++;return new Promise(resolve=>finish=()=>resolve({...s,phone:'020-123',max:99}));}});
  h.DouxAI={research:async()=>({status:'ready',retrievedAt:new Date().toISOString()})};
  const original={id:'real',source:'amap',poiId:'A',name:'真实店',address:'地址',max:12};
  const newer={...original,name:'我的别名',poiName:'真实店',max:5};
  const a=h.prepareMerchantDetails(original,0),b=h.prepareMerchantDetails(newer,0);finish();await Promise.all([a,b]);
  assert.equal(calls,1);assert.equal(newer.max,5);assert.equal(newer.name,'我的别名');assert.equal(newer.phone,'020-123');
  await h.prepareMerchantDetails(newer,0);assert.equal(calls,1);assert.equal(newer.max,5);
});

test('详情空值保留已有评分、人均和图片，有效新值正常更新',()=>{
  const old={id:'amap-A',poiId:'A',name:'别名',poiName:'真实店',rating:4.6,price:80,photos:['https://example.com/photo.jpg'],phone:'123',location:[113,23]};
  const kept=adapter.mergeDetails(old,{id:'A',name:'真实店',biz_ext:{rating:[],cost:''},photos:[],tel:''});
  assert.equal(kept.rating,4.6);assert.equal(kept.price,80);assert.deepEqual(kept.photos,old.photos);assert.equal(kept.phone,'123');assert.equal(kept.name,'别名');assert.deepEqual(kept.location,old.location);
  const updated=adapter.mergeDetails(old,{id:'A',biz_ext:{rating:'4.8',cost:'95'}});
  assert.equal(updated.rating,4.8);assert.equal(updated.price,95);
});

test('资料层及缓存的空值不覆盖调用方已有商业数据',async()=>{
  const h=harness({details:async()=>({rating:null,price:null,photos:[],phone:''})});
  h.DouxAI={research:async()=>({status:'ready',retrievedAt:new Date().toISOString()})};
  const s={id:'real',poiId:'A',name:'真实店',address:'地址',source:'amap',rating:4.5,price:60,photos:['photo']};
  await h.prepareMerchantDetails(s,0);assert.equal(s.rating,4.5);assert.equal(s.price,60);assert.deepEqual(s.photos,['photo']);
  const blank={...s,poiId:'B',rating:null,price:null};await h.prepareMerchantDetails(blank,0);
  const richer={...blank,rating:4.9,price:100};await h.prepareMerchantDetails(richer,0);
  assert.equal(richer.rating,4.9);assert.equal(richer.price,100);
});

test('自选门店自动核对路程，复用相同请求并随起点或出行方式刷新',async()=>{
  let calls=0;
  const h=harness({route:async(from,_to,mode)=>{calls++;return mode==='驾车'?5:from[0]===113?12:20;}});
  h.state.page='custom';const s={source:'amap',location:[114,23]};
  await Promise.all([h.ensureStoreRoute(s),h.ensureStoreRoute(s)]);
  assert.equal(calls,1);assert.equal(s.max,12);assert.equal(s.routeStatus,'ready');
  await h.ensureStoreRoute(s);assert.equal(calls,1);
  h.state.origin.location=[112,23];await h.ensureStoreRoute(s);assert.equal(s.max,20);
  h.state.config.mode='驾车';await h.ensureStoreRoute(s);assert.equal(s.max,5);assert.equal(s.routeMode,'驾车');
});

test('缺少起点清除旧路线；请求失败可主动重试，未知耗时不作为零分钟',async()=>{
  let calls=0;
  const h=harness({route:async()=>++calls===1?null:8}),s={source:'amap',location:[114,23],max:99};
  h.state.origin.location=null;await h.ensureStoreRoute(s);assert.equal(s.max,undefined);assert.equal(s.routeStatus,'missing-origin');assert.equal(calls,0);
  h.state.origin.location=[113,23];await h.ensureStoreRoute(s);assert.equal(s.routeStatus,'error');assert.equal(s.max,undefined);
  await h.ensureStoreRoute(s);assert.equal(calls,1);
  await h.ensureStoreRoute(s,true);assert.equal(s.max,8);assert.equal(s.routeStatus,'ready');
});

test('旧路线响应不覆盖更换起点后的耗时',async()=>{
  let finish;
  const h=harness({route:async from=>from[0]===113?new Promise(r=>finish=r):4}),s={source:'amap',location:[114,23]};
  const old=h.ensureStoreRoute(s);h.state.origin.location=[112,23];h.state.request++;
  await h.ensureStoreRoute(s);finish(30);await old;assert.equal(s.max,4);
});
