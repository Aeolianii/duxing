'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createReviewStore} = require('./reviews.cjs');
const {createServer} = require('./server.cjs');

// 1×1 透明 PNG，用来验证图片落盘与静态服务，不依赖任何外部文件。
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const base = {
  poiId: 'B001', poiName: '测试餐厅', city: '广州', address: '测试路 1 号', activity: 'food',
  rating: 5, content: '分量很足，环境安静，适合和朋友一起来。', tags: ['味道好'],
  device: 'device-1111-aaaa', author: {name: '小都'}
};

function fresh(now = () => Date.now()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duxing-review-'));
  const file = path.join(dir, 'reviews.json'), uploadDir = path.join(dir, 'uploads');
  return {dir, file, uploadDir, store: createReviewStore({file, uploadDir, now}), reopen: () => createReviewStore({file, uploadDir, now})};
}

test('发布后能读回同一条，并统计出平均分、星级分布与标签', () => {
  const {store} = fresh();
  const created = store.add({...base});
  assert.equal(created.rating, 5);
  assert.equal(created.author.name, '小都');
  const list = store.list({poiId: 'B001', device: 'device-1111-aaaa'});
  assert.equal(list.total, 1);
  assert.equal(list.summary.count, 1);
  assert.equal(list.summary.average, 5);
  assert.equal(list.summary.histogram[5], 1);
  assert.equal(list.summary.tags[0].tag, '味道好');
  assert.equal(list.summary.tags[0].count, 1);
  assert.equal(list.reviews[0].mine, true);
  assert.equal(list.reviews[0].liked, false);
});

test('同一台设备对同一家店只能评价一次', () => {
  const {store} = fresh();
  store.add({...base});
  assert.throws(() => store.add({...base, content: '再来一条不一样的内容。'}), /已经评价过/);
  // 换一家店或换一台设备都可以继续写
  assert.doesNotThrow(() => store.add({...base, poiId: 'B002'}));
  assert.doesNotThrow(() => store.add({...base, device: 'device-2222-bbbb'}));
  assert.equal(store.list({poiId: 'B001'}).total, 2);
});

test('非法输入被逐项拒绝：评分、内容、标签、门店标识、图片', () => {
  const {store} = fresh();
  assert.throws(() => store.add({...base, rating: 0}), /评分/);
  assert.throws(() => store.add({...base, rating: 4.5}), /评分/);
  assert.throws(() => store.add({...base, content: '好吃'}), /太短/);
  assert.throws(() => store.add({...base, content: '啊'.repeat(601)}), /最多 600/);
  assert.throws(() => store.add({...base, tags: ['不存在的标签']}), /未知的标签/);
  assert.throws(() => store.add({...base, tags: ['味道好', '分量足', '性价比高', '环境舒服', '服务好']}), /未知的标签|最多/);
  assert.throws(() => store.add({...base, poiId: '坏 id'}), /门店标识无效/);
  assert.throws(() => store.add({...base, images: ['data:text/plain;base64,aGk=']}), /只支持/);
  assert.throws(() => store.add({...base, images: [PNG, PNG, PNG, PNG]}), /最多/);
  assert.throws(() => store.add({...base, author: {name: ''}}), /昵称/);
  assert.throws(() => store.add({...base, author: {name: '名'.repeat(21)}}), /最多 20/);
  assert.throws(() => store.add({...base, device: ''}), /设备标识/);
});

test('单张图片超过 400KB 会被拒绝', () => {
  const {store} = fresh();
  const huge = 'data:image/png;base64,' + Buffer.alloc(420 * 1024, 1).toString('base64');
  assert.throws(() => store.add({...base, images: [huge]}), /不能超过/);
});

test('图片与头像写入 uploads 目录，返回可直接访问的地址', () => {
  const {store, uploadDir} = fresh();
  const created = store.add({...base, images: [PNG, PNG], author: {name: '小都', avatar: PNG}});
  assert.equal(created.images.length, 2);
  assert.match(created.images[0], /^\/uploads\/[A-Za-z0-9_-]+-1\.png$/);
  assert.match(created.author.avatar, /^\/uploads\/[A-Za-z0-9_-]+-avatar\.png$/);
  const files = fs.readdirSync(uploadDir);
  assert.equal(files.length, 3);
  assert.ok(files.every(name => fs.statSync(path.join(uploadDir, name)).size > 0));
  assert.equal(store.list({poiId: 'B001'}).summary.photos, 2);
});

test('四种排序：最有帮助、最新、最低分、最高分', () => {
  let clock = 1700000000000;
  const {store} = fresh(() => clock);
  store.add({...base, rating: 4, content: '中规中矩的一顿。', device: 'device-1001-aaaa'});
  clock += 1000;
  store.add({...base, rating: 2, content: '排队太久，味道一般。', device: 'device-1002-aaaa'});
  clock += 1000;
  store.add({...base, rating: 5, content: '非常推荐，下次还来。', device: 'device-1003-aaaa'});
  const newest = store.list({poiId: 'B001', sort: 'newest'});
  assert.equal(newest.reviews[0].rating, 5);
  const lowest = store.list({poiId: 'B001', sort: 'lowest'});
  assert.equal(lowest.reviews[0].rating, 2);
  const highest = store.list({poiId: 'B001', sort: 'highest'});
  assert.equal(highest.reviews[0].rating, 5);
  assert.equal(highest.reviews.at(-1).rating, 2);
  const target = newest.reviews.find(item => item.rating === 4);
  store.like({reviewId: target.id, device: 'device-9001-aaaa'});
  store.like({reviewId: target.id, device: 'device-9002-aaaa'});
  const helpful = store.list({poiId: 'B001', sort: 'helpful'});
  assert.equal(helpful.reviews[0].id, target.id);
  assert.equal(helpful.reviews[0].likes, 2);
});

test('点赞可以在同一台设备上取消，计数不会变成负数', () => {
  const {store} = fresh();
  const created = store.add({...base});
  assert.deepEqual(store.like({reviewId: created.id, device: 'device-9001-aaaa'}), {id: created.id, likes: 1, liked: true});
  assert.deepEqual(store.like({reviewId: created.id, device: 'device-9001-aaaa'}), {id: created.id, likes: 0, liked: false});
  assert.equal(store.list({poiId: 'B001', device: 'device-9001-aaaa'}).reviews[0].likes, 0);
  assert.throws(() => store.like({reviewId: 'not-exist', device: 'device-9001-aaaa'}), /不存在/);
});

test('分页：每页 10 条，第二页 hasMore 为 false', () => {
  const {store} = fresh();
  for (let i = 0; i < 12; i++) store.add({...base, device: 'device-' + String(2000 + i) + '-aaaa', content: `第 ${i + 1} 条真实评价，写满五个字。`});
  const page1 = store.list({poiId: 'B001', page: 1, limit: 10});
  assert.equal(page1.reviews.length, 10);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.total, 12);
  const page2 = store.list({poiId: 'B001', page: 2, limit: 10});
  assert.equal(page2.reviews.length, 2);
  assert.equal(page2.hasMore, false);
  const capped = store.list({poiId: 'B001', page: 1, limit: 999});
  assert.equal(capped.pageSize, 30);
});

test('按标签筛选只返回带该标签的评价，统计仍然基于全部评价', () => {
  const {store} = fresh();
  store.add({...base, tags: ['味道好', '环境舒服'], device: 'device-3001-aaaa'});
  store.add({...base, tags: ['排队久'], device: 'device-3002-aaaa'});
  const filtered = store.list({poiId: 'B001', tag: '味道好'});
  assert.equal(filtered.total, 1);
  assert.equal(filtered.summary.count, 2);
  assert.equal(filtered.reviews[0].tags.includes('味道好'), true);
  assert.equal(store.list({poiId: 'B001', tag: '不存在的标签'}).total, 2);
});

test('评价内容原样保存，不做 HTML 转义或截断（转义交给前端）', () => {
  const {store} = fresh();
  const content = '环境不错 <script>alert(1)</script> 但有点吵，下次挑工作日。';
  store.add({...base, content});
  const saved = store.list({poiId: 'B001'}).reviews[0].content;
  assert.equal(saved, content);
  assert.equal(saved.includes('&lt;'), false);
});

test('换行会被保留但连续空行压缩，控制字符被清掉', () => {
  const {store} = fresh();
  store.add({...base, content: '第一行\r\n\r\n\r\n第二行\u0007结束'});
  const saved = store.list({poiId: 'B001'}).reviews[0].content;
  assert.equal(saved, '第一行\n\n第二行结束');
});

test('重启后仍能读到评价；存档损坏时改名保留并重新开始', () => {
  const {store, reopen, file, dir} = fresh();
  store.add({...base});
  assert.equal(reopen().list({poiId: 'B001'}).total, 1);
  fs.writeFileSync(file, '{ 坏掉的 JSON', 'utf8');
  const recovered = createReviewStore({file, uploadDir: path.join(dir, 'uploads')});
  assert.equal(recovered.list({poiId: 'B001'}).total, 0);
  assert.ok(fs.readdirSync(dir).some(name => name.includes('.corrupt-')));
});

test('同一 IP 一小时内最多发布 30 条，时间窗口过后恢复', () => {
  let clock = 1700000000000;
  const {store} = fresh(() => clock);
  for (let i = 0; i < 30; i++) store.add({...base, poiId: 'P' + i, device: 'device-' + String(4000 + i) + '-aaaa'});
  assert.throws(() => store.add({...base, poiId: 'P30', device: 'device-4030-aaaa'}), /频繁/);
  clock += 3600 * 1000 + 1;
  assert.doesNotThrow(() => store.add({...base, poiId: 'P30', device: 'device-4030-aaaa'}));
});

test('HTTP 接口：列表、发布、图片访问、点赞与超大请求', async () => {
  const {store, uploadDir} = fresh();
  const server = createServer({reviews: store, uploadsDir: uploadDir});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${origin}/api/reviews?poiId=B001&device=device-1111-aaaa`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).total, 0);

    response = await fetch(`${origin}/api/reviews`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...base, images: [PNG], author: {name: '小都', avatar: PNG}})
    });
    assert.equal(response.status, 200);
    const created = await response.json();
    assert.equal(created.rating, 5);

    response = await fetch(origin + created.images[0]);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');

    response = await fetch(`${origin}/api/reviews/like`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({reviewId: created.id, device: 'device-2222-bbbb'})
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).likes, 1);

    response = await fetch(`${origin}/api/reviews?poiId=B001&sort=newest`);
    const listed = await response.json();
    assert.equal(listed.total, 1);
    assert.equal(listed.reviews[0].likes, 1);

    response = await fetch(`${origin}/api/reviews?poiId=B001&tag=${encodeURIComponent('味道好')}`);
    assert.equal((await response.json()).total, 1, 'HTTP 层的标签筛选必须生效');
    response = await fetch(`${origin}/api/reviews?poiId=B001&tag=${encodeURIComponent('排队久')}`);
    assert.equal((await response.json()).total, 0);

    response = await fetch(`${origin}/api/reviews/like`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
    assert.equal(response.status, 400);

    response = await fetch(`${origin}/api/reviews`, {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: 'hi'});
    assert.equal(response.status, 415);

    response = await fetch(`${origin}/uploads/..%2F..%2F.env`);
    assert.equal(response.status, 404);

    response = await fetch(`${origin}/api/reviews`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: 'x'.repeat(3 * 1024 * 1024 + 16)
    });
    assert.equal(response.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});


test('只允许本人修改评价，保留 ID、点赞、图片和初次发布时间',()=>{
  const {store,reopen}=fresh();
  const created=store.add({...base,images:[PNG]});
  store.like({reviewId:created.id,device:'device-other-2222'});
  assert.throws(()=>store.update({...base,reviewId:created.id,device:'device-other-2222'}),/只能修改/);
  const updated=store.update({...base,reviewId:created.id,rating:2,content:'更新后的真实体验，不是新增一条。',keepImages:created.images,images:[],date:'private-date',price:888,note:'private-note'});
  assert.equal(updated.id,created.id);assert.equal(updated.createdAt,created.createdAt);assert.equal(updated.rating,2);
  assert.equal(updated.likes,1);assert.deepEqual(updated.images,created.images);
  assert.equal(reopen().list({poiId:base.poiId}).total,1);
  assert.doesNotMatch(JSON.stringify(updated),/private-date|private-note|888/);
});

test('我的评价不受列表分页或标签筛选影响，不能借用别人的图片',()=>{
  const {store}=fresh(),mine=store.add({...base,images:[PNG]});
  const other=store.add({...base,device:'device-other-2222',images:[PNG]});
  const list=store.list({poiId:base.poiId,device:base.device,tag:'排队久',page:9});
  assert.equal(list.reviews.length,0);assert.equal(list.myReview.id,mine.id);
  assert.equal(store.list({poiId:base.poiId}).myReview,null);
  assert.throws(()=>store.update({...base,reviewId:mine.id,keepImages:other.images}),/自己的评价图片/);
  assert.throws(()=>store.update({...base,reviewId:mine.id,rating:0}),/评分/);
  assert.equal(store.list({poiId:base.poiId,device:base.device}).myReview.rating,5);
});

test('HTTP PUT 更新自己的评价并重新计算站内平均分',async()=>{
  const {store,uploadDir}=fresh();const created=store.add({...base});
  const server=createServer({config:{},reviews:store,uploadsDir:uploadDir});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try{
    const update=body=>fetch(origin+'/api/reviews',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await update({...base,reviewId:created.id,device:'device-not-owner'})).status,403);
    const response=await update({...base,reviewId:created.id,rating:3,content:'更新后的评价内容。',keepImages:[]});
    assert.equal(response.status,200);assert.equal((await response.json()).id,created.id);
    const data=await (await fetch(origin+'/api/reviews?'+new URLSearchParams({poiId:base.poiId,device:base.device}))).json();
    assert.equal(data.total,1);assert.equal(data.summary.average,3);assert.equal(data.myReview.rating,3);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
