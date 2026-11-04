'use strict';
const root='https://kyfw.12306.cn/otn/';
const seats={O:[30,'二等座'],M:[31,'一等座'],9:[32,'商务座'],1:[29,'硬座'],3:[28,'硬卧'],4:[23,'软卧']};
async function railway(q,fetcher){
 const get=async(p,headers={})=>{const r=await fetcher(root+p,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('铁路查询服务暂不可用');return r;};
 const [stations,init]=await Promise.all([get('resources/js/framework/station_name.js').then(r=>r.text()),get('leftTicket/init')]);
 const rows=stations.split('@').slice(1).map(s=>s.split('|'));
 const code=n=>rows.find(r=>r[1]===n.replace(/市$/,''))?.[2]||rows.find(r=>r[7]===n.replace(/市$/,''))?.[2];
 const from=code(q.origin),to=code(q.destination);if(!from||!to)throw Error('未识别铁路出发站或到达站，请输入城市或车站全名');
 const route=(await init.text()).match(/CLeftTicketUrl\s*=\s*['"](leftTicket\/query[A-Za-z]*)['"]/i)?.[1];if(!route)throw Error('未取得铁路余票查询入口');
 const cookie=init.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 const args=new URLSearchParams({'leftTicketDTO.train_date':q.date,'leftTicketDTO.from_station':from,'leftTicketDTO.to_station':to,purpose_codes:'ADULT'});
 const r=await get(route+'?'+args,{Cookie:cookie,Referer:root+'leftTicket/init'}),data=await r.json().catch(()=>null);
 if(!Array.isArray(data?.data?.result))throw Error('12306 未返回可核验库存，请稍后重试');
 const offers=[];
 for(const raw of data.data.result){const f=raw.split('|');if(f[11]!=='Y'||(q.mode==='高铁'&&!/^[GCD]/.test(f[3])))continue;
 const dep=q.date+'T'+f[8]+':00+08:00', duration=f[10].split(':').map(Number);
 const end=new Date(Date.parse(dep)+(duration[0]*60+duration[1]+480)*60000);if(!Number.isFinite(+end)||end.toISOString().slice(11,16)!==f[9])continue;
 for(const chunk of (f[39]||'').match(/.{10}/g)||[]){const seat=seats[chunk[0]],count=Number(chunk.slice(6));if(!seat||!/^.[0-9]{9}$/.test(chunk)||count>=3000||count<q.people)continue;
 const shown=f[seat[0]],qty=shown==='有'?count:Math.min(count,Number(shown));if(!(qty>=q.people))continue;
 const price=Number(chunk.slice(1,6))/10;if(!(price>0))continue;
 offers.push({mode:/^[GCD]/.test(f[3])?'高铁':'铁路',service:f[3],departureAt:dep,arrivalAt:end.toISOString().slice(0,19)+'+08:00',departurePlace:data.data.map?.[f[6]],arrivalPlace:data.data.map?.[f[7]],priceCNY:price,seat:seat[1],availableSeats:qty,provider:'铁路12306',priceNote:'成人单程票面价，未计个人优惠'});}
 }return offers.slice(0,50);
}
module.exports={railway};
