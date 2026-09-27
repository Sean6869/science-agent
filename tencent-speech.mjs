import {createHash,createHmac,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
const sign=(key,value)=>createHmac('sha256',key).update(value).digest();
export function splitSpeech(text){
 const chunks=[];
 while(text){let end=Math.min(140,text.length);if(text.length>140){const cut=Math.max(...Array.from('。！？；',mark=>text.lastIndexOf(mark,139)));if(cut>=0)end=cut+1;}chunks.push(text.slice(0,end));text=text.slice(end);}
 return chunks;
}
export function speechHeaders(payload,id,key,now=Math.floor(Date.now()/1000)){
 const date=new Date(now*1000).toISOString().slice(0,10),scope=`${date}/tts/tc3_request`;
 const canonical=`POST\n/\n\ncontent-type:application/json\nhost:tts.tencentcloudapi.com\n\ncontent-type;host\n${hash(payload)}`;
 const signature=sign(sign(sign(sign('TC3'+key,date),'tts'),'tc3_request'),`TC3-HMAC-SHA256\n${now}\n${scope}\n${hash(canonical)}`).toString('hex');
 return {'Content-Type':'application/json','X-TC-Action':'TextToVoice','X-TC-Version':'2019-08-23','X-TC-Timestamp':String(now),Authorization:`TC3-HMAC-SHA256 Credential=${id}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`};
}
export function pcmWave(pcm){
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
export function createSpeech({directory,voice=101026,env=process.env,request=fetch}){
 const pending=new Map();
 return async function audio(input){
  const text=String(input||'').replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').trim();
  if(!text)throw Object.assign(new Error('播报内容为空'),{status:400});
  const file=resolve(directory,hash(JSON.stringify({text,voice,rate:16000,version:1}))+'.wav');
  try{return await readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(pending.has(file))return pending.get(file);
  const task=(async()=>{
   const id=env.TENCENTCLOUD_SECRET_ID?.trim(),key=env.TENCENTCLOUD_SECRET_KEY?.trim();
   if(!id||!key)throw Object.assign(new Error('请在 Railway 配置腾讯云语音密钥'),{status:503});
   const chunks=await Promise.all(splitSpeech(text).map(async segment=>{
    const payload=JSON.stringify({Text:segment,SessionId:randomUUID(),VoiceType:voice,Codec:'pcm',SampleRate:16000,PrimaryLanguage:1,Speed:0,Volume:0});
    const response=await request('https://tts.tencentcloudapi.com/',{method:'POST',headers:speechHeaders(payload,id,key),body:payload,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Object.assign(new Error('腾讯云语音服务暂不可用'),{status:502});
    const result=(await response.json()).Response;
    if(result?.Error)throw Object.assign(new Error(`腾讯云语音合成失败（${result.Error.Code}）`),{status:502});
    if(typeof result?.Audio!=='string'||!result.Audio)throw new Error('腾讯云未返回音频');
    const pcm=Buffer.from(result.Audio,'base64');if(!pcm.length||pcm.length%2)throw new Error('腾讯云返回的音频无效');return pcm;
   }));
   const wav=pcmWave(Buffer.concat(chunks));await mkdir(directory,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,wav);await rename(temp,file);return wav;
  })();pending.set(file,task);
  try{return await task;}finally{pending.delete(file);}
 };
}
