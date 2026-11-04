const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {createResearch} = require('./ai-service.cjs');

function loadConfig(root = __dirname) {
  let source = '';
  try { source = fs.readFileSync(path.join(root, '.env'), 'utf8'); } catch {}
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(FLI_BIN|AMADEUS_CLIENT_ID|AMADEUS_CLIENT_SECRET|AMAP_JS_KEY|AMAP_SECURITY_CODE|DEEPSEEK_API_KEY|DEEPSEEK_MODEL|TRAVEL_QUOTE_URL|TRAVEL_QUOTE_TOKEN)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return {fliBin:process.env.FLI_BIN||values.FLI_BIN,airKey:process.env.AMADEUS_CLIENT_ID||values.AMADEUS_CLIENT_ID,airSecret:process.env.AMADEUS_CLIENT_SECRET||values.AMADEUS_CLIENT_SECRET,quoteURL:process.env.TRAVEL_QUOTE_URL || values.TRAVEL_QUOTE_URL || '',quoteToken:process.env.TRAVEL_QUOTE_TOKEN || values.TRAVEL_QUOTE_TOKEN || '',key: process.env.AMAP_JS_KEY || values.AMAP_JS_KEY || '', security: process.env.AMAP_SECURITY_CODE || values.AMAP_SECURITY_CODE || '', deepseekKey:process.env.DEEPSEEK_API_KEY || values.DEEPSEEK_API_KEY || '', deepseekModel:process.env.DEEPSEEK_MODEL || values.DEEPSEEK_MODEL || 'deepseek-flash'};
}

function createServer({config = loadConfig(), fetcher = fetch} = {}) {
  const research=createResearch({config,fetcher}),optionResearch=createResearch({config,fetcher,allowOptions:true});
  const files = new Set(['index.html', 'style.css', 'app.js', 'core.js', 'amap-client.js', 'map-ui.js', 'discovery.js', 'ai-client.js', 'freewheel.js','travel-core.js','travel.js', 'assets/food.png', 'assets/play.png', 'assets/travel.png', 'assets/custom.png']);
  const types = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png'};
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const json = (status, data) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data));};
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(403, {error:'仅允许本机访问'});
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(403, {error:'不允许跨站请求'});
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403, {error:'不允许跨站请求'});
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return json(400, {error:'请求地址无效'}); }
    const travelRoute=/^\/api\/travel\/(discover|plan|quote|reviews)$/.exec(url.pathname);
    if(travelRoute && req.method==='POST'){
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(415,{error:'请使用 JSON'});
      try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return json(413,{error:'请求过大'});chunks.push(chunk);}
        return json(200,await require('./travel-service.cjs').travelAPI(travelRoute[1],JSON.parse(Buffer.concat(chunks)),config,fetcher));
      }catch(e){return json(400,{error:/^[\u4e00-\u9fff]/.test(e.message)?e.message:'查询失败，请重试'});}
    }
    if (['/api/store-research','/api/option-research'].includes(url.pathname) && req.method === 'POST') {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(415,{error:'请使用 JSON 请求'});
      try {
        const chunks=[];let size=0;
        for await (const chunk of req) {
          size+=chunk.length;
          if(size>8192)return json(413,{error:'请求内容过大'});
          chunks.push(chunk);
        }
        let input;
        try { input=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return json(400,{error:'JSON 格式无效'}); }
        return json(200,await (url.pathname==='/api/option-research'?optionResearch:research)(input));
      } catch(error) { return json(error.status || 502,{error:error.status?error.message:'资料检索暂时失败，请重试'}); }
    }
    if (req.method !== 'GET') return json(405, {error:'不支持的请求方法'});
    if (url.pathname === '/api/ai-config') return json(200,{configured:Boolean(config.deepseekKey),model:config.deepseekModel || 'deepseek-flash'});
    const configured = Boolean(config.key && config.security);
    if (url.pathname === '/api/map-config') return json(200, {configured, key:configured ? config.key : ''});
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
      res.writeHead(200, {'Content-Type':types[path.extname(name)]});
      res.end(body);
    });
  });
}
if (require.main === module) {
  const server = createServer();
  server.listen(5173, '127.0.0.1', () => console.log('都行: http://127.0.0.1:5173'));
  server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? '5173 端口已占用，请关闭旧服务再启动。' : error.message); process.exitCode = 1;});
}
module.exports = {createServer, loadConfig};
