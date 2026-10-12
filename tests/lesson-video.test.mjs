import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codapanPlayUrl,rewriteCodapanPlaylist} from '../codapan-video.mjs';

test('Codapan page exposes only a trusted HLS lesson stream',()=>{
 const url=codapanPlayUrl('<script>var playUrl = "https://www.codapan.com/play/video/2026-10/12/example/index.m3u8";</script>');
 assert.equal(url.href,'https://www.codapan.com/play/video/2026-10/12/example/index.m3u8');
 for(const html of ['',`var playUrl = "https://example.com/play/video/x/index.m3u8"`,`var playUrl = "https://www.codapan.com/private/file.m3u8"`])assert.throws(()=>codapanPlayUrl(html));
});

test('Codapan playlist is rewritten to authenticated same-origin assets',()=>{
 const source='#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n#EXTINF:8.0,\n0000.ts\n#EXT-X-ENDLIST\n';
 assert.equal(rewriteCodapanPlaylist(source,'bending-light'),'#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="/api/lesson-video/bending-light/key.key"\n#EXTINF:8.0,\n/api/lesson-video/bending-light/0000.ts\n#EXT-X-ENDLIST\n');
 assert.throws(()=>rewriteCodapanPlaylist('#EXTM3U\n../secret.ts','bending-light'));
});
