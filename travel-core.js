(function(root){
  'use strict';
  const themes=['自然风景','历史古迹','城市漫游','美食','海边','主题乐园'];
  // Editorial starting points, not live availability, quotes or verified routes.
  const rows=[
    ['广州',113.27,23.13,'城市漫游 美食 历史古迹 主题乐园','沿老街散步，把粤式风味放进行程。','沙面|陈家祠|越秀公园|永庆坊|广东省博物馆|广州长隆旅游度假区'],
    ['深圳',114.06,22.55,'城市漫游 海边 主题乐园','在城市公园与海边之间，留一点发呆的时间。','莲花山公园|深圳博物馆|深圳湾公园|华侨城创意文化园|世界之窗|大梅沙海滨公园'],
    ['珠海',113.58,22.27,'海边 城市漫游 主题乐园','以海滨散步为主，也可以安排一天主题乐园。','珠海渔女|海滨公园|野狸岛|珠海博物馆|情侣路|珠海长隆海洋王国'],
    ['长沙',112.94,28.23,'美食 城市漫游 历史古迹','街巷、美食与湘江风景，适合搭配着慢慢逛。','天心阁|太平老街|橘子洲|岳麓书院|湖南博物院|长沙简牍博物馆'],
    ['桂林',110.29,25.27,'自然风景 历史古迹','从市区山水开始，把更远的风景留给充足的一天。','象鼻山|两江四湖|靖江王府|叠彩山|七星公园|芦笛岩'],
    ['厦门',118.09,24.48,'海边 美食 城市漫游','海边走走，再到街巷寻找一餐喜欢的味道。','中山路步行街|八市|南普陀寺|沙坡尾|环岛路|鼓浪屿'],
    ['泉州',118.68,24.87,'历史古迹 美食 城市漫游','以老城街巷和历史建筑串起一段慢旅行。','开元寺|西街|承天寺|清净寺|泉州海外交通史博物馆|府文庙'],
    ['杭州',120.16,30.27,'自然风景 历史古迹 城市漫游','湖边漫步与老街闲逛，可以分开安排在不同的日子。','西湖|中国茶叶博物馆|河坊街|胡雪岩故居|浙江省博物馆|京杭大运河杭州段'],
    ['苏州',120.59,31.30,'历史古迹 城市漫游 美食','园林和水巷交替，留出坐下来喝茶的空档。','拙政园|苏州博物馆|平江路|狮子林|留园|山塘街'],
    ['南京',118.80,32.06,'历史古迹 美食 城市漫游','在博物馆、城墙和街巷之间认识这座城。','南京博物院|明故宫遗址公园|南京城墙|玄武湖|夫子庙|老门东'],
    ['上海',121.47,31.23,'城市漫游 主题乐园 历史古迹','城市漫步与主题乐园都可选，乐园建议单独留一天。','外滩|豫园|上海博物馆|人民广场|武康路|上海迪士尼乐园'],
    ['成都',104.07,30.57,'美食 城市漫游 历史古迹','把街巷、茶馆和川味安排得松一点。','人民公园|宽窄巷子|武侯祠|锦里|杜甫草堂|成都博物馆'],
    ['重庆',106.55,29.56,'城市漫游 美食 历史古迹','山城街巷适合分区探索，坡路较多，注意留出休息。','解放碑|洪崖洞|湖广会馆|山城步道|重庆中国三峡博物馆|鹅岭公园'],
    ['西安',108.94,34.34,'历史古迹 美食 城市漫游','从古城街巷到博物馆，按区域安排历史主题旅行。','西安城墙|碑林博物馆|大雁塔|陕西历史博物馆|西安钟楼|西安鼓楼'],
    ['北京',116.41,39.90,'历史古迹 城市漫游 主题乐园','历史建筑和城市公园值得慢慢看，预约情况出发前核对。','故宫博物院|景山公园|天坛公园|前门大街|颐和园|北京环球度假区'],
    ['青岛',120.38,36.07,'海边 城市漫游 美食','沿海滨分段散步，把老城与海景分开安排。','栈桥|中山路|八大关|第二海水浴场|五四广场|奥帆中心'],
    ['昆明',102.71,25.04,'自然风景 城市漫游 美食','公园、老街和湖景，适合留白多一些的行程。','翠湖公园|云南陆军讲武堂|昆明老街|金马碧鸡坊|云南省博物馆|海埂公园'],
    ['大理',100.27,25.61,'自然风景 历史古迹','古城和湖边分区探索，不把远距离地点挤在一天。','大理古城|崇圣寺三塔|喜洲古镇|海舌生态公园|大理市博物馆|才村码头'],
    ['武汉',114.30,30.59,'历史古迹 美食 城市漫游','江边散步与博物馆穿插，跨江行程留足交通时间。','黄鹤楼|户部巷|湖北省博物馆|东湖听涛景区|江汉路|汉口江滩'],
    ['洛阳',112.45,34.62,'历史古迹 美食','以历史遗迹和老城为线索，景区与城区分日安排。','洛邑古城|丽景门|洛阳博物馆|隋唐城遗址植物园|龙门石窟|白马寺'],
    ['黄山',118.34,29.71,'自然风景 历史古迹','山岳与徽州街巷可搭配，登山需要单独留足时间。','屯溪老街|黎阳老街|徽州古城|棠樾牌坊群|黄山风景区|宏村'],
    ['三亚',109.51,18.25,'海边 自然风景','海边休闲为主，景区分布较散，适合少赶路。','大东海|鹿回头风景区|三亚湾|椰梦长廊|亚龙湾|天涯海角'],
    ['天津',117.20,39.08,'城市漫游 美食 历史古迹','街区漫步、海河风景与本地小吃搭配着安排。','五大道|民园广场|古文化街|海河|意式风情区|天津博物馆'],
    ['福州',119.30,26.08,'历史古迹 城市漫游 美食','从老街巷出发，把园林和城市生活一起装进行程。','三坊七巷|林则徐纪念馆|西湖公园|福建博物院|上下杭|烟台山公园']
  ];
  const cities=rows.map(([name,lng,lat,tags,intro,spots],i)=>({id:'city-'+i,name,location:[lng,lat],tags:tags.split(' '),intro,spots:spots.split('|').map((name,j)=>({id:`spot-${i}-${j}`,name,stay:/乐园|度假区|黄山风景区|鼓浪屿/.test(name)?'建议预留一整天':'建议预留 1～3 小时',fullDay:/乐园|度假区|黄山风景区|鼓浪屿/.test(name)}))}));
  const normalize=s=>String(s||'').trim().replace(/市$/,'');
  function matchesPOI(city,name,poi){
    if(!poi?.location||!String((poi.city||'')+' '+(poi.address||'')).includes(city.name)||distance(poi.location,city.location)>180)return false;
    const canonical=value=>String(value).replace(/[（(].*$/,'').replace(new RegExp('^'+city.name+'市?'),'').trim();
    const aliases=name==='八市'&&city.name==='厦门'?['八市','第八市场']: [name];
    return aliases.some(alias=>canonical(poi.name)===canonical(alias));
  }
  const distance=(a,b)=>{const r=Math.PI/180,dlat=(b[1]-a[1])*r,dlng=(b[0]-a[0])*r;return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dlng/2)**2)));};
  function candidates(c,{visited=[],removed=[],previous=[],random=Math.random}={}){
    const origin=cities.find(x=>x.name===normalize(c.origin));
    return cities.filter(x=>x.name!==normalize(c.origin)&&!removed.includes(x.id)&&!(c.excludeVisited&&visited.includes(x.id))&&(!c.themes.length||c.themes.some(t=>x.tags.includes(t))))
      .map(city=>{const km=origin?distance(origin.location,city.location):null;const proximity=(c.days<=3?2:1)*(c.mode==='自驾'?2:1)*(c.budget>0&&c.budget<1500?1.5:1);return {city,score:c.themes.filter(t=>city.tags.includes(t)).length*3-(km||0)/500*proximity+random()*2-(previous.includes(city.id)?100:0)};})
      .sort((a,b)=>b.score-a.score).slice(0,6).map(x=>x.city);
  }
  function reason(city,c){const matched=c.themes.filter(t=>city.tags.includes(t));return `${matched.length?'包含你想玩的'+matched.join('、'):'可围绕'+city.tags.slice(0,2).join('、')+'游玩'}；按 ${c.days} 天安排${c.children||c.elders?'，同行者需要时可放慢节奏':''}。交通与总预算尚待核对。`;}
  function createPlan(city,c,id){
    const pool=city.spots.slice();
    if(c.themes.includes('主题乐园'))pool.sort((a,b)=>Number(b.fullDay)-Number(a.fullDay));
    let cursor=0;
    const days=Array.from({length:c.days},(_,index)=>{const spots=[];const count=c.children||c.elders||c.days===1?1:2;while(cursor<pool.length&&spots.length<count){const next=pool[cursor];if(next.fullDay&&spots.length)break;spots.push({...next});cursor++;if(next.fullDay)break;}return {spots,light:false};});
    return {id,cityId:city.id,cityName:city.name,conditions:JSON.parse(JSON.stringify(c)),days,checklist:{},savedAt:null};
  }
  function replacement(city,plan,day,index){const used=new Set(plan.days.flatMap(d=>d.spots.map(s=>s.id)));return city.spots.find(s=>!used.has(s.id)&&(!s.fullDay||plan.days[day].spots.length===1))||null;}
  function validConditions(c){const date=typeof c?.date==='string'?new Date(c.date+'T00:00:00Z'):null;return !!(c&&typeof c.origin==='string'&&normalize(c.origin).length>0&&normalize(c.origin).length<=30&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&date&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===c.date&&Number.isInteger(c.days)&&c.days>=1&&c.days<=7&&Number.isFinite(c.budget)&&c.budget>=0&&c.budget<=100000&&['不限','高铁','飞机','自驾'].includes(c.mode)&&Array.isArray(c.themes)&&c.themes.every(t=>themes.includes(t))&&Number.isInteger(c.people)&&c.people>=1&&c.people<=20);}
  function validPlan(p){return p&&typeof p.id==='string'&&cities.some(c=>c.id===p.cityId)&&validConditions(p.conditions)&&Array.isArray(p.days)&&p.days.length===p.conditions.days&&p.days.every(d=>Array.isArray(d.spots)&&d.spots.length<=12&&d.spots.every(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.length<=60))&&p.checklist&&typeof p.checklist==='object';}
  const api={cities,themes,normalize,distance,matchesPOI,candidates,reason,createPlan,replacement,validConditions,validPlan};
  if(typeof module!=='undefined')module.exports=api;else root.DouxTravel=api;
})(typeof window==='undefined'?globalThis:window);
