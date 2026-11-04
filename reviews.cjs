'use strict';
// 站内用户评价：JSON 落盘、纯本地存储、零依赖。
// 只保存用户主动提交的内容；启动时若存档损坏，会改名保留而不是直接删除。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TAGS = {
  food: ['味道好', '分量足', '性价比高', '环境舒服', '服务好', '干净卫生', '适合聚餐', '适合约会', '排队久', '有点贵', '太吵', '口味一般'],
  play: ['体验好', '设施新', '讲解到位', '性价比高', '环境舒服', '适合亲子', '适合朋友', '排队久', '有点贵', '工作人员友好', '项目丰富', '交通方便']
};
const ALL_TAGS = new Set([...TAGS.food, ...TAGS.play]);
const SORTS = new Set(['helpful', 'newest', 'lowest', 'highest']);
const LIMITS = {
  contentMin: 5, contentMax: 600, nameMax: 20, poiIdMax: 64, tags: 4,
  images: 3, imageBytes: 400 * 1024, imagesTotal: 900 * 1024, avatarBytes: 16 * 1024,
  records: 5000, pageSize: 30, reviewsPerHour: 30, likesPerHour: 300
};

function fail(status, message) { const error = new Error(message); error.status = status; return error; }
const charLength = value => [...value].length;
const stripControl = value => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

function cleanText(value, min, max, label) {
  const text = stripControl(typeof value === 'string' ? value : '').trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  if (charLength(text) < min) throw fail(400, label + '太短');
  if (charLength(text) > max) throw fail(400, label + '最多 ' + max + ' 个字');
  return text;
}
function cleanPoiId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw fail(400, '门店标识无效');
  return id;
}
function hashDevice(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw fail(400, '设备标识无效');
  return crypto.createHash('sha256').update('duxing|' + id).digest('hex').slice(0, 24);
}
function parseDataURL(value, maxBytes) {
  const match = typeof value === 'string' ? /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value.trim()) : null;
  if (!match) throw fail(400, '只支持 JPEG / PNG / WebP 图片');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw fail(400, '图片内容为空');
  if (buffer.length > maxBytes) throw fail(413, '单张图片不能超过 ' + Math.round(maxBytes / 1024) + 'KB');
  return {ext: match[1] === 'jpeg' ? 'jpg' : match[1], buffer};
}
function cleanTags(value, activity) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw fail(400, '标签格式无效');
  if (value.length > LIMITS.tags) throw fail(400, '最多选 ' + LIMITS.tags + ' 个标签');
  const tags = [];
  for (const raw of value) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (!ALL_TAGS.has(tag)) throw fail(400, '未知的标签：' + tag.slice(0, 12));
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}
function cleanAuthor(input) {
  const source = input && typeof input === 'object' ? input : {};
  const name = cleanText(source.name, 1, LIMITS.nameMax, '昵称');
  const avatar = source.avatar ? parseDataURL(source.avatar, LIMITS.avatarBytes) : null;
  return {name, avatar};
}
function cleanActualPrice(value) {
  if(value==null||(typeof value==='string'&&!value.trim()))return null;
  if(!['string','number'].includes(typeof value))throw fail(400,'请填写有效的人均金额');
  const amount=Number(value),cents=Math.round(amount*100);
  if(!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(cents))throw fail(400,'请填写有效的人均金额');
  return cents/100;
}

function toPublic(record, device) {
  return {
    id: record.id, rating: record.rating, content: record.content, tags: record.tags.slice(), actualPrice:record.actualPrice??null,
    images: record.images.map(name => '/uploads/' + name),
    author: {name: record.author.name, avatar: record.author.avatar ? '/uploads/' + record.author.avatar : ''},
    createdAt: record.createdAt, updatedAt: record.updatedAt || record.createdAt, likes: record.likedBy.length,
    liked: Boolean(device) && record.likedBy.includes(device),
    mine: Boolean(device) && record.device === device
  };
}

function summarize(records) {
  const histogram = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  const tags = new Map();
  let sum = 0, photos = 0;
  for (const record of records) {
    histogram[record.rating] = (histogram[record.rating] || 0) + 1;
    sum += record.rating;
    photos += record.images.length;
    for (const tag of record.tags) tags.set(tag, (tags.get(tag) || 0) + 1);
  }
  return {
    count: records.length,
    average: records.length ? Math.round(sum / records.length * 10) / 10 : 0,
    histogram,
    photos,
    tags: [...tags].map(([tag, count]) => ({tag, count})).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  };
}

const compare = {
  helpful: (a, b) => b.likedBy.length - a.likedBy.length || b.createdAt.localeCompare(a.createdAt),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  lowest: (a, b) => a.rating - b.rating || b.createdAt.localeCompare(a.createdAt),
  highest: (a, b) => b.rating - a.rating || b.createdAt.localeCompare(a.createdAt)
};

function createReviewStore({file, uploadDir, now = () => Date.now()} = {}) {
  if (!file || !uploadDir) throw new Error('评价存储需要 file 与 uploadDir');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.mkdirSync(uploadDir, {recursive: true});

  let records = load();
  const buckets = new Map();

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(parsed?.reviews) ? parsed.reviews : [];
      return list.filter(item => item && typeof item.id === 'string' && typeof item.poiId === 'string');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch {}
      console.warn('评价存档无法读取，已改名保留并重新开始：', error.message);
      return [];
    }
  }
  function persist() {
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({version: 1, reviews: records}), 'utf8');
    fs.renameSync(temporary, file);
  }
  function limited(ip, kind, cap) {
    const key = (ip || 'local') + '|' + kind, stamp = now(), window = 3600000;
    const list = (buckets.get(key) || []).filter(time => stamp - time < window);
    if (list.length >= cap) throw fail(429, '操作太频繁，请稍后再试');
    list.push(stamp); buckets.set(key, list);
  }
  function writeImage(reviewId, suffix, parsed) {
    const name = reviewId + '-' + suffix + '.' + parsed.ext;
    fs.writeFileSync(path.join(uploadDir, name), parsed.buffer);
    return name;
  }

  return {
    add(input = {}) {
      limited(input.ip, 'review', LIMITS.reviewsPerHour);
      if (records.length >= LIMITS.records) throw fail(507, '这台服务器的评价数量已达上限');
      const poiId = cleanPoiId(input.poiId);
      const activity = input.activity === 'play' ? 'play' : 'food';
      const rating = Number(input.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw fail(400, '评分需要 1 到 5 星');
      const content = cleanText(input.content, LIMITS.contentMin, LIMITS.contentMax, '评价内容');
      const actualPrice=cleanActualPrice(input.actualPrice);
      const tags = cleanTags(input.tags, activity);
      const device = hashDevice(input.device);
      const author = cleanAuthor(input.author);
      if (records.some(item => item.poiId === poiId && item.device === device)) throw fail(409, '你已经评价过这家了，感谢你的认真');

      const sourceImages = input.images == null ? [] : input.images;
      if (!Array.isArray(sourceImages)) throw fail(400, '图片格式无效');
      if (sourceImages.length > LIMITS.images) throw fail(400, '最多上传 ' + LIMITS.images + ' 张图片');
      const parsedImages = [];
      let total = 0;
      for (const item of sourceImages) {
        const parsed = parseDataURL(item, LIMITS.imageBytes);
        total += parsed.buffer.length;
        if (total > LIMITS.imagesTotal) throw fail(413, '图片总大小超出限制');
        parsedImages.push(parsed);
      }

      const id = crypto.randomUUID();
      const images = parsedImages.map((parsed, index) => writeImage(id, String(index + 1), parsed));
      const avatar = author.avatar ? writeImage(id, 'avatar', author.avatar) : '';
      const record = {
        id, poiId, activity, rating, content, tags, images, actualPrice,
        poiName: typeof input.poiName === 'string' ? input.poiName.trim().slice(0, 80) : '',
        city: typeof input.city === 'string' ? input.city.trim().slice(0, 40) : '',
        address: typeof input.address === 'string' ? input.address.trim().slice(0, 160) : '',
        author: {name: author.name, avatar},
        device, likedBy: [], createdAt: new Date(now()).toISOString()
      };
      records.push(record);
      persist();
      return toPublic(record, device);
    },
    update(input = {}) {
      limited(input.ip, 'review', LIMITS.reviewsPerHour);
      const device=hashDevice(input.device),record=records.find(item=>item.id===input.reviewId);
      if(!record)throw fail(404,'这条评价不存在');
      if(record.device!==device)throw fail(403,'只能修改自己的评价');
      if(input.poiId && cleanPoiId(input.poiId)!==record.poiId)throw fail(400,'门店信息不一致');
      const rating=Number(input.rating);
      if(!Number.isInteger(rating)||rating<1||rating>5)throw fail(400,'评分需要 1 到 5 星');
      const content=cleanText(input.content,LIMITS.contentMin,LIMITS.contentMax,'评价内容');
      const actualPrice=input.actualPrice===undefined?(record.actualPrice??null):cleanActualPrice(input.actualPrice);
      const tags=cleanTags(input.tags,record.activity),author=cleanAuthor(input.author);
      const keep=input.keepImages==null?record.images:input.keepImages;
      if(!Array.isArray(keep))throw fail(400,'保留图片格式无效');
      const kept=[...new Set(keep.map(name=>typeof name==='string'?name.replace(/^\/uploads\//,''):''))];
      if(kept.some(name=>!record.images.includes(name)))throw fail(400,'只能保留自己的评价图片');
      const added=input.images==null?[]:input.images;
      if(!Array.isArray(added)||kept.length+added.length>LIMITS.images)throw fail(400,'最多上传 3 张图片');
      const parsed=added.map(image=>parseDataURL(image,LIMITS.imageBytes));
      const total=kept.reduce((sum,name)=>sum+fs.statSync(path.join(uploadDir,name)).size,0)+parsed.reduce((sum,image)=>sum+image.buffer.length,0);
      if(total>LIMITS.imagesTotal)throw fail(413,'图片总大小超出限制');
      const revision=crypto.randomUUID(),images=[...kept,...parsed.map((image,index)=>writeImage(revision,String(index+1),image))];
      const avatar=author.avatar?writeImage(revision,'avatar',author.avatar):record.author.avatar;
      const next={...record,rating,content,tags,images,actualPrice,author:{name:author.name,avatar},updatedAt:new Date(now()).toISOString()};
      const index=records.indexOf(record);records[index]=next;
      try{persist();}catch(error){records[index]=record;throw error;}
      return toPublic(next,device);
    },
    like(input = {}) {
      limited(input.ip, 'like', LIMITS.likesPerHour);
      const device = hashDevice(input.device);
      const record = records.find(item => item.id === input.reviewId);
      if (!record) throw fail(404, '这条评价不存在或已被删除');
      const index = record.likedBy.indexOf(device);
      if (index >= 0) record.likedBy.splice(index, 1);
      else if (record.likedBy.length < 500) record.likedBy.push(device);
      persist();
      return {id: record.id, likes: record.likedBy.length, liked: index < 0};
    },
    list(input = {}) {
      const poiId = cleanPoiId(input.poiId);
      const sort = SORTS.has(input.sort) ? input.sort : 'helpful';
      const size = Math.min(LIMITS.pageSize, Math.max(1, Number.parseInt(input.limit, 10) || 10));
      const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
      let device = '';
      try { device = hashDevice(input.device); } catch {}
      const all = records.filter(item => item.poiId === poiId);
      const tag = typeof input.tag === 'string' && ALL_TAGS.has(input.tag.trim()) ? input.tag.trim() : '';
      const mine = tag ? all.filter(item => item.tags.includes(tag)) : all;
      const sorted = mine.slice().sort(compare[sort]);
      const start = (page - 1) * size;
      return {
        poiId, sort, tag, page, pageSize: size, total: sorted.length,
        summary: summarize(all),
        myReview: all.find(item=>device && item.device===device)?toPublic(all.find(item=>item.device===device),device):null,
        reviews: sorted.slice(start, start + size).map(item => toPublic(item, device)),
        hasMore: start + size < sorted.length
      };
    },
    summary(poiId) {
      return summarize(records.filter(item => item.poiId === cleanPoiId(poiId)));
    }
  };
}

module.exports = {createReviewStore, TAGS, LIMITS, parseDataURL, cleanTags, summarize, hashDevice};
