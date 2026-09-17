import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanEnvValue,completeFeedback,deepseekConfig} from '../deepseek.mjs';

test('default request explicitly disables thinking and exposes only final content', async () => {
 const messages = [{role:'user',content:'物距改变时，像的大小如何变化？'}];
 const result = await completeFeedback(messages, {env:{DEEPSEEK_API_KEY:'test-key'}, fetchImpl:async(url, init)=>{
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.deepEqual(body.thinking, {type:'disabled'});
  assert.equal(body.max_tokens, 700);
  assert.deepEqual(body.messages, messages);
  assert.equal(body.stream, false);
  return Response.json({choices:[{finish_reason:'stop',message:{content:' 请补充观察条件。 ',reasoning_content:'private reasoning'}}]});
 }});
 assert.equal(result, '请补充观察条件。');
});

test('structured feedback requests DeepSeek JSON output',async()=>{
 await completeFeedback([{role:'user',content:'输出JSON'}],{env:{DEEPSEEK_API_KEY:'test'},responseFormat:{type:'json_object'},fetchImpl:async(_url,init)=>{
  assert.deepEqual(JSON.parse(init.body).response_format,{type:'json_object'});
  return Response.json({choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]});
 }});
});

test('legacy models migrate while explicit thinking settings take precedence', () => {
 for (const name of ['deepseek-chat','deepseek-reasoner','deepseek-v4-flash','deepseek-v4-flash-vision-exp']) {
  assert.equal(deepseekConfig({DEEPSEEK_MODEL:name}).model, 'deepseek-flash');
 }
 const config=deepseekConfig({DEEPSEEK_MODEL:'deepseek-reasoner'});
 assert.deepEqual(config.thinking,{type:'enabled'});
 assert.equal(config.reasoning_effort,'low');
 assert.equal(config.max_tokens,8192);
 assert.equal('temperature' in config,false);
 assert.equal(deepseekConfig({DEEPSEEK_MODEL:'deepseek-reasoner',DEEPSEEK_THINKING:'disabled'}).thinking.type,'disabled');
 assert.equal(deepseekConfig({DEEPSEEK_MODEL:'deepseek-v4-pro'}).model,'deepseek-v4-pro');
 assert.throws(()=>deepseekConfig({DEEPSEEK_MODEL:'typo'}));
 assert.throws(()=>deepseekConfig({DEEPSEEK_THINKING:'yes'}));
});

test('Railway values tolerate accidental straight and Chinese quotation marks',async()=>{
 assert.equal(cleanEnvValue(' “deepseek-flash” '),'deepseek-flash');
 assert.deepEqual(deepseekConfig({DEEPSEEK_MODEL:'“deepseek-flash”',DEEPSEEK_THINKING:'”disabled”',DEEPSEEK_REASONING_EFFORT:'“low”'}).thinking,{type:'disabled'});
 await completeFeedback([],{env:{DEEPSEEK_API_KEY:'“test-key”'},fetchImpl:async(_url,init)=>{assert.equal(init.headers.authorization,'Bearer test-key');return Response.json({choices:[{finish_reason:'stop',message:{content:'ok'}}]});}});
});

test('truncated, empty, malformed and failed replies are rejected', async()=>{
 const responses=[
  ()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}),
  ()=>Response.json({choices:[{finish_reason:'stop',message:{content:'',reasoning_content:'thinking only'}}]}),
  ()=>Response.json(null),
  ()=>new Response('not JSON'),
  ...[401,402,429,500,503].map(status=>()=>new Response('',{status})),
  ()=>{throw new DOMException('Timed out','TimeoutError');}
 ];
 for (const fetchImpl of responses) await assert.rejects(completeFeedback([], {env:{DEEPSEEK_API_KEY:'test'},fetchImpl}));
});
