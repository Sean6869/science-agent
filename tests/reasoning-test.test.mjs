import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReasoningScoringMessages,parseReasoningScore,reasoningTest} from '../reasoning-test.mjs';

test('science reasoning test contains five questions and an auditable 100-point rubric prompt',()=>{
 assert.equal(reasoningTest.questions.length,5);
 const answers=Object.fromEntries(reasoningTest.questions.map(question=>[question.id,`回答${question.id}`]));
 const prompt=buildReasoningScoringMessages(answers);
 assert.match(prompt[0].content,/每题0至20分/);
 assert.match(prompt[0].content,/总分必须等于五题之和/);
 for(const question of reasoningTest.questions)assert.match(prompt[1].content,new RegExp(`学生回答：回答${question.id}`));
});

test('science reasoning scoring validates every item and derives the total from item scores',()=>{
 const items=['1','2','3','4','5'].map((id,index)=>({id,score:12+index,reason:'可复核的评分依据'}));
 assert.deepEqual(parseReasoningScore({items,total:99}),{items,total:70});
 assert.throws(()=>parseReasoningScore({items:items.slice(0,4),total:54}),/Invalid reasoning score/);
 assert.throws(()=>parseReasoningScore({items:items.map(item=>item.id==='3'?{...item,score:21}:item),total:75}),/Invalid reasoning score item/);
});
