(function(root) {
  'use strict';
  const text = value => typeof value === 'string' ? value : '';
  function coordinates(value) {
    if (!value) return null;
    const parts = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [value.getLng?.() ?? value.lng, value.getLat?.() ?? value.lat];
    const pair = parts.map(Number);
    return pair.length === 2 && pair.every(Number.isFinite) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90 ? pair : null;
  }
  function normalize(poi) {
    const number = v => v !== '' && v != null && !Array.isArray(v) && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const photos = (Array.isArray(poi.photos) ? poi.photos : []).map(p => text(p.url)).filter(u => /^https:\/\//i.test(u));
    return {id:'amap-'+poi.id, poiId:poi.id, source:'amap', name:text(poi.name), location:coordinates(poi.location),
      type:text(poi.type).split(';').filter(Boolean).pop() || '餐饮', category:text(poi.type), typecode:text(poi.typecode),
      city:text(poi.cityname)||text(poi.citycode),address:[text(poi.cityname),text(poi.adname),text(poi.address)].join(''), price:number(poi.biz_ext?.cost),
      rating:number(poi.biz_ext?.rating), phone:text(poi.tel), photos, hours:null, emoji:'🍽️', color:'#e7f5ef'};
  }
  function routeMinutes(result) {
    const time = result?.routes?.[0]?.time;
    return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? Math.ceil(time / 60) : null;
  }
  function mergeDetails(store, poi) {
    const next={...store},normalized=normalize(poi);
    for(const [key,value] of Object.entries(normalized)){
      if(value==null||value===''||(Array.isArray(value)&&!value.length))continue;
      if(['emoji','color','type'].includes(key)&&store[key])continue;
      if(key==='name'&&store.poiName)continue;
      next[key]=value;
    }
    return next;
  }
  function transitMinutes(result){
    const plans=(result?.plans||[]).filter(p=>Number.isFinite(p.time)&&p.time>=0&&!p.segments?.some(s=>['TAXI','RAILWAY'].includes(s.transit_mode)));
    return plans.length?Math.ceil(Math.min(...plans.map(p=>p.time))/60):null;
  }
  function eligible(store, config, times, limits) {
    return times.length === limits.length && times.every((time, i) => Number.isFinite(time) && time <= limits[i]) &&
      (!config.budget || (store.price == null ? !!config.unknownPrice : store.price <= config.budget)) &&
      (!config.open || !!config.unknownHours);
  }
  function call(start, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('高德请求超时，请重试')), timeout);
      try { start((status, result) => {
        clearTimeout(timer);
        if (status === 'complete') resolve(result);
        else if (status === 'no_data') resolve(null);
        else {
          const diagnostic=JSON.stringify(result)||'';
          const code=(diagnostic.match(/\b(?:INVALID|USERKEY|INSUFFICIENT|SERVICE|DAILY|ACCESS|INVALID_USER_SCODE)[A-Z_]*\b/)||[])[0] || (typeof result==='string'?result:result?.info);
          const safe=typeof code==='string'&&/^[A-Z][A-Z_0-9]{2,60}$/.test(code)?'（'+code+'）':'';
          reject(new Error('高德服务未返回结果'+safe+'，请检查 Key、白名单和服务额度'));
        }
      }); } catch (error) {clearTimeout(timer); reject(error);}
    });
  }
  let sdkPromise;
  async function load() {
    if (!sdkPromise) sdkPromise = (async () => {
      const response = await fetch('/api/map-config', {signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('请通过启动原型.cmd 打开应用');
      const config = await response.json();
      if (!config.configured) throw new Error('请先配置高德 Key 和安全密钥');
      root._AMapSecurityConfig = {serviceHost:location.origin+'/_AMapService'};
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {script.remove(); reject(new Error('地图加载超时，请检查网络后重试'));}, 15000);
        script.src = 'https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(config.key);
        script.onload = () => {clearTimeout(timer); root.AMap ? resolve() : reject(new Error('地图初始化失败'));};
        script.onerror = () => {clearTimeout(timer); script.remove(); reject(new Error('地图加载失败，请检查网络'));};
        document.head.append(script);
      });
      await new Promise((resolve,reject) => {
        const timer=setTimeout(()=>reject(new Error('地图插件加载超时')),12000);
        root.AMap.plugin(['AMap.PlaceSearch','AMap.Geocoder','AMap.Geolocation','AMap.Walking','AMap.Driving','AMap.Transfer'],()=>{clearTimeout(timer);resolve();});
      });
      return root.AMap;
    })().catch(error => {sdkPromise=null; throw error;});
    return sdkPromise;
  }
  // Verified against AMap's published POI table. BBQ has no dedicated type code.
  const cuisineQueries = {
    '中餐':{type:'050100'},
    '西餐':{type:'050201|050204|050205|050207|050208|050210|050211|050212|050213|050214|050215|050216'},
    '韩餐':{type:'050203'},'日料':{type:'050202'},'火锅':{type:'050117'},
    '东南亚':{type:'050000',keyword:'东南亚|泰国|越南|新加坡|马来西亚|印尼'},
    '烧烤':{type:'050000',keyword:'烧烤|烤串'},
    '奶茶':{type:'050000',keyword:'奶茶|茶饮|喜茶|奈雪|蜜雪冰城|古茗|茶百道|霸王茶姬|沪上阿姨|一点点|益禾堂|书亦烧仙草|茶月山'}
  };
  function matchesCuisine(store, selected) {
    if (!selected.length) return true;
    return selected.some(label => {
      const query=cuisineQueries[label];if(!query)return false;
      if(query.keyword)return query.keyword.split('|').some(word=>(store.name+';'+store.category).includes(word));
      return query.type.split('|').some(code=>String(store.typecode).startsWith(code.endsWith('00')?code.slice(0,4):code));
    });
  }
  // Entertainment venues: AMap has dedicated codes for cinemas, KTV and bars;
  // escape rooms and script-killing rooms share the generic leisure type, so
  // those rely on keyword search plus a name match.
  const playQueries = {
    '看电影':{type:'080601',match:['电影院']},
    '密室逃脱':{type:'080000',keyword:'密室逃脱|密室|逃脱',nameRe:/密室|逃脱/},
    '剧本杀':{type:'080000',keyword:'剧本杀|剧本|推理',nameRe:/剧本|推理|侦探/},
    '唱K':{type:'080302',match:['KTV']},
    '桌游':{type:'080000',keyword:'桌游|狼人杀|游戏社',nameRe:/桌游|狼人杀/},
    '酒吧':{type:'080304',match:['酒吧']},
    '看演出':{type:'080603|080602',match:['剧场','音乐厅']}
  };
  function matchesPlay(store, selected) {
    if (!selected.length) return true;
    const hay = text(store.name) + ' ' + text(store.category) + ' ' + text(store.type);
    return selected.some(label => {
      const query = playQueries[label];
      if (!query) return false;
      if (query.nameRe) return query.nameRe.test(hay);
      return (query.match||[]).some(word => hay.includes(word));
    });
  }
  function playEmoji(store) {
    const hay = text(store.name) + ' ' + text(store.category);
    if (/密室|逃脱/.test(hay)) return '🗝️';
    if (/剧本|推理|侦探/.test(hay)) return '🕵️';
    if (/桌游|狼人杀/.test(hay)) return '🎲';
    if (/电影|影城|影院|IMAX|CGV/i.test(hay)) return '🎬';
    if (/KTV|卡拉|量贩|歌/i.test(hay)) return '🎤';
    if (/酒吧|酒馆|精酿|livehouse/i.test(hay)) return '🍻';
    if (/剧场|剧院|音乐厅|演出|相声|喜剧/.test(hay)) return '🎭';
    return '🎡';
  }
  const playColors = ['#ffe0ec','#e2f0ff','#e8e2ff','#dff3e6','#fff0cf','#f6e3ff'];
  function decoratePlay(store, index) {
    return {...store, activity:'play', emoji:playEmoji(store), color:playColors[index % playColors.length]};
  }
  async function search(query, center) {
    const A = await load();
    const searcher = new A.PlaceSearch({pageSize:8,extensions:'all'});
    const result = await call(done => center ? searcher.searchNearBy(query, center, 20000, done) : searcher.search(query, done));
    return (result?.poiList?.pois || []).map(normalize).filter(p => p.location);
  }
  async function nearby(origin, config) {
    const A = await load();
    const radius = Math.min(50000, Math.max(1000,config.limit*(config.mode==='驾车'?700:config.mode==='公共交通'?400:90)));
    if (config.activity === 'play') {
      const pairs = config.types.length ? config.types.map(label => [label, playQueries[label]]).filter(pair => pair[1]) : Object.entries(playQueries);
      // One query at a time: several parallel PlaceSearch calls trip AMap's
      // per-key QPS limit, so the extra latency is cheaper than a failed wheel.
      // Map previews only need a few pins, so they ask fewer categories.
      const list = config.preview ? pairs.slice(0, 3) : pairs;
      const groups = [];
      for (const [label, query] of list) {
        const result = await call(done => new A.PlaceSearch({type:query.type,pageSize:20,extensions:'all'}).searchNearBy(query.keyword||'',origin,radius,done));
        groups.push((result?.poiList?.pois||[]).map(normalize).filter(p => p.location && matchesPlay(p, [label])));
        if (list.length > 1) await new Promise(resolve => setTimeout(resolve, 420));
      }
      const unique = new Map();
      for (let row=0; row<20 && unique.size<20; row++) for (const group of groups) {
        const store = group[row];
        if (store && unique.size < 20) unique.set(store.id, decoratePlay(store, unique.size));
      }
      return [...unique.values()];
    }
    const queries=config.types.length?config.types.map(t=>cuisineQueries[t]):[{type:'050000'}];
    const groups=await Promise.all(queries.map(async query=>{
      const result=await call(done=>new A.PlaceSearch({type:query.type,pageSize:20,extensions:'all'}).searchNearBy(query.keyword||'',origin,radius,done));
      return (result?.poiList?.pois||[]).map(normalize).filter(p=>p.location&&matchesCuisine(p,config.types));
    }));
    const unique=new Map();
    for(let row=0;row<20&&unique.size<20;row++)for(const group of groups){if(group[row]&&unique.size<20)unique.set(group[row].id,group[row]);}
    return [...unique.values()];
  }
  const cities=new Map();
  async function cityAt(point){
    const key=point.join(',');if(cities.has(key))return cities.get(key);
    const A=await load();
    const result=await call(done=>new A.Geocoder().getAddress(point,done));
    const address=result?.regeocode?.addressComponent;
    const city=text(address?.city)||text(address?.province);
    if(!city)throw new Error('无法确定公交查询城市，请重新搜索出发地点');
    cities.set(key,city);return city;
  }
  const routeSlots=new Map();
  async function waitRouteSlot(mode){
    // Reserve request slots across workers, including a previous cancelled search.
    const now=Date.now(),slot=Math.max(now,routeSlots.get(mode)||0);
    routeSlots.set(mode,slot+1150);
    if(slot>now)await new Promise(resolve=>setTimeout(resolve,slot-now));
  }
  async function route(from,to,mode,context={}) {
    const A = await load();
    if(mode==='公共交通'){
      const city=context.city||await cityAt(from),cityd=context.cityd||await cityAt(to);
      await waitRouteSlot(mode);
      const service=new A.Transfer({city,cityd,policy:A.TransferPolicy.LEAST_TIME,extensions:'all'});
      const minutes=transitMinutes(await call(done=>service.search(from,to,done)));
      // Nearby destinations often have no bus/subway plan. Check a real walking
      // route in that case; never turn missing route data into a zero-minute trip.
      return minutes==null?route(from,to,'步行'):minutes;
    }
    await waitRouteSlot(mode);
    const service = mode === '驾车' ? new A.Driving() : new A.Walking();
    const result = await call(done => service.search(from,to,done));
    return routeMinutes(result);
  }
  async function details(store) {
    const A = await load();
    const result = await call(done => new A.PlaceSearch({extensions:'all'}).getDetails(store.poiId,done),8000);
    const poi = result?.poiList?.pois?.find(p=>p.id===store.poiId);
    if (!poi) return store;
    const next = mergeDetails(store, poi);
    next.emoji = store.emoji || next.emoji;
    next.color = store.color || next.color;
    next.activity = store.activity || next.activity;
    return next;
  }
  async function locate() {
    const A=await load();
    const result=await call(done=>new A.Geolocation({enableHighAccuracy:true,timeout:10000,convert:true}).getCurrentPosition(done));
    const point=coordinates(result?.position);
    if(!point) throw new Error('未获取到定位，请在地图上手动选点');
    return {location:point,name:result.formattedAddress || '我的位置'};
  }
  const api={coordinates,normalize,mergeDetails,routeMinutes,transitMinutes,cityAt,eligible,matchesCuisine,matchesPlay,playQueries,playTypes:Object.keys(playQueries),decoratePlay,playEmoji,call,load,search,nearby,route,details,locate};
  if(typeof module!=='undefined') module.exports=api; else root.DouxMap=api;
})(typeof window!=='undefined'?window:globalThis);
