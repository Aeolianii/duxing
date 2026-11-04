const run = require('node:util').promisify(require('node:child_process').execFile);
const airports = require('./cn-airports.json');
function nearby(point) {
  if (!Array.isArray(point) || point.length!==2 || !point.every(Number.isFinite)) throw Error('请先定位出发地和目的地');
  const [lng,lat]=point;
  const rad=Math.PI/180;
  const matches=[];
  for (const airport of airports) {
    const [y,x]=airport.coordinates.split(',').map(Number);
    const d=Math.sin((y-lat)*rad/2)**2+Math.cos(y*rad)*Math.cos(lat*rad)*Math.sin((x-lng)*rad/2)**2;
    const km=12742*Math.asin(Math.sqrt(d));
    if(km<=200)matches.push({code:airport.iata_code,km});
  }
  if(!matches.length)throw Error('周边 200 公里内未匹配到机场');
  matches.sort((a,b)=>a.km-b.km);
  return matches.filter(a=>a.km<=matches[0].km+75).slice(0,2);
}
async function referenceFlights(query,conditions,bin) {
  const points=conditions.airportPoints||[];
  const origins=nearby(points[0]),destinations=nearby(points[1]);
  const pairs=origins.flatMap(a=>destinations.filter(b=>b.code!==a.code).map(b=>({codes:[a.code,b.code],distance:a.km+b.km}))).sort((a,b)=>a.distance-b.distance);
  if(!pairs.length)return [];
  let failure;
  for(const {codes} of pairs){
    if(query.direction==='return')codes.reverse();
    try{
      const offers=await searchPair(query,bin,codes);
      if(offers.length)return offers;
    }catch(error){failure=error;if(error.fatal)throw error;}
  }
  if(failure)throw failure;
  return [];
}
async function searchPair(query,bin,codes){
  let stdout;
  try { ({stdout}=await run(bin,['flights',...codes,query.date,'--stops','NON_STOP','--currency','CNY','--format','json'],{timeout:45000,windowsHide:true,maxBuffer:4*1024*1024,env:{...process.env,PYTHONUTF8:'1'}})); } catch(error) {
    if(error.killed)throw Error('航班参考价查询超时，请稍后重试');
    if(error.code==='ENOENT')throw Object.assign(Error('本机航班查询组件不可用'),{fatal:true});
    throw Error('航班数据源未能完成 '+codes.join(' → ')+' 的查询，请稍后重试');
  }
  const result=JSON.parse(stdout);
  if(!result.success||!Array.isArray(result.flights))throw Error('未取得航班参考价');
  return result.flights.flatMap(f=>{
    const leg=f.legs?.[0];
    if(f.legs?.length!==1||!leg.airline?.code||!leg.flight_number||f.currency!=='CNY'||!(f.price>0)||leg.departure_airport.code!==codes[0]||leg.arrival_airport.code!==codes[1])return [];
    return [{mode:'飞机',service:leg.airline.code+leg.flight_number,departurePlace:leg.departure_airport.name+' ('+codes[0]+')',arrivalPlace:leg.arrival_airport.name+' ('+codes[1]+')',departureAt:leg.departure_time+'+08:00',arrivalAt:leg.arrival_time+'+08:00',priceCNY:f.price,provider:'Google Flights · fli',availability:'余票未核验',seat:'经济舱',priceNote:'单成人单程参考价，多人按此估算'}];
  });
}
module.exports={referenceFlights};
