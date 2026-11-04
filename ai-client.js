(function(root) {
  'use strict';
  function createClient(fetcher, now=Date.now) {
    const cache=new Map(),pending=new Map();
    function payload(store) {
      return {source:store.source,activity:store.activity==='play'?'play':'food',poiId:store.poiId,name:store.poiName||store.name,city:store.city,address:store.address,category:store.category||store.type};
    }
    function research(store) {
      if(store.manual||store.source!=='amap')return Promise.resolve(null);
      const input=payload(store),key=JSON.stringify(input),hit=cache.get(key);
      if(hit&&now()-Date.parse(hit.retrievedAt)<900000)return Promise.resolve(hit);
      if(pending.has(key))return pending.get(key);
      const task=(async()=>{
        const response=await fetcher('/api/store-research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(25000)});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'资料检索失败，请重试');
        if(!['ready','empty'].includes(data.status))throw new Error('资料响应无效，请重试');
        cache.set(key,data);return data;
      })().finally(()=>pending.delete(key));
      pending.set(key,task);return task;
    }
    return {research,payload};
  }
  if(typeof module==='object'&&module.exports)module.exports={createClient};
  else root.DouxAI=createClient(root.fetch.bind(root));
})(typeof window==='undefined'?globalThis:window);
