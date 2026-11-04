(function(root){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function createVisitPicker({state,core,maps,node,showModal,modalTop,recordForm}){
    let sequence=0,timer,picker={activity:'food',results:[],loading:false};
    const key=store=>String(store.poiId||store.id||'').replace(/^amap-/,'');
    const unique=stores=>{const byId=new Map();for(const store of stores)if(!byId.has(key(store)))byId.set(key(store),store);return [...byId.values()];};
    function known(){
      const play=picker.activity==='play';
      const visits=(state.visits||[]).map(v=>({...v,id:v.storeId}));
      const plans=(state.outings||[]).map(item=>item.store);
      const all=[...Object.values(state.catalog||{}),...(state.favorites||[]),...visits,...plans,...(state.live?[]:(play?core.playStores:core.stores))];
      return unique(all.filter(s=>s?.id&&((s.activity==='play')===play)));
    }
    function choices(results,selected=''){
      const select=node('#recordPick');if(!select)return;
      picker.results=results;
      for(const store of results)state.catalog[store.id]={...state.catalog[store.id],...store};
      select.innerHTML='<option value="">请选择地点</option>'+results.map(store=>`<option value="${escape(store.id)}">${escape(store.name)}${store.address||store.city?' · '+escape(store.address||store.city):''}</option>`).join('');
      select.disabled=results.length===0;select.value=results.some(s=>s.id===selected)?selected:'';
    }
    function open(){
      clearTimeout(timer);sequence++;state.catalog=state.catalog||{};
      picker={activity:state.visitTab==='play'?'play':'food',results:[],loading:false};
      showModal(modalTop(picker.activity==='play'?'补录一次游玩':'补录一次到店')+`<div class="search-line"><input id="recordSearch" type="search" maxlength="100" placeholder="搜索城市、店名或地址" aria-label="搜索到访地点" autocomplete="off"><button id="recordSearchGo" class="btn small" type="button">搜索</button></div><p id="recordSearchStatus" class="muted" role="status"></p><select id="recordPick" class="full" aria-label="选择到访地点"></select>`);
      choices(known());node('#recordSearch')?.focus();
    }
    function active(input,token){return token===sequence&&node('#recordSearch')===input&&node('#modal')?.open;}
    async function search(){
      clearTimeout(timer);const input=node('#recordSearch');if(!input||!node('#modal')?.open)return;
      const query=input.value.trim(),token=++sequence,activity=picker.activity;
      const status=node('#recordSearchStatus');picker.loading=Boolean(query);
      if(!query){choices(known());status.textContent='';return;}
      node('#recordPick').disabled=true;status.textContent='正在搜索…';
      const words=query.toLowerCase().split(/\s+/);
      const local=known().filter(s=>words.every(word=>[s.name,s.city,s.address].join(' ').toLowerCase().includes(word)));
      try{
        // Text search has no origin/radius; past visits must not use current route or budget restrictions.
        const remote=state.mapConfigured===false?[]:await maps.search(query,null);
        if(!active(input,token))return;
        const places=remote.filter(s=>activity==='play'?maps.matchesPlay(s,maps.playTypes):(/^05/.test(s.typecode)||/餐饮|餐厅|餐馆|咖啡|茶饮/.test((s.category||'')+' '+(s.type||''))));
        const decorated=places.map((s,i)=>activity==='play'?maps.decoratePlay(s,i):{...s,activity:'food'});
        const results=unique([...decorated,...local]);
        choices(results);status.textContent=results.length?`找到 ${results.length} 个地点`:state.mapConfigured===false?'暂未找到地点，请检查地图配置或选择已保存地点。':'没有找到，试试加上城市或更完整的店名。';
      }catch(error){if(active(input,token)){choices(local);status.textContent=local.length?'已显示匹配的已保存地点；联网搜索暂不可用。':error.message||'搜索失败，请重试。';}}
      finally{if(active(input,token))picker.loading=false;}
    }
    function schedule(){
      clearTimeout(timer);sequence++;const input=node('#recordSearch');if(!input)return;
      if(node('#recordPick'))node('#recordPick').disabled=true;
      timer=setTimeout(()=>{if(node('#recordSearch')===input)search();},300);
    }
    function choose(id){const store=picker.results.find(s=>s.id===id);if(store){sequence++;clearTimeout(timer);recordForm(store);}}
    function snapshot(){const input=node('#recordSearch');return input?{activity:picker.activity,results:picker.results.slice(),query:input.value,loading:picker.loading}:null;}
    function restore(saved){
      if(!saved||!node('#recordSearch'))return;
      clearTimeout(timer);sequence++;picker={...saved,results:saved.results.slice(),loading:false};
      const selected=node('#recordPick').value;node('#recordSearch').value=saved.query;
      choices(picker.results,selected);if(saved.loading)search();
    }
    return {open,search,schedule,choose,snapshot,restore};
  }
  if(typeof module==='object'&&module.exports){module.exports={createVisitPicker};return;}
  root.DouxVisitPicker=createVisitPicker({state,core:Doux,maps:DouxMap,node:selector=>document.querySelector(selector),showModal:html=>root.showModal(html),modalTop:title=>root.modalTop(title),recordForm:store=>root.recordForm(store)});
  document.addEventListener('click',event=>{if(event.target.closest('#recordSearchGo'))root.DouxVisitPicker.search();});
  document.addEventListener('input',event=>{if(event.target.id==='recordSearch')root.DouxVisitPicker.schedule();});
  document.addEventListener('keydown',event=>{if(event.target.id==='recordSearch'&&event.key==='Enter'){event.preventDefault();root.DouxVisitPicker.search();}});
  document.addEventListener('change',event=>{if(event.target.id==='recordPick'&&event.target.value)root.DouxVisitPicker.choose(event.target.value);});
})(typeof window!=='undefined'?window:globalThis);
