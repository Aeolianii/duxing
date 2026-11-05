// Run locally, then deploy city-covers.json and assets/cities together.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const root = __dirname;
const userAgent = 'Duxing/1.0 (https://github.com/Aeolianii/duxing)';
const plain = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#(?:x([a-f0-9]+)|(\d+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).trim();
async function request(url) {
  const response = await fetch(url, {headers: {'User-Agent': userAgent}, signal: AbortSignal.timeout(20000), redirect: 'error'});
  if (!response.ok) throw Error('HTTP ' + response.status);
  return response;
}
async function query(host, params) {
  const url = new URL('https://' + host + '/w/api.php');
  url.search = new URLSearchParams({action: 'query', format: 'json', ...params});
  return (await request(url)).json();
}
async function main() {
  const indexPath = path.join(root, 'city-covers.json');
  let index = {};
  try { index = JSON.parse(await fs.readFile(indexPath, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.join(root, 'assets/cities'), {recursive: true});
  const cities = process.argv.slice(2);
  if (!cities.length) throw Error('请提供城市名称，例如 node update-city-covers.cjs 杭州 上海');
  for (const input of cities) {
    const city = input.replace(/市$/, '');
    if (!/^[\p{Script=Han}·]{2,24}$/u.test(city)) throw Error('无效城市名称');
    try {
      const data = await query('zh.wikipedia.org', {titles: city + '市', prop: 'pageimages', piprop: 'name', redirects: '1', pilicense: 'free'});
      const page = Object.values(data.query?.pages || {})[0];
      if (!page?.pageimage) throw Error('无可用封面');
      const details = await query('commons.wikimedia.org', {titles: 'File:' + page.pageimage, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960'});
      const info = Object.values(details.query?.pages || {})[0]?.imageinfo?.[0];
      const meta = info?.extmetadata;
      const license = plain(meta?.LicenseShortName?.value);
      if (!/^(CC BY(?:-SA)? [1-4]\.0|CC0|Public domain)$/i.test(license) || !meta.Artist?.value) throw Error('许可或作者信息不完整');
      const remote = new URL(info.thumburl);
      if (remote.protocol !== 'https:' || !remote.hostname.endsWith('.wikimedia.org')) throw Error('无效图片地址');
      const response = await request(remote);
      const type = response.headers.get('content-type')?.split(';')[0];
      const ext = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[type];
      if (!ext || Number(response.headers.get('content-length')) > 5000000) throw Error('图片格式或大小不合适');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 5000000) throw Error('图片过大');
      const file = createHash('sha256').update(bytes).digest('hex').slice(0, 24) + '.' + ext;
      await fs.writeFile(path.join(root, 'assets/cities', file), bytes);
      index[city] = {url: '/assets/cities/' + file, name: page.pageimage, author: plain(meta.Artist.value), license, licenseURL: meta.LicenseUrl?.value || info.descriptionurl, source: info.descriptionurl};
      // Save each successful import so interruption never loses prior cities.
      await fs.writeFile(indexPath + '.tmp', JSON.stringify(index, null, 2) + '\n');
      await fs.rename(indexPath + '.tmp', indexPath);
      console.log(city, license, bytes.length);
    } catch (error) { console.error(city, error.message); process.exitCode = 1; }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
