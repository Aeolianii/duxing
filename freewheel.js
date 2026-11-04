'use strict';
// One shared list for text, map places and favorites.
const freeWheel={items:[],stage:'edit',round:0,last:null,info:null,busy:false,legacyImported:false};
function insertFreeItem(item){
  if(!item?.name?.trim())return false;
  if(freeWheel.items.length>=20){toast('最多添加 20 个选项');return false;}
  if(freeWheel.items.some(s=>(item.poiId&&s.poiId===item.poiId)||s.id===item.id||s.name===item.name.trim())){toast('这个选项已经加过啦');return false;}
  freeWheel.items.push({...item,id:item.id||crypto.randomUUID(),name:item.name.trim()});return true;
}
function addFreeItem(item){
  if(!insertFreeItem(item))return false;
  freeWheel.stage='edit';state.page='freewheel';$('#modal').close();render();toast('已加入自定义转盘');return true;
}
function openFreeFavorites(){
  showModal(modalTop('从收藏添加')+`<div class="candidate-list">${state.favorites.map((s,i)=>{
    const added=freeWheel.items.some(item=>item.id===s.id||(s.poiId&&item.poiId===s.poiId)||item.name===s.name);
    return `<button class="candidate-row free-favorite" data-free-favorite="${i}" ${added?'disabled':''}><span class="candidate-emoji">${esc(s.emoji||'📍')}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.address||'文字选项')}</small></span><span>${added?'已添加':'＋'}</span></button>`;
  }).join('')||'<div class="empty"><b>还没有收藏</b>先在美食或游玩地图中收藏喜欢的地点。</div>'}</div>`);
}
function renderFreeWheel(){
  if(!freeWheel.legacyImported){freeWheel.legacyImported=true;for(const item of [...state.customs.food,...state.customs.play])insertFreeItem(item);}
  document.body.classList.add('is-freewheel');
  $('#nav').innerHTML='';
  if(freeWheel.stage==='edit'){
    $('#view').innerHTML=heading('自定义转盘','输入选项、地图选地点，或把收藏放进来。')+`<section class="free-editor"><img class="free-dice-art" src="assets/custom.webp" alt="" aria-hidden="true"><h2>添加你的候选</h2><div class="free-add-methods"><button class="btn secondary small" id="freeText">✎ 输入文字</button><button class="btn outline small" id="freeMap">📍 地图选地点</button><button class="btn outline small" id="freeFavorites">♡ 从收藏添加</button></div><form id="freeOptionForm" class="search-line"><input id="freeOptionName" aria-label="候选项" placeholder="例如：露营、看电影、逛书店" maxlength="80" autocomplete="off"><button class="btn small" type="submit">添加</button></form><p class="muted">2～20 个选项</p><ul class="free-list">${freeWheel.items.map((s,i)=>`<li><span class="free-number">${i+1}</span><span>${s.source==='amap'?`<button class="free-place-name" data-free-detail="${s.id}">${esc(s.name)} ↗</button><small>${esc(s.address||'地图地点')}</small>`:esc(s.name)}</span><button data-free-remove="${s.id}" aria-label="移除${esc(s.name)}">×</button></li>`).join('')||'<li class="free-empty">把第一个小纠结放进来吧</li>'}</ul></section><button id="freeReady" class="btn full sheet-note" ${freeWheel.items.length<2?'disabled':''}>生成我的转盘 · ${freeWheel.items.length} 项</button>`;
  }else{
    $('#view').innerHTML=`<div class="step-nav"><button id="freeEdit">‹ 编辑候选</button><span>随心转一转</span></div>`+heading('答案，就在下一转。','开始后揭晓一个选项，顺便了解它。')+`<section class="panel wheel-panel"><div class="wheel-header"><h3>我的自定义转盘</h3><span class="muted">${freeWheel.items.length} 个选项</span></div><div class="wheel-wrap"><div class="pointer"></div><div class="wheel-rim"><div class="wheel-disc" id="freeDisc">${wheelSVG(freeWheel.items)}</div></div><div class="hub">好运<small>交给这一转</small></div></div><div class="wheel-actions"><button id="freeSpin" class="btn full">开始转盘 ${decoration("sparkle")}</button><p class="wheel-status" id="freeStatus" role="status">每个选项都有同样的机会</p></div></section>`;
  }
}
async function researchFreeOption(winner,round){
  freeWheel.info={status:'loading'};
  try{
    if(winner.source==='amap'){
      await prepareDetails(winner,0);
      if(round===freeWheel.round){
        freeWheel.info=winner.ai;
        if(state.page==='freewheel'&&state.last?.id===winner.id&&$('#modal').open){updateAI(winner);updateStats(winner);}
      }
      return;
    }
    const response=await fetch('/api/option-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:winner.name}),signal:AbortSignal.timeout(25000)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'暂时未能获取介绍，请重试');
    if(!['ready','empty'].includes(data.status))throw new Error('资料响应无效，请重试');
    if(round===freeWheel.round)freeWheel.info=data;
  }catch(error){if(round===freeWheel.round)freeWheel.info={status:'error',error:error.name==='TimeoutError'?'资料检索超时，请重试':error.message};}
  if(round===freeWheel.round&&$('#freeKnowledge'))$('#freeKnowledge').innerHTML=freeKnowledge();
}
function freeKnowledge(){
  const info=freeWheel.info;
  if(!info||info.status==='loading')return '<p role="status">正在检索这个选项的资料，稍后就好…</p>';
  if(info.status==='ready')return `<p>${esc(info.introduction)}</p><details><summary>查看资料来源</summary><p class="muted">AI 根据搜索摘要整理，资料可能不完整。</p>${(info.evidence||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title||'查看来源')} ↗</a>`).join('')}</details>`;
  return `<p>${esc(info.status==='error'?info.error:'暂未找到与这个选项匹配的可靠介绍。可以补充更具体的候选名称后再试。')}</p><button id="freeRetry" class="btn secondary small">重新检索</button>`;
}
function showFreeResult(){
  if(freeWheel.last.source==='amap'){detail(freeWheel.last,true);return;}
  showModal(modalTop('这次，就选它！')+`<div class="free-result"><span aria-hidden="true">${decoration("star")}</span><h2>${esc(freeWheel.last.name)}</h2></div><section class="free-knowledge"><h3>你可能想知道</h3><div id="freeKnowledge">${freeKnowledge()}</div></section><div class="actions sheet-note"><button id="freeAgain" class="btn full">再转一次</button><button class="btn outline full" data-close>收下这个答案</button></div>`);
}
async function spinFreeWheel(){
  if(freeWheel.busy||freeWheel.items.length<2)return;
  const list=freeWheel.items, index=Math.floor(Math.random()*list.length),winner=list[index],round=++freeWheel.round;
  freeWheel.last=winner;freeWheel.busy=true;state.busy=true;
  document.querySelectorAll('#view button').forEach(b=>b.disabled=true);
  $('#freeStatus').textContent='好运转动中，也在了解这个选项…';
  const disc=$('#freeDisc'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animation=reduced?null:disc.animate([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:650,iterations:Infinity});
  const task=researchFreeOption(winner,round);
  let timer;
  await Promise.all([wait(reduced?0:1800),Promise.race([task,new Promise(resolve=>timer=setTimeout(resolve,10000))])]);clearTimeout(timer);
  const matrix=new DOMMatrix(getComputedStyle(disc).transform),angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
  animation?.cancel();disc.style.transform=`rotate(${angle}deg)`;disc.getBoundingClientRect();
  disc.style.transition=reduced?'none':'transform 950ms cubic-bezier(.16,.7,.15,1)';
  disc.style.transform=`rotate(${360*3-(index+.5)*360/list.length}deg)`;
  await wait(reduced?0:950);
  freeWheel.busy=false;state.busy=false;render();showFreeResult();
}
function handleFreeWheelAction(button){
  document.body.classList.toggle('is-freewheel',state.page==='freewheel');
  if(button.dataset.freeFavorite!==undefined){const item=state.favorites[+button.dataset.freeFavorite];if(item&&insertFreeItem(item)){render();openFreeFavorites();toast('已加入自定义转盘');}return true;}
  if(button.dataset.freeDetail){const item=freeWheel.items.find(s=>s.id===button.dataset.freeDetail);if(item)detail(item);return true;}
  if(button.dataset.freeRemove){freeWheel.items=freeWheel.items.filter(s=>s.id!==button.dataset.freeRemove);render();return true;}
  switch(button.id){
    case 'freeText':$('#freeOptionName').focus();return true;
    case 'freeMap':if(state.live)openLocation('freewheel');else setupSheet();return true;
    case 'freeFavorites':openFreeFavorites();return true;
    case 'freeReady':if(freeWheel.items.length<2)return true;freeWheel.stage='wheel';render();return true;
    case 'freeEdit':freeWheel.stage='edit';render();return true;
    case 'freeSpin':spinFreeWheel();return true;
    case 'freeAgain':$('#modal').close();spinFreeWheel();return true;
    case 'freeRetry':researchFreeOption(freeWheel.last,freeWheel.round);$('#freeKnowledge').innerHTML=freeKnowledge();return true;
    default:return false;
  }
}
document.addEventListener('submit',event=>{
  if(event.target.id!=='freeOptionForm')return;
  event.preventDefault();const input=$('#freeOptionName'),name=input.value.trim();
  if(!name)return toast('先写下一个选项');
  if(freeWheel.items.length>=20)return toast('最多添加 20 个选项');
  if(freeWheel.items.some(s=>s.name===name))return toast('这个选项已经加过啦');
  if(insertFreeItem({id:crypto.randomUUID(),name,manual:true}))render();$('#freeOptionName').focus();
});
