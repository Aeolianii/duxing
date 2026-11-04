'use strict';
// History stores screen positions, while edits stay in the application's live data.
// Going back must never restore an older copy of a user's itinerary or custom list.
(function(){
  const dialog=$('#modal'),session=crypto.randomUUID(),entries=[],drafts=new Map(),modalDrafts=new Map();
  const originalRender=render,originalModal=showModal,nativeClose=dialog.close.bind(dialog);
  let cursor=0,applying=false,queued=false,closed=false,pending=null;
  const mealPages=['near','play','fair','custom'];
  function route(){
    const r={page:state.page,activity:state.activity,stage:state.stage,freeStage:freeWheel.stage,travelStage:travel.stage,day:travel.day,visitTab:state.visitTab};
    r.key=r.page+(mealPages.includes(r.page)?':'+r.activity+':'+r.stage:r.page==='travel'?':'+r.travelStage:r.page==='freewheel'?':'+r.freeStage:'');
    return r;
  }
  function fields(container){
    return [...container.querySelectorAll('input,textarea,select')].filter(el=>!['file','password'].includes(el.type)).map(el=>({
      id:el.id,name:el.name,tag:el.tagName,type:el.type,value:el.value,checked:el.checked,
      selected:el.multiple?[...el.selectedOptions].map(option=>option.value):null
    }));
  }
  function restoreFields(container,values=[]){
    const nodes=[...container.querySelectorAll('input,textarea,select')].filter(el=>!['file','password'].includes(el.type));
    values.forEach((value,index)=>{
      const el=value.id?nodes.find(node=>node.id===value.id):nodes[index];
      if(!el||el.tagName!==value.tag||el.name!==value.name)return;
      el.value=value.value;if(['checkbox','radio'].includes(el.type))el.checked=value.checked;
      if(value.selected)for(const option of el.options)option.selected=value.selected.includes(option.value);
    });
  }
  function mealData(){return {candidates:state.candidates.slice(),drawn:new Set(state.drawn),excluded:new Set(state.excluded),searchMessage:state.searchMessage,last:state.last,detailWon:state.detailWon};}
  function capture(){
    const r=route(),view=$('#view');
    const modal=dialog.open?{
      key:(dialog.querySelector('.modal-top h3,.result-topbar h3')?.textContent||'')+':'+(dialog.querySelector('[data-store]')?.dataset.store||'')+':'+(dialog.querySelector('#reviewForm')?.dataset.record||'')+':'+(dialog.querySelector('#reviewForm')?.dataset.visit||'')+':'+(dialog.querySelector('#reviewForm')?.dataset.plan||''),
      html:$('#modal-content .modal-inner')?.innerHTML||$('#modal-content').innerHTML,
      fields:fields(dialog),scroll:$('#modal-content').scrollTop,last:state.last,won:state.detailWon,reviews:window.DouxReviews?.snapshot(),
      map:dialog.querySelector('#realMap')?{target:mapUI.target,draft:mapUI.draft,results:mapUI.results.slice(),html:$('#mapResults').innerHTML}:null,
      profile:dialog.querySelector('#currentUsername')?state.profileDraft:null,
      travelLast:travel.last,freeLast:freeWheel.last,travelInfo:travel.info,freeInfo:freeWheel.info
    }:null;
    return {route:r,fields:fields(view),scroll:window.scrollY,modal,meal:mealPages.includes(r.page)?mealData():null};
  }
  function remember(){
    if(applying||!entries[cursor])return;
    const current=entries[cursor],next=capture();
    // State may already have changed before render(), but the DOM is still the old screen.
    if(current.modal&&dialog.open){current.modal.fields=fields(dialog);current.modal.scroll=$('#modal-content').scrollTop;current.modal.html=$('#modal-content .modal-inner')?.innerHTML||'';}
    if(!current.modal){current.fields=fields($('#view'));current.scroll=window.scrollY;drafts.set(current.route.key,current.fields);}
    if(current.route.key===next.route.key){current.route=next.route;current.meal=next.meal;if(current.modal&&next.modal?.key===current.modal.key)current.modal=next.modal;}
    if(dialog.open&&current.modal&&dialog.querySelector('#visitForm,#currentUsername,#mapSearch,#reviewForm'))modalDrafts.set(current.modal.key,current.modal);
  }
  function write(entry,replace=false){
    if(replace)entries[cursor]=entry;
    else {entries.splice(cursor+1);entries.push(entry);cursor++;}
    history[replace?'replaceState':'pushState']({douxNavigation:session,index:cursor},'');
  }
  function pageEntry(entry){return {...entry,modal:null};}
  function baseIndex(){let index=cursor;while(index>0&&entries[index].modal)index--;return index;}
  function reconcile(next){
    const current=entries[cursor];
    if(next.route.key!==current.route.key){
      const stored=drafts.get(next.route.key);
      if(stored){restoreFields($('#view'),stored);next.fields=fields($('#view'));}
      const completing=current.route.page===next.route.page&&current.route.stage==='loading'&&next.route.stage==='wheel';
      write(pageEntry(next),completing);
      if(next.modal)write(next);
    } else if(next.modal){
      if(current.modal?.key===next.modal.key)entries[cursor]=next;else write(next);
    } else entries[cursor]=next;
  }
  function sync(){
    queued=false;if(applying||pending)return;
    const next=capture(),current=entries[cursor];
    if(current.modal&&(closed||!next.modal)){
      closed=false;const index=baseIndex();pending=next;history.go(index-cursor);return;
    }
    closed=false;reconcile(next);
  }
  function schedule(){if(!queued&&!applying){queued=true;queueMicrotask(sync);}}
  function cancelWork(){
    DouxWheel.cancelAll();
    if(state.busy){state.round++;freeWheel.round++;travel.round++;}
    state.bg++;state.request++;state.loading=false;state.busy=false;freeWheel.busy=false;
    $('#backHome').disabled=false;$('#help').disabled=false;
  }
  function restore(entry){
    applying=true;cancelWork();if(dialog.open)nativeClose();
    const r=entry.route;
    if(mealPages.includes(r.page))setActivity(r.activity);
    state.page=r.page;state.stage=r.stage==='loading'?'map':r.stage;state.visitTab=r.visitTab;
    freeWheel.stage=r.freeStage;travel.stage=r.travelStage;travel.day=r.day;
    if(entry.meal){Object.assign(state,entry.meal);state.drawn=new Set(entry.meal.drawn);state.excluded=new Set(entry.meal.excluded);}
    if(state.page==='travel'&&travel.stage==='plan'&&!travel.plan)travel.stage='settings';
    originalRender();restoreFields($('#view'),drafts.get(r.key)||entry.fields);window.scrollTo({top:entry.scroll,behavior:'instant'});
    const m=entry.modal;
    if(m){
      state.last=m.last;state.detailWon=m.won;
      if(travel.last?.id!==m.travelLast?.id)travel.info=m.travelInfo;
      if(freeWheel.last?.id!==m.freeLast?.id)freeWheel.info=m.freeInfo;
      travel.last=m.travelLast;freeWheel.last=m.freeLast;
      if(m.profile){state.profileDraft=m.profile;state.profileDraft.loading=false;}
      if(m.map){
        const task=openLocation(m.map.target);mapUI.draft=m.map.draft;mapUI.results=m.map.results;$('#mapResults').innerHTML=m.map.html;
        const token=mapUI.token;
        task.then(()=>{if(token!==mapUI.token||!dialog.open)return;if(m.map.draft?.location){mapUI.map?.setCenter(m.map.draft.location);mapUI.marker?.setPosition(m.map.draft.location);$('#selectedPlace').textContent=m.map.draft.name;$('#confirmLocation').disabled=false;}});
      } else {
        originalModal(m.html);
        if(dialog.querySelector('#map'))bindMap();
        if(m.last&&dialog.querySelector('#storeStats')){
          updateAI(m.last);updateStats(m.last);
          prepareDetails(m.last,0).then(()=>{if(dialog.open&&state.last?.id===m.last.id){updateAI(m.last);updateStats(m.last);}}).catch(()=>{});
        }
        if(dialog.querySelector('#travelKnowledge')){$('#travelKnowledge').innerHTML=travelKnowledge();if(travel.info?.status==='loading')researchTravel(travel.last,travel.round);}
        if(dialog.querySelector('#freeKnowledge')){$('#freeKnowledge').innerHTML=freeKnowledge();if(freeWheel.info?.status==='loading')researchFreeOption(freeWheel.last,freeWheel.round);}
        if(m.profile)$('#saveUsername').disabled=false;
      }
      restoreFields(dialog,m.fields);window.DouxReviews?.restore(m.reviews);$('#modal-content').scrollTop=m.scroll;
    }
    applying=false;
  }
  render=function(){if(!applying)remember();originalRender();schedule();};
  showModal=function(html){
    if(!applying)remember();originalModal(html);
    if(!applying){
      const draft=modalDrafts.get(capture().modal.key);
      if(draft){restoreFields(dialog,draft.fields);window.DouxReviews?.restore(draft.reviews);if(draft.profile){state.profileDraft=draft.profile;$('#profileAvatarPreview').innerHTML=avatarIcon(draft.profile.avatar);}}
    }
    schedule();
  };
  dialog.close=function(...args){if(!applying&&dialog.open)closed=true;nativeClose(...args);schedule();};
  dialog.addEventListener('cancel',event=>{if(entries[cursor]?.modal){event.preventDefault();remember();history.back();}});
  dialog.addEventListener('close',schedule);
  window.addEventListener('popstate',event=>{
    const target=event.state;
    if(target?.douxNavigation!==session||!entries[target.index])return;
    if(pending){cursor=target.index;pending=null;reconcile(capture());return;}
    remember();cursor=target.index;restore(entries[cursor]);
  });
  // Capture drafts before delegated handlers replace the current DOM.
  document.addEventListener('click',event=>{
    remember();
    if(event.target.closest('.brand')){event.preventDefault();if(!state.busy&&state.page!=='home')navigate('home');return;}
    const button=event.target.closest('button');if(!button)return;
    // Native input events can run a microtask checkpoint between capture and
    // delegated bubble handlers. Wait for the next task to observe a completed save.
    if(button.id==='saveUsername'){const key=entries[cursor]?.modal?.key;setTimeout(()=>{if(!dialog.open)modalDrafts.delete(key);},0);}
    let target=null;
    if(button.dataset.close!==undefined&&entries[cursor]?.modal)target=cursor-1;
    else {
      const r=route();let match;
      if(['backToMap','cancelGeneration','cancelGenerationBottom'].includes(button.id))match=e=>e.route.page===r.page&&e.route.activity===r.activity&&e.route.stage==='map';
      else if(button.id==='freeEdit')match=e=>e.route.page==='freewheel'&&e.route.freeStage==='edit';
      else if(button.id==='backHome')match=e=>e.route.page==='home';
      else if(button.dataset.travelStage&&button.closest('.step-nav'))match=e=>e.route.page==='travel'&&e.route.travelStage===button.dataset.travelStage;
      if(match)for(let i=cursor-1;i>=0;i--)if(!entries[i].modal&&match(entries[i])){target=i;break;}
    }
    if(target!==null&&target>=0){event.preventDefault();event.stopImmediatePropagation();history.go(target-cursor);}
  },true);
  document.addEventListener('submit',event=>{
    if(event.target.id!=='visitForm')return;const key=entries[cursor]?.modal?.key;
    setTimeout(()=>{if(!dialog.open)modalDrafts.delete(key);},0);
  },true);
  document.addEventListener('doux:review-saved',()=>modalDrafts.delete(entries[cursor]?.modal?.key));
  for(const type of ['input','change'])document.addEventListener(type,()=>queueMicrotask(remember));
  entries.push(capture());history.replaceState({douxNavigation:session,index:0},'');
  if('scrollRestoration' in history)history.scrollRestoration='manual';
})();
