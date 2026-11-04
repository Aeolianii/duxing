(function(root){
  'use strict';
  const keyOf=store=>String(store?.poiId||store?.reviewKey||store?.storeId||store?.id||'').replace(/^amap-/, '');
  const rating=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5?Number(value):0;
  function get(records,store){return (Array.isArray(records)?records:[]).find(item=>item.key===keyOf(store))||null;}
  function put(records,store,values){
    const key=keyOf(store);if(!key)throw new Error('缺少门店信息');
    const old=get(records,store)||{};
    const next={...old,...values,key,store:{...(old.store||{}),...store},rating:rating(values.rating??old.rating)};
    return [...(Array.isArray(records)?records:[]).filter(item=>item.key!==key),next];
  }
  function visit(visits,store,values,existing){
    const next={...existing,id:existing?.id||values.id,storeId:store.id||existing?.storeId||keyOf(store),reviewKey:keyOf(store),poiId:store.poiId||existing?.poiId,
      name:store.name||existing?.name,emoji:store.emoji||existing?.emoji,source:store.source||existing?.source,city:store.city||existing?.city,address:store.address||existing?.address,
      activity:store.activity==='play'?'play':'food',date:values.date,price:values.price,note:values.note};
    return existing?(visits||[]).map(item=>item.id===existing.id?next:item):[...(visits||[]),next];
  }
  // Roll back both local keys if quota/storage errors interrupt the write.
  function commit(storage,records,visits){
    const updates=[['doux-my-reviews-v1',JSON.stringify(records)]];
    if(visits)updates.push(['doux-visits',JSON.stringify(visits)]);
    const before=updates.map(([key])=>[key,storage.getItem(key)]);
    try{for(const [key,value]of updates)storage.setItem(key,value);}
    catch(error){for(const [key,value]of before){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{}}throw error;}
  }
  const api={keyOf,rating,get,put,visit,commit};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DouxReviewModel=api;
})(typeof window!=='undefined'?window:globalThis);
