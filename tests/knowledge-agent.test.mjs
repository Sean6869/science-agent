import {test} from 'node:test';
import assert from 'node:assert/strict';
import {knowledgeMessages,parseKnowledgeAnswer,answerKnowledge} from '../knowledge-agent.mjs';
test('direct requests for the full core law return inquiry guidance without a model call',async()=>{
 for(const text of ['凸透镜成像规律是什么','直接告诉我欧姆定律公式','列出完整的光的折射规律']){const answer=await answerKnowledge({text,history:[]},{fetchImpl:()=>{throw new Error('must not call');}});assert.equal(answer.source,'rule');assert.equal(answer.content.split('\n').length,3);}
});
test('knowledge dialogue has an independent policy and bounded history',()=>{
 const messages=knowledgeMessages({text:'什么是焦距？',history:Array.from({length:12},()=>({role:'agent',text:'旧回答'}))});
 assert.equal(messages.length,10);assert.match(messages[0].content,/不直接给出/);assert.match(messages[0].content,/不提供星级/);assert.equal(messages.at(-1).content,'什么是焦距？');
});
test('knowledge response rejects missing sentences and multiple followups',()=>{
 assert.throws(()=>parseKnowledgeAnswer('{"sentences":["一句"]}'));
 assert.throws(()=>parseKnowledgeAnswer('{"sentences":["为什么？","你觉得呢？","解释。"]}'));
 assert.equal(parseKnowledgeAnswer('{"sentences":["解释一。","解释二。","你观察到什么？"]}').split('\n').length,3);
});
test('knowledge answers do not carry metacognitive attempt counters',async()=>{
 const result=await answerKnowledge({text:'什么是虚像？',history:[]},{env:{DEEPSEEK_API_KEY:'test'},fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({sentences:['虚像是光线反向延长线的会聚位置形成的像。','它不能用光屏承接。','眼睛接收光线后仍能看到虚像。']})}}]})});
 assert.equal(result.agent,'knowledge');assert.equal('remainingAttempts' in result,false);
});
