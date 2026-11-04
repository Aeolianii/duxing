(function(root) {
  'use strict';
  const text = value => typeof value === 'string' ? value : '';
  function coordinates(value) {
    if (!value) return null;
    const parts = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [value.getLng?.() ?? value.lng, value.getLat?.() ?? value.lat];
    const pair = parts.map(Number);
    return pair.length === 2 && pair.every(Number.isFinite) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90 ? pair : null;
  }
  const WEEKDAYS = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':0,'天':0};
  const pad2 = value => String(value).padStart(2, '0');
  const clockMinute = (hour, minute) => hour >= 0 && hour <= 24 && minute >= 0 && minute < 60 && !(hour === 24 && minute !== 0) ? hour * 60 + minute : null;
  function clockText(minute) {
    return minute === 1440 ? '24:00' : pad2(Math.floor(minute / 60)) + ':' + pad2(minute % 60);
  }
  function hourIntervals(value) {
    const found = new Map();
    for (const match of value.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})\s*[-~至到—－]\s*(\d{1,2})\s*[:：]\s*(\d{2})/g)) {
      const from = clockMinute(+match[1], +match[2]), to = clockMinute(+match[3], +match[4]);
      if (from != null && to != null && from !== to) found.set(from + '-' + to, [from, to]);
    }
    return [...found.values()].sort((a, b) => a[0] - b[0]);
  }
  function hourText(intervals) {
    if (intervals.length === 1 && intervals[0][0] === 0 && intervals[0][1] === 1440) return '24 小时营业';
    return intervals.map(([from, to]) => clockText(from) + '-' + clockText(to)).join('、');
  }
  function dayStart(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); }
  function datePoint(value, year) {
    const parts = value.split('-').map(Number);
    return parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]).getTime() : new Date(year, parts[0] - 1, parts[1]).getTime();
  }
  function withinDates(now, from, to) {
    const year = now.getFullYear(), today = dayStart(now), start = datePoint(from, year), end = datePoint(to, year);
    return start <= end ? today >= start && today <= end : today >= start || today <= end;
  }
  function weekdayMatch(now, range) {
    const match = /^周([一二三四五六日天])(?:至周([一二三四五六日天]))?$/.exec(range);
    if (!match) return false;
    const from = WEEKDAYS[match[1]], to = WEEKDAYS[match[2] || match[1]], day = now.getDay();
    return from <= to ? day >= from && day <= to : day >= from || day <= to;
  }
  function weekdayHours(value, now) {
    const pattern = /(?:(\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2})\s*至\s*(\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2})\s*)?(周[一二三四五六日天](?:\s*至\s*周[一二三四五六日天])?)[，,、；;：:\s]*((?:\d{1,2}\s*[:：]\s*\d{2}\s*[-~至到—－]\s*\d{1,2}\s*[:：]\s*\d{2}[，,、；;\s]*)+)/g;
    for (const match of value.matchAll(pattern)) {
      if (match[1] && match[2] && !withinDates(now, match[1], match[2])) continue;
      if (!weekdayMatch(now, match[3].replace(/\s+/g, ''))) continue;
      const intervals = hourIntervals(match[4]);
      if (intervals.length) return intervals;
    }
    return null;
  }
  // open_time is AMap's short summary; opentime2 adds weekday and special-date
  // rules. Prefer the weekday rule that applies today and ignore holiday ranges,
  // so a special-period interval never counts as the normal opening hours.
  function parseHours(poi, now = new Date()) {
    const sources = [text(poi.opentime2), text(poi.open_time)];
    for (const value of sources) {
      if (!value) continue;
      if (/24\s*小时|全天营业|24h/i.test(value)) return {intervals: [[0, 1440]], text: '24 小时营业'};
      const weekday = weekdayHours(value, now);
      if (weekday) return {intervals: weekday, text: hourText(weekday)};
    }
    for (const value of sources) {
      if (!value) continue;
      const intervals = hourIntervals(value);
      if (intervals.length) return {intervals, text: hourText(intervals)};
    }
    return null;
  }
  function normalize(poi, now = new Date()) {
    const at = now instanceof Date ? now : new Date();
    const number = v => v !== '' && v != null && !Array.isArray(v) && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const photos = (Array.isArray(poi.photos) ? poi.photos : []).map(p => text(p.url)).filter(u => /^https:\/\//i.test(u));
    // JS API 2.0 puts rating/cost at the top level of a POI; older SDK and REST
    // payloads nest them in biz_ext. Read the top-level value first, then fall back.
    const rating = number(poi.rating) ?? number(poi.biz_ext?.rating);
    const price = number(poi.cost) ?? number(poi.biz_ext?.cost);
    const hours = parseHours(poi, at);
    return {id:'amap-'+poi.id, poiId:poi.id, source:'amap', name:text(poi.name), location:coordinates(poi.location),
      type:text(poi.type).split(';').filter(Boolean).pop() || '餐饮', category:text(poi.type), typecode:text(poi.typecode),
      city:text(poi.cityname)||text(poi.citycode),address:[text(poi.cityname),text(poi.adname),text(poi.address)].join(''), price,
      rating, phone:text(poi.tel), photos, hours:hours?hours.intervals:null, hoursText:hours?hours.text:(text(poi.open_time)||text(poi.opentime2)), emoji:'🍽️', color:'#e7f5ef'};
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
  // opening is the result of checking parsed hours against the expected arrival
  // time: true, false, or null when AMap gave no usable opening hours.
  function eligible(store, config, times, limits, opening) {
    return times.length === limits.length && times.every((time, i) => Number.isFinite(time) && time <= limits[i]) &&
      (!config.budget || (store.price == null ? !!config.unknownPrice : store.price <= config.budget)) &&
      (!config.open || (opening == null ? !!config.unknownHours : !!opening));
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
        root.AMap.plugin(['AMap.PlaceSearch','AMap.Geocoder','AMap.Geolocation','AMap.Walking','AMap.Riding','AMap.Driving','AMap.Transfer'],()=>{clearTimeout(timer);resolve();});
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
  // Attraction-type POIs (scenic spots, parks, museums, galleries) usually come
  // back as several sub-points of the same venue: 广州塔 / 广州塔A区 / 登塔大厅 /
  // 450米观景平台. They are merged into one candidate; the venue with the best
  // public data (rating, photos, shorter name) represents the group.
  const ATTRACTION_CATEGORY = /风景名胜|旅游景点|国家级景点|省级景点|观景点|城市广场|公园|博物馆|展览馆|美术馆|世界遗产/;
  const ATTRACTION_LABELS = ['景点', '博物馆', '美术馆', '公园'];
  function isAttractionStore(store) {
    return ATTRACTION_CATEGORY.test(text(store.category) + ' ' + text(store.type));
  }
  function distanceMeters(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
    const rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  const plainText = value => text(value).replace(/[（(][^）)]*[）)]/g, '').replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
  function commonPrefixLength(a, b) { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
  function sameVenue(a, b, label) {
    if (distanceMeters(a.location, b.location) > 300) return false;
    const left = plainText(a.name), right = plainText(b.name);
    if (left && right && (left.startsWith(right) || right.startsWith(left) || commonPrefixLength(left, right) >= 3)) return true;
    if (ATTRACTION_LABELS.includes(label)) {
      const la = plainText(a.address), lb = plainText(b.address);
      // A sub-point addresses itself with the landmark name (e.g. 「阅江西路
      // 222号广州塔E区108层」); sharing a street prefix alone is not enough,
      // otherwise a neighbouring venue on the same street gets merged too.
      if (la && lb && (la.includes(right) || lb.includes(left))) return true;
    }
    return false;
  }
  function venueScore(store) {
    return [Number(store.rating) || 0, Array.isArray(store.photos) ? store.photos.length : 0, -text(store.name).length];
  }
  function betterVenue(a, b) {
    const left = venueScore(a), right = venueScore(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i] ? a : b;
    return a;
  }
  function dedupeVenues(stores, label) {
    const parent = stores.map((_, index) => index);
    const find = index => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
    const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[b] = a; };
    for (let i = 0; i < stores.length; i++) for (let j = i + 1; j < stores.length; j++) if (sameVenue(stores[i], stores[j], label)) union(i, j);
    const groups = new Map();
    stores.forEach((store, index) => { const root = find(index); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(store); });
    return [...groups.values()].map(group => {
      let winner = group[0];
      for (const store of group.slice(1)) winner = betterVenue(winner, store);
      if (!(winner.photos || []).length) { const withPhotos = group.find(store => (store.photos || []).length); if (withPhotos) winner.photos = withPhotos.photos; }
      return winner;
    });
  }
  function matchesCuisine(store, selected) {
    if (!selected.length) return true;
    return selected.some(label => {
      const query=cuisineQueries[label];if(!query)return false;
      if(query.keyword)return query.keyword.split('|').some(word=>(store.name+';'+store.category).includes(word));
      // JS API 2.0 no longer returns typecode. The nearby search was already
      // restricted to this type code, so keep the result instead of dropping it.
      if(!text(store.typecode))return true;
      return query.type.split('|').some(code=>String(store.typecode).startsWith(code.endsWith('00')?code.slice(0,4):code));
    });
  }
  // Venues and attractions. Type codes verified against live AMap results:
  // 110000 风景名胜 (含公园广场/旅游景点/国家级景点/观景点), 110101 公园,
  // 140100 博物馆, 140200 展览馆, 140400 美术馆. Type queries are pre-filtered by
  // AMap, so matchesPlay only needs a light category keyword sanity check.
  // Escape rooms, script-killing rooms and board-game bars share the generic
  // leisure type (080000), so those rely on keyword search plus a name match.
  const playQueries = {
    '景点':{type:'110000',match:['风景名胜','旅游景点','国家级景点','省级景点','观景点','城市广场','世界遗产','寺庙','道观','教堂','纪念馆','古镇','遗址','观景']},
    '看电影':{type:'080601',match:['电影院']},
    '博物馆':{type:'140100|140200',match:['博物馆','展览馆','陈列馆','科技馆','天文馆','蜡像','展览','会展']},
    '美术馆':{type:'140400',match:['美术馆','画廊','艺术中心','艺术馆','当代艺术']},
    '公园':{type:'110101',match:['公园','植物园','动物园','水族馆']},
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
    if (/博物馆|展览馆|蜡像|陈列|科技馆|天文馆/.test(hay)) return '🏛️';
    if (/美术馆|画廊|艺术中心|艺术馆|当代艺术/.test(hay)) return '🖼️';
    if (/公园|植物园|动物园|水族馆/.test(hay)) return '🌳';
    if (/景点|风景|景区|古镇|遗址|寺庙|道观|教堂|广场|塔/.test(hay)) return '🗺️';
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
    return (result?.poiList?.pois || []).map(poi=>normalize(poi)).filter(p => p.location);
  }
  // Shared by map previews and generation, including requests still in flight.
  const nearbyCache=new Map(),nearbyPending=new Map();
  function placeKey(origin,radius,query,page){return JSON.stringify([origin,radius,query.type,query.keyword||'',page]);}
  async function nearby(origin, config) {
    const A = await load();
    const radius = Math.min(50000, Math.max(1000,config.limit*(config.mode==='驾车'?700:config.mode==='公共交通'?400:90)));
    const play=config.activity==='play',page=config.pageIndex||1;
    let queries=play?(config.types.length?config.types.map(label=>[label,playQueries[label]]).filter(pair=>pair[1]):Object.entries(playQueries)):
      (config.types.length?config.types.map(label=>[label,cuisineQueries[label]]).filter(pair=>pair[1]):[[null,{type:'050000'}]]);
    // Rotate category priority so early stopping does not always favor the same types.
    if(play)for(let i=queries.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[queries[i],queries[j]]=[queries[j],queries[i]];}
    const reusable=([,query])=>{const key=placeKey(origin,radius,query,page);return nearbyPending.has(key)||(nearbyCache.get(key)?.expires>Date.now());};
    queries.sort((a,b)=>Number(reusable(b))-Number(reusable(a)));
    if(config.preview)queries=queries.slice(0,3);
    const groups=[];let lastError;
    for(const [label,query] of queries){
      if(config.cancelled?.())break;
      const key=placeKey(origin,radius,query,page);let pois;
      try{
        const hit=nearbyCache.get(key);
        if(hit&&hit.expires>Date.now())pois=hit.pois;
        else {
          let pending=nearbyPending.get(key);
          if(!pending){
            pending=(async()=>{
              await waitRouteSlot('place');
              const result=await call(done=>new A.PlaceSearch({type:query.type,pageSize:20,pageIndex:page,extensions:'all'}).searchNearBy(query.keyword||'',origin,radius,done));
              const raw=result?.poiList?.pois||[];
              if(nearbyCache.size>=200)nearbyCache.delete(nearbyCache.keys().next().value);
              nearbyCache.set(key,{pois:raw,expires:Date.now()+120000});return raw;
            })().finally(()=>nearbyPending.delete(key));
            nearbyPending.set(key,pending);
          }
          pois=await pending;
        }
      }catch(error){lastError=error;continue;}
      if(config.cancelled?.())break;
      let batch=pois.map(poi=>normalize(poi)).filter(p=>p.location&&(play?matchesPlay(p,[label]):matchesCuisine(p,label?[label]:[])));
      if(play)batch=dedupeVenues(batch,label).map(decoratePlay);
      groups.push(batch);
      // Backpressure: validate this batch before spending requests on another category.
      if(config.onBatch&&await config.onBatch(batch)===false)break;
    }
    if(!groups.length&&lastError)throw lastError;
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
  const routeCache=new Map(),routePending=new Map();
  async function route(from,to,mode,context={}) {
    const key=JSON.stringify([from,to,mode,context.city||'',context.cityd||'',!!context.strictMode]);
    const cached=routeCache.get(key);
    if(!context.force&&cached&&Date.now()-cached.at<300000)return cached.minutes;
    if(routePending.has(key))return routePending.get(key);
    const task=(async()=>{
      let minutes;
      try{minutes=await queryRoute(from,to,mode,context);}
      catch(error){if(!/超时|QPS|BUSY|SERVICE_NOT_AVAILABLE/.test(error.message))throw error;minutes=await queryRoute(from,to,mode,context);}
      if(Number.isFinite(minutes)){
        if(routeCache.size>=600)routeCache.delete(routeCache.keys().next().value);
        routeCache.set(key,{minutes,at:Date.now()});
      }
      return minutes;
    })().finally(()=>routePending.delete(key));
    routePending.set(key,task);return task;
  }
  async function queryRoute(from,to,mode,context={}) {
    const A = await load();
    if(mode==='公共交通'){
      const city=context.city||await cityAt(from),cityd=context.cityd||await cityAt(to);
      await waitRouteSlot(mode);
      const service=new A.Transfer({city,cityd,policy:A.TransferPolicy.LEAST_TIME,extensions:'all'});
      const minutes=transitMinutes(await call(done=>service.search(from,to,done)));
      // Nearby destinations often have no bus/subway plan. Check a real walking
      // route in that case; never turn missing route data into a zero-minute trip.
      return minutes==null&&!context.strictMode?route(from,to,'步行'):minutes;
    }
    await waitRouteSlot(mode);
    const service = mode === '驾车' ? new A.Driving() : mode==='骑行'?new A.Riding():new A.Walking();
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
  const api={coordinates,normalize,parseHours,mergeDetails,routeMinutes,transitMinutes,cityAt,eligible,matchesCuisine,matchesPlay,dedupeVenues,isAttractionStore,playQueries,playTypes:Object.keys(playQueries),decoratePlay,playEmoji,call,load,search,nearby,route,details,locate};
  if(typeof module!=='undefined') module.exports=api; else root.DouxMap=api;
})(typeof window!=='undefined'?window:globalThis);
