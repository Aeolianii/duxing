'use strict';
// 站内用户评价：结果页的大众点评式评价区 + 写评价弹层。
// 真实评价来自本机服务；美食中奖页另有明确标注、独立于真实统计的界面示例。
(function (root) {
  const TAGS = {
    food: ['味道好', '分量足', '性价比高', '环境舒服', '服务好', '干净卫生', '适合聚餐', '适合约会', '排队久', '有点贵', '太吵', '口味一般'],
    play: ['体验好', '设施新', '讲解到位', '性价比高', '环境舒服', '适合亲子', '适合朋友', '排队久', '有点贵', '工作人员友好', '项目丰富', '交通方便']
  };
  const RATE_TEXT = ['', '很差', '一般', '还行', '推荐', '强烈推荐'];
  const SORTS = [['helpful', '最有帮助'], ['newest', '最新'], ['lowest', '最低分'], ['highest', '最高分']];
  const PHOTO_LIMIT = 3, PHOTO_BYTES = 300 * 1024, CONTENT_MAX = 600;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // app.js 里的 state 是顶层 const（全局词法绑定），不会挂在 window 上，这里直接读。
  const appState = () => (typeof state !== 'undefined' ? state : null);

  let current = null;   // {store, el, sort, tag, page, data, loading}
  let draft = null;     // {store, rating, tags, photos, busy}
  const cache = new Map();
  const Model = root.DouxReviewModel;
  const checkedStores = new Map();
  const savedPlans=root.read('outings-v1');appState().outings=Array.isArray(savedPlans)?savedPlans:[];
  const pendingFor=store=>(appState().outings||[]).find(item=>item.status==='planned'&&item.reviewKey===Model.keyOf(store));
  function planButton(store){return `<button class="btn full" data-rv-plan>${pendingFor(store)?'查看行程':'＋ 加入行程'}</button>`;}
  function renderPlans(tab){
    if(tab==='travel')return '';
    const plans=(appState().outings||[]).filter(item=>item.status==='planned'&&item.activity===tab);
    return `<h2 class="profile-section-title">待出发</h2><div class="section-list">${plans.map(item=>`<article class="list-row"><span class="emoji">${item.store.emoji||(tab==='play'?'🎡':'🍽️')}</span><div class="grow"><h3>${esc(item.name)}</h3><p>${esc(item.store.address||'已加入行程')}</p><small>待出发</small></div><div class="actions"><button class="btn secondary small" data-rv-visit-plan="${esc(item.id)}">确认到访并评价</button><button class="quiet" data-rv-view-plan="${esc(item.id)}">查看地点</button><button class="quiet" data-rv-cancel-plan="${esc(item.id)}">移除</button></div></article>`).join('')||'<p class="empty">还没有待出发的行程</p>'}</div>`;
  }
  function addPlan(store){
    if(pendingFor(store)){document.getElementById('modal')?.close();appState().visitTab=store.activity==='play'?'play':'food';root.navigate('visits');return;}
    const next=Model.plan(appState().outings,store,{id:crypto.randomUUID(),createdAt:new Date().toISOString()});
    if(!root.save('outings-v1',next))return;
    appState().outings=next;
    const action=document.getElementById('resultTripAction');if(action)action.innerHTML=planButton(store);
    root.toast?.('已加入行程，出发后可在个人资料中确认到访');
  }
  function personalRecords() { try { const value=JSON.parse(localStorage.getItem('doux-my-reviews-v1')||'[]');return Array.isArray(value)?value:[]; } catch { return []; } }
  const personal = store => Model.get(personalRecords(),store);
  function rememberPublic(store,mine) {
    if(!mine)return false;
    const records=personalRecords(),old=Model.get(records,store);
    if(old?.remoteUpdatedAt===mine.updatedAt&&old.publicId===mine.id)return false;
    const values=old&&(!old.publicId||old.publicPending)
      ? {publicId:mine.id,remoteUpdatedAt:mine.updatedAt,publicPending:true}
      : {rating:mine.rating,content:mine.content,tags:mine.tags,images:mine.images,actualPrice:mine.actualPrice??null,authorName:mine.author.name,publicId:mine.id,remoteUpdatedAt:mine.updatedAt,publicPending:false};
    try { Model.commit(localStorage,Model.put(records,store,values));return true; } catch { return false; }
  }
  function labelFor(store) {
    const mine=personal(store),n=mine?.rating||(store.activity==='travel'&&store.storeId?Model.rating(store.rating):0);
    return n?`<span class="rv-stars-inline" aria-label="我的评分 ${n} 星">${stars(n)}</span> <span>我的评分 ${n} 星</span>`:'<span class="muted">待评分</span>';
  }
  function personalHTML(store) {
    const mine=personal(store),status=mine?.publicId?(mine.publicPending?'修改未发布':'已发布'):'仅自己可见';
    return mine?.rating?`<div class="rv-personal"><div>${labelFor(store)}<small>${status}</small></div></div>`:'';
  }
  async function hydrateVisits(visits) {
    for(const visit of visits.filter(v=>v.activity!=='travel')) {
      const key=Model.keyOf(visit);if(!key||Date.now()-(checkedStores.get(key)||0)<30000)continue;
      checkedStores.set(key,Date.now());
      try { const data=await api('/api/reviews?'+new URLSearchParams({poiId:key,device:deviceId()}));if(rememberPublic({...visit,id:visit.storeId},data.myReview)&&appState()?.page==='visits')root.render(); } catch {}
    }
  }

  function deviceId() {
    let id = '';
    try { id = localStorage.getItem('doux-device') || ''; } catch {}
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID && crypto.randomUUID()) || 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('doux-device', id); } catch {}
    }
    return id;
  }
  const storeKey = store => Model.keyOf(store);
  const meta = store => ({
    poiId: storeKey(store),
    poiName: store.poiName || store.name || '',
    city: store.city || '',
    address: store.address || '',
    activity: store.activity === 'play' ? 'play' : 'food'
  });
  const hue = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360; return h; };
  const initial = name => [...String(name || '?')][0] || '?';
  const dateText = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}); };
  const stars = n => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n)));
  const scoreStars = score => `<span class="rv-stars" role="img" aria-label="${score} 分"><span class="rv-stars-bg">★★★★★</span><span class="rv-stars-fg" style="width:${Math.max(0, Math.min(100, score / 5 * 100))}%">★★★★★</span></span>`;

  async function api(url, options) {
    const response = await fetch(url, {...options, signal: AbortSignal.timeout(15000)});
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw Object.assign(new Error(data.error || '网络请求失败'), {status: response.status});
    return data;
  }

  function avatarHTML(author, extra = '') {
    if (author?.avatar) return `<span class="rv-avatar ${extra}"><img src="${esc(author.avatar)}" alt="${esc(author.name)}的头像" loading="lazy"></span>`;
    return `<span class="rv-avatar ${extra}" style="background:hsl(${hue(author?.name || '?')} 76% 91%);color:hsl(${hue(author?.name || '?')} 52% 38%)" aria-hidden="true">${esc(initial(author?.name))}</span>`;
  }

  function shell(store,showExample=false) {
    const demo = store.source !== 'amap';
    return `<div class="rv-my-review">${personalHTML(store)}</div><div class="rv-panel-head"><h3>🗣 用户评价</h3></div>
      <p class="rv-note">${showExample?'含一条用于界面展示的示例评价。':demo ? '演示／自选门店：评价保存在这台服务器，仅代表本站用户，不是平台的真实评价。' : '来自本站用户的真实体验，写之前请先确认你去过这里。'}</p>
      <div class="rv-body" aria-live="polite"><p class="muted">正在读取评价…</p></div>`;
  }

  function summaryHTML(data,example=false) {
    const s = data.summary;
    if (!s.count) return '';
    const bars = [5, 4, 3, 2, 1].map(star => {
      const n = s.histogram[star] || 0, percent = s.count ? Math.round(n / s.count * 100) : 0;
      return `<div class="rv-hist-row"><span>${star} 星</span><div class="rv-bar"><i style="width:${percent}%"></i></div><small>${n}</small></div>`;
    }).join('');
    return `<div class="rv-summary">
      <div class="rv-score"><strong>${s.average.toFixed(1)}</strong>${scoreStars(s.average)}
        <small>${example?'示例评分':'站内平均分'} · ${s.count} 条${example?'示例':''}评价${s.photos ? ` · ${s.photos} 张${example?'示例':''}图片` : ''}</small></div>
      <div class="rv-hist">${bars}</div>
    </div>`;
  }

  function tagsHTML(data, active) {
    if (!data.summary.tags.length) return '';
    const chips = data.summary.tags.slice(0, 10).map(t => `<button class="chip rv-tag ${active === t.tag ? 'on' : ''}" data-rv-tag="${esc(t.tag)}">${esc(t.tag)} · ${t.count}</button>`).join('');
    return `<div class="rv-tags">${chips}${active ? '<button class="quiet" data-rv-tag="">清除筛选</button>' : ''}</div>`;
  }

  function itemHTML(review) {
    return `<article class="rv-item">
      <div class="rv-item-head">${avatarHTML(review.author)}
        <div class="grow"><strong>${esc(review.author.name)}${review.example?' <span class="rv-example-tag">示例评价</span>':review.mine ? ' <small class="rv-mine">我的评价</small>' : ''}</strong>
          <span class="rv-item-score"><span class="rv-stars-inline" aria-label="${review.rating} 星">${stars(review.rating)}</span><small>${review.example?'展示内容':dateText(review.createdAt)}</small>${Number.isFinite(review.actualPrice)?`<small>${review.example?'示例人均':'实际人均'} ¥${esc(review.actualPrice)}</small>`:''}</span></div>
      </div>
      <p class="rv-text">${esc(review.content)}</p>
      ${review.images.length ? `<div class="rv-photos">${review.images.map((src, i) => `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="${esc(review.author.name)}的评价图片 ${i + 1}" loading="lazy"></a>`).join('')}</div>` : ''}
      ${review.tags.length ? `<div class="rv-item-tags">${review.tags.map(tag => `<span class="rv-tag-pill">${esc(tag)}</span>`).join('')}</div>` : ''}
      <div class="rv-foot">${review.example?'<span class="rv-like">♡ 有用</span>':`<button class="rv-like ${review.liked ? 'on' : ''}" data-rv-like="${esc(review.id)}" aria-pressed="${review.liked ? 'true' : 'false'}">${review.liked ? '♥' : '♡'} 有用${review.likes ? ' · ' + review.likes : ''}</button>`}</div>
    </article>`;
  }

  function exampleHTML(full=false) {
    const review={id:'food-example',example:true,author:{name:'小都'},rating:5,actualPrice:58,content:'口味合心意，份量也合适，环境舒服。和朋友一起过来，整体体验挺满意的。',images:['assets/food.webp'],tags:['味道好','环境舒服']};
    const summary={count:1,average:5,histogram:{1:0,2:0,3:0,4:0,5:1},photos:1,tags:[]};
    return `<section class="rv-example" aria-label="用户评价界面示例"><div class="rv-example-head"><strong>示例评价</strong><small>仅用于界面展示</small></div>${full?summaryHTML({summary},true)+`<div class="rv-sort">${SORTS.map(([,label],i)=>`<span class="chip ${i===0?'on':''}">${label}</span>`).join('')}</div>`:''}<div class="rv-list">${itemHTML(review)}</div></section>`;
  }

  function render() {
    if (!current?.el) return;
    const {el, data} = current;
    const own=el.querySelector('.rv-my-review');if(own)own.innerHTML=personalHTML(current.store);
    const body = el.querySelector('.rv-body');
    if (!body) return;
    if (!data) { body.innerHTML = '<p class="muted">正在读取评价…</p>'; return; }
    const writeButton = '';
    if (!data.total && !current.tag) {
      body.innerHTML = current.showExample?exampleHTML(true):`<div class="rv-empty"><b>还没有人评价过这里</b>${writeButton}</div>`;
      return;
    }
    const list = data.reviews.length
      ? data.reviews.map(itemHTML).join('')
      : `<div class="empty"><b>这个标签下还没有评价</b>换个标签，或者写下你的体验。</div>`;
    body.innerHTML = `${summaryHTML(data)}${tagsHTML(data, current.tag)}
      <div class="rv-sort">${SORTS.map(([id, label]) => `<button class="chip ${current.sort === id ? 'on' : ''}" data-rv-sort="${id}">${label}</button>`).join('')}</div>
      <div class="rv-list">${list}</div>
      ${data.hasMore ? '<button class="btn outline full rv-more" data-rv-more>加载更多评价</button>' : ''}
      ${current.page > 1 ? `<p class="muted rv-count">已显示 ${data.reviews.length} / ${data.total} 条</p>` : ''}
      ${writeButton}${current.showExample?exampleHTML(false):''}`;
  }

  async function load(page = 1, {append = false} = {}) {
    if (!current || current.loading) return;
    current.loading = true;
    const snapshot = current;
    try {
      const query = new URLSearchParams({
        poiId: storeKey(snapshot.store), sort: snapshot.sort, page: String(page), limit: '10', device: deviceId()
      });
      if (snapshot.tag) query.set('tag', snapshot.tag);
      const data = await api('/api/reviews?' + query.toString());
      if (current !== snapshot || !snapshot.el.isConnected) return;
      rememberPublic(snapshot.store,data.myReview);
      snapshot.page = page;
      snapshot.data = append && snapshot.data ? {...data, reviews: [...snapshot.data.reviews, ...data.reviews]} : data;
      cache.set(storeKey(snapshot.store), {at: Date.now(), data: snapshot.data});
      render();
    } catch (error) {
      if (current !== snapshot) return;
      const body = snapshot.el.querySelector('.rv-body');
      if (body) body.innerHTML = `${snapshot.showExample?exampleHTML(true):''}<p class="muted">评价暂时读取失败：${esc(error.message)}</p><button class="btn outline small" data-rv-retry>重试</button>`;
    } finally {
      if (current === snapshot) snapshot.loading = false;
    }
  }

  function mount(store,options={}) {
    const el = document.getElementById('storeReviews');
    if (!el || !store) return;
    const showExample=Boolean(options.won&&store.activity!=='play'&&store.activity!=='travel');
    el.innerHTML = shell(store,showExample);
    current = {store, el, showExample, sort: 'helpful', tag: '', page: 1, data: null, loading: false};
    el.dataset.store = storeKey(store);
    const cached = cache.get(storeKey(store));
    if (cached && Date.now() - cached.at < 60000) { current.data = cached.data; render(); return; }
    load(1);
  }

  /* ---------- 写评价 ---------- */
  function draftBody(store) {
    const tags=TAGS[meta(store).activity],visit=draft.visit,kind=store.activity==='play'?'游玩':'到店';
    return `<form id="reviewForm" class="rv-form" data-store="${esc(storeKey(store))}" data-visit="${esc(visit?.id||'')}" data-record="${draft.recordVisit?'visit':'review'}" data-plan="${esc(draft.planId||'')}" novalidate>
      <div class="intro-box">${esc(store.name)}</div>
      <p class="rv-form-label">我的评分</p>
      <div class="rv-rate" role="radiogroup" aria-label="评分">${[1,2,3,4,5].map(n=>`<button type="button" class="rv-star ${n<=draft.rating?'on':''}" data-rv-star="${n}" role="radio" aria-checked="${n===draft.rating}" aria-label="${n} 星">★</button>`).join('')}<b id="rvRateText">${RATE_TEXT[draft.rating]||'待评分'}</b></div>
      <p class="rv-form-label">标签（最多 4 个）</p><div class="chips rv-pick-tags">${tags.map(tag=>`<button type="button" class="chip ${draft.tags.includes(tag)?'on':''}" data-rv-tagpick="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>
      <p class="rv-form-label">我的评价</p><textarea id="rvContent" maxlength="${CONTENT_MAX}" rows="4" placeholder="写下这次体验…" aria-label="评价内容">${esc(draft.content||'')}</textarea>
      <p class="muted rv-counter"><span id="rvCount">${[...(draft.content||'')].length}</span> / ${CONTENT_MAX}</p>
      <div class="rv-photo-actions"><label class="btn outline small rv-upload">＋ 添加图片<input id="rvPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><small>最多 3 张</small></div><div id="rvPreview" class="rv-preview"></div>
      ${draft.recordVisit?'':`<label class="rv-checkbox"><input id="rvVisited" type="checkbox" ${visit?'checked':''}>我已实际${kind}，同时保存足迹</label>`}
      <div id="rvVisitFields" ${visit||draft.recordVisit?'':'hidden'}>
        <label class="rv-name">实际到访日期<input id="rvVisitDate" type="date" max="${root.today()}" value="${esc(visit?.date||root.today())}"></label>
        <label class="rv-name">实际人均（可选，发布时公开）<input id="rvVisitPrice" type="number" min="0" step="0.01" value="${visit?.price??''}" placeholder="人民币 / 人"></label>
        <label class="rv-name">备注（可选，仅自己可见）<textarea id="rvPrivateNote" maxlength="500" rows="2">${esc(visit?.note||'')}</textarea></label>
        ${visit?.feeling&&visit.feeling!=='暂不评价'?`<p class="muted">原感受：${esc(visit.feeling)}</p>`:''}
      </div>
      <label class="rv-checkbox"><input id="rvPublish" type="checkbox">同时发布到站内${personal(store)?.publicId?'（更新已发布评价）':''}</label>
      <p class="muted rv-privacy">勾选后公开个人资料名称、评分、人均、评价和图片；到访日期和备注不公开。</p>
      <button class="btn full" id="rvSubmit" type="submit">保存记录与评价</button><p id="rvError" role="alert"></p>
    </form>`;
  }
  function openForm(store,options={}) {
    const mine=personal(store);
    draft={store,rating:mine?.rating||0,tags:[...(mine?.tags||[])],photos:[...(mine?.images||[])],content:mine?.content||'',authorName:mine?.authorName,
      visit:options.visit||null,planId:options.planId||null,recordVisit:Boolean(options.recordVisit||options.visit),visitId:options.visit?.id||crypto.randomUUID(),fromResult:Boolean(document.getElementById('modal')?.open&&document.getElementById('storeReviews')),busy:false};
    root.showModal(root.modalTop('记录与评价')+draftBody(store));
    syncPreview();
  }
  function syncStars() {
    document.querySelectorAll('[data-rv-star]').forEach(button => {
      const n = +button.dataset.rvStar;
      button.classList.toggle('on', n <= draft.rating);
      button.setAttribute('aria-checked', String(n === draft.rating));
    });
    const label = document.getElementById('rvRateText');
    if (label) label.textContent = RATE_TEXT[draft.rating]||'待评分';
  }
  function syncPreview() {
    const box = document.getElementById('rvPreview');
    if (!box) return;
    box.innerHTML = draft.photos.map((photo, i) => `<span class="rv-preview-item"><img src="${esc(photo)}" alt="评价图片 ${i + 1} 预览"><button type="button" data-rv-unpick="${i}" aria-label="移除第 ${i + 1} 张图片">×</button></span>`).join('');
  }

  async function compressPhoto(file) {
    if (!/^image\//.test(file.type || '')) throw new Error('请选择图片文件');
    if (file.size > 12 * 1024 * 1024) throw new Error('这张图片太大了，请换一张');
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new Error('这张图片无法读取');
    let side = 1200, quality = 0.82;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length * 0.75 <= PHOTO_BYTES) { bitmap.close?.(); return url; }
      side = Math.round(side * 0.8); quality = Math.max(0.5, quality - 0.08);
    }
    bitmap.close?.();
    throw new Error('图片压缩后仍然偏大，请换一张');
  }

  async function shrinkAvatar(dataUrl) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl || '')) return '';
    const image = new Image();
    image.src = dataUrl;
    await image.decode().catch(() => {});
    if (!image.width || !image.height) return '';
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(96 / image.width, 96 / image.height);
    const width = image.width * scale, height = image.height * scale;
    ctx.drawImage(image, (96 - width) / 2, (96 - height) / 2, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function submitForm() {
    if(!draft||draft.busy)return;
    const form=document.getElementById('reviewForm');if(!form)return;
    const value=id=>document.getElementById(id)?.value||'';
    const publish=document.getElementById('rvPublish').checked,visited=Boolean(draft.recordVisit||document.getElementById('rvVisited')?.checked);
    const content=value('rvContent').trim(),name=(appState()?.username||'用户1').trim()||'用户1',date=value('rvVisitDate'),price=value('rvVisitPrice');
    const error=document.getElementById('rvError'),say=message=>{if(error)error.textContent=message;};
    if(visited&&(!date||date>root.today()))return say('请选择有效的到访日期');
    if(price!==''&&(!Number.isFinite(Number(price))||Number(price)<0))return say('请填写有效的人均花费');
    const actualPrice=price===''?null:Math.round(Number(price)*100)/100;
    if(publish&&!draft.rating)return say('发布前请选择星级');
    if(publish&&[...content].length<5)return say('公开评价至少写 5 个字');
    if(!draft.rating&&!content&&!visited)return say('请评分、填写评价或记录一次到访');
    const active=draft,store=active.store,key=storeKey(store),records=personalRecords(),old=Model.get(records,store);
    const values={rating:active.rating,content,tags:active.tags.slice(),images:active.photos.slice(),actualPrice,authorName:name,updatedAt:new Date().toISOString()};
    const changed=!old||['rating','content','tags','images','actualPrice','authorName'].some(field=>JSON.stringify(old[field])!==JSON.stringify(values[field]));
    values.publicPending=Boolean(old?.publicPending||changed);
    const next=Model.put(records,store,values);
    const visits=visited?Model.visit(appState().visits,store,{id:active.visitId,date,price:actualPrice,note:value('rvPrivateNote'),planId:active.planId},active.visit):null;
    const plans=visited&&active.planId?Model.finishPlan(appState().outings,active.planId,active.visitId):null;
    try { Model.commit(localStorage,next,visits,plans);if(plans)appState().outings=plans;if(visits){appState().visits=visits;active.visit=visits.find(v=>v.id===active.visitId);} }
    catch {return say('本机保存失败，请检查浏览器存储空间');}
    active.busy=true;const button=document.getElementById('rvSubmit');button.disabled=true;button.textContent=publish?'正在发布…':'正在保存…';say('');
    try {
      if(publish) {
        const remote=await api('/api/reviews?'+new URLSearchParams({poiId:key,device:deviceId()})),mine=remote.myReview;
        const avatar=await shrinkAvatar(appState()?.avatar||'');
        const payload={...meta(store),rating:active.rating,content,tags:active.tags,actualPrice,images:active.photos.filter(image=>image.startsWith('data:')),device:deviceId(),author:{name,avatar}};
        if(!mine&&active.photos.some(image=>!image.startsWith('data:')))throw new Error('原评价图片已失效，请重新选择图片');
        if(mine){payload.reviewId=mine.id;payload.keepImages=active.photos.filter(image=>!image.startsWith('data:'));}
        const published=await api('/api/reviews',{method:mine?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const latest=personalRecords(),sameRevision=Model.get(latest,store)?.updatedAt===values.updatedAt;
        const synced=Model.put(latest,store,{...(sameRevision?{...values,images:published.images}:{}),publicId:published.id,remoteUpdatedAt:published.updatedAt,publicPending:!sameRevision});
        Model.commit(localStorage,synced);
      }
      if(draft!==active||document.getElementById('reviewForm')!==form){cache.delete(key);return;}
      const fromResult=active.fromResult;draft=null;cache.delete(key);
      document.dispatchEvent(new CustomEvent('doux:review-saved'));
      document.getElementById('modal')?.close();root.render();
      root.toast?.(publish?'记录已保存，评价已发布':'已保存，仅自己可见');
      const last=appState()?.last;
      if(fromResult&&last&&storeKey(last)===key)setTimeout(()=>root.detail(last,Boolean(appState()?.detailWon)),40);
    } catch(err) {
      say('本机记录已保存，站内同步失败：'+err.message);
      if(document.getElementById('reviewForm')===form){button.disabled=false;button.textContent='保存记录与评价';}
      active.busy=false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
    if(data.rvPlan!==undefined){if(current)addPlan(current.store);return;}
    if(data.rvVisitPlan){const item=(appState().outings||[]).find(item=>item.id===data.rvVisitPlan&&item.status==='planned');if(item)openForm(item.store,{recordVisit:true,planId:item.id});return;}
    if(data.rvViewPlan){const item=(appState().outings||[]).find(item=>item.id===data.rvViewPlan);if(item)root.detail(item.store,false);return;}
    if(data.rvCancelPlan){const next=Model.cancelPlan(appState().outings,data.rvCancelPlan);if(root.save('outings-v1',next)){appState().outings=next;root.render();}return;}
    if (data.rvWrite !== undefined) { if (current) openForm(current.store); return; }
    if (data.rvSort) { if (current) { current.sort = data.rvSort; current.page = 1; load(1); } return; }
    if (data.rvTag !== undefined) { if (current) { current.tag = data.rvTag; current.page = 1; load(1); } return; }
    if (data.rvMore !== undefined) { if (current) load(current.page + 1, {append: true}); return; }
    if (data.rvRetry !== undefined) { if (current) load(1); return; }
    if (data.rvLike) {
      const id = data.rvLike, target = current?.data?.reviews?.find(item => item.id === id);
      if (!target) return;
      target.liked = !target.liked; target.likes = Math.max(0, target.likes + (target.liked ? 1 : -1));
      render();
      api('/api/reviews/like', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({reviewId: id, device: deviceId()})})
        .then(result => { target.likes = result.likes; target.liked = result.liked; render(); })
        .catch(() => { target.liked = !target.liked; target.likes = Math.max(0, target.likes + (target.liked ? 1 : -1)); render(); root.toast?.('点赞失败，请重试'); });
      return;
    }
    if (data.rvStar) { if (draft) { draft.rating = +data.rvStar; syncStars(); } return; }
    if (data.rvTagpick) {
      if (!draft) return;
      const tag = data.rvTagpick;
      if (draft.tags.includes(tag)) draft.tags = draft.tags.filter(item => item !== tag);
      else if (draft.tags.length >= 4) return root.toast?.('最多选 4 个标签');
      else draft.tags.push(tag);
      button.classList.toggle('on', draft.tags.includes(tag));
      return;
    }
    if (data.rvUnpick !== undefined) { if (draft) { draft.photos.splice(+data.rvUnpick, 1); syncPreview(); } return; }
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'rvContent') return;
    const counter = document.getElementById('rvCount');
    if (counter) counter.textContent = String([...event.target.value].length);
  });

  document.addEventListener('change', async event => {
    if(event.target.id==='rvVisited'){document.getElementById('rvVisitFields').hidden=!draft?.recordVisit&&!event.target.checked;return;}
    if(event.target.id==='rvPublish'){document.getElementById('rvSubmit').textContent=event.target.checked?'保存并发布':'保存记录与评价';return;}
    if (event.target.id !== 'rvPhotos' || !draft) return;
    const files = [...(event.target.files || [])];
    event.target.value = '';
    for (const file of files) {
      if (draft.photos.length >= PHOTO_LIMIT) { root.toast?.('最多 3 张图片'); break; }
      try { draft.photos.push(await compressPhoto(file)); }
      catch (error) { root.toast?.(error.message); }
    }
    syncPreview();
  });

  document.addEventListener('submit', event => {
    if (event.target.id !== 'reviewForm') return;
    event.preventDefault();
    submitForm();
  });

  // Navigation restores DOM snapshots; reconnect the review controller and its unsaved draft.
  function snapshot() {
    return {
      form: document.getElementById('reviewForm') && draft ? {...draft, tags: draft.tags.slice(), photos: draft.photos.slice(), busy: false} : null,
      list: document.getElementById('storeReviews') && current ? {store: current.store, showExample:current.showExample, sort: current.sort, tag: current.tag, page: current.page, data: current.data} : null
    };
  }
  function restore(saved) {
    if (document.getElementById('reviewForm') && saved?.form) {
      draft = {...saved.form, tags: saved.form.tags.slice(), photos: saved.form.photos.slice(), busy: false};
      syncStars(); syncPreview();
      document.querySelectorAll('[data-rv-tagpick]').forEach(button => button.classList.toggle('on', draft.tags.includes(button.dataset.rvTagpick)));
      document.getElementById('rvVisitFields').hidden=!draft.recordVisit&&!document.getElementById('rvVisited')?.checked;
      const counter = document.getElementById('rvCount');
      if (counter) counter.textContent = String([...(document.getElementById('rvContent')?.value || '')].length);
      const button = document.getElementById('rvSubmit');
      if (button) { button.disabled = false; button.textContent = document.getElementById('rvPublish')?.checked?'保存并发布':'保存记录与评价'; }
    } else {
      const el = document.getElementById('storeReviews');
      if (el && saved?.list) {
        current = {...saved.list, el, loading: false};
        render();
        if (!current.data || current.page === 1) load(1);
      }
    }
  }
  root.DouxReviews = {mount, openForm, snapshot, restore, labelFor, hydrateVisits, planButton, renderPlans, compressPhoto, TAGS, PHOTO_LIMIT};
  root.addEventListener('storage',event=>{
    if(event.key==='doux-visits'){try{const visits=JSON.parse(event.newValue||'[]');if(Array.isArray(visits))appState().visits=visits;}catch{}}
    if(event.key==='doux-outings-v1'){try{const plans=JSON.parse(event.newValue||'[]');if(Array.isArray(plans))appState().outings=plans;}catch{}}
    if(!['doux-my-reviews-v1','doux-visits','doux-outings-v1'].includes(event.key))return;
    if(current?.el?.isConnected)render();
    if(appState()?.page==='visits'&&!document.getElementById('modal')?.open)root.render();
  });
})(window);
