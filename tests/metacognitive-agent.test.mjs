import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFeedbackMessages,formatStructuredFeedback,hasRequiredFeedbackStructure,isSelfAssessmentText,isStructuredFeedbackComplete,stageRubrics} from '../metacognitive-agent.mjs';

test('rubrics cover every assessed stage and omit evidence collection',()=>{
 assert.deepEqual(Object.keys(stageRubrics),['1','2','3','5','6']);
 assert.deepEqual(Object.fromEntries(Object.entries(stageRubrics).map(([id,r])=>[id,r.dimensions.length])),{1:2,2:3,3:3,5:3,6:2});
 for(const rubric of Object.values(stageRubrics))for(const item of rubric.dimensions){assert.ok(item.levels[1]);assert.ok(item.levels[2]);assert.ok(item.levels[3]);assert.ok(item.example);}
});

test('prompt is built from the selected rubric and enforces the response contract',()=>{
 const messages=buildFeedbackMessages({stage:2,kind:'content',attempt:2,text:'物距越小，像越大。',context:[]});
 assert.equal(messages.length,2);
 assert.match(messages[0].content,/第2次正式内容提交/);
 assert.match(messages[0].content,/只输出合法JSON/);
 assert.match(messages[0].content,/不直接代写修正答案/);
 const data=JSON.parse(messages[1].content);
 assert.deepEqual(data.rubric.dimensions.map(d=>d.name),['可检验性','明确性','条件性']);
});

test('short star-rating replies are self-assessments while scientific content is not',()=>{
 for(const text of ['我们认为可以达到2星','我觉得是⭐⭐','小组评为三颗星，因为变量很清楚'])assert.equal(isSelfAssessmentText(text),true);
 for(const text of ['在固定焦距时，物距越小，像越大。','请告诉我三星标准是什么',''])assert.equal(isSelfAssessmentText(text),false);
});

test('model feedback must preserve the three labelled sections',()=>{
 assert.equal(hasRequiredFeedbackStructure('自我评价：你们会评几星？\n老师的评价：明确性⭐⭐。\n请说明条件。'),true);
 assert.equal(hasRequiredFeedbackStructure('总体不错，请继续。'),false);
});

test('structured model data is converted to the fixed student-facing format',()=>{
 const content=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'你们会给各维度几星，为什么？',ratings:[{dimension:'明确具体',stars:2,reason:'包含变量但关系方向不清'},{dimension:'可探究性',stars:3,reason:'可以操作物距并观察像'}],feedback:'请想一想怎样把变量关系写得更明确。',allThreeStars:false}),{stage:1,kind:'content',attempt:2});
 assert.equal(hasRequiredFeedbackStructure(content),true);
 assert.match(content,/明确具体⭐⭐/);
 assert.match(content,/还剩1次内容提交机会/);
 assert.throws(()=>formatStructuredFeedback('{"ratings":[]}',{stage:1,kind:'content',attempt:1}));
});

test('all-three-star feedback becomes a metacognitive reflection and closes the stage',()=>{
 const content=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'请逐项自评。',ratings:[{dimension:'观点明晰',stars:3,reason:'判断与理由清楚'},{dimension:'指向证据',stars:3,reason:'引用了具体记录'}],feedback:'模型提出了一条不应继续给出的修改建议。',allThreeStars:true}),{stage:6,kind:'content',attempt:2});
 assert.match(content,/回顾哪一步思考/);
 assert.match(content,/保存成果并进入下一环节/);
 assert.doesNotMatch(content,/修改建议/);
 assert.equal(isStructuredFeedbackComplete(JSON.stringify({ratings:[{stars:3},{stars:3}]})),true);
 assert.equal(isStructuredFeedbackComplete(JSON.stringify({ratings:[{stars:3},{stars:2}]})),false);
});
