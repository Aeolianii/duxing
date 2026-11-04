const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('./server.cjs');
(async()=>{
  const server=createServer({config:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,...(process.env.DOUX_TEST_CHROMIUM?{executablePath:process.env.DOUX_TEST_CHROMIUM}:{})});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=async(expression)=>page.waitForFunction(expression,{},{timeout:5000});
  const back=async()=>{await page.goBack();await page.waitForTimeout(80);};
  const forward=async()=>{await page.goForward();await page.waitForTimeout(80);};
  try {
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    if(process.env.DOUX_TEST_SCREENSHOT)await page.screenshot({path:process.env.DOUX_TEST_SCREENSHOT,fullPage:true});
    assert.equal(await page.locator('.hub-art img').evaluateAll(imgs=>imgs.filter(i=>i.complete&&i.naturalWidth===512).length),4);
    await page.click('[data-feature="food"]');await check('state.page==="near"');
    await page.click('#openFilters');await page.locator('#modal').waitFor({state:'visible'});
    await page.selectOption('#budget','100');
    await back();await check('!document.querySelector("#modal").open && state.page==="near"');
    assert.equal(await page.evaluate(()=>state.config.budget),100);
    await back();await check('state.page==="home"');await forward();await check('state.page==="near"');
    console.log('PASS: modal Back, page Back/Forward, filters retained');

    await page.evaluate(()=>{state.config.budget=0;generate();render();});
    await page.click('#buildWheel');await check('state.stage==="wheel"');
    const ids=await page.evaluate(()=>state.candidates.map(s=>s.id));
    await back();await check('state.stage==="map"');await forward();await check('state.stage==="wheel"');
    assert.deepEqual(await page.evaluate(()=>state.candidates.map(s=>s.id)),ids);
    await page.emulateMedia({reducedMotion:'reduce'});await page.click('#spin');
    await page.locator('#share').waitFor({timeout:8000});await page.click('#share');
    await check('document.querySelector(".share-preview")!==null');
    await back();await page.locator('[data-rv-plan]').waitFor();
    await page.click('[data-rv-plan]');assert.equal(await page.evaluate(()=>state.visits.length),0);
    await page.click('[data-rv-plan]');await check('state.page==="visits"');
    await page.click('[data-rv-visit-plan]');await page.fill('#rvPrivateNote','未提交的到店记录');
    await back();await check('!document.querySelector("#modal").open');await forward();
    assert.equal(await page.inputValue('#rvPrivateNote'),'未提交的到店记录');
    await page.click('.modal-close');await page.click('[data-rv-visit-plan]');
    assert.equal(await page.inputValue('#rvPrivateNote'),'未提交的到店记录');
    assert.equal(await page.locator('#rvName').count(),0);
    assert.equal(await page.locator('#rvVisited').count(),0);
    assert.equal(await page.locator('#rvVisitFields').isVisible(),true);
    await page.click('#rvSubmit');
    await check('!document.querySelector("#modal").open && state.visits.length===1');
    assert.equal(await page.locator('[data-rv-visit-plan]').count(),0);
    await page.evaluate(()=>recordForm(state.last));assert.equal(await page.inputValue('#rvPrivateNote'),'');
    await page.click('.modal-close');await check('!document.querySelector("#modal").open');
    console.log('PASS: result joins pending plan without a visit, arrival confirmation and draft restore, no nickname input');

    await page.click('#backHome');await check('state.page==="home"');
    await page.click('[data-feature="custom"]');await page.fill('#freeOptionName','尚未提交的文字');
    await back();await check('state.page==="home"');await forward();
    assert.equal(await page.inputValue('#freeOptionName'),'尚未提交的文字');
    await page.fill('#freeOptionName','选项甲');await page.locator('#freeOptionForm button').click();
    await page.fill('#freeOptionName','选项乙');await page.locator('#freeOptionForm button').click();
    await page.click('#freeReady');await check('freeWheel.stage==="wheel"');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.click('#freeSpin');await page.locator('#freeAgain').waitFor({timeout:10000});
    await back();await check('!document.querySelector("#modal").open && freeWheel.stage==="wheel"');
    await page.click('#freeEdit');await check('freeWheel.stage==="edit"');
    assert.equal(await page.evaluate(()=>freeWheel.items.length),2);
    console.log('PASS: custom draft and options survive Back/Forward and in-app step Back');

    await page.click('#backHome');await check('state.page==="home"');await page.click('[data-feature="travel"]');
    await page.fill('#travelOrigin','广州');await page.fill('[name="budget"]','1250');
    await page.click('[data-travel-stage="library"]');await check('travel.stage==="library"');
    await back();await check('travel.stage==="settings"');
    assert.equal(await page.inputValue('#travelOrigin'),'广州');assert.equal(await page.inputValue('[name="budget"]'),'1250');
    await page.locator('#travelSettings button[type="submit"]').click();await check('travel.stage==="candidates"');
    await page.click('#travelReady');await check('travel.stage==="wheel"');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.click('#travelSpin');await page.waitForTimeout(200);await back();await check('travel.stage==="candidates" && !state.busy');
    await page.waitForTimeout(3500);assert.equal(await page.locator('#modal').evaluate(el=>el.open),false);
    await back();await check('travel.stage==="settings"');assert.equal(await page.inputValue('[name="budget"]'),'1250');
    console.log('PASS: travel steps and settings retained, Back cancels spin without stale result');

    await page.evaluate(()=>navigate('visits'));await page.click('#editUsername');await page.fill('#currentUsername','待保存的名字');
    await page.keyboard.press('Escape');await check('!document.querySelector("#modal").open');
    await page.click('#editUsername');assert.equal(await page.inputValue('#currentUsername'),'待保存的名字');
    await page.click('#saveUsername');await check('!document.querySelector("#modal").open');
    assert.equal(await page.evaluate(()=>state.username),'待保存的名字');
    await page.evaluate(()=>{
      state.live=true;
      DouxMap.load=async()=>({
        Map:class{constructor(){}add(){}on(){}destroy(){}setCenter(){}},
        Marker:class{setPosition(){}}
      });
      DouxMap.search=async()=>[{id:'amap-test',name:'广州塔',source:'amap',location:[113.33,23.11],address:'广州市海珠区',category:'风景名胜'}];
      openLocation('near');
    });
    await page.fill('#mapSearch','广州塔');await page.click('#mapSearchGo');await page.click('[data-map-result="0"]');
    await page.evaluate(()=>setupSheet());await back();await page.locator('#mapSearch').waitFor();
    assert.equal(await page.inputValue('#mapSearch'),'广州塔');assert.equal(await page.textContent('#selectedPlace'),'广州塔');
    await page.click('#confirmLocation');await check('!document.querySelector("#modal").open');
    assert.equal(await page.evaluate(()=>state.origin.name),'广州塔');
    console.log('PASS: Escape preserves profile draft, save completes, nested map restores query and selected place');

    const samples=await page.evaluate(async()=>{
      const disc=document.createElement('div');disc.style.cssText='position:fixed;width:40px;height:40px;top:0;left:0';document.body.append(disc);
      const motion=DouxWheel.start(disc);await new Promise(r=>setTimeout(r,400));
      const frames=[];let done=false;
      const sample=t=>{const m=new DOMMatrix(getComputedStyle(disc).transform);frames.push([t,Math.atan2(m.b,m.a)*180/Math.PI]);if(!done)requestAnimationFrame(sample);};
      requestAnimationFrame(sample);const ok=await motion.stop(3,6);done=true;disc.remove();return {frames,ok};
    });
    assert.equal(samples.ok,true);
    const speeds=[];for(let i=1;i<samples.frames.length;i++){
      const [t,a]=samples.frames[i],[pt,pa]=samples.frames[i-1];const delta=(a-pa+360)%360;
      if(t>pt&&delta<100)speeds.push(delta/(t-pt));
    }
    assert.ok(Math.max(...speeds)<.65,'braking must not accelerate above cruise speed');
    assert.ok(speeds.at(-3)<.03,'wheel approaches rest slowly');
    console.log('PASS: real browser animation sampled, peak deg/ms='+Math.max(...speeds).toFixed(3)+', near-end='+speeds.at(-3).toFixed(4));
    for(const width of [320,360,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
    console.log('PASS: no horizontal overflow at 320/360/390 px');
    assert.deepEqual(errors,[]);console.log('PASS: no browser JavaScript errors');
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
