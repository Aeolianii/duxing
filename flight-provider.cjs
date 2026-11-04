'use strict';
// Only the production inventory host is used. Passenger fares must be identical to show a per-person price.
async function flights(q,c,config,fetcher){
 const base='https://api.amadeus.com';
 const call=async(path,opt)=>{const r=await fetcher(base+path,{...opt,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('航班库存服务未返回有效响应');return r.json();};
 const auth=await call('/v1/security/oauth2/token',{method:'POST',body:new URLSearchParams({grant_type:'client_credentials',client_id:config.airKey,client_secret:config.airSecret})});
 const points=c.airportPoints;
 if(!Array.isArray(points)||points.length!==2||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('未取得城市坐标，无法匹配机场');
 const airports=await Promise.all(points.map(async ([longitude,latitude])=>{
   const params=new URLSearchParams({longitude,latitude,radius:200,sort:'distance'});
   const result=await call('/v1/reference-data/locations/airports?'+params,{headers:{Authorization:'Bearer '+auth.access_token}});
   const airport=result.data?.find(a=>a.address?.countryCode==='CN'&&/^[A-Z]{3}$/.test(a.iataCode));
   if(!airport)throw Error('城市周边未匹配到国内机场');return airport;
 }));
 if(q.direction==='return')airports.reverse();
 const codes=airports.map(a=>a.iataCode);
 const params=new URLSearchParams({originLocationCode:codes[0],destinationLocationCode:codes[1],departureDate:q.date,adults:q.people,currencyCode:'CNY',nonStop:'true',max:'30'});
 const result=await call('/v2/shopping/flight-offers?'+params,{headers:{Authorization:'Bearer '+auth.access_token}});
 if(!Array.isArray(result.data))throw Error('未取得航班库存');
 return result.data.flatMap(f=>{const seg=f.itineraries?.[0]?.segments?.[0],prices=f.travelerPricings;
 // Local datetimes use the same UTC offset only for mainland Chinese airports.
 if(!seg||[seg.departure.iataCode,seg.arrival.iataCode].some(x=>result.dictionaries?.locations?.[x]?.countryCode!=='CN')||f.price?.currency!=='CNY'||prices?.length!==q.people||!prices.every(p=>p.price.total===prices[0].price.total))return [];
 return [{mode:'飞机',service:seg.carrierCode+seg.number,departurePlace:airports[0].name+' ('+codes[0]+')',arrivalPlace:airports[1].name+' ('+codes[1]+')',departureAt:seg.departure.at+'+08:00',arrivalAt:seg.arrival.at+'+08:00',availableSeats:f.numberOfBookableSeats,seat:prices[0].fareDetailsBySegment?.[0]?.cabin,priceCNY:Number(prices[0].price.total),provider:'Amadeus',priceNote:'每人单程成人报价'}];});
}
module.exports={flights};
