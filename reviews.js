'use strict';
// 站内用户评价：结果页的大众点评式评价区 + 写评价弹层。
// 只展示真实提交到本机服务的内容；没有任何内置或伪造的评价。
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

  function deviceId() {
    let id = '';
    try { id = localStorage.getItem('doux-device') || ''; } catch {}
    if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = (crypto.randomUUID && crypto.randomUUID()) || 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('doux-device', id); } catch {}
    }
    return id;
  }
  const storeKey = store => String(store.poiId || store.id || '');
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

  function shell(store) {
    const demo = store.source !== 'amap';
    return `<div class="rv-panel-head"><h3>🗣 用户评价</h3><button class="btn secondary small" data-rv-write>写评价</button></div>
      <p class="rv-note">${demo ? '演示／自选门店：评价保存在这台服务器，仅代表本站用户，不是平台的真实评价。' : '来自本站用户的真实体验，写之前请先确认你去过这里。'}</p>
      <div class="rv-body" aria-live="polite"><p class="muted">正在读取评价…</p></div>`;
  }

  function summaryHTML(data) {
    const s = data.summary;
    if (!s.count) return '';
    const bars = [5, 4, 3, 2, 1].map(star => {
      const n = s.histogram[star] || 0, percent = s.count ? Math.round(n / s.count * 100) : 0;
      return `<div class="rv-hist-row"><span>${star} 星</span><div class="rv-bar"><i style="width:${percent}%"></i></div><small>${n}</small></div>`;
    }).join('');
    return `<div class="rv-summary">
      <div class="rv-score"><strong>${s.average.toFixed(1)}</strong>${scoreStars(s.average)}
        <small>共 ${s.count} 条评价${s.photos ? ` · ${s.photos} 张图片` : ''}</small></div>
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
        <div class="grow"><strong>${esc(review.author.name)}${review.mine ? ' <small class="rv-mine">我的评价</small>' : ''}</strong>
          <span class="rv-item-score"><span class="rv-stars-inline" aria-label="${review.rating} 星">${stars(review.rating)}</span><small>${dateText(review.createdAt)}</small></span></div>
      </div>
      <p class="rv-text">${esc(review.content)}</p>
      ${review.images.length ? `<div class="rv-photos">${review.images.map((src, i) => `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="${esc(review.author.name)}的评价图片 ${i + 1}" loading="lazy"></a>`).join('')}</div>` : ''}
      ${review.tags.length ? `<div class="rv-item-tags">${review.tags.map(tag => `<span class="rv-tag-pill">${esc(tag)}</span>`).join('')}</div>` : ''}
      <div class="rv-foot"><button class="rv-like ${review.liked ? 'on' : ''}" data-rv-like="${esc(review.id)}" aria-pressed="${review.liked ? 'true' : 'false'}">${review.liked ? '♥' : '♡'} 有用${review.likes ? ' · ' + review.likes : ''}</button></div>
    </article>`;
  }

  function render() {
    if (!current?.el) return;
    const {el, data} = current;
    const body = el.querySelector('.rv-body');
    if (!body) return;
    if (!data) { body.innerHTML = '<p class="muted">正在读取评价…</p>'; return; }
    const writeButton = `<button class="btn full ${data.summary.count ? 'outline' : ''}" data-rv-write>${data.summary.count ? '写下我的真实评价' : '写下第一条评价'}</button>`;
    if (!data.total && !current.tag) {
      body.innerHTML = `<div class="rv-empty"><b>还没有人评价过这里</b><p>你的第一条真实体验，会帮到下一个转到这里的人。</p>${writeButton}</div>`;
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
      ${writeButton}`;
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
      snapshot.page = page;
      snapshot.data = append && snapshot.data ? {...data, reviews: [...snapshot.data.reviews, ...data.reviews]} : data;
      cache.set(storeKey(snapshot.store), {at: Date.now(), data: snapshot.data});
      render();
    } catch (error) {
      if (current !== snapshot) return;
      const body = snapshot.el.querySelector('.rv-body');
      if (body) body.innerHTML = `<p class="muted">评价暂时读取失败：${esc(error.message)}</p><button class="btn outline small" data-rv-retry>重试</button>`;
    } finally {
      if (current === snapshot) snapshot.loading = false;
    }
  }

  function mount(store) {
    const el = document.getElementById('storeReviews');
    if (!el || !store) return;
    el.innerHTML = shell(store);
    current = {store, el, sort: 'helpful', tag: '', page: 1, data: null, loading: false};
    el.dataset.store = storeKey(store);
    const cached = cache.get(storeKey(store));
    if (cached && Date.now() - cached.at < 60000) { current.data = cached.data; render(); return; }
    load(1);
  }

  /* ---------- 写评价 ---------- */
  function draftBody(store) {
    const tags = TAGS[meta(store).activity];
    return `<form id="reviewForm" class="rv-form" data-store="${esc(storeKey(store))}" novalidate>
      <p class="rv-form-label">这家怎么样？</p>
      <div class="rv-rate" role="radiogroup" aria-label="评分">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="rv-star ${n <= draft.rating ? 'on' : ''}" data-rv-star="${n}" role="radio" aria-checked="${n === draft.rating}" aria-label="${n} 星">★</button>`).join('')}
        <b id="rvRateText">${RATE_TEXT[draft.rating]}</b></div>
      <p class="rv-form-label">选几个标签（最多 4 个）</p>
      <div class="chips rv-pick-tags">${tags.map(tag => `<button type="button" class="chip ${draft.tags.includes(tag) ? 'on' : ''}" data-rv-tagpick="${esc(tag)}">${esc(tag)}</button>`).join('')}</div>
      <p class="rv-form-label">说点具体的</p>
      <textarea id="rvContent" maxlength="${CONTENT_MAX}" rows="4" placeholder="吃了什么、环境怎么样、排队久不久……写你真实遇到的。" aria-label="评价内容"></textarea>
      <p class="muted rv-counter"><span id="rvCount">0</span> / ${CONTENT_MAX}</p>
      <div class="rv-photo-actions"><label class="btn outline small rv-upload">＋ 添加图片<input id="rvPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><small>最多 3 张，会自动压缩</small></div>
      <div id="rvPreview" class="rv-preview"></div>
      <label class="rv-name">昵称<input id="rvName" maxlength="20" value="${esc(appState()?.username || '用户1')}" aria-label="昵称"></label>
      <p class="muted rv-privacy">评价会公开显示给访问本站的所有人，包含昵称、评分、文字与图片；请只写你的真实体验。昵称可以随意填写。</p>
      <button class="btn full" id="rvSubmit" type="submit">发布评价</button>
      <p class="muted" id="rvError" role="alert"></p>
    </form>`;
  }

  function openForm(store) {
    draft = {store, rating: 5, tags: [], photos: [], busy: false};
    root.showModal(root.modalTop('✍️ 写一条真实评价') + draftBody(store));
  }

  function syncStars() {
    document.querySelectorAll('[data-rv-star]').forEach(button => {
      const n = +button.dataset.rvStar;
      button.classList.toggle('on', n <= draft.rating);
      button.setAttribute('aria-checked', String(n === draft.rating));
    });
    const label = document.getElementById('rvRateText');
    if (label) label.textContent = RATE_TEXT[draft.rating];
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
    if (!draft || draft.busy) return;
    const form = document.getElementById('reviewForm');
    if (!form) return;
    const content = (document.getElementById('rvContent')?.value || '').trim();
    const name = (document.getElementById('rvName')?.value || '').trim();
    const error = document.getElementById('rvError');
    const say = message => { if (error) error.textContent = message; };
    if (!draft.rating) return say('请先选一个星级');
    if ([...content].length < 5) return say('评价至少写 5 个字');
    if (!name) return say('请填写昵称');
    draft.busy = true;
    const button = document.getElementById('rvSubmit');
    if (button) { button.disabled = true; button.textContent = '正在发布…'; }
    say('');
    try {
      const avatar = await shrinkAvatar(appState()?.avatar || '');
      const saved = await api('/api/reviews', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...meta(draft.store), rating: draft.rating, content, tags: draft.tags, images: draft.photos, device: deviceId(), author: {name, avatar}})
      });
      const store = draft.store, key = storeKey(store);
      draft = null;
      document.dispatchEvent(new CustomEvent('doux:review-saved'));
      document.getElementById('modal')?.close();
      cache.delete(key);
      if (current && storeKey(current.store) === key) load(1);
      root.toast?.(saved.mine ? '评价已发布，谢谢你的真实分享' : '评价已发布');
      // 关掉表单后回到结果页，让用户立刻看到刚发布的评价。
      const last = appState()?.last;
      if (typeof root.detail === 'function' && last && storeKey(last) === key) {
        setTimeout(() => root.detail(last, Boolean(appState()?.detailWon)), 40);
      }
    } catch (err) {
      say(err.status === 409 ? '你已经评价过这家了，暂不支持重复评价' : err.message);
      if (button) { button.disabled = false; button.textContent = '发布评价'; }
      if (draft) draft.busy = false;
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    const data = button.dataset;
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
      list: document.getElementById('storeReviews') && current ? {store: current.store, sort: current.sort, tag: current.tag, page: current.page, data: current.data} : null
    };
  }
  function restore(saved) {
    if (document.getElementById('reviewForm') && saved?.form) {
      draft = {...saved.form, tags: saved.form.tags.slice(), photos: saved.form.photos.slice(), busy: false};
      syncStars(); syncPreview();
      document.querySelectorAll('[data-rv-tagpick]').forEach(button => button.classList.toggle('on', draft.tags.includes(button.dataset.rvTagpick)));
      const counter = document.getElementById('rvCount');
      if (counter) counter.textContent = String([...(document.getElementById('rvContent')?.value || '')].length);
      const button = document.getElementById('rvSubmit');
      if (button) { button.disabled = false; button.textContent = '发布评价'; }
    } else {
      const el = document.getElementById('storeReviews');
      if (el && saved?.list) {
        current = {...saved.list, el, loading: false};
        render();
        if (!current.data || current.page === 1) load(1);
      }
    }
  }
  root.DouxReviews = {mount, openForm, snapshot, restore, TAGS, PHOTO_LIMIT};
})(window);
