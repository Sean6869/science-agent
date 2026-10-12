import {Readable} from 'node:stream';

const CODAPAN_ORIGIN='https://www.codapan.com';
const ASSET_PATTERN=/^(?:index\.m3u8|key\.key|\d{4}\.ts)$/;

export function codapanPlayUrl(html){
 const match=String(html).match(/\bvar\s+playUrl\s*=\s*["']([^"']+)["']/);
 if(!match)throw Object.assign(new Error('视频地址暂不可用'),{status:502});
 const url=new URL(match[1],CODAPAN_ORIGIN);
 if(url.origin!==CODAPAN_ORIGIN||!url.pathname.startsWith('/play/video/')||!url.pathname.endsWith('/index.m3u8'))throw Object.assign(new Error('视频地址无效'),{status:502});
 return url;
}

export function rewriteCodapanPlaylist(source,lessonId){
 const route=asset=>`/api/lesson-video/${encodeURIComponent(lessonId)}/${asset}`;
 return String(source)
  .replace(/URI="([^"]+)"/g,(_,asset)=>{if(!ASSET_PATTERN.test(asset))throw Object.assign(new Error('视频清单包含无效资源'),{status:502});return `URI="${route(asset)}"`;})
  .split(/\r?\n/)
  .map(line=>line&&!line.startsWith('#')?(ASSET_PATTERN.test(line)?route(line):(()=>{throw Object.assign(new Error('视频清单包含无效分片'),{status:502});})()):line)
  .join('\n');
}

export function createCodapanVideoProxy({lessons,fetchImpl=globalThis.fetch}){
 const resolved=new Map();
 async function playUrl(lesson){
  const cached=resolved.get(lesson.id);if(cached&&cached.expiresAt>Date.now())return cached.promise;
  const promise=(async()=>{
   const response=await fetchImpl(lesson.videoPage,{headers:{'user-agent':'Mozilla/5.0 (compatible; XiaokeLessonPlayer/1.0)'},signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Object.assign(new Error('视频页面暂不可用'),{status:502});
   return codapanPlayUrl(await response.text());
  })().catch(error=>{resolved.delete(lesson.id);throw error;});
  resolved.set(lesson.id,{promise,expiresAt:Date.now()+300000});return promise;
 }
 return async function serve(req,res,url){
  const match=url.pathname.match(/^\/api\/lesson-video\/([^/]+)\/(index\.m3u8|key\.key|\d{4}\.ts)$/);
  if(!match)return false;
  if(req.method!=='GET'&&req.method!=='HEAD')throw Object.assign(new Error('不支持此请求'),{status:405});
  if(req.schoolUser?.role!=='student')throw Object.assign(new Error('请使用学生账号'),{status:403});
  const lesson=lessons.find(item=>item.id===decodeURIComponent(match[1]));
  if(!lesson)throw Object.assign(new Error('课程视频不存在'),{status:404});
  const asset=match[2],manifest=await playUrl(lesson),upstreamUrl=new URL(asset,manifest);
  const headers={'user-agent':'Mozilla/5.0 (compatible; XiaokeLessonPlayer/1.0)'};
  if(req.headers.range)headers.range=req.headers.range;
  const upstream=await fetchImpl(upstreamUrl,{headers,signal:AbortSignal.timeout(30000)});
  if(!upstream.ok){resolved.delete(lesson.id);throw Object.assign(new Error('视频内容暂不可用'),{status:502});}
  if(asset==='index.m3u8'){
   const playlist=rewriteCodapanPlaylist(await upstream.text(),lesson.id);
   res.writeHead(200,{'content-type':'application/vnd.apple.mpegurl; charset=utf-8','cache-control':'private, max-age=300','x-content-type-options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:playlist);return true;
  }
  const responseHeaders={'content-type':asset==='key.key'?'application/octet-stream':'video/mp2t','cache-control':'private, max-age=86400','x-content-type-options':'nosniff'};
  for(const name of ['content-length','content-range','accept-ranges']){const value=upstream.headers.get(name);if(value)responseHeaders[name]=value;}
  res.writeHead(upstream.status,responseHeaders);if(req.method==='HEAD'||!upstream.body){res.end();return true;}Readable.fromWeb(upstream.body).pipe(res);return true;
 };
}
