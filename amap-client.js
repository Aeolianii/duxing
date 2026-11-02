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
      address:[text(poi.cityname),text(poi.adname),text(poi.address)].join(''), price:number(poi.biz_ext?.cost),
      rating:number(poi.biz_ext?.rating), phone:text(poi.tel), photos, hours:null, emoji:'🍽️', color:'#e7f5ef'};
  }
  function routeMinutes(result) {
    const time = result?.routes?.[0]?.time;
    return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? Math.ceil(time / 60) : null;
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
        else reject(new Error('高德服务未返回结果，请检查 Key、白名单和服务额度'));
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
        root.AMap.plugin(['AMap.PlaceSearch','AMap.Geocoder','AMap.Geolocation','AMap.Walking','AMap.Driving'],()=>{clearTimeout(timer);resolve();});
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
    '烧烤':{type:'050000',keyword:'烧烤|烤串'}
  };
  function matchesCuisine(store, selected) {
    if (!selected.length) return true;
    return selected.some(label => {
      const query=cuisineQueries[label];if(!query)return false;
      if(query.keyword)return query.keyword.split('|').some(word=>(store.name+';'+store.category).includes(word));
      return query.type.split('|').some(code=>String(store.typecode).startsWith(code.endsWith('00')?code.slice(0,4):code));
    });
  }
  async function search(query) {
    const A = await load();
    const result = await call(done => new A.PlaceSearch({pageSize:8,extensions:'all'}).search(query,done));
    return (result?.poiList?.pois || []).map(normalize).filter(p => p.location);
  }
  async function nearby(origin, config) {
    const A = await load();
    const radius = Math.min(50000, Math.max(1000,config.limit*(config.mode==='驾车'?700:90)));
    const queries=config.types.length?config.types.map(t=>cuisineQueries[t]):[{type:'050000'}];
    const groups=await Promise.all(queries.map(async query=>{
      const result=await call(done=>new A.PlaceSearch({type:query.type,pageSize:20,extensions:'all'}).searchNearBy(query.keyword||'',origin,radius,done));
      return (result?.poiList?.pois||[]).map(normalize).filter(p=>p.location);
    }));
    const unique=new Map();
    for(let row=0;row<20&&unique.size<20;row++)for(const group of groups){if(group[row]&&unique.size<20)unique.set(group[row].id,group[row]);}
    return [...unique.values()];
  }
  async function route(from,to,mode) {
    const A = await load();
    const service = mode === '驾车' ? new A.Driving() : new A.Walking();
    const result = await call(done => service.search(from,to,done));
    return routeMinutes(result);
  }
  async function details(store) {
    const A = await load();
    const result = await call(done => new A.PlaceSearch({extensions:'all'}).getDetails(store.poiId,done),8000);
    const poi = result?.poiList?.pois?.find(p=>p.id===store.poiId);
    return poi ? {...store,...normalize(poi)} : store;
  }
  async function locate() {
    const A=await load();
    const result=await call(done=>new A.Geolocation({enableHighAccuracy:true,timeout:10000,convert:true}).getCurrentPosition(done));
    const point=coordinates(result?.position);
    if(!point) throw new Error('未获取到定位，请在地图上手动选点');
    return {location:point,name:result.formattedAddress || '我的位置'};
  }
  const api={coordinates,normalize,routeMinutes,eligible,matchesCuisine,call,load,search,nearby,route,details,locate};
  if(typeof module!=='undefined') module.exports=api; else root.DouxMap=api;
})(typeof window!=='undefined'?window:globalThis);
