const test = require('node:test');
const assert = require('node:assert/strict');
const {queryTransport} = require('./transport-service.cjs');
const conditions = {origin:'上海',date:'2026-11-15',days:2,mode:'铁路',people:2};
test('未配置报价服务返回明确状态，返程交换城市并使用最后一天', async () => {
  const data = await queryTransport({...conditions,mode:'飞机'},'广州','return',{quoteURL:''},fetch);
  assert.equal(data.status,'unconfigured');
  assert.equal(data.query.origin,'广州');
  assert.equal(data.query.destination,'上海');
  assert.equal(data.query.date,'2026-11-16');
});
test('报价保留站点席别来源，跨日耗时正确，拒绝错误日期', async () => {
  const offer = {mode:'铁路',availableSeats:2,service:'测试车次',departurePlace:'上海站',arrivalPlace:'广州站',
    departureAt:'2026-11-15T22:00:00+08:00',arrivalAt:'2026-11-16T08:00:00+08:00',
    priceCNY:300,provider:'模拟供应商',seat:'硬卧'};
  const fetcher = async () => Response.json({offers:[offer]});
  const run = () => queryTransport(conditions,'广州','outbound',{quoteURL:'https://example.com'},fetcher);
  assert.equal((await run()).offers[0].minutes,600);
  offer.availableSeats=1;assert.equal((await run()).offers.length,0);delete offer.availableSeats;assert.equal((await run()).offers.length,0);offer.availableSeats=2;offer.departureAt='2026-11-14T22:00:00+08:00';
  await assert.rejects(run,/日期/);
});
