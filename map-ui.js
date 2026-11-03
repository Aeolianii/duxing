'use strict';
// Compact phone UI and the real-map workflow share the existing roulette state.
const mapUI={map:null,marker:null,token:0,searchToken:0,draft:null,target:null,results:[]};
state.live=false;state.mapConfigured=false;state.catalog={};state.request=0;state.checkingMap=true;

function disposeMap(){mapUI.token++;mapUI.searchToken++;mapUI.map?.destroy();mapUI.map=null;mapUI.marker=null;}
function openFilters(){showModal(modalTop((state.activity==='play')?'🎡 这一次，想怎么玩？':'🍋 这一顿，想怎么吃？')+settings());}
function openCandidates(){showModal(modalTop('🍽️ 本轮的美味候选')+`<div class="candidate-list">${available().map(s=>`<div class="candidate-row"><button data-detail="${s.id}" class="candidate-main"><span class="candidate-emoji">${s.emoji||'🍽️'}</span><span><strong>${esc(s.name)}</strong><small>${s.price==null?'人均未知':'约 ¥'+s.price+'/人'}${Number.isFinite(s.max)?' · '+s.max+' 分钟':''}</small></span></button><button data-exclude="${s.id}" class="close" aria-label="移除${esc(s.name)}">×</button></div>`).join('')||'<div class="empty"><b>还没有可抽的餐厅</b>试试调整条件，或开启新一轮。</div>'}</div><p class="muted sheet-note">每家概率相同，点店名查看详情。</p>`);}
function openCustom(){showModal(modalTop((state.activity==='play')?'🎡 我的心愿场馆':'🍱 我的心愿餐厅')+customPanel()+(state.mapConfigured?'<button class="btn full" id="searchCustom">在高德查找餐厅</button>':''));}
function openPeople(){
  if(!state.live){showModal(modalTop('👫 饭搭子从哪出发？')+fairPanel());return;}
  showModal(modalTop('👫 饭搭子从哪出发？')+`<p class="muted">分别选好出发点，我们再比较真实路线。</p><div class="people">${state.people.map((p,i)=>`<div class="person live-person"><span class="person-color-pin" style="color:${personIdentity(i).color}">${originPin(personIdentity(i).username)}</span>${usernameField(i)}<button class="person-place" data-select-person="${i}">${esc(p.origin?.name||'选择出发点')} ›</button><select aria-label="成员${i+1}出行方式" data-person="${i}" data-key="mode">${['步行','公共交通','驾车'].map(t=>`<option ${t===p.mode?'selected':''}>${t}</option>`).join('')}</select><select aria-label="成员${i+1}时间限制" data-person="${i}" data-key="limit">${[10,15,20,30,45,60].map(n=>`<option value="${n}" ${n===p.limit?'selected':''}>${n}分钟</option>`).join('')}</select><button data-remove-person="${i}" aria-label="移除成员${i+1}" ${state.people.length<=2?'disabled':''}>×</button></div>`).join('')}</div><div class="actions"><button class="btn secondary" id="addPerson" ${state.people.length>=6?'disabled':''}>＋ 加一位</button><button class="btn" id="applyFilters">确认这些出发点</button></div><details class="fold"><summary>怎么照顾每个人的路程？</summary><p class="muted">先满足所有人的时间限制，再按最长路程、时间差、总时间排序。仅比较这次检索到的店，入选后等概率抽取。</p></details>`);
}
function setupSheet(){showModal(modalTop('🗺️ 高德地图设置')+`<div class="setup-art">🗺️<span>让美味，离你近一点</span></div><p class="detail-copy">${state.mapConfigured?'本地已检测到配置。真实地图可搜索、拖动选点并获取附近餐厅。':'还没有 Key 也可以继续体验转盘。申请后填入本地配置，就能查找真实的附近餐厅。'}</p><ol class="setup-steps"><li>打开高德开放平台，登录并创建应用。</li><li>添加 <b>Web端（JS API）</b> Key，取得 Key 和安全密钥。</li><li>将 demo 中的 <b>.env.example</b> 复制为 <b>.env</b>，填写两个值；关闭旧服务再启动。</li></ol><p class="muted">密钥只填在自己的电脑上，不用发到聊天里。控制台如要求白名单，配置本地访问域名。</p><a class="btn full" href="https://console.amap.com/dev/key/app" target="_blank" rel="noopener noreferrer">前往高德控制台 ↗</a>${state.mapConfigured?`<button class="btn secondary full sheet-note" id="toggleMapMode">${state.live?'切换到演示体验':'使用真实高德数据'}</button>`:''}<details class="fold"><summary>数据与定位说明</summary><p class="muted">点击定位才会请求设备位置；选点、搜索和路线查询会传给高德。评分、照片、价格可能缺失；抽取时由 DeepSeek 搜索并整理公开门店资料，仅发送店名、地址和分类，不发送个人起点或到店记录。收藏和到店记录留在当前浏览器。</p></details>`);}

async function openLocation(target='near'){
  if(!state.live&&typeof target==='number')return openPeople();
  if(!state.live){
    showModal(modalTop('📍 从这里出发')+`<div class="notice">演示地点，可先体验选点。真实地图需要配置高德。</div><div class="chips sheet-note">${places.map((p,i)=>`<button class="chip" data-demo-place="${i}">${p.name}</button>`).join('')}</div>${mapHTML()}<button class="btn full sheet-note" data-close>就从这里出发</button><button class="btn secondary full sheet-note" id="mapSetup">配置高德地图</button>`);bindMap();return;
  }
  const previous=typeof target==='number'?state.people[target].origin:state.origin;
  showModal(modalTop(target==='custom'?((state.activity==='play')?'搜索真实场馆':'搜索真实餐厅'):'📍 选一个出发点')+`<div class="search-line"><input id="mapSearch" aria-label="搜索城市、地点或餐厅" placeholder="输入城市、地点或餐厅"><button id="mapSearchGo" class="btn small">搜索</button></div><div id="mapResults" class="map-results"></div><div class="real-map-wrap"><div id="realMap" aria-label="高德地图，可拖拽或点击选点"></div><div id="mapLoading" class="map-loading">正在打开地图…</div></div><div class="map-selection"><strong id="selectedPlace">${esc(previous?.location?previous.name:'默认浏览广州，请搜索或移动地图选点')}</strong><button id="realLocate" class="btn secondary small">⌖ 定位</button></div><p id="mapError" class="muted" role="status">点击地图或拖动地图后，确认出发点。</p><button id="confirmLocation" class="btn full sheet-note" ${previous?.location&&target!=='custom'?'':'disabled'}>${target==='custom'?'将选中的餐厅加入转盘':'就从这里出发'}</button>`);
  mapUI.target=target;mapUI.draft=previous?.location&&target!=='custom'?{...previous}:null;mapUI.results=[];
  const token=mapUI.token;
  try{
    const A=await DouxMap.load();if(token!==mapUI.token||!$('#realMap'))return;
    const center=previous?.location||[113.32452,23.10647];
    mapUI.map=new A.Map('realMap',{zoom:15,center,viewMode:'2D'});
    mapUI.marker=new A.Marker({position:center});mapUI.map.add(mapUI.marker);
    const select=(point,name)=>{
      if(target==='custom')return;
      mapUI.searchToken++;mapUI.draft={location:DouxMap.coordinates(point),name:name||'地图选定位置'};
      mapUI.marker.setPosition(point);$('#selectedPlace').textContent=mapUI.draft.name;$('#confirmLocation').disabled=false;
    };
    mapUI.map.on('click',e=>select(e.lnglat));
    mapUI.map.on('dragend',()=>select(mapUI.map.getCenter()));
    $('#mapLoading').remove();
  }catch(error){if(token===mapUI.token&&$('#mapError')){$('#mapError').textContent=error.message;$('#mapLoading').textContent='地图暂未加载，可关闭后重试';}}
}
async function searchMap(){
  const query=$('#mapSearch')?.value.trim();if(!query)return toast('先输入一个地点名称');
  const token=mapUI.token,searchToken=++mapUI.searchToken;
  $('#mapResults').textContent='正在查找…';
  try{const results=await DouxMap.search(query,mapUI.target==='custom'?state.origin?.location:null);if(token!==mapUI.token||searchToken!==mapUI.searchToken)return;
    const playSearch=state.activity==='play';mapUI.results=mapUI.target==='custom'?(playSearch?results.filter(s=>DouxMap.matchesPlay(s,DouxMap.playTypes)).map((s,i)=>DouxMap.decoratePlay(s,i)):results.filter(s=>s.category.startsWith('餐饮'))):results;
    $('#mapResults').innerHTML=mapUI.results.map((p,i)=>`<button data-map-result="${i}"><strong>${esc(p.name)}</strong><small>${esc(p.address)}</small></button>`).join('')||'<p class="muted">没找到匹配地点，试试加上城市名。</p>';
  }catch(error){if(token===mapUI.token&&searchToken===mapUI.searchToken)$('#mapResults').textContent=error.message;}
}
async function locateReal(){
  const token=mapUI.token,searchToken=++mapUI.searchToken;$('#mapError').textContent='正在请求定位…';
  try{const p=await DouxMap.locate();if(token!==mapUI.token||searchToken!==mapUI.searchToken)return;
    mapUI.map?.setCenter(p.location);mapUI.marker?.setPosition(p.location);
    if(mapUI.target!=='custom'){mapUI.draft=p;$('#selectedPlace').textContent=p.name;$('#confirmLocation').disabled=false;}
    $('#mapError').textContent='定位完成，也可以手动调整位置。';
  }catch(error){if(token===mapUI.token&&searchToken===mapUI.searchToken)$('#mapError').textContent=error.message+'；也可以搜索或拖动地图选点。';}
}
function realOrigins(){return state.page==='fair'?state.people.map(p=>({...p.origin,mode:p.mode,limit:p.limit})):[{...state.origin,mode:state.config.mode,limit:state.config.limit}];}
async function refreshCandidates(){
  if(state.page==='custom'){generate();render();return;}
  if(!state.live)return buildDemoWheel();
  const origins=realOrigins();
  if(origins.some(p=>!p.location)){state.searchMessage='请先选好'+(state.page==='fair'?'每个人的':'你的')+'出发点';render();return state.page==='fair'?openPeople():openLocation();}
  const token=++state.request;state.loading=true;state.stage='loading';state.progress={value:8,title:(state.activity==='play')?'正在寻找附近场馆…':'正在寻找附近餐厅…',detail:(state.activity==='play')?'先按类型和范围搜索':'先按口味和范围搜索'};state.candidates=[];state.searchMessage='';render();
  const config={...state.config,types:[...state.config.types],activity:state.activity},fair=state.page==='fair';
  const start=Date.now(),limit=45000;
  try{
    const center=[0,1].map(i=>origins.reduce((sum,p)=>sum+p.location[i],0)/origins.length);
    const searchConfig=fair?{...config,limit:Math.max(...origins.map(p=>p.limit)),mode:origins.some(p=>p.mode==='驾车')?'驾车':origins.some(p=>p.mode==='公共交通')?'公共交通':'步行'}:config;
    let pool=await DouxMap.nearby(center,searchConfig);if(token!==state.request)return;
    pool=Doux.shuffle(pool).filter(s=>!state.excluded.has(s.id)&&(state.repeat||!state.drawn.has(s.id)));
    const matches=[];let cursor=0,failures=0,completed=0,checked=0;
    updateProgress(20,'正在核对路线…',`共 ${pool.length} 家待检查`);
    // Two workers bound quota usage; every selected restaurant must pass actual route checks.
    async function worker(){while(cursor<pool.length&&token===state.request&&Date.now()-start<limit){
      const store=pool[cursor++];
      if(config.budget&&(store.price==null?!config.unknownPrice:store.price>config.budget)){checked++;continue;}
      if(config.open&&!config.unknownHours){checked++;continue;}
      try{
        const times=[];
        for(const origin of origins){if(token!==state.request||Date.now()-start>=limit)return;times.push(await DouxMap.route(origin.location,store.location,origin.mode,{city:origin.city,cityd:store.city}));}
        completed++;
        if(DouxMap.eligible(store,config,times,origins.map(p=>p.limit))){
          const candidate={...store,times,max:Math.max(...times),gap:Math.max(...times)-Math.min(...times),sum:times.reduce((a,b)=>a+b,0),opening:null,routeMode:config.mode==='公共交通'?'公交/地铁（含步行）':config.mode,routeKey:routeContext(store).key,routeCheckedAt:Date.now(),routeStatus:'ready'};
          matches.push(candidate);
        }
      }catch{failures++;}
      checked++;if(token===state.request)updateProgress(20+Math.round(75*checked/Math.max(1,pool.length)),'正在核对路线…',`已检查 ${checked} / ${pool.length} 家，符合条件 ${matches.length} 家`);
    }}
    await Promise.all([worker(),worker()]);if(token!==state.request)return;
    state.candidates=(fair?matches.sort(Doux.fairSort):Doux.shuffle(matches)).slice(0,config.count);
    state.candidates.forEach(s=>state.catalog[s.id]=s);
    state.searchMessage=state.candidates.length?`找到 ${state.candidates.length} 家${failures?'，部分路线未获取':''}`:config.open&&!config.unknownHours?'营业时间未知，可在筛选中允许未知':failures&&!completed?'路线查询失败，请稍后重试':'本次检索暂无合适'+(state.activity==='play'?'场馆':'餐厅')+'，试试调整条件';
  }catch(error){if(token===state.request)state.searchMessage=error.message;}
  finally{if(token===state.request){state.loading=false;state.stage=state.candidates.length?'wheel':'map';if(state.candidates.length)updateProgress(100,'候选已就位','转盘已准备好');render();window.scrollTo({top:0});}}
}
const detailTasks=new Map(),detailCache=new Map();
const routeTasks=new Map();
function routeContext(store){
  const origins=realOrigins().map(p=>({location:p.location,city:p.city,mode:p.mode,limit:p.limit}));
  return {origins,key:JSON.stringify([state.live,store.location,store.city,origins])};
}
async function ensureStoreRoute(store,force=false){
  if(store.source!=='amap'||store.manual)return;
  const {origins,key}=routeContext(store),token=state.request;
  if(!force&&store.routeKey===key&&Number.isFinite(store.max)&&Date.now()-store.routeCheckedAt<300000)return;
  if(!force&&store.routeKey===key&&store.routeStatus==='error')return;
  delete store.max;delete store.times;delete store.gap;delete store.sum;
  store.routeKey=key;
  if(!state.live||origins.some(p=>!p.location)){store.routeStatus='missing-origin';return;}
  if(!store.location){store.routeStatus='unlinked';return;}
  store.routeStatus='loading';
  if(!routeTasks.has(key)){
    let expired=false,timer;
    const work=(async()=>{
      const times=[];
      for(const origin of origins){
        if(expired)throw new Error('route timeout');
        const time=await DouxMap.route(origin.location,store.location,origin.mode,{city:origin.city,cityd:store.city});
        if(!Number.isFinite(time)||time<0)throw new Error('no route');
        times.push(time);
      }
      return {times,max:Math.max(...times),gap:Math.max(...times)-Math.min(...times),sum:times.reduce((a,b)=>a+b,0),routeMode:origins.length>1?'多人最长路程':origins[0].mode,routeCheckedAt:Date.now(),routeStatus:'ready'};
    })();
    const task=Promise.race([work,new Promise((_,reject)=>timer=setTimeout(()=>{expired=true;reject(new Error('route timeout'));},12000))])
      .finally(()=>{clearTimeout(timer);routeTasks.delete(key);});
    routeTasks.set(key,task);
  }
  try{
    const result=await routeTasks.get(key);
    if(token===state.request&&routeContext(store).key===key)Object.assign(store,result);
  }catch{
    if(token===state.request&&routeContext(store).key===key)store.routeStatus='error';
  }
}
async function prepareDetails(store,delay){
  const [ok]=await Promise.all([prepareMerchantDetails(store,delay),ensureStoreRoute(store)]);
  return ok;
}
async function prepareMerchantDetails(store,delay){
  if(store.source!=='amap'){if(!store.manual)await new Promise(resolve=>setTimeout(resolve,delay));return true;}
  const key=JSON.stringify([store.poiId,store.poiName||store.name,store.address]);
  const hit=detailCache.get(key);
  if(hit&&Date.now()-Date.parse(hit.ai?.retrievedAt)<900000){Object.assign(store,hit);return true;}
  if(detailTasks.has(key)){const result=await detailTasks.get(key);Object.assign(store,result);return result.ai?.status!=='error';}
  const task=(async()=>{
    const result={};store.ai={status:'loading'};
    await Promise.all([
      (async()=>{try{
        const details=await DouxMap.details(store);
        // Only merge merchant details; a shared request must not overwrite a newer route or display name.
        for(const field of ['photos','phone','rating','price','hours','category']){
          const value=details[field];
          if(value!=null&&value!==''&&(!Array.isArray(value)||value.length))result[field]=value;
        }
        result.detailError=false;
      }catch{result.detailError=true;}})(),
      (async()=>{if(typeof DouxAI==='undefined')return;try{result.ai=await DouxAI.research(store);}catch(error){result.ai={status:'error',error:error.name==='TimeoutError'?'资料检索超时，请重试':error.message};}})()
    ]);
    return result;
  })().finally(()=>detailTasks.delete(key));
  detailTasks.set(key,task);
  Object.assign(store,await task);
  if(['ready','empty'].includes(store.ai?.status)){
    if(detailCache.size>=200)detailCache.delete(detailCache.keys().next().value);
    const fields=['photos','phone','rating','price','hours','category','detailError','ai'];
    detailCache.set(key,Object.fromEntries(fields.filter(k=>store[k]!=null&&store[k]!==''&&(!Array.isArray(store[k])||store[k].length)).map(k=>[k,store[k]])));
  }
  if(state.candidates?.some(s=>s.id===store.id))state.catalog[store.id]=store;
  return store.ai?.status!=='error';
}
function openRealRoute(store){
  const params=new URLSearchParams({position:store.location.join(','),name:store.name,src:'doux',coordinate:'gaode',callnative:'1'});
  showModal(modalTop(store.activity==='play'?'📍 去这里':'📍 去吃这家')+`<div class="intro-box"><b>${esc(store.name)}</b><br>${esc(store.address)}</div><p class="detail-copy">在高德中确认出发位置、选择路线并导航。实时交通和实际场次 / 营业情况可能变化。</p><a class="btn full" href="https://uri.amap.com/marker?${esc(params.toString())}" target="_blank" rel="noopener noreferrer">在高德地图中打开 ↗</a>`);
}
async function validateCustom(){
  const play=state.activity==='play';
  const real=state.custom.filter(s=>s.source==='amap');
  if(real.length&&(!state.live||!state.origin.location))return toast('请先在“'+(play?'去哪玩':'吃什么')+'”中使用高德选好出发点');
  $('#modal').close();const token=++state.request;state.loading=true;state.candidates=[];render();
  const config={...state.config,types:[...state.config.types]},origin={...state.origin};
  const accepted=[];let failed=0;
  for(const store of state.custom){
    if(token!==state.request)return;
    if(store.manual)continue;
    if(store.source==='amap'){
      try{const time=await DouxMap.route(origin.location,store.location,config.mode);
        if(DouxMap.eligible(store,config,[time],[config.limit]))accepted.push({...store,times:[time],max:time,opening:null,routeMode:config.mode,routeKey:routeContext(store).key,routeCheckedAt:Date.now(),routeStatus:'ready'});
      }catch{failed++;}
    }else if(!state.live){const checked=Doux.evaluate(store,config,[{...origin,mode:config.mode,limit:config.limit}]);if(checked.eligible)accepted.push(checked);}
  }
  if(token!==state.request)return;
  state.candidates=accepted;state.loading=false;render();toast(`校验后保留 ${accepted.length} ${play?'家场馆':'家餐厅'}${failed?'，部分路线未获取':''}；仅按路程与预算，未关联选项不参与校验`);
}
function handleCompactAction(button){
  const d=button.dataset;
  if(d.selectPerson!==undefined){openLocation(+d.selectPerson);return true;}
  if(d.demoPlace!==undefined){state.origin={...places[+d.demoPlace]};generate();render();$('#modal').close();return true;}
  if(d.mapResult!==undefined){
    mapUI.searchToken++;const p=mapUI.results[+d.mapResult];mapUI.draft=p;
    mapUI.map?.setCenter(p.location);mapUI.marker?.setPosition(p.location);
    $('#selectedPlace').textContent=p.name;$('#confirmLocation').disabled=false;$('#mapResults').innerHTML='';return true;
  }
  switch(button.id){
    case 'openFilters':openFilters();break;
    case 'openCandidates':openCandidates();break;
    case 'openCustom':openCustom();break;
    case 'openPeople':openPeople();break;
    case 'openLocation':openLocation();break;
    case 'searchCustom':if(state.live)openLocation('custom');else setupSheet();break;
    case 'mapSetup':case 'mapSetupLink':setupSheet();break;
    case 'fetchCandidates':refreshCandidates();break;
    case 'applyFilters':$('#modal').close();generate();render();toast('已保存，点击生成转盘继续');break;
    case 'generate':$('#modal').close();refreshCandidates();break;
    case 'customValidate':validateCustom();break;
    case 'mapSearchGo':searchMap();break;
    case 'realLocate':locateReal();break;
    case 'confirmLocation':{
      if(!mapUI.draft)return true;const selected={...mapUI.draft},target=mapUI.target;$('#modal').close();
      if(target==='custom'){state.catalog[selected.id]=selected;addCustom(selected);}
      else{if(typeof target==='number')state.people[target].origin=selected;else state.origin=selected;generate();render();if(typeof target==='number')openPeople();}
      break;
    }
    case 'toggleMapMode':
      discovery.previews=[];discovery.cache=null;state.live=!state.live;state.origin=state.live?{name:'选择真实出发点',location:null}:{...places[0]};
      state.drawn.clear();state.excluded.clear();$('#modal').close();generate();render();updateSource();break;
    case 'openRules':showModal(modalTop('✨ 把纠结交给好运')+'<p class="detail-copy">每个候选被抽中的概率相同。点击开始就确定结果，转动期间优先获取中奖店资料，展示后再补充其他候选。<br><br>开启“本轮不重复”后，已抽中的店不会再次出现。新一轮会清除已抽与本轮排除记录。</p>');break;
    case 'help':showModal(modalTop('你好，这里是都行 ✿')+'<p class="detail-copy">地图选点 → 生成转盘 → 开始抽取。<br>详细设置都藏在卡片按钮里，点击就能展开。<br><br>地图上的“定位方式”可以切换单人、多人；“自选”放入纠结的店。收藏与到店记录保存在当前浏览器，清除站点数据会删除它们。</p>');break;
    default:return false;
  }
  return true;
}
function updateSource(){document.querySelector('.demo-label').innerHTML='<i></i> '+(state.live?'高德模式':'演示模式');}
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.id==='mapSearch'){event.preventDefault();searchMap();}});
$('#modal').addEventListener('close',()=>{if(!$('#modal').open)disposeMap();});
generate();render();
(async()=>{try{
  const result=await fetch('/api/map-config',{signal:AbortSignal.timeout(4000)});if(!result.ok)return;
  const config=await result.json();state.mapConfigured=config.configured;
  if(config.configured){discovery.previews=[];state.live=true;state.origin={name:'选择真实出发点',location:null};generate();render();updateSource();}
}catch{/* Direct file preview stays in explicitly labelled demo mode. */}
finally{state.checkingMap=false;render();}})();
