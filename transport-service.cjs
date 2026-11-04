'use strict';

function text(value, limit = 120) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function normalizeOffer(offer, queryDate) {
  if (!offer || !['飞机', '高铁', '铁路', '火车'].includes(offer.mode)) {
    throw new Error('交通方案类型无效');
  }
  const departure = Date.parse(offer.departureAt);
  const arrival = Date.parse(offer.arrivalAt);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(offer.departureAt) ||
      !/([+-]\d{2}:\d{2}|Z)$/.test(offer.departureAt) ||
      !/([+-]\d{2}:\d{2}|Z)$/.test(offer.arrivalAt) ||
      !Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure ||
      offer.departureAt.slice(0, 10) !== queryDate) {
    throw new Error('班次日期或到发时间无效');
  }
  if (!Number.isFinite(offer.priceCNY) || offer.priceCNY < 0 ||
      !text(offer.service) || !text(offer.departurePlace) || !text(offer.arrivalPlace) ||
      !text(offer.provider)) {
    throw new Error('班次、站点或报价来源缺失');
  }
  let bookingUrl = '';
  if (offer.bookingUrl) {
    const url = new URL(offer.bookingUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) bookingUrl = url.href;
  }
  return {
    mode: offer.mode,
    service: text(offer.service),
    departurePlace: text(offer.departurePlace),
    arrivalPlace: text(offer.arrivalPlace),
    departureAt: offer.departureAt,
    arrivalAt: offer.arrivalAt,
    departureAddress: text(offer.departureAddress, 240),
    arrivalAddress: text(offer.arrivalAddress, 240),
    minutes: Math.ceil((arrival - departure) / 60000),
    priceCNY: offer.priceCNY,
    seat: text(offer.seat) || '席别待核实',
    priceNote: text(offer.priceNote, 240) || '每人单程参考报价，税费及优惠以供应方确认为准',
    availability: text(offer.availability) || '余票待核实',
    provider: text(offer.provider),
    bookingUrl
  };
}

async function queryTransport(conditions, destination, direction, config, fetcher) {
  if (!['outbound', 'return'].includes(direction)) throw new Error('查询方向无效');
  const date = new Date(conditions.date + 'T00:00:00Z');
  if (direction === 'return') date.setUTCDate(date.getUTCDate() + conditions.days - 1);
  const queryDate = date.toISOString().slice(0, 10);
  const query = {
    origin: direction === 'return' ? destination : conditions.origin,
    destination: direction === 'return' ? conditions.origin : destination,
    date: queryDate,
    mode: conditions.mode,
    people: conditions.people,
    members: (conditions.members || []).map(member => ({ticket: member.ticket})),
    direction
  };
  const endpoint = config.quoteURL || process.env.TRAVEL_QUOTE_URL;
  const ready=rows=>{
    const offers=rows.filter(o=>o?.mode!=='航运'&&Number.isInteger(o?.availableSeats)&&o.availableSeats>=query.people&&(query.mode==='不限'||query.mode===o.mode||query.mode==='铁路'&&['高铁','铁路','火车'].includes(o.mode))).map(o=>({...normalizeOffer(o,queryDate),availableSeats:o.availableSeats,availability:'可售 '+o.availableSeats+' 席'}));
    return {status:offers.length?'ready':'empty',query,offers,checkedAt:new Date().toISOString(),message:offers.length?'':'未取得同时满足班次、价格和同行人数的可售席位'};
  };
  if(!endpoint){
    if(['高铁','铁路','不限'].includes(query.mode))return ready(await require('./rail-provider.cjs').railway(query,fetcher));
    if(query.mode==='飞机'&&config.airKey&&config.airSecret)return ready(await require('./flight-provider.cjs').flights(query,conditions,config,fetcher));
    if(query.mode==='飞机'&&config.fliBin){
      const rows=await require('./reference-flights.cjs').referenceFlights(query,conditions,config.fliBin);
      const offers=rows.map(row=>({...normalizeOffer(row,queryDate),referenceOnly:true}));
      return {status:offers.length?'ready':'empty',query,offers,checkedAt:new Date().toISOString()};
    }
    return {status:'unconfigured',query,offers:[],message:query.mode==='自驾'?'自驾没有售票班次':query.mode==='飞机'?'本机尚未配置航空生产库存，无法取得机票报价':'尚未配置该方式的实时库存服务'};
  }
  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + (config.quoteToken || process.env.TRAVEL_QUOTE_TOKEN || '')},
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('交通报价服务暂不可用');
  const data = await response.json();
  if (!Array.isArray(data.offers) || data.offers.length > 50) {
    throw new Error('票务服务未返回有效的方案列表');
  }
  return ready(data.offers);
}
module.exports={queryTransport,normalizeOffer};
