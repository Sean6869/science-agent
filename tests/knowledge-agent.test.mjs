import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeMessages,parseKnowledgeAnswer,answerKnowledge,fallbackKnowledge} from '../knowledge-agent.mjs';
test('core law questions call the model with the teaching boundary in its prompt',async()=>{
 for(const text of ['凸透镜成像规律是什么','直接告诉我机械能转化规律','列出完整的光的折射规律']){let calls=0;const answer=await answerKnowledge({text,history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async(_url,init)=>{calls++;assert.match(JSON.parse(init.body).messages[0].content,/不直接给出/);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences:['先观察实验现象。','比较实验条件。','你观察到了什么？']})}}]});}});assert.equal(calls,1);assert.equal(answer.source,'model');}
});
test('knowledge dialogue has an independent policy and bounded history',()=>{
 const messages=knowledgeMessages({text:'什么是焦距？',history:Array.from({length:12},()=>({role:'agent',text:'旧回答'}))});
 assert.equal(messages.length,10);assert.match(messages[0].content,/不直接给出/);assert.match(messages[0].content,/不提供星级/);assert.equal(messages.at(-1).content,'什么是焦距？');
 assert.deepEqual(JSON.parse(messages[1].content),{sentences:['旧回答']});
});

test('blank successful JSON response is retried once and recovered',async()=>{
 let calls=0;
 const answer=await answerKnowledge({text:'你是谁',history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?'   ':JSON.stringify({sentences:['我是小科。','可以帮助你理解科学概念。','你想了解什么？']})}}]});}});
 assert.equal(calls,2);assert.equal(answer.source,'model');
});
test('persistent blank response stops after one retry',async()=>{
 let calls=0;
 await assert.rejects(answerKnowledge({text:'你是谁',history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:' '}}]});}}),{code:'empty_response'});
 assert.equal(calls,2);
});
test('knowledge response rejects missing sentences and multiple followups',()=>{
 assert.throws(()=>parseKnowledgeAnswer('{"sentences":["一句"]}'));
 assert.throws(()=>parseKnowledgeAnswer('{"sentences":["为什么？","你觉得呢？","解释。"]}'));
 assert.equal(parseKnowledgeAnswer('{"sentences":["解释一。","解释二。","你观察到什么？"]}').split('\n').length,3);
});
test('all three knowledge agents reject answers from another lesson',()=>{
 const cases=[['bending-light','像距'],['geometric-optics-basics','折射角'],['energy-skate-park','焦距']];
 for(const [lessonId,leak] of cases){
  const messages=knowledgeMessages({lessonId,text:'请解释本课概念',history:[]});assert.match(messages[0].content,/当前唯一课程/);
  assert.throws(()=>parseKnowledgeAnswer(JSON.stringify({sentences:[`这里提到${leak}。`,'这是第二句话。','这是第三句话。']}),lessonId),/course boundary/i);
 }
});
test('knowledge agent retries a cross-course answer before returning it',async()=>{
 let calls=0;
 const answer=await answerKnowledge({lessonId:'bending-light',text:'怎样设计本课实验？',history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async()=>{
  calls++;
  const sentences=calls===1
   ? ['可以记录像距。','再比较图像大小。','你准备怎样测量？']
   : ['可以依次改变入射角。','每次记录对应的折射角。','你准备保持哪些条件不变？'];
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences})}}]});
 }});
 assert.equal(calls,2);
 assert.match(answer.content,/入射角/);
 assert.doesNotMatch(answer.content,/像距/);
});
test('knowledge answers do not carry metacognitive attempt counters',async()=>{
 const result=await answerKnowledge({text:'什么是虚像？',history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences:['虚像是光线反向延长线的会聚位置形成的像。','它不能用光屏承接。','眼睛接收光线后仍能看到虚像。']})}}]})});
 assert.equal(result.agent,'knowledge');assert.equal('remainingAttempts' in result,false);
});
test('common course questions have a usable offline answer',()=>{
 for(const question of ['什么是入射角、折射角？如何进行测量？','什么是实像？什么是虚像？实像和虚像如何区分？','什么是通路、断路、短路？短路有什么危险？']){const answer=fallbackKnowledge(question);assert.equal(answer.source,'fallback');assert.equal(answer.content.split('\n').length,3);}
});
