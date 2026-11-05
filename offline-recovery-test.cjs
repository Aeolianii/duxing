const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('./server.cjs');
(async()=>{
 const server=createServer({config:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.DOUX_TEST_CHROMIUM?{executablePath:process.env.DOUX_TEST_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
  await page.evaluate(()=>{
   state.live=true;state.mapConfigured=true;state.origin={name:'已选地点',location:[113.3,23.1]};
   window.mapLoads=0;window.searches=[];window.failNext=true;
   DouxMap.load=async()=>{window.mapLoads++;if(window.failNext){window.failNext=false;throw Error('模拟地图失败');}return {Map:class{on(){}add(){}destroy(){}getCenter(){return [113.3,23.1]}},Marker:class{setPosition(){}}};};
   DouxMap.search=async q=>{window.searches.push(q);return [{name:q,address:'测试地址',location:[113.4,23.2]}]};
   openLocation('near');
  });
  await page.locator('#retryLocationMap').waitFor({state:'visible'});
  await page.locator('#mapSearch').fill('北京南站');
  await page.locator('#retryLocationMap').click();
  await page.waitForFunction(()=>!mapUI.failed&&!!mapUI.map);
  assert.equal(await page.locator('#mapSearch').inputValue(),'北京南站');
  assert.equal(await page.locator('#selectedPlace').innerText(),'已选地点');
  assert.equal(await page.locator('#retryLocationMap').isVisible(),false);
  console.log('PASS: 原位重试保留输入及已选地点，清除错误');
  for(let i=0;i<2;i++){
   await context.setOffline(true);await page.waitForFunction(()=>navigator.onLine===false);
   await page.locator('#mapSearchGo').click();
   assert.match(await page.locator('#mapResults').innerText(),/网络已断开/);
   await context.setOffline(false);
   await page.waitForFunction(()=>!mapUI.failed&&!mapUI.failedQuery&&document.querySelector('#mapResults').innerText.includes('测试地址'));
   assert.doesNotMatch(await page.locator('#mapError').innerText(),/失败|断开/);
   assert.equal(await page.locator('#mapSearch').inputValue(),'北京南站');
  }
  assert.equal(await page.evaluate(()=>window.searches.length),2);
  console.log('PASS: 两次断网重连自动恢复地图并重试搜索');
  await page.evaluate(()=>{window.releaseSearch=null;DouxMap.search=()=>new Promise(r=>window.releaseSearch=r);searchMap();});
  await page.locator('.modal-close').click();
  await page.evaluate(()=>window.releaseSearch([{name:'迟到结果',address:'不应显示',location:[1,2]}]));
  assert.equal(await page.locator('dialog[open]').count(),0);
  assert.doesNotMatch(await page.locator('#mapResults').innerText(),/迟到结果/);
  await context.setOffline(true);await context.setOffline(false);
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(()=>{
   window.homeLoads=0;
   DouxMap.load=async()=>({Map:class{constructor(){window.homeLoads++;}on(){}destroy(){}getCenter(){return [113.4,23.2]}getZoom(){return 16}}});
   state.origin={name:'未选点',location:null};state.page='near';render();
  });
  await page.waitForFunction(()=>window.homeLoads===1);
  await context.setOffline(true);await context.setOffline(false);
  await page.waitForFunction(()=>window.homeLoads===2);
  assert.doesNotMatch(await page.locator('#mapHint').innerText(),/失败/);
  console.log('PASS: 联网后重建主页地图并清除旧状态');
  const cold=await context.newPage();let failConfig=true;
  await cold.route('**/api/map-config',r=>failConfig?r.abort():r.fulfill({json:{configured:true,key:'test'}}));
  await cold.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
  assert.equal(await cold.evaluate(()=>state.mapConfigured),false);
  failConfig=false;await context.setOffline(true);await context.setOffline(false);
  await cold.waitForFunction(()=>state.mapConfigured&&state.live);
  await cold.close();
  console.log('PASS: 首次配置请求失败后联网自动恢复真实地图模式');
  assert.deepEqual(errors,[]);
  console.log('PASS: 关闭后迟到搜索不更新页面，联网不重开弹窗，无前端异常');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
