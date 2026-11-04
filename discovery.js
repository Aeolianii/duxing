'use strict';
state.stage='map';state.locationMode='single';state.activeOrigin=0;
const discovery={map:null,markers:[],token:0,previewToken:0,camera:null,previews:[],cache:null};
const personColors=['#e56935','#4285dc','#e6b52d','#8f67d8','#30a486','#ec7294'];
state.username='用户1';
state.people.forEach((p,i)=>{p.username='用户'+(i+1);p.color=personColors[i];});
function personIdentity(i){const p=state.people[i];return {username:p?.username||'用户'+(i+1),color:p?.color||personColors[i%personColors.length]};}
function usernameField(i){const p=personIdentity(i);return `<label class="person-username"><span>用户名</span><input aria-label="成员${i+1}用户名" data-person="${i}" data-key="username" maxlength="20" value="${esc(p.username)}"></label>`;}
const modeIcon=mode=>mode==='公共交通'?'🚇':mode==='驾车'?'🚗':'🚶';
function destroyHomeMap(){
  discovery.token++;discovery.previewToken++;
  if(discovery.map){discovery.camera={center:DouxMap.coordinates(discovery.map.getCenter()),zoom:discovery.map.getZoom()};discovery.map.destroy();}
  discovery.map=null;discovery.markers=[];
}
function originList(){return state.page==='fair'?state.people.map((p,i)=>({...p.origin,label:String.fromCharCode(65+i),mode:p.mode,limit:p.limit})): [{...state.origin,label:'我',mode:state.config.mode,limit:state.config.limit}];}
function renderDiscovery(){
  if(state.stage==='loading')return renderGenerating();
  if(state.stage==='wheel'){
    $('#view').innerHTML=`<div class="step-nav"><button id="backToMap">‹ 返回地图</button><span>② 转一转</span></div>`+((state.activity==='play')?heading('好玩已就位！','候选准备好了，按下开始揭晓这一场。'):heading('美味已就位！','候选准备好了，按下开始揭晓这一餐。'))+wheelPanel()+`<div class="under-wheel"><button id="openCandidates" class="candidate-entry"><span>${(state.activity==='play')?'🎡':'🍽️'}</span><strong>看看候选</strong><small>${available().length} 家</small><span>›</span></button><button id="refresh" class="refresh-entry">↻ 重新生成</button></div><p class="muted sheet-note">${state.live?((state.activity==='play')?'高德场馆与路线数据':'高德餐厅与路线数据'):'演示候选'} · 高评分更易入选，本轮候选等概率</p>`;
    return;
  }
  const group=state.page==='fair',c=state.config;
  $('#view').innerHTML=((state.activity==='play')?heading('先找好玩的，再交给好运。','这一场，让好运帮你选。'):heading('先找美味，再交给好运。','这一餐，让好运帮你选。'))+`<div class="discovery-toolbar"><button id="locationMode" class="mode-button">${group?((state.activity==='play')?'👫 多人同玩':'👫 多人定位'):'📍 单人定位'}</button><button id="openFilters" class="preference-button">${modeIcon(c.mode)} ${group?'各自的路程':c.mode+' '+c.limit+'分钟'} · ${c.types.length?esc(c.types.join('/')):((state.activity==='play')?'玩什么都行':'口味都行')} <span>筛选</span></button></div>
  <section class="map-stage"><div class="map-search-button"><button id="homeSearch">⌕ 搜索城市、地铁站、商圈</button><button id="homeLocate" aria-label="使用当前位置">⌖</button></div>
    ${state.live?'<div id="homeMap" aria-label="美食地图，点击选择出发点"></div><div id="homeMapLoading" class="home-map-loading">🗺️ 正在打开地图…</div>':demoHomeMap()}
  </section>
  <p class="map-bottom-hint" id="mapHint" role="status">${group?'点击地图，调整当前成员的出发点':'点击地图选择出发点'}${state.live?'':' · 示意地图'}</p>
  <div class="origin-strip" id="originStrip">${originChips()}</div>
  ${state.searchMessage?`<p class="flow-error" role="status">${esc(state.searchMessage)}</p>`:''}
  <button id="buildWheel" class="btn full build-wheel" ${state.checkingMap?'disabled':''}>生成转盘 <span aria-hidden="true">${decoration("star")}</span></button><p class="generation-note">${(state.activity==='play')?'先筛选场馆、核对路程，再去转盘揭晓':'先筛选餐厅、核对路程，再去转盘揭晓'}</p>`;
  if(state.live)mountHomeMap();else bindDemoHome();
}
function originChips(){
  const group=state.page==='fair';
  const list=state.live?originList():people();
  return list.map((p,i)=>{const identity=group?personIdentity(i):{username:state.username,color:personColors[0]};return `<button class="origin-chip ${group&&i===state.activeOrigin?'selected':''}" style="--person-color:${identity.color}" ${group?`data-home-person="${i}"`:'id="editUsername"'} title="${esc(identity.username)}"><span class="legend-pin">${originPin(identity.username)}</span><span>${esc(identity.username)}</span></button>`;}).join('')+(group?'<button id="openPeople" class="origin-edit">编辑</button>':'');
}
function originPin(username){
  return `<svg class="origin-pin-art" viewBox="0 0 64 84" role="img" aria-label="${esc(username)}的出发点"><path d="M32 1C14.9 1 1 14.9 1 32c0 21 31 52 31 52s31-31 31-52C63 14.9 49.1 1 32 1Z" fill="currentColor"/><circle cx="32" cy="31" r="13" fill="white"/></svg>`;
}
function editUsername(){showModal(modalTop('怎么称呼你？')+`<label class="username-form">用户名<input id="currentUsername" maxlength="20" value="${esc(state.username)}"></label><button id="saveUsername" class="btn full sheet-note">保存用户名</button>`);}
function demoHomeMap(){return `<div id="demoHomeMap" aria-label="演示地图，点击选择出发点"><svg viewBox="0 0 360 380" preserveAspectRatio="none" aria-hidden="true"><rect width="360" height="380" fill="#e5f4e6"/><path d="M310 -10 Q160 100 300 235 T320 400" stroke="#acdfe8" stroke-width="45" fill="none"/><g stroke="#fffdf8" stroke-width="14" fill="none"><path d="M-10 90 L390 140 M100 -10 L150 400 M-10 300 L390 245 M-10 200 L390 180"/></g><g fill="#cee8c7"><rect x="15" y="15" width="65" height="55" rx="15"/><rect x="175" y="30" width="55" height="60" rx="16"/><rect x="25" y="225" width="63" height="45" rx="14"/><rect x="190" y="300" width="60" height="65" rx="15"/></g><text x="16" y="355" fill="#689383" font-size="12">榕树街区 · 演示</text></svg><div id="demoPins"></div></div>`;}
function bindDemoHome(){
  discovery.previews=eligible().slice(0,5);paintDemoPins();
  $('#demoHomeMap').onclick=event=>{
    if(event.target.closest('button'))return;
    const r=event.currentTarget.getBoundingClientRect();const p={name:'地图选点',x:Math.max(10,Math.min(90,(event.clientX-r.left)/r.width*100)),y:Math.max(10,Math.min(90,(event.clientY-r.top)/r.height*100))};
    if(state.page==='fair')state.people[state.activeOrigin].demoOrigin=p;else state.origin=p;
    generate();render();
  };
}
function paintDemoPins(){
  const ps=people();$('#demoPins').innerHTML=ps.map((p,i)=>`<span class="demo-origin" style="left:${p.x}%;top:${p.y}%;color:${state.page==='fair'?personIdentity(i).color:personColors[0]}">${originPin(state.page==='fair'?personIdentity(i).username:state.username)}</span>`).join('')+discovery.previews.map((s,i)=>`<button class="demo-food food-map-pin" data-preview="${i}" style="left:${15+i*16}%;top:${[28,55,36,70,25][i]}%"><span>${s.emoji}</span><small>${esc(s.name.slice(0,5))}</small></button>`).join('');
}
async function mountHomeMap(){
  const token=discovery.token;
  try{
    const A=await DouxMap.load();if(token!==discovery.token||!$('#homeMap'))return;
    const positions=originList().filter(p=>p.location),center=positions.length?positions[0].location:discovery.camera?.center||[113.32452,23.10647];
    discovery.map=new A.Map('homeMap',{zoom:discovery.camera?.zoom||17,center,viewMode:'2D'});
    $('#homeMapLoading').remove();
    discovery.map.on('click',event=>chooseHomePoint(DouxMap.coordinates(event.lnglat)));
    discovery.map.on('zoomend',()=>paintHomePins(false));
    paintHomePins(true);loadHomePreviews();
  }catch(error){if(token!==discovery.token)return;if($('#homeMapLoading'))$('#homeMapLoading').innerHTML=`<span>🗺️</span><p>${esc(error.message)}</p><button class="btn secondary" id="retryMap">重试地图</button>`;else if($('#mapHint'))$('#mapHint').textContent='地图标记未完成：'+error.message;}
}
function chooseHomePoint(location,name='地图选定位置',city=''){
  if(!location)return;
  state.request++;state.candidates=[];state.searchMessage='';
  const point={location,name,city};
  if(state.page==='fair')state.people[state.activeOrigin].origin=point;else state.origin=point;
  discovery.previews=[];$('#originStrip').innerHTML=originChips();paintHomePins(false);loadHomePreviews();
}
function paintHomePins(fit){
  const map=discovery.map;if(!map)return;const A=window.AMap;
  if(discovery.markers.length)map.remove(discovery.markers);discovery.markers=[];
  const originMarkers=[];
  originList().forEach((p,i)=>{if(!p.location)return;const marker=new A.Marker({position:p.location,anchor:'bottom-center',offset:new A.Pixel(0,0),zIndex:200,content:`<div class="origin-map-pin ${state.page==='fair'&&i===state.activeOrigin?'active':''}" style="color:${state.page==='fair'?personIdentity(i).color:personColors[0]}">${originPin(state.page==='fair'?personIdentity(i).username:state.username)}</div>`});originMarkers.push(marker);discovery.markers.push(marker);});
  const visible=[];
  for(const store of discovery.previews){
    if(store.source!=='amap'||!DouxMap.coordinates(store.location))continue;
    // Separate markers in screen pixels so zooming out never creates a pile.
    const point=map.lngLatToContainer(store.location);
    const nearOrigin=originList().some(p=>p.location&&Math.hypot(p.location[0]-store.location[0],p.location[1]-store.location[1])<.0005);
    const x=point.x+(nearOrigin?48:0),y=point.y;
    if(visible.length>=5||visible.some(p=>Math.hypot(p.x-x,p.y-y)<75))continue;
    visible.push({x,y});const button=document.createElement('button');button.className='food-map-pin';button.setAttribute('aria-label',store.name);
    const photo=store.photos?.[0];button.innerHTML=(photo?`<img src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`:`<span>${store.emoji||'🍜'}</span>`)+`<small>${esc(store.name.slice(0,6))}</small>`;
    const img=button.querySelector('img');if(img)img.onerror=()=>{img.replaceWith(Object.assign(document.createElement('span'),{textContent:store.emoji||'🍜'}));};
    const marker=new A.Marker({position:store.location,anchor:'bottom-center',offset:new A.Pixel(nearOrigin?48:0,0),content:button,bubble:false,zIndex:100});
    marker.on('click',()=>detail(store));discovery.markers.push(marker);
  }
  if(discovery.markers.length)map.add(discovery.markers);
  if(fit&&discovery.markers.length>1)map.setFitView(discovery.markers,false,[90,45,70,45]);
}
async function loadHomePreviews(){
  const ps=originList().filter(p=>p.location),token=++discovery.previewToken;
  if(!ps.length){discovery.previews=[];return;}
  const center=[0,1].map(i=>ps.reduce((n,p)=>n+p.location[i],0)/ps.length);
  const config={...state.config,limit:Math.max(...ps.map(p=>p.limit)),mode:ps.some(p=>p.mode==='驾车')?'驾车':ps.some(p=>p.mode==='公共交通')?'公共交通':'步行',activity:state.activity,preview:true};
  const key=JSON.stringify([center,config.types,config.limit,config.mode,state.activity]);
  $('#mapHint').textContent=state.page==='fair'?'点击地图，调整当前成员的出发点':'点击地图选择出发点';
  try{
    const cached=discovery.cache?.key===key&&Date.now()-discovery.cache.at<120000;
    const stores=cached?discovery.cache.stores:await DouxMap.nearby(center,{...config,cancelled:()=>token!==discovery.previewToken||!$('#homeMap')});
    if(token!==discovery.previewToken||!$('#homeMap'))return;
    if(!cached)discovery.cache={key,stores,at:Date.now()};
    discovery.previews=[];
    for(const store of Doux.ratingOrder(stores)){if(discovery.previews.length>=5)break;if(!discovery.previews.some(p=>Math.hypot(p.location[0]-store.location[0],p.location[1]-store.location[1])<.00065))discovery.previews.push(store);}
    stores.forEach(s=>state.catalog[s.id]=s);paintHomePins(true);
    if(!stores.length)$('#mapHint').textContent='附近暂未找到'+((state.activity==='play')?'场馆':'餐厅')+'，试试调整位置或筛选。';
  }catch(error){if(token===discovery.previewToken&&$('#mapHint')){discovery.previews=[];paintHomePins(false);$('#mapHint').textContent=error.message;}}
}
function openLocationMode(){const play=state.activity==='play';showModal(modalTop(play?'这次，和谁一起玩？':'这次，和谁一起吃？')+`<div class="location-choices"><button data-location-mode="single"><span>🙋</span><strong>单人定位</strong><small>${play?'以一个出发点寻找附近好玩':'以一个出发点寻找附近美食'}</small></button><button data-location-mode="multi"><span>👫</span><strong>多人定位</strong><small>2～6 个起点，照顾每个人的路程</small></button></div>`);}
function returnToMap(){state.request++;state.loading=false;state.stage='map';state.searchMessage='';render();window.scrollTo({top:0});}
function renderGenerating(){
  const progress=state.progress||{value:5,title:(state.activity==='play')?'正在寻找附近好玩…':'正在寻找附近美味…',detail:(state.activity==='play')?'先找场馆，再逐一确认路线':'先找餐厅，再逐一确认路线'};
  $('#view').innerHTML=`<div class="step-nav"><button id="cancelGeneration">‹ 返回地图</button><span>准备你的转盘</span></div><section class="generation-screen"><div class="loading-plate">${(state.activity==='play')?'🎡':'🍜'}<span aria-hidden="true">${decoration("star")}</span></div><h1>${(state.activity==='play')?'好玩的，正在集合':'好吃的，正在集合'}</h1><p id="progressTitle">${esc(progress.title)}</p><div class="progress-track" role="progressbar" aria-label="生成转盘进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.value}"><div id="progressFill" style="width:${progress.value}%"></div></div><p id="progressDetail" class="muted">${esc(progress.detail)}</p><div class="loading-steps"><span>✓ 定好出发点</span><span>${(state.activity==='play')?'🎡 搜索场馆':'🍽 搜索餐厅'}</span><span>⌁ 核对路程</span></div><p class="muted">${state.live?'根据实际查询进度更新，不符合条件的店不会入选。':'演示模式，正在模拟候选生成。'}</p><button id="cancelGenerationBottom" class="btn outline sheet-note">取消，回地图调整</button></section>`;
}
function updateProgress(value,title,detail){
  state.progress={value,title,detail};if(state.stage!=='loading')return;
  const fill=$('#progressFill');if(fill){fill.style.width=value+'%';fill.parentElement.setAttribute('aria-valuenow',value);$('#progressTitle').textContent=title;$('#progressDetail').textContent=detail;}
}
async function buildDemoWheel(){
  const token=++state.request;state.stage='loading';state.loading=true;state.progress={value:0,title:(state.activity==='play')?'正在挑选场馆…':'正在挑选餐厅…',detail:(state.activity==='play')?'模拟筛选类型、预算与路程条件':'模拟筛选口味、预算与营业条件'};render();
  await new Promise(r=>setTimeout(r,350));if(token!==state.request)return;
  const selected=eligible().slice(0,state.config.count);
  for(let i=0;i<selected.length;i++){
    if(token!==state.request)return;
    updateProgress(100*(i+1)/state.config.count,'正在筛选候选…',`已确认 ${i+1} / ${state.config.count} 家`);
    await new Promise(r=>setTimeout(r,60));
  }
  if(token!==state.request)return;
  state.candidates=selected;state.loading=false;state.stage=selected.length?'wheel':'map';state.searchMessage=selected.length?'':'没有符合条件的店，试试放宽筛选';render();window.scrollTo({top:0});
}
function handleDiscoveryAction(button){
  const d=button.dataset;
  if(d.locationMode){state.locationMode=d.locationMode;state.page=d.locationMode==='multi'?'fair':(state.activity==='play'?'play':'near');state.activeOrigin=0;discovery.previews=[];discovery.camera=null;generate();render();$('#modal').close();if(state.page==='fair')openPeople();return true;}
  if(d.homePerson!==undefined){state.activeOrigin=+d.homePerson;$('#originStrip').innerHTML=originChips();if(state.live)paintHomePins(false);else paintDemoPins();return true;}
  if(d.preview!==undefined){const s=discovery.previews[+d.preview];if(s)detail(s);return true;}
  switch(button.id){
    case 'editUsername':editUsername();break;
    case 'saveUsername':{const name=$('#currentUsername').value.trim().slice(0,20);if(!name){toast('请填写用户名');break;}state.username=name;state.people[0].username=name;$('#modal').close();render();break;}
    case 'locationMode':openLocationMode();break;
    case 'homeOrigin':case 'homeSearch':openLocation(state.page==='fair'?state.activeOrigin:'near');break;
    case 'homeLocate':{
      if(!state.live){toast('演示模式不获取真实位置');break;}
      const token=discovery.token;toast('正在请求设备定位');DouxMap.locate().then(p=>{if(token!==discovery.token)return;discovery.map?.setCenter(p.location);chooseHomePoint(p.location,p.name);}).catch(error=>toast(error.message));break;
    }
    case 'buildWheel':refreshCandidates();break;
    case 'backToMap':case 'cancelGenerationBottom':case 'cancelGeneration':returnToMap();break;
    case 'retryMap':render();break;
    default:return false;
  }return true;
}
