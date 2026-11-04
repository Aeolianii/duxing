'use strict';
const travelStored=read('travel-live-v1');
DouxTravel.cities.push(...(travelStored?.cities||[]));
const travel={stage:'settings',conditions:DouxTravel.validConditions(travelStored?.conditions)?travelStored.conditions:{origin:'',date:today(),days:2,budget:1500,mode:'不限',themes:[],people:1,children:false,elders:false,excludeVisited:true},
  favorites:Array.isArray(travelStored?.favorites)?travelStored.favorites.filter(id=>DouxTravel.cities.some(c=>c.id===id)):[],visited:Array.isArray(travelStored?.visited)?travelStored.visited.filter(id=>DouxTravel.cities.some(c=>c.id===id)):[],plans:Array.isArray(travelStored?.plans)?travelStored.plans.filter(DouxTravel.validPlan):[],candidates:[],removed:[],drawn:new Set(),noRepeat:true,round:0,last:null,info:null,plan:DouxTravel.validPlan(travelStored?.draft)?travelStored.draft:null,day:0,map:null,mapToken:0,photos:new Map(),photoPending:new Map(),poi:new Map(),poiPending:new Map(),revision:0,draftSaved:true,dirty:DouxTravel.validPlan(travelStored?.draft)};
const travelColors=['#337ca5','#b25c7a','#398a70','#a17c27','#825daa','#bd6645','#427b85'];
const travelCity=id=>DouxTravel.cities.find(c=>c.id===id);
const travelClone=v=>JSON.parse(JSON.stringify(v));
function persistTravel(){return save('travel-live-v1',{cities:DouxTravel.cities,version:1,conditions:travel.conditions,favorites:travel.favorites,visited:travel.visited,plans:travel.plans,draft:travel.dirty?travel.plan:null});}
function destroyTravelMap(){travel.mapToken++;travel.map?.destroy();travel.map=null;}
function travelAvailable(){return travel.candidates.filter(c=>!travel.noRepeat||!travel.drawn.has(c.id));}
function travelGo(stage){state.page='travel';travel.stage=stage;render();window.scrollTo({top:0});}
function travelPhoto(city,extra=''){const photo=travel.photos.get(city.id);return `<div class="travel-photo ${extra}">${photo?.url?`<img src="${esc(photo.url)}" alt="${esc(city.name)} · ${esc(photo.name)}" referrerpolicy="no-referrer"><small>${esc(photo.name)} · 高德图片</small>`:`<img src="assets/travel.webp" alt="旅行插画"><small>旅行插画 · 实景待查询</small>`}</div>`;}
function renderTravel(){
  $('#view').innerHTML=`<div class="travel-nav"><button data-travel-stage="settings">旅行条件</button><button data-travel-stage="library">我的旅行${travel.plans.length?' · '+travel.plans.length:''}</button></div>`;
  if(travel.stage==='settings')renderTravelSettings();
  else if(travel.stage==='candidates')renderTravelCandidates();
  else if(travel.stage==='wheel')renderTravelWheel();
  else if(travel.stage==='plan'&&travel.plan)renderTravelPlan();
  else renderTravelLibrary();
  if(['candidates','library'].includes(travel.stage))loadTravelPhotos();
}
function renderTravelSettings(){const c=travel.conditions;
  $('#view').innerHTML+=`<div class="travel-intro"><div><h1>下一站，去哪儿？</h1><p>先想好怎么出发，<br>再把目的地交给一点好运。</p></div><img src="assets/travel.webp" alt=""></div><form id="travelSettings" class="travel-form"><label>从哪出发<div class="search-line"><input name="origin" id="travelOrigin" value="${esc(c.origin)}" list="originCityOptions" autocomplete="off" aria-describedby="originCityHint" placeholder="输入城市名称，如杭州" maxlength="30" required><button type="button" id="travelLocate" class="btn secondary small">定位</button></div></label><datalist id="originCityOptions"></datalist><small id="originCityHint" role="status"></small><div class="travel-fields"><label>出发日期<input type="date" name="date" value="${esc(c.date)}" min="${today()}" required></label><label>游玩天数<select name="days">${Array.from({length:7},(_,i)=>`<option value="${i+1}" ${c.days===i+1?'selected':''}>${i+1} 天</option>`).join('')}</select></label></div><div class="chips"><button type="button" data-travel-preset="2" class="chip">周末两天</button><button type="button" data-travel-preset="3" class="chip">三天小假期</button></div><label>人均总预算（元）<input type="number" name="budget" min="0" max="100000" step="50" value="${c.budget}" required><small>住宿、餐饮和门票均计入，可选择是否计入去程交通。0 表示不限。</small></label><label>抵达目的地的交通<select name="includeTransport"><option value="no">自行安排</option><option value="yes" ${c.includeTransport?'selected':''}>加入行程规划</option></select></label><div id="intercityOptions" ${c.includeTransport?'':'hidden'}><label>抵达交通类型<select name="mode">${['高铁','铁路','飞机','自驾'].map(m=>`<option ${c.mode===m?'selected':''}>${m}</option>`).join('')}</select></label><label id="driveBudgetField" ${c.mode==='自驾'?'':'hidden'}>人均去程自驾费用估算（元，可留空）<input type="number" name="driveBudget" min="0" value="${esc(String(c.driveBudget??''))}"></label><label><span><input type="checkbox" name="fareInBudget" ${c.fareInBudget!==false?'checked':''}> 去程费用计入人均总预算</span></label><small>有可售班次时，按去程报价和到达时刻安排游玩。返程可另查。</small></div><label>人均住宿预算（全程，已含在总预算内）<input type="number" min="0" max="100000" name="hotelBudget" value="${esc(String(c.hotelBudget??''))}" placeholder="留空按总预算的 35% 分配"></label><label>住宿房间数<input type="number" min="1" max="20" name="rooms" value="${esc(String(c.rooms??''))}" placeholder="留空按每两人一间"></label><label>市内出行<select name="localMode">${['公共交通','打车','步行','骑行','自驾'].map(m=>'<option '+(c.localMode===m?'selected':'')+'>'+m+'</option>').join('')}</select></label><fieldset><legend>想玩什么 <small>可多选</small></legend><div class="travel-interests">${DouxTravel.themes.map(t=>`<label><input type="checkbox" name="theme" value="${t}" ${c.themes.includes(t)?'checked':''}><span>${t}</span></label>`).join('')}</div></fieldset><label>自定义兴趣（逗号分隔）<input name="custom" maxlength="180" value="${esc((c.themes||[]).filter(t=>!DouxTravel.themes.includes(t)).join('，'))}"></label><details><summary>更多条件</summary><label class="sheet-note">同行人数<input type="number" name="people" value="${c.people}" min="1" max="20" required></label><div id="memberFields">${memberFields(c.people,c.members)}</div><div class="travel-checks"><label><input name="children" type="checkbox" ${c.children?'checked':''}>亲子出游</label><label><input name="elders" type="checkbox" ${c.elders?'checked':''}>长辈同行</label><label><input name="excludeVisited" type="checkbox" ${c.excludeVisited?'checked':''}>排除去过的城市</label></div><p class="muted">在“我的旅行”标记去过的地方。</p></details><button class="btn full" type="submit">看看有哪些目的地</button><p class="muted">DeepSeek 会按本次条件推荐目的地。具体交通、票价和住宿需另行查询。</p></form>`;
}
function travelSummary(c=travel.conditions){return `${esc(c.origin)}出发 · ${esc(c.date)} · ${c.days}天 · ${c.includeTransport===false?'仅规划市内行程':esc(c.mode)} · ${c.budget?'人均预算 ¥'+c.budget:'预算不限'}`;}
function renderTravelCandidates(){
  $('#view').innerHTML+=heading('这几座城，想去哪里？','不喜欢的移出去，也可以加入心里的目的地。')+`<p class="travel-summary">${travelSummary()}</p><p class="notice">按天数、交通和预算粗略筛选。选定目的地后可查看班次和参考价。</p><div class="travel-cities">${travel.candidates.map(city=>`<article class="travel-city" data-city-card="${city.id}"><div data-city-photo="${city.id}">${travelPhoto(city)}</div><div class="travel-city-copy"><h2>${city.name}</h2><p>${esc(DouxTravel.reason(city,travel.conditions))}</p><small>${esc(city.assessment||'本地游，无需城际交通')}</small><div class="actions"><button class="quiet" data-travel-remove="${city.id}">移除</button><button class="quiet" data-travel-favorite="${city.id}">${travel.favorites.includes(city.id)?'已收藏 ♥':'收藏 ♡'}</button></div></div></article>`).join('')||'<div class="empty">没有匹配的城市了。可调整兴趣、已去城市或恢复移除的候选。</div>'}</div><div class="actions"><button class="btn secondary small" id="travelRefresh">换一批</button><button class="btn outline small" id="travelRestore">恢复移除</button></div><form id="travelAddCity" class="search-line sheet-note"><input name="city" required maxlength="24" placeholder="输入想去的城市"><button class="btn secondary small">添加城市</button></form><p class="muted sheet-note">手动添加的城市保留你的选择，不要求匹配兴趣。最多 12 座。</p><button class="btn full sheet-note" id="travelReady" ${travel.candidates.length?'':'disabled'}>生成旅行转盘 · ${travel.candidates.length} 座城市</button>`;
}
function renderTravelWheel(){const list=travelAvailable();
  $('#view').innerHTML+=`<div class="step-nav"><button data-travel-stage="candidates">‹ 修改候选</button><span>目的地转盘</span></div>`+heading('让下一站，有点惊喜。','每座候选城市，都有同样的机会。')+`<section class="panel wheel-panel"><div class="wheel-header"><h3>下一站旅行</h3><span>${list.length} 座城市</span></div><div class="wheel-wrap"><div class="pointer"></div><div class="wheel-rim"><div class="wheel-disc" id="travelDisc">${list.length?wheelSVG(list):'<div class="empty">本轮已抽完</div>'}</div></div><div class="hub">出发<small>去看看世界</small></div></div><div class="wheel-actions"><button class="btn full" id="travelSpin" ${list.length?'':'disabled'}>开始！下一站是…</button><p id="travelSpinStatus" class="wheel-status" role="status">${list.length?'点击开始，抽中后优先查这座城的资料':'本轮已抽完，开启新一轮或修改候选'}</p></div><div class="wheel-footer"><label><input id="travelNoRepeat" type="checkbox" ${travel.noRepeat?'checked':''}>本轮不重复</label><button id="travelNewRound">新的一轮 ↻</button></div></section>${travel.last?'<button class="btn outline full sheet-note" id="travelLast">查看上次目的地</button>':''}`;
}
async function researchTravel(city,round){
  travel.info={status:'loading'};
  try{const response=await fetch('/api/option-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:city.name+'市旅游特色与季节出行注意事项'}),signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok)throw new Error(response.status===503?'联网介绍暂不可用，可以先根据候选城市介绍规划。':data.error||'资料检索暂时失败');if(!['ready','empty'].includes(data.status))throw new Error('资料响应无效');if(round===travel.round)travel.info=data;}
  catch(error){if(round===travel.round)travel.info={status:'error',error:error.name==='TimeoutError'?'检索超时，可重试或先生成行程。':error.message};}
  if(round===travel.round&&$('#travelKnowledge'))$('#travelKnowledge').innerHTML=travelKnowledge();
}
function travelSourceHTML(s){
  const quotes=Array.isArray(s.quotes)?s.quotes.filter(q=>q&&typeof q.quote==='string'&&q.quote):(typeof s.quote==='string'&&s.quote?[{quote:s.quote}]:[]);
  const source=`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||'查看来源')}</a>`;
  if(quotes.length<2)return source+(quotes.length?`<small class="muted">原文：${esc(quotes[0].quote.slice(0,120))}</small>`:'');
  return source+`<details class="evidence-quotes"><summary>${quotes.length} 条原文</summary>${quotes.map(q=>`<p class="muted">原文：${esc(q.quote.slice(0,120))}</p>`).join('')}</details>`;
}
function travelKnowledge(){const info=travel.info;
  if(info?.status==='loading')return '<p role="status">正在查这座城的资料，你也可以先规划行程…</p>';
  if(info?.status==='ready')return `<p>${esc(info.introduction)}</p><details><summary>资料来源与查询时间</summary><p>AI 根据搜索摘要整理；仅作旅行灵感，季节信息请核对适用时间。查询于 ${esc(new Date(info.retrievedAt).toLocaleString('zh-CN'))}</p>${(info.evidence||[]).filter(s=>/^https?:\/\//.test(s.url)).map(travelSourceHTML).join('')}</details>`;
  return `<p>${esc(info?.error||'暂无可靠的联网介绍，先参考本地旅行灵感。')}</p><button class="btn secondary small" id="travelRetry">重新检索</button>`;
}
function showTravelResult(){const city=travel.last;if(!city)return;
  showModal(modalTop('下一站，'+city.name)+`<div data-city-photo="${city.id}">${travelPhoto(city,'travel-hero-photo')}</div><p class="detail-copy">${esc(city.intro)}<br><small>DeepSeek 根据本次条件生成，未核验当前开放情况。</small></p><div class="reason-box"><b>为什么入选</b><p>${esc(DouxTravel.reason(city,travel.conditions))}</p></div><section class="free-knowledge sheet-note"><h3>你可能想知道</h3><div id="travelKnowledge">${travelKnowledge()}</div></section><p class="detail-copy">${travelSummary()}<br>往返交通耗时：待查询 · 参考总花费：待查询<br>天气、预约及开放情况：出发前核实</p><button class="btn full sheet-note" id="travelConfirm">就去这里，生成行程</button><div class="actions sheet-note"><button class="btn secondary small" id="travelAgain" ${travelAvailable().length?'':'disabled'}>再转一次</button><button class="btn outline small" id="travelAdjust">调整条件</button><button class="quiet" data-travel-favorite="${city.id}">${travel.favorites.includes(city.id)?'已收藏 ♥':'收藏 ♡'}</button></div>`);
  loadTravelPhoto(city);
}
async function spinTravel(){
  const list=travelAvailable();if(state.busy||!list.length)return;
  const index=Math.floor(Math.random()*list.length),city=list[index],round=++travel.round;
  travel.last=city;travel.drawn.add(city.id);state.busy=true;
  document.querySelectorAll('#view button,#view input,#backHome,#help').forEach(b=>b.disabled=true);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#travelSpinStatus').textContent='好运转动中，正在了解这座城…';
  const motion=DouxWheel.start($('#travelDisc'),{period:700,reduced});
  const task=researchTravel(city,round);loadTravelPhoto(city);let timer;
  await Promise.all([wait(reduced?0:1600),Promise.race([task,new Promise(resolve=>timer=setTimeout(resolve,8000))])]);clearTimeout(timer);
  if(!await motion.stop(index,list.length,()=>round===travel.round))return;
  state.busy=false;$('#backHome').disabled=false;$('#help').disabled=false;render();showTravelResult();
}
function markTravelDirty(){travel.dirty=true;travel.revision++;travel.draftSaved=persistTravel();const note=$('#travelSaveNote');if(note)note.textContent=travel.draftSaved?'草稿已在本机保留；点击保存行程加入我的旅行。':'草稿保存失败，请重试保存行程。';}
function renderTravelPlan(){const p=travel.plan,city=travelCity(p.cityId),day=p.days[travel.day];
  $('#view').innerHTML+=heading(city.name+'，我们慢慢逛。',p.savedAt?(travel.dirty?'有修改尚未保存':'已保存在当前浏览器'):'行程草案，按你的节奏修改。')+`<p class="travel-summary">${travelSummary(p.conditions)}</p><p class="notice">这是可修改的行程建议，尚未核对车次、开放和预约。到达日与返程日请按实际车票删减景点；整日景区不要与远处地点挤在一天。</p>${p.days.some(d=>!d.spots.length)?'<button class="btn secondary full sheet-note" id="travelFillDays">补全空白天的景点</button>':''}<div class="trip-day-row"><div class="travel-days" role="tablist" aria-label="行程日期">${p.days.map((d,i)=>`<button role="tab" aria-selected="${i===travel.day}" data-travel-day="${i}" class="chip ${i===travel.day?'on':''}" style="--day-color:${travelColors[i]}">第 ${i+1} 天</button>`).join('')}</div><button class="btn trip-refresh" data-trip-action="plan" title="重新生成，保留必去景点" aria-label="重新生成旅行方案">↻</button></div><div class="travel-day-title"><h2>第 ${travel.day+1} 天${day.light?' · 轻松一点':''}</h2><button class="quiet" id="travelLight">这天轻松一点</button></div><p class="muted">${travel.day===0?'到达 → 安顿行李 → ':''}${day.spots.length?'安排下面的地点，中间留出用餐和休息':'自由活动、当地美食或休息'}${travel.day===p.days.length-1?' → 预留返程时间':''}</p><section class="panel">${transportSection(p)}</section>${hotelSection(p)}<div id="travelStops" class="travel-stops">${day.spots.map((s,i)=>travelSpotHTML(s,i)).join('')||'<div class="empty">这天还没有景点，可加入一个必去地点。</div>'}</div><form id="travelMustGo" class="search-line"><input name="spot" aria-label="必去地点" placeholder="加入必去地点（尽量填写全名）" maxlength="60" required><button class="btn secondary small">加入</button></form><p class="muted sheet-note">必去地点会保留在“轻松一点”中，也可手动移除。新地点的城市、交通与开放情况需核对。</p><div class="travel-map-block"><h3 style="color:${travelColors[travel.day]}">第 ${travel.day+1} 天的地点</h3><div id="travelMap" class="travel-map"><p>正在准备地图…</p></div><p id="travelMapNote" class="muted">只显示当前一天；连线表示游览顺序，不是导航路线。</p><button class="quiet" id="travelMapRetry">刷新地图与交通</button></div><section class="travel-checklist"><h3>旅行打卡</h3>${p.days.flatMap((d,n)=>d.spots.map(s=>'<label><input type="checkbox" data-travel-check="done-'+esc(s.id)+'" '+(p.checklist["done-"+s.id]?'checked':'')+'>第 '+(n+1)+' 天 · '+esc(s.name)+'</label>')).join('')}<button data-trip-action="reviews">查看这座城市的行程评价</button><div id="tripComments"></div></section><section class="travel-checklist"><h3>出发前，再检查一下</h3>${['证件','往返车票 / 机票或自驾路线','住宿','景点开放与预约','天气与行李'].map((t,i)=>`<label><input type="checkbox" data-travel-check="${i}" ${p.checklist[i]?'checked':''}>${t}</label>`).join('')}<p class="muted">临近出发，请主动查询天气、余票和开放情况。</p></section><div class="travel-save"><button id="travelSave" class="btn">${p.savedAt?'保存修改':'保存行程'}</button><button id="travelShare" class="btn secondary">生成分享卡片</button></div><p class="muted sheet-note" id="travelSaveNote">${travel.dirty?(travel.draftSaved?'草稿已在本机保留；点击保存行程加入我的旅行。':'草稿保存失败，请重试保存行程。'):'保存在本机浏览器，清除站点数据会删除。'} 分享前可预览，不会自动发给他人。</p>${travelSources(p.sources)}`;
  mountTravelMap();
}
function travelSources(sources){
  const links=(Array.isArray(sources)?sources:[]).filter(item=>/^https?:\/\//i.test(item?.url));
  if(!links.length)return '';
  return `<details class="trip-sources"><summary>参考资料（${links.length}）</summary><ul>${links.map(item=>`<li><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title||'查看来源')} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul></details>`;
}
function travelSpotHTML(s,i){const p=travel.plan,city=travelCity(p.cityId),poi=travel.poi.get(city.id+'|'+s.name);return `<article class="travel-stop"><div class="travel-stop-number" style="background:${travelColors[travel.day]}">${i+1}</div><div class="travel-stop-copy">${poi?.photos?.[0]?`<img class="travel-spot-photo" src="${esc(poi.photos[0])}" alt="${esc(s.name)} · 高德图片" referrerpolicy="no-referrer">`:''}<h3>${esc(s.name)}${s.must?' <small>必去</small>':''}</h3><p>${esc(s.stay||'游玩时长待查询')}<br>开放 / 门票 / 预约：待查询</p>${poi?`<small class="travel-source">地点与图片：高德 · ${esc(poi.checkedAt)}<br>${esc(poi.address||'')}</small>`:''}<div class="actions"><button class="quiet" data-travel-swap="${i}" ${s.must?'disabled':''}>换一个景点</button><button class="quiet" data-travel-delete-spot="${i}">移除</button></div>${i?`<p class="travel-leg" id="travelLeg${i}">上一站 → 此处：交通方式与耗时待查询</p>`:''}</div></article>`;}
async function lookupTravelPOI(city,name){
  const key=city.id+'|'+name;if(travel.poi.has(key))return travel.poi.get(key);if(travel.poiPending.has(key))return travel.poiPending.get(key);
  if(!state.mapConfigured)return null;
  const task=(async()=>{try{const query=name==='八市'&&city.name==='厦门'?'厦门第八市场':city.name+' '+name;const rows=await DouxMap.search(query);const poi=rows.find(p=>DouxTravel.matchesPOI(city,name,p));if(!poi)return null;poi.checkedAt=new Date().toLocaleString('zh-CN');travel.poi.set(key,poi);return poi;}catch{return null;}finally{travel.poiPending.delete(key);}})();travel.poiPending.set(key,task);return task;
}
async function loadTravelPhoto(city){
  if(travel.photos.has(city.id)||!state.mapConfigured)return;
  if(travel.photoPending.has(city.id))return travel.photoPending.get(city.id);
  const task=(async()=>{let poi;for(const spot of city.spots.slice(0,2)){poi=await lookupTravelPOI(city,spot.name);if(poi?.photos?.[0])break;await wait(250);}if(poi?.photos?.[0]){travel.photos.set(city.id,{url:poi.photos[0],name:poi.name});document.querySelectorAll(`[data-city-photo="${city.id}"]`).forEach(node=>node.innerHTML=travelPhoto(city,node.closest('dialog')?'travel-hero-photo':''));}})().finally(()=>travel.photoPending.delete(city.id));travel.photoPending.set(city.id,task);return task;
}
async function loadTravelPhotos(){const stage=travel.stage;const list=stage==='candidates'?travel.candidates:travel.favorites.map(travelCity);for(const city of list){if(state.page!=='travel'||travel.stage!==stage||state.busy)break;await loadTravelPhoto(city);await wait(220);}}
async function mountTravelMap(){
  const token=travel.mapToken,p=travel.plan,index=travel.day,day=p.days[index],city=travelCity(p.cityId);
  const active=()=>token===travel.mapToken&&state.page==='travel'&&travel.stage==='plan'&&travel.plan===p&&travel.day===index&&!!$('#travelMap');
  if(!state.mapConfigured){$('#travelMap').innerHTML='<p>地图暂不可用，可稍后重试。<br>未取得坐标的地点不会虚构在地图上。</p>';return;}
  try{const A=await DouxMap.load();if(!active())return;$('#travelMap').innerHTML='';travel.map=new A.Map('travelMap',{...(city.location?{center:city.location}:{}),zoom:12,viewMode:'2D'});const points=[];
    for(let i=0;i<day.spots.length;i++){const poi=await lookupTravelPOI(city,day.spots[i].name);if(!active())return;points.push(poi);}
    $('#travelStops').innerHTML=day.spots.map((s,i)=>travelSpotHTML(s,i)).join('')||'<div class="empty">这天还没有景点，可加入一个必去地点。</div>';
    const known=points.filter(Boolean);known.forEach(poi=>{const marker=new A.Marker({position:poi.location,label:{content:esc((points.indexOf(poi)+1)+'. '+poi.name),direction:'top'}});travel.map.add(marker);});
    // Never connect across an unresolved stop as though it were a complete route.
    if(known.length>1&&known.length===points.length)travel.map.add(new A.Polyline({path:known.map(poi=>poi.location),strokeColor:travelColors[index],strokeWeight:4,strokeStyle:'dashed'}));
    if(known.length)travel.map.setFitView();$('#travelMapNote').textContent=`已定位 ${known.length}/${day.spots.length} 个地点。连线仅表示顺序，不是导航路线；只显示第 ${index+1} 天。`;
    for(let i=1;i<points.length;i++){if(!active())return;if(!points[i-1]||!points[i])continue;const local=p.conditions.localMode||(p.conditions.mode==='自驾'?'自驾':'公共交通');const mode=['自驾','打车'].includes(local)?'驾车':local;try{const minutes=await DouxMap.route(points[i-1].location,points[i].location,mode,{city:city.name,cityd:city.name,strictMode:true});if(!active())return;if(Number.isFinite(minutes))$('#travelLeg'+i).textContent=`上一站 → 此处：${mode==='公共交通'?'公交 / 地铁（可能含步行）':mode}约 ${minutes} 分钟。高德 · ${new Date().toLocaleString('zh-CN')}，非出发日预测。`;}catch{if(active())$('#travelLeg'+i).textContent='市内交通查询失败，可稍后重试。';}}
  }catch{if(active()){$('#travelMap').innerHTML='<p>地图加载失败，可以重试。</p>';}}
}
function renderTravelLibrary(){
  $('#view').innerHTML+=heading('把期待，留在这里。','收藏目的地、保存计划，也记下去过的地方。')+`${travel.plan?'<button class="btn full sheet-note" id="travelResume">继续编辑当前行程'+(travel.dirty?'草稿':'')+'</button>':''}<h2 class="travel-section-title">保存的行程</h2><div class="section-list">${travel.plans.map(p=>`<article class="list-row"><div class="grow"><h3>${esc(travelCity(p.cityId).name)} · ${p.conditions.days} 天</h3><p>${esc(p.conditions.date)} · 从${esc(p.conditions.origin)}出发</p></div><button class="btn secondary small" data-travel-open="${esc(p.id)}">打开行程</button><button class="quiet" data-travel-delete-plan="${esc(p.id)}">删除</button></article>`).join('')||'<p class="empty">还没有保存的行程。抽一座城市，开始第一份旅行计划。</p>'}</div><h2 class="travel-section-title">收藏的目的地</h2><div class="travel-cities">${travel.favorites.map(travelCity).map(city=>`<article class="travel-city"><div data-city-photo="${city.id}">${travelPhoto(city)}</div><div class="travel-city-copy"><h2>${city.name}</h2><button class="btn secondary small" data-travel-use="${city.id}">规划旅行</button><button class="quiet" data-travel-favorite="${city.id}">取消收藏</button></div></article>`).join('')||'<p class="muted">喜欢的城市，可以先收藏起来。</p>'}</div><button class="btn secondary full sheet-note" id="travelFootprints">查看旅游足迹 / 记录旅行</button><h2 class="travel-section-title">去过的城市</h2><div class="travel-interests">${DouxTravel.cities.map(c=>`<label><input type="checkbox" data-travel-visited="${c.id}" ${travelVisitedIds().includes(c.id)?'checked':''}><span>${c.name}</span></label>`).join('')}</div><button class="btn full sheet-note" data-travel-stage="settings">计划下一次旅行</button>`;
}
function saveTravelPlan(){const p=travel.plan,copy=travelClone(p);copy.savedAt=new Date().toISOString();const old=travel.plans;travel.plans=old.some(x=>x.id===p.id)?old.map(x=>x.id===p.id?copy:x):[copy,...old];const wasDirty=travel.dirty;travel.dirty=false;if(!persistTravel()){travel.plans=old;travel.dirty=wasDirty;return;}p.savedAt=copy.savedAt;toast('行程已保存在这台设备');render();}
function shareTravelPlan(){const p=travel.plan,city=travelCity(p.cityId),canvas=document.createElement('canvas');canvas.width=900;const lineSets=p.days.map((d,i)=>({title:`第 ${i+1} 天`,text:d.spots.map(s=>s.name).join(' → ')||'自由活动 / 休息'}));const lines=[];for(const d of lineSets){lines.push(d.title);for(let i=0;i<d.text.length;i+=24)lines.push(d.text.slice(i,i+24));lines.push('');}canvas.height=420+lines.length*43;const ctx=canvas.getContext('2d');ctx.fillStyle='#e4f4fc';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#315d7b';ctx.font='bold 56px Microsoft YaHei, sans-serif';ctx.fillText('下一站，'+city.name,55,95);ctx.font='26px Microsoft YaHei, sans-serif';ctx.fillText(`${p.conditions.date} · ${p.conditions.days} 天 · ${p.conditions.people} 人`,55,155);ctx.fillText(p.conditions.budget?`人均预算 ¥${p.conditions.budget}（计划上限，非报价）`:'预算不限 · 按自己的节奏出发',55,203);ctx.font='28px Microsoft YaHei, sans-serif';lines.forEach((line,i)=>ctx.fillText(line,55,285+i*43));ctx.font='23px Microsoft YaHei, sans-serif';ctx.fillText('旅行草案 · 交通、开放与预约请出发前核实',55,canvas.height-85);ctx.fillText('都行 · 把纠结交给一点好运',55,canvas.height-40);const url=canvas.toDataURL('image/png');showModal(modalTop('旅行分享卡片')+`<img class="share-preview" src="${url}" alt="${esc(city.name)}旅行计划分享卡片"><p class="muted sheet-note">包含出发日期、人数和预算；不含出发城市及准备清单。</p><a class="btn full sheet-note" href="${url}" download="都行-${esc(city.name)}旅行计划.png">下载分享图片</a>`);}
function handleTravelAction(button){const d=button.dataset;
  if(d.travelRemovePhoto!==undefined){const form=button.closest('#visitForm');button.closest('.rv-preview-item')?.remove();form?.dispatchEvent(new Event('input',{bubbles:true}));return true;}
  if(d.travelRecord){recordForm(travelRecordStore(d.travelRecord));return true;}
  if(button.id==='travelFootprints'){state.page='visits';state.visitTab='travel';render();return true;}
  if(d.travelStage){if(state.busy)return true;travelGo(d.travelStage);return true;}
  if(d.travelPreset){const f=$('#travelSettings');f.elements.days.value=d.travelPreset;if(d.travelPreset==='2'){const date=new Date();date.setDate(date.getDate()+((6-date.getDay()+7)%7||7));f.elements.date.value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}rememberTravelForm();return true;}
  if(d.travelRemove){travel.removed.push(d.travelRemove);travel.candidates=travel.candidates.filter(c=>c.id!==d.travelRemove);render();return true;}
  if(d.travelFavorite){const previous=travel.favorites;travel.favorites=previous.includes(d.travelFavorite)?previous.filter(id=>id!==d.travelFavorite):[...previous,d.travelFavorite];if(!persistTravel()){travel.favorites=previous;return true;}button.textContent=travel.favorites.includes(d.travelFavorite)?'已收藏 ♥':'收藏 ♡';if(travel.stage==='library')render();return true;}
  if(d.travelDay!==undefined){travel.day=+d.travelDay;render();return true;}
  if(d.travelSwap!==undefined){const i=+d.travelSwap,next=DouxTravel.replacement(travelCity(travel.plan.cityId),travel.plan,travel.day,i);if(!next)return toast('暂时没有未安排的替代景点，可手动加入必去地点'),true;travel.plan.days[travel.day].spots[i]={...next};markTravelDirty();render();return true;}
  if(d.travelDeleteSpot!==undefined){travel.plan.days[travel.day].spots.splice(+d.travelDeleteSpot,1);markTravelDirty();render();return true;}
  if(d.travelOpen){if(travel.dirty&&!confirm('打开已保存行程将替换当前草稿，是否继续？'))return true;travel.plan=travelClone(travel.plans.find(p=>p.id===d.travelOpen));travel.day=0;travel.dirty=false;persistTravel();travelGo('plan');return true;}
  if(d.travelDeletePlan){if(!confirm('删除这份已保存的旅行计划？'))return true;const old=travel.plans;travel.plans=old.filter(p=>p.id!==d.travelDeletePlan);if(!persistTravel())travel.plans=old;render();return true;}
  if(d.travelUse){if(!DouxTravel.validConditions(travel.conditions)||travel.conditions.date<today()){toast('先填写本次旅行的出发条件');travelGo('settings');return true;}travel.last=travelCity(d.travelUse);travel.round++;researchTravel(travel.last,travel.round);showTravelResult();return true;}
  switch(button.id){
    case 'travelLocate':locateTravel();break;
    case 'help':if(state.page!=='travel')return false;showModal(modalTop('旅行规划')+'<p>出发地、预算和同行偏好会发送至 DeepSeek，用于推荐城市、景点和住宿。高德用于定位和地点查询；交通库存单独查询。</p>');break;
    case 'travelRefresh':discoverCities(button,'refresh');break;
    case 'travelRestore':for(const id of travel.removed){const c=travelCity(id);if(c&&!travel.candidates.includes(c)&&travel.candidates.length<12)travel.candidates.push(c);}travel.removed=[];render();break;
    case 'travelReady':travelGo('wheel');break;
    case 'travelSpin':spinTravel();break;
    case 'travelNewRound':travel.drawn.clear();render();break;
    case 'travelLast':showTravelResult();break;
    case 'travelAgain':$('#modal').close();travelGo('wheel');spinTravel();break;
    case 'travelAdjust':$('#modal').close();travelGo('settings');break;
    case 'travelRetry':researchTravel(travel.last,travel.round);$('#travelKnowledge').innerHTML=travelKnowledge();break;
    case 'travelConfirm':if(travel.dirty&&!confirm('生成新行程将替换当前草稿，是否继续？'))break;generateTravelPlan(button);break;
    case 'travelFillDays':{const used=new Set(travel.plan.days.flatMap(d=>d.spots.map(s=>s.name)));const pool=travelCity(travel.plan.cityId).spots.filter(s=>!used.has(s.name));for(const day of travel.plan.days)if(!day.spots.length&&pool.length)day.spots.push({...pool.shift()});markTravelDirty();render();toast('已补充未安排的景点，原有安排保留');break;}
    case 'travelLight':{const day=travel.plan.days[travel.day];const kept=day.spots.filter(s=>s.must);if(!kept.length&&day.spots.length)kept.push(day.spots[0]);day.spots=kept;day.light=true;markTravelDirty();render();toast('已减少普通景点，必去地点保留');break;}
    case 'travelResume':travelGo('plan');break;
    case 'travelMapRetry':render();break;
    case 'travelSave':saveTravelPlan();break;
    case 'travelShare':shareTravelPlan();break;
    default:return false;
  }return true;
}
function rememberTravelForm(){const form=$('#travelSettings');if(!form)return;const f=new FormData(form),c={origin:f.get('origin').trim(),date:f.get('date'),days:+f.get('days'),budget:+f.get('budget'),mode:f.get('mode'),themes:[...new Set([...f.getAll('theme'),...String(f.get('custom')||'').split(/[,，、]/).map(t=>t.trim()).filter(Boolean)])],people:+f.get('people'),children:f.has('children'),elders:f.has('elders'),excludeVisited:f.has('excludeVisited')};if(c.origin===travel.conditions.origin&&travel.conditions.originPoint)c.originPoint=travel.conditions.originPoint;c.driveBudget=f.get('driveBudget')?Number(f.get('driveBudget')):null;form.querySelector('#driveBudgetField').hidden=c.mode!=='自驾';c.includeTransport=f.get('includeTransport')==='yes';c.fareInBudget=c.includeTransport&&f.has('fareInBudget');if(!c.includeTransport)c.mode='不限';form.querySelector('#intercityOptions').hidden=!c.includeTransport;c.hotelBudget=f.get("hotelBudget")?Number(f.get("hotelBudget")):null;c.rooms=f.get("rooms")?Number(f.get("rooms")):null;c.localMode=f.get("localMode");c.members=Array.from({length:Math.min(20,c.people)},(_,i)=>({tags:f.getAll("tags"+i),custom:f.get("memberCustom"+i)||"",ticket:f.get("ticket"+i)||"全价票"}));travel.conditions=c;}
async function locateTravel(){const input=$('#travelOrigin'),button=$('#travelLocate');if(!state.mapConfigured)return toast('定位暂不可用，请手动填写出发城市');button.disabled=true;button.textContent='定位中…';try{const point=await DouxMap.locate();const city=await DouxMap.cityAt(point.location);if(input.isConnected){input.setCustomValidity('');input.value=DouxTravel.normalize(city);suggestOrigins(input);rememberTravelForm();travel.conditions.originPoint=point.location;}}catch{toast('定位失败或未授权，请手动填写出发城市');}finally{if(button.isConnected){button.disabled=false;button.textContent='定位';}}}
document.addEventListener('input',event=>{if(event.target.closest('#travelSettings'))rememberTravelForm();});
document.addEventListener('change',event=>{const t=event.target;if(t.id==='travelNoRepeat'){travel.noRepeat=t.checked;render();}if(t.dataset.travelCheck!==undefined){travel.plan.checklist[t.dataset.travelCheck]=t.checked;markTravelDirty();}if(t.dataset.travelVisited){if(!t.checked&&state.visits?.some(v=>v.activity==='travel'&&v.storeId===t.dataset.travelVisited)){t.checked=true;toast('这个城市有旅游足迹，请在足迹中编辑或删除记录');return;}const old=travel.visited;travel.visited=t.checked?[...new Set([...old,t.dataset.travelVisited])]:old.filter(id=>id!==t.dataset.travelVisited);if(!persistTravel()){travel.visited=old;t.checked=!t.checked;}}});
document.addEventListener('submit',async event=>{const form=event.target;
  if(form.id==='travelSettings'){event.preventDefault();if(!await validateOrigin(form))return;rememberTravelForm();if(travel.conditions.days>1&&(travel.conditions.rooms>travel.conditions.people||(travel.conditions.budget>0&&travel.conditions.hotelBudget>travel.conditions.budget)))return toast('请核对住宿预算与房间数');if(!DouxTravel.validConditions(travel.conditions)||travel.conditions.date<today())return toast('请填写有效的出发城市、日期与旅行条件');persistTravel();travel.removed=[];travel.drawn.clear();discoverCities(form.querySelector('[type=submit]'),'new');}
  if(form.id==='travelAddCity'){event.preventDefault();if(travel.candidates.length>=12)return toast('最多 12 座');discoverCities(form.querySelector('button'),'add',new FormData(form).get('city').trim());}
  if(form.id==='travelMustGo'){event.preventDefault();const name=new FormData(form).get('spot').trim();if(!name)return;const existing=travel.plan.days.flatMap(d=>d.spots).find(s=>s.name===name);if(existing){existing.must=true;markTravelDirty();render();return;}const day=travel.plan.days[travel.day];if(day.spots.length>=12)return toast('这天已有 12 个地点，建议先减少一些');day.spots.push({id:'must-'+crypto.randomUUID(),name,must:true,stay:'游玩时长待查询'});markTravelDirty();render();}
});
window.addEventListener('beforeunload',event=>{if(travel.dirty&&!persistTravel()){event.preventDefault();event.returnValue='';}});

function travelVisitedIds(){return [...new Set([...travel.visited,...(state.visits||[]).filter(v=>v.activity==='travel').map(v=>v.storeId)])];}
function travelRecordStore(id){const city=travelCity(id);return city?{id:city.id,name:city.name,activity:'travel',emoji:'🧳'}:null;}
function openTravelVisitPicker(){showModal(modalTop('选择旅行城市')+`<select id="travelRecordPick" class="full"><option value="">请选择城市</option>${DouxTravel.cities.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>`);}
function travelVisitExtras(){const marked=travel.visited.filter(id=>!state.visits.some(v=>v.activity==='travel'&&v.storeId===id));return `<button class="btn outline full sheet-note" data-travel-stage="library">查看保存的行程</button>${marked.length?'<h2 class="travel-section-title">已标记去过的城市</h2><p class="muted">这些城市还没有旅行手记，可以补上一句话或旅行照。</p><div class="section-list">'+marked.map(id=>`<div class="list-row"><div class="grow"><h3>${esc(travelCity(id).name)}</h3><p>还没有旅行手记</p></div><button class="btn secondary small" data-travel-record="${id}">补充记录</button></div>`).join('')+'</div>':''}`;}
document.addEventListener('change',event=>{if(event.target.id==='travelRecordPick'&&event.target.value)recordForm(travelRecordStore(event.target.value));});

// 旅行手记独立于门店评价；照片压缩后仅保存在本机足迹中。
const travelPhotoWork=new WeakSet();
const travelRecordPhotos=record=>(Array.isArray(record?.images)?record.images:[]).filter(src=>/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src)).slice(0,3);
function travelRecordPhotosHTML(record){return `<div class="travel-visit-photos">${travelRecordPhotos(record).map((src,i)=>`<img src="${esc(src)}" alt="${esc(record.name)}旅行照 ${i+1}" loading="lazy">`).join('')}</div>`;}
function travelPhotoPreview(src){return `<span class="rv-preview-item"><img data-travel-photo src="${esc(src)}" alt="旅行照预览"><button type="button" data-travel-remove-photo aria-label="移除旅行照">×</button></span>`;}
function openTravelRecordForm(store,existing){
  state.bg++;
  showModal(modalTop(existing?'编辑旅行手记':'记下这次旅行')+`<form id="visitForm" class="record-form" data-store="${esc(store.id)}" data-activity="travel" data-visit="${esc(existing?.id||'')}"><div class="intro-box">${esc(store.name)}</div><label>留一句话<textarea name="note" maxlength="500" rows="3" placeholder="记下旅途中的一个瞬间…">${esc(existing?.note||'')}</textarea></label><div class="rv-photo-actions"><label class="btn outline small rv-upload">＋ 添加旅行照<input id="travelRecordPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><small>最多 3 张</small></div><div id="travelRecordPreview" class="rv-preview">${travelRecordPhotos(existing).map(travelPhotoPreview).join('')}</div><button class="btn full" type="submit">保存旅行手记</button></form>`);
}
function saveTravelRecord(form){
  if(travelPhotoWork.has(form))return toast('旅行照正在处理，请稍候');
  const existing=state.visits.find(v=>v.id===form.dataset.visit),store=travelRecordStore(form.dataset.store);
  if(!store)return toast('请选择旅行城市');
  const note=String(new FormData(form).get('note')||'').trim().slice(0,500);
  const images=travelRecordPhotos({images:[...form.querySelectorAll('img[data-travel-photo]')].map(img=>img.getAttribute('src'))});
  if(!note&&!images.length)return toast('留下一句话或添加旅行照吧');
  const record={...existing,id:existing?.id||crypto.randomUUID(),storeId:store.id,name:store.name,emoji:store.emoji,activity:'travel',date:existing?.date||today(),note,images};
  const next=existing?state.visits.map(v=>v.id===record.id?record:v):[...state.visits,record];
  if(!save('visits',next))return;
  state.visits=next;state.visitTab='travel';$('#modal').close();render();toast('这次旅行，已经记下了');
}
document.addEventListener('change',async event=>{
  const input=event.target;if(input.id!=='travelRecordPhotos')return;
  const form=input.closest('#visitForm');if(!form||travelPhotoWork.has(form))return;
  travelPhotoWork.add(form);
  try {
    for(const file of [...(input.files||[])]){
      if(form.querySelectorAll('img[data-travel-photo]').length>=3){toast('最多 3 张旅行照');break;}
      try {const src=await window.DouxReviews.compressPhoto(file);if(!form.isConnected)break;form.querySelector('#travelRecordPreview').insertAdjacentHTML('beforeend',travelPhotoPreview(src));form.dispatchEvent(new Event('input',{bubbles:true}));}
      catch(error){toast(error.message);}
    }
  } finally {travelPhotoWork.delete(form);input.value='';}
});
function memberFields(count,members=[]){return Array.from({length:Math.min(20,count)},(_,i)=>`<fieldset><legend>成员 ${i+1}</legend><div class="travel-interests">${['娱乐','美食','文化','历史','艺术','自然景观','综合'].map(t=>`<label><input type="checkbox" name="tags${i}" value="${t}" ${members?.[i]?.tags?.includes(t)?'checked':''}><span>${t}</span></label>`).join('')}</div><label>其他个人偏好<input name="memberCustom${i}" maxlength="80" value="${esc(members?.[i]?.custom||'')}" placeholder="例如非遗、建筑摄影"></label><label>票种偏好<select name="ticket${i}">${['全价票','学生票','半价票'].map(t=>`<option ${members?.[i]?.ticket===t?'selected':''}>${t}</option>`).join('')}</select></label></fieldset>`).join('');}
document.addEventListener('change',e=>{if(e.target.name==='people'&&$('#memberFields')){$('#memberFields').innerHTML=memberFields(+e.target.value,travel.conditions.members);rememberTravelForm();}});
async function tripRequest(action,extra={},button){const p=travel.plan;if(!p)return;if(action==='drive'){button.disabled=true;try{const A=await DouxMap.load(),geo=n=>new Promise((ok,no)=>new A.Geocoder().getLocation(n,(s,r)=>s==='complete'&&r.geocodes?.[0]?ok(r.geocodes[0].location):no(Error('未定位到城市'))));let points=await Promise.all([geo(p.conditions.origin),geo(p.cityName)]);if(extra.direction==='return')points.reverse();const minutes=await DouxMap.route(...points.map(v=>[v.lng,v.lat]),'驾车');if(!Number.isFinite(minutes))throw Error('未取得路线');if(travel.plan!==p||!button.isConnected)return;p.transport=p.transport||{};p.transport[extra.direction]={offers:[],message:'高德城市中心间驾车约 '+minutes+' 分钟，具体起终点会影响耗时。'};markTravelDirty();render();}catch(e){toast(e.message);}finally{button.disabled=false;}return;}const rev=travel.revision;if(button)button.disabled=true;
try{const response=await fetch('/api/travel/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cityId:p.cityId,city:travelCity(p.cityId),...(action==='plan'?{mustGo:p.days.flatMap(d=>d.spots.filter(s=>s.must).map(s=>s.name)),previous:p.days.map(d=>d.spots.map(s=>s.name))}:{}),conditions:['quote','plan'].includes(action)?await withAirportPoints(p.conditions,p.cityName):p.conditions,...extra})});const data=await response.json();if(!response.ok)throw Error(data.error);if(travel.plan!==p||travel.stage!=='plan'||state.page!=='travel')return;
if(action==='reviews'){$('#tripComments').innerHTML=data.map(r=>`<p><b>${r.rating}/5</b> · ${esc(r.date)}<br>${esc(r.comment)}</p>`).join('')||'暂无评价。';return;}
if(action==='plan'){if(rev!==travel.revision)return toast('草稿已修改，请重新规划');Object.assign(p,data);}else {p.transport=p.transport||{};p.transport[extra.direction||'outbound']=data;}
markTravelDirty();render();}catch(e){toast(e.message||'请求失败，可稍后重试');}finally{if(button)button.disabled=false;}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-trip-action]');if(b)tripRequest(b.dataset.tripAction,{direction:b.dataset.direction||"outbound"},b);});

function hotelSection(plan){
  if(plan.conditions.days===1)return '<p class="muted">当日往返，无需安排住宿。</p>';
  const h=plan.hotel;
  if(!h)return '<section class="travel-checklist"><h3>住宿安排</h3><p>生成 AI 行程后查看推荐酒店或住宿片区。</p></section>';
  const source=h.name&&/^https?:\/\//.test(h.url)?`<a href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">查看酒店资料</a>`:'';
  return `<section class="travel-checklist"><h3>住宿安排 · ${esc(h.name||h.area)}</h3><p>${esc(h.area)} · 连住 ${Number(h.nights)} 晚 · ${Number(h.rooms)} 间房</p><p>${h.perPerson?'人均住宿预算 ¥'+Number(h.perPerson)+'，每间每晚预算上限 ¥'+Number(h.nightlyCap):'未设置住宿金额'}${h.remaining!=null?' · 人均其余预算 ¥'+Number(h.remaining):''}</p><p>${esc(h.reason)}</p>${source}<button type="button" data-area-hotels>查看片区内的酒店</button><div id="areaHotels"></div><small>入住日期的房价和空房请向酒店核实。</small></section>`;
}


document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-area-hotels]');
  if(!button)return;
  const result=$('#areaHotels'), plan=travel.plan;
  if(!plan||!result)return;
  const city=travelCity(plan.cityId);
  const query=city.name+' '+plan.hotel.area.split('/')[0]+' 酒店';
  const mapLink=``;
  button.disabled=true;
  result.textContent='正在查找酒店…';
  try{
    const rows=state.mapConfigured?await DouxMap.search(query):[];
    const hotels=rows.filter(row=>String(row.city||row.address).includes(city.name)&&/住宿|宾馆|酒店|旅馆/.test(row.category)).slice(0,3);
    result.innerHTML=hotels.map(row=>`<p><b>${esc(row.name)}</b><br>${esc(row.address||'地址待核实')}</p>`).join('')+mapLink;
  }catch{result.innerHTML=mapLink;}finally{button.disabled=false;}
});


function transportSection(plan) {
  if(plan.conditions.includeTransport===false)return '';
  const arrival=plan.arrivalPlan, offer=arrival?.offer;
  const summary=offer?`<p>${esc(offer.mode)} · ${esc(offer.service)} · ${esc(offer.departurePlace)} → ${esc(offer.arrivalPlace)}<br>${esc(offer.departureAt)} → ${esc(offer.arrivalAt)} · ${offer.minutes} 分钟<br>规划时去程报价 ¥${offer.priceCNY}/人 · ${esc(arrival.checkedAt)}</p>`:'';
  const budget=arrival?`<p>${esc(arrival.note)}${arrival.remaining!=null?' · 目的地可用 ¥'+arrival.remaining+'/人':''}</p>`:'';

  const sections = ['outbound','return'].map(direction => {
    const result = plan.transport?.[direction]||(direction==='outbound'?arrival?.outbound:null);
    const label = direction==='outbound'?'去程':'返程';
    const stale=result?.offers?.length&&Date.now()-Date.parse(result.checkedAt)>300000;
    const offers = (stale?[]:(result?.offers || [])).filter(o=>o.referenceOnly||o.availableSeats>=plan.conditions.people);
    const cards = offers.map(offer => `<article class="travel-stop"><div class="travel-stop-copy">
      <h3>${esc(offer.mode)} · ${esc(offer.service)}</h3>
      <p>${esc(offer.departurePlace)} → ${esc(offer.arrivalPlace)}<br>
      ${esc(offer.departureAt.replace('T',' '))} → ${esc(offer.arrivalAt.replace('T',' '))}<br>
      全程 ${Number(offer.minutes)} 分钟 · ${esc(offer.seat)} · ${esc(offer.availability)}</p>
      <p>¥${Number(offer.priceCNY)} / 人 · ${esc(offer.priceNote)}</p>
      <p>${esc(offer.departureAddress||'出发站地址待核实')}<br>${esc(offer.arrivalAddress||'到达站地址待核实')}</p>
      <small>${esc(offer.provider)} · 查询于 ${esc(result.checkedAt||'')}</small>
    </div></article>`).join('');
    return `<h3>${label}</h3><button type="button" class="btn secondary" data-trip-action="${plan.conditions.mode==='自驾'?'drive':'quote'}" data-direction="${direction}">${plan.conditions.mode==='自驾'?'查询'+label+'驾车耗时':'查询'+label+'班次、站点与价格'}</button>
      ${result?.query?`<p>${esc(result.query.origin)} → ${esc(result.query.destination)} · ${esc(result.query.date)}</p>`:''}
      ${cards||`<p class="muted">${esc(stale?'上次库存已过期，请重新查询':result?.message||(result?.status==='empty'?'本次查询没有可用方案':'尚未查询班次与报价'))}</p>`}`;
  }).join('');
  const current=plan.transport?.outbound||arrival?.outbound;
  const rows=current&&Date.now()-Date.parse(current.checkedAt)<300000?current.offers||[]:[];
  const average=rows.length?Math.round(rows.reduce((sum,o)=>sum+o.priceCNY,0)/rows.length):null;
  const stock=rows.some(o=>!o.referenceOnly&&o.availableSeats>=plan.conditions.people)?'有票 · ':'';
  return `<section class="travel-checklist">${average!==null?`<p>去程 · ${stock}平均参考价 ¥${average}/人</p>`:''}<details><summary>查看交通班次与费用</summary>${summary}${budget}${sections}</details></section>`;

}

async function travelCall(action,input){
 const r=await fetch('/api/travel/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'请求失败');return data;
}
async function discoverCities(button,kind,requested){
 if(travel.pendingDiscovery)return;travel.pendingDiscovery=true;
 const label=button.textContent;button.disabled=true;button.textContent='正在按偏好检索…';
 const conditions=travelClone(travel.conditions),exclude=[...(conditions.excludeVisited?travelVisitedIds():[]),...(kind==='new'?[]:[...travel.removed,...travel.candidates.map(c=>c.id)])].map(id=>travelCity(id)?.name).filter(Boolean);
 try{
 const localName=DouxTravel.normalize(conditions.origin);
 const local={id:'dest-'+localName,name:localName,tags:conditions.themes,spots:[],intro:'按本次预算优先安排本地游。',assessment:'本地游 · 无需城际交通'};
 // 住宿预算是上限，粗筛按经济住宿预留，不把整个上限视作支出。
 const lodging=conditions.days>1?Math.min(conditions.hotelBudget??Infinity,80*(conditions.days-1)):0;
 const transportReserve=conditions.includeTransport&&conditions.fareInBudget!==false?({'飞机':300,'高铁':60,'铁路':30,'自驾':conditions.driveBudget??50}[conditions.mode]??0):0;
 const localOnly=conditions.budget>0&&conditions.budget<lodging+40*conditions.days+transportReserve;
 let result;
 if(localOnly){
   if(requested&&DouxTravel.normalize(requested)!==localName)throw Error('按当前预算建议本地游，可调整预算后再添加外地城市');
   result=[local];
 }else{
   const batch=await travelCall('discover',{conditions,requested,exclude,analyze:true});
   result=batch.cities.filter(city=>city.estimate==null||!conditions.budget||city.estimate<=conditions.budget)
     .map(city=>({...city,assessment:conditions.budget?(city.estimate==null?'费用待估':city.estimate>conditions.budget*.8?'粗估预算偏紧':'粗估预算可覆盖'):'预算不限'}));
   if(!result.length&&!requested){
     const nearest=[...batch.cities].sort((a,b)=>(a.estimate??Infinity)-(b.estimate??Infinity)).slice(0,2);
     if(!nearest.length)throw Error('本批未生成可比较的外地城市，请换一批或调整偏好');
     result.push(batch.local||local,...nearest.map(city=>({...city,assessment:city.estimate==null?'费用待估':'本批较低价方案 · 粗估超预算'})));
   }
 }
 if(!result.length)throw Error('没有找到符合交通和预算条件的城市');
 if(!button.isConnected||JSON.stringify(conditions)!==JSON.stringify(travel.conditions))return;
 for(const c of result){const i=DouxTravel.cities.findIndex(v=>v.id===c.id);if(i<0)DouxTravel.cities.push(c);else DouxTravel.cities[i]=c;}
 travel.candidates=kind==='add'?[...travel.candidates,...result]:result;travel.last=null;travel.drawn.clear();persistTravel();travelGo('candidates');
 }catch(e){toast(e.message);}finally{travel.pendingDiscovery=false;button.disabled=false;button.textContent=label;}
}
async function generateTravelPlan(button){
 const city=travel.last,conditions=travelClone(travel.conditions);if(DouxTravel.normalize(city.name)===DouxTravel.normalize(conditions.origin)){conditions.includeTransport=false;conditions.fareInBudget=false;}button.disabled=true;button.textContent='正在编排每日行程与住宿…';
 try{if(!city.spots.length){
 const batch=await travelCall('discover',{conditions,requested:city.name,analyze:true,exclude:[]});
 if(!batch.local?.spots?.length||batch.local.name!==city.name)throw Error('未取得本地景点，请重试');
 Object.assign(city,batch.local);
 }const data=await travelCall('plan',{cityId:city.id,city,conditions:await withAirportPoints(conditions,city.name)});if(!button.isConnected||!$('#modal').open)return;
 travel.plan={id:crypto.randomUUID(),cityId:city.id,cityName:city.name,conditions,...data,checklist:{},savedAt:null};travel.day=0;markTravelDirty();$('#modal').close();travelGo('plan');
 }catch(e){toast(e.message);}finally{button.disabled=false;button.textContent='就去这里，生成行程';}
}

async function withAirportPoints(conditions,destination){
  if(conditions.mode!=='飞机'||conditions.includeTransport===false)return conditions;
  try{
    const A=await DouxMap.load();
    const locate=name=>new Promise((resolve,reject)=>new A.Geocoder().getLocation(name,(status,result)=>{
      const point=result?.geocodes?.[0]?.location;
      if(status==='complete'&&point)resolve([point.lng,point.lat]);else reject(Error('城市定位失败'));
    }));
    const points=await Promise.all([conditions.originPoint||locate(conditions.origin),locate(destination)]);
    return {...conditions,airportPoints:points};
  }catch{return conditions;}
}

let originDirectory;
function loadOriginCities(){
  if(originDirectory)return originDirectory;
  originDirectory=DouxMap.load().then(A=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('城市目录暂不可用，请稍后重试')),15000);
    A.plugin('AMap.DistrictSearch',()=>{
      new A.DistrictSearch({level:'country',subdistrict:3,extensions:'base'}).search('中国',(status,result)=>{
        clearTimeout(timer);
        const names=new Set();
        function collect(node){
          if(node.level==='city'||(node.level==='province'&&/市$|特别行政区$/.test(node.name))||(node.level==='district'&&/市$/.test(node.name)))names.add(node.name);
          for(const child of node.districtList||[])collect(child);
        }
        if(status==='complete')for(const root of result.districtList||[])collect(root);
        if(!names.size)return reject(Error('未取得城市目录，请重试'));
        resolve([...names].filter(n=>!['市辖区','县','省直辖县级行政区划','自治区直辖县级行政区划'].includes(n)));
      });
    });
  })).catch(error=>{originDirectory=null;throw error;});
  return originDirectory;
}
const originAlias=name=>name.trim().replace(/特别行政区$|市$/,'');
async function suggestOrigins(input){
  const value=input.value.trim(),hint=$('#originCityHint');
  try{
    const names=await loadOriginCities();
    if(!input.isConnected||input.value.trim()!==value)return;
    const matches=value?names.filter(n=>n.includes(value)).sort((a,b)=>Number(b.startsWith(value))-Number(a.startsWith(value))):[];
    $('#originCityOptions').innerHTML=matches.slice(0,30).map(n=>'<option value="'+esc(n)+'"></option>').join('');
    hint.textContent=value&&!matches.length?'未找到匹配城市，请检查名称。':'';
  }catch{if(input.isConnected)hint.textContent='城市目录加载失败，提交时会重试。';}
}
for(const type of ['focusin','input'])document.addEventListener(type,e=>{
  if(e.target.id==='travelOrigin'){e.target.setCustomValidity('');suggestOrigins(e.target);}
});
async function validateOrigin(form){
  const input=form.elements.origin,value=input.value.trim();
  try{
    const names=await loadOriginCities();
    if(!form.isConnected||input.value.trim()!==value)return false;
    const match=names.find(n=>n===value)||names.find(n=>originAlias(n)===value);
    if(!match){input.setCustomValidity('请输入有效城市全名，或从匹配列表选择。');input.reportValidity();return false;}
    input.value=originAlias(match);return true;
  }catch{toast('无法验证出发城市，请检查网络后重试');return false;}
}
