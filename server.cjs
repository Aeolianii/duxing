const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createResearch} = require('./ai-service.cjs');
const {createReviewStore} = require('./reviews.cjs');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
// 默认只允许本机访问；显式设置 HOST（例如 0.0.0.0）时才放开 Host 校验，方便同一局域网的人来写评价。
const LOCAL_ONLY = !process.env.HOST || /^(127\.0\.0\.1|localhost|::1)$/.test(process.env.HOST);

function loadConfig(root = __dirname) {
  let source = '';
  try { source = fs.readFileSync(path.join(root, '.env'), 'utf8'); } catch {}
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(AMAP_JS_KEY|AMAP_SECURITY_CODE|DEEPSEEK_API_KEY|DEEPSEEK_MODEL)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return {key: process.env.AMAP_JS_KEY || values.AMAP_JS_KEY || '', security: process.env.AMAP_SECURITY_CODE || values.AMAP_SECURITY_CODE || '', deepseekKey:process.env.DEEPSEEK_API_KEY || values.DEEPSEEK_API_KEY || '', deepseekModel: process.env.DEEPSEEK_MODEL || values.DEEPSEEK_MODEL || 'deepseek-flash'};
}

// 读取 JSON 请求体；limit 按接口区分，评价带图片时上限比检索接口大得多。
async function readJson(req, limit) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw Object.assign(new Error('请使用 JSON 请求'), {status: 415});
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求内容过大'), {status: 413});
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON 格式无效'), {status: 400});
  }
}

function createServer({config = loadConfig(), fetcher = fetch, reviews, uploadsDir = path.join(DATA_DIR, 'uploads')} = {}) {
  const research=createResearch({config,fetcher}),optionResearch=createResearch({config,fetcher,allowOptions:true});
  const reviewStore = reviews || createReviewStore({file: path.join(DATA_DIR, 'reviews.json'), uploadDir: uploadsDir});
  const files = new Set(['index.html', 'style.css', 'app.js', 'core.js', 'amap-client.js', 'map-ui.js', 'discovery.js', 'ai-client.js', 'wheel-motion.js', 'app-history.js', 'freewheel.js','travel-core.js','travel.js', 'assets/food.webp', 'assets/play.webp', 'assets/travel.webp', 'assets/custom.webp','review-model.js','reviews.js']);
  const types = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webp':'image/webp'};
  const uploadTypes = {'.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp'};
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const json = (status, data) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data));};
    if (LOCAL_ONLY && !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(403, {error:'仅允许本机访问'});
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, {error:'不允许跨站请求'});
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, {error:'不允许跨站请求'});
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return json(400, {error:'请求地址无效'}); }
    if (['/api/store-research','/api/option-research'].includes(url.pathname) && req.method === 'POST') {
      try {
        const input = await readJson(req, 8192);
        return json(200, await (url.pathname==='/api/option-research'?optionResearch:research)(input));
      } catch(error) { return json(error.status || 502,{error:error.status?error.message:'资料检索暂时失败，请重试'}); }
    }
    // 站内评价：列表走 GET，发布与点赞走 POST；图片与头像另存为文件，不塞进 JSON 存档。
    if (url.pathname === '/api/reviews' && req.method === 'GET') {
      try {
        return json(200, reviewStore.list({
          poiId: url.searchParams.get('poiId') || '',
          sort: url.searchParams.get('sort') || 'helpful',
          page: url.searchParams.get('page') || 1,
          limit: url.searchParams.get('limit') || 10,
          device: url.searchParams.get('device') || '',
          tag: url.searchParams.get('tag') || ''
        }));
      } catch (error) { return json(error.status || 500, {error: error.status ? error.message : '读取评价失败'}); }
    }
    if ((url.pathname === '/api/reviews' && ['POST','PUT'].includes(req.method)) || (url.pathname === '/api/reviews/like' && req.method === 'POST')) {
      try {
        const limit = url.pathname === '/api/reviews' ? 3 * 1024 * 1024 : 2048;
        const input = await readJson(req, limit);
        const result = url.pathname === '/api/reviews'
          ? reviewStore[req.method === 'PUT' ? 'update' : 'add']({...input, ip: req.socket.remoteAddress})
          : reviewStore.like({...input, ip: req.socket.remoteAddress});
        return json(200, result);
      } catch (error) { return json(error.status || 500, {error: error.status ? error.message : '评价保存失败，请重试'}); }
    }
    if (req.method !== 'GET') return json(405, {error:'不支持的请求方法'});
    if (url.pathname === '/api/ai-config') return json(200,{configured:Boolean(config.deepseekKey),model:config.deepseekModel || 'deepseek-flash'});
    const configured = Boolean(config.key && config.security);
    if (url.pathname === '/api/map-config') return json(200, {configured, key:configured ? config.key : ''});
    if (url.pathname.startsWith('/uploads/')) {
      const name = url.pathname.slice('/uploads/'.length);
      if (!/^[A-Za-z0-9_-]{8,80}\.(jpg|png|webp)$/.test(name)) return json(404, {error:'Not found'});
      return fs.readFile(path.join(uploadsDir, name), (error, body) => {
        if (error) return json(404, {error:'Not found'});
        res.writeHead(200, {'Content-Type': uploadTypes[path.extname(name)], 'Cache-Control': 'public, max-age=31536000, immutable'});
        res.end(body);
      });
    }
    if (url.pathname.startsWith('/_AMapService/')) {
      if (!configured) return json(503, {error:'尚未配置高德 Key 和安全密钥'});
      const targetPath = url.pathname.slice('/_AMapService'.length);
      if (!/^\/v[345]\/[a-zA-Z0-9_/-]+$/.test(targetPath)) return json(403, {error:'不支持的地图服务路径'});
      const target = new URL(targetPath, 'https://restapi.amap.com');
      target.search = url.search;
      const callback=target.searchParams.get('callback');
      if(callback&&!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback)) return json(400,{error:'无效的回调名称'});
      target.searchParams.set('key', config.key);
      target.searchParams.set('jscode', config.security);
      try {
        const upstream = await fetcher(target, {signal:AbortSignal.timeout(15000), redirect:'error'});
        const content = await upstream.text();
        const diagnostic=content.match(/"info"\s*:\s*"([A-Z_]+)"/);
        if(diagnostic&&diagnostic[1]!=='OK') console.warn('AMap service:',targetPath,diagnostic[1]);
        const safe = content.split(config.security).join('[redacted]');
        // AMap returns JSONP with application/json. With nosniff, the browser
        // refuses to execute it unless the proxy sends the JavaScript MIME type.
        res.writeHead(upstream.status, {'Content-Type':callback?'application/javascript; charset=utf-8':upstream.headers.get('content-type') || 'application/json; charset=utf-8'});
        return res.end(safe);
      } catch { return json(502, {error:'高德服务暂时不可用，请稍后重试'}); }
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!files.has(name)) return json(404, {error:'Not found'});
    fs.readFile(path.join(__dirname, name), (error, body) => {
      if (error) return json(404, {error:'Not found'});
      // Revalidate code on every visit; illustrations may be reused for an hour.
      // Content hashes also detect edits made within the same filesystem timestamp.
      const etag = '"'+createHash('sha256').update(body).digest('hex').slice(0,24)+'"';
      res.setHeader('Cache-Control', name.startsWith('assets/') ? 'public, max-age=3600' : 'public, max-age=0, must-revalidate');
      res.setHeader('ETag', etag);
      const tags=(req.headers['if-none-match'] || '').split(',').map(value=>value.trim().replace(/^W\//,''));
      if(tags.includes(etag)||tags.includes('*')) {res.writeHead(304);return res.end();}
      res.writeHead(200, {'Content-Type':types[path.extname(name)]});
      res.end(body);
    });
  });
}
if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT) || 5173;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`都行: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`));
  server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? `${port} 端口已占用，请关闭旧服务再启动。` : error.message); process.exitCode = 1;});
}
module.exports = {createServer, loadConfig};
