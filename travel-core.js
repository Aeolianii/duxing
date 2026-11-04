(function(root){
  'use strict';
  const themes=['自然风景','历史古迹','城市漫游','美食','海边','主题乐园'];
  const cities=[];
  const normalize=s=>String(s||'').trim().replace(/市$/,'');
  function matchesPOI(city,name,poi){
    if(!poi?.location||!String((poi.city||'')+' '+(poi.address||'')).includes(city.name)||(city.location&&distance(poi.location,city.location)>180))return false;
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
  function reason(city,c){const matched=c.themes.filter(t=>city.tags.includes(t));return `${matched.length?'包含你想玩的'+matched.join('、'):'可围绕'+city.tags.slice(0,2).join('、')+'游玩'}；按 ${c.days} 天安排${c.children||c.elders?'，同行者需要时可放慢节奏':''}。`;}
  function createPlan(city,c,id){
    const pool=city.spots.slice();
    if(c.themes.includes('主题乐园'))pool.sort((a,b)=>Number(b.fullDay)-Number(a.fullDay));
    let cursor=0;
    const days=Array.from({length:c.days},(_,index)=>{const spots=[];const pace=c.children||c.elders||c.days===1?1:2;const count=Math.min(pace,Math.ceil((pool.length-cursor)/(c.days-index)));while(cursor<pool.length&&spots.length<count){const next=pool[cursor];if(next.fullDay&&spots.length)break;spots.push({...next});cursor++;if(next.fullDay)break;}return {spots,light:false};});
    return {id,cityId:city.id,cityName:city.name,conditions:JSON.parse(JSON.stringify(c)),days,checklist:{},savedAt:null};
  }
  function replacement(city,plan,day,index){const used=new Set(plan.days.flatMap(d=>d.spots.map(s=>s.id)));return city.spots.find(s=>!used.has(s.id)&&(!s.fullDay||plan.days[day].spots.length===1))||null;}
  function validConditions(c){const date=typeof c?.date==='string'?new Date(c.date+'T00:00:00Z'):null;return !!(c&&typeof c.origin==='string'&&normalize(c.origin).length>0&&normalize(c.origin).length<=30&&/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&date&&!Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===c.date&&Number.isInteger(c.days)&&c.days>=1&&c.days<=7&&Number.isFinite(c.budget)&&c.budget>=0&&c.budget<=100000&&['不限','高铁','铁路','飞机','自驾','航运'].includes(c.mode)&&Array.isArray(c.themes)&&c.themes.length<=30&&c.themes.every(t=>typeof t==='string'&&t.length<=40)&&Number.isInteger(c.people)&&c.people>=1&&c.people<=20);}
  function validPlan(p){return p&&typeof p.id==='string'&&cities.some(c=>c.id===p.cityId)&&validConditions(p.conditions)&&Array.isArray(p.days)&&p.days.length===p.conditions.days&&p.days.every(d=>Array.isArray(d?.spots)&&d.spots.length<=12&&d.spots.every(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.length<=60))&&p.checklist&&typeof p.checklist==='object';}
  const api={cities,themes,normalize,distance,matchesPOI,candidates,reason,createPlan,replacement,validConditions,validPlan};
  if(typeof module!=='undefined')module.exports=api;else root.DouxTravel=api;
})(typeof window==='undefined'?globalThis:window);
