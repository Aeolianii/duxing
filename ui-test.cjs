const test=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('./server.cjs');
const wheel=require('./wheel-motion.js');

test('转盘从当前角度持续向前，衔接速度一致且逐渐降至零，准确落在答案上',()=>{
  for(const count of [1,2,4,6,12,20])for(let index=0;index<count;index++)for(const angle of [0,359,360,1234.5,30000]){
    const plan=wheel.brakingPlan(angle,700,index,count),distance=plan.to-plan.from;
    assert.equal(plan.from,angle);assert.ok(distance>=540&&distance<900);
    assert.ok(Math.abs(2*distance/plan.duration-360/700)<1e-10,'no speed jump at braking start');
    let previous=Infinity;
    for(let t=0;t<=1;t+=.05){const speed=2*distance/plan.duration*(1-t);assert.ok(speed<=previous);previous=speed;}
    assert.ok(Math.abs(((plan.to%360)+360)%360-plan.target)<1e-8);
    assert.ok(Math.abs(((plan.target+(index+.5)*360/count)%360))<1e-8);
  }
});

test('取消转盘后不揭晓旧结果，减少动态效果时直接定位答案',async()=>{
  const disc={style:{},animate(){throw new Error('reduced motion must not animate');}};
  const cancelled=wheel.start(disc,{reduced:true});wheel.cancelAll();assert.equal(await cancelled.stop(0,6),false);
  assert.equal(await wheel.start(disc,{reduced:true}).stop(2,4),true);
  assert.equal(disc.style.transform,'rotate(135deg)');
});

test('静态资源缓存与内容校验，API 仍禁止缓存',async()=>{
  const server=createServer({config:{}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    for(const file of ['assets/food.webp','assets/play.webp','assets/travel.webp','assets/custom.webp','app.js','style.css','']) {
      const response=await fetch(base+'/'+file);
      assert.equal(response.status,200,file);
      const etag=response.headers.get('etag');assert.ok(etag);
      const body=await response.arrayBuffer();assert.ok(body.byteLength>0);
      if(file.startsWith('assets/')) {
        assert.equal(response.headers.get('content-type'),'image/webp');
        assert.match(response.headers.get('cache-control'),/max-age=3600/);
        assert.ok(body.byteLength<100000,'illustration remains under 100 KB');
      } else assert.match(response.headers.get('cache-control'),/must-revalidate/);
      const cached=await fetch(base+'/'+file,{headers:{'If-None-Match':etag}});
      assert.equal(cached.status,304);assert.equal((await cached.text()).length,0);
      const changed=await fetch(base+'/'+file,{headers:{'If-None-Match':'"old-content"'}});
      assert.equal(changed.status,200);await changed.arrayBuffer();
    }
    const config=await fetch(base+'/api/map-config');
    assert.equal(config.headers.get('cache-control'),'no-store');
    assert.equal(config.headers.get('etag'),null);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
