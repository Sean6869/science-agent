import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFeedbackMessages,fallbackConceptPrompt,formatStructuredFeedback,hasRequiredFeedbackStructure,isSelfAssessmentText,isStructuredFeedbackComplete,stageRubrics} from '../metacognitive-agent.mjs';
import {formatFeedbackForDisplay} from '../public/feedback-format.js';

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
 assert.match(messages[0].content,/hasConcepts/);
 assert.match(messages[0].content,/无法确定概念/);
 const data=JSON.parse(messages[1].content);
 assert.deepEqual(data.rubric.dimensions.map(d=>d.name),['可检验性','明确性','条件性']);
 assert.ok(Array.isArray(data.courseConcepts));
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
 const content=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'你们会给各维度几星，为什么？',ratings:[{dimension:'明确具体',stars:2,reason:'包含变量但关系方向不清'},{dimension:'可探究性',stars:3,reason:'可以操作物距并观察像'}],feedback:'请想一想怎样把变量关系写得更明确。',allThreeStars:false,hasConcepts:true,concepts:['物距'],relatedConcepts:['像距'],conceptPrompt:'你们的回答涉及“物距”，还可以联系相近的“像距”，可以点击左侧“小科”知识答疑进一步梳理它们的联系。'}),{stage:1,kind:'content',attempt:2});
 assert.equal(hasRequiredFeedbackStructure(content),true);
 assert.match(content,/明确具体⭐⭐/);
 assert.match(content,/老师的评价：\n明确具体⭐⭐（[^\n]+）；\n可探究性⭐⭐⭐/);
 assert.match(content,/还剩1次内容提交机会/);
 assert.match(content,/知识答疑提示：.*物距.*像距/);
 assert.throws(()=>formatStructuredFeedback('{"ratings":[]}',{stage:1,kind:'content',attempt:1}));
});

test('a directional science question is not marked as missing direction and quota text is not duplicated',()=>{
 const payload={lessonId:'energy-skate-park',stage:1,kind:'content',attempt:2,text:'物体的质量越大，动能会越大吗？'};
 const raw=JSON.stringify({selfAssessmentGuide:'请对照标准自评。',ratings:[{dimension:'明确具体',stars:2,reason:'问题提到质量和动能两个变量，但没有写清质量变化与动能变化的关系方向'},{dimension:'可探究性',stars:2,reason:'还需说明观察方法'}],feedback:'请把变量关系写得更明确。本环节还剩1次内容提交机会。',hasConcepts:false});
 const formatted=formatStructuredFeedback(raw,payload);
 assert.match(buildFeedbackMessages(payload)[0].content,/越大吗.*关系方向/);
 assert.match(formatted,/明确具体⭐⭐⭐（明确提出质量增大时动能是否增大的关系方向）/);
 assert.doesNotMatch(formatted,/没有写清|请把变量关系写得更明确/);
 assert.equal(formatted.match(/本环节还剩1次内容提交机会/g)?.length,1);
 assert.equal(isStructuredFeedbackComplete(raw,payload),false);
});

test('each lesson uses its own criteria and examples across all assessed stages',()=>{
 for(const [lessonId,expected,excluded] of [
  ['bending-light','入射角','像距|物距|凸透镜'],
  ['geometric-optics-basics','物距','入射角|动能'],
  ['energy-skate-park','能量|动能','像距|物距|入射角']
 ])for(const stage of [1,2,3,5,6]){
  const messages=buildFeedbackMessages({lessonId,stage,text:'我们的产出',attempt:1,conversation:[{role:'agent',text:'探究【其他课程内容】清晰'}]});
  const data=JSON.parse(messages[1].content);
  assert.match(JSON.stringify(data.rubric),new RegExp(expected));
  assert.doesNotMatch(JSON.stringify(data.rubric),new RegExp(excluded));
  assert.deepEqual(data.recentDialogue,[]);
  assert.match(messages[0].content,/当前课程由平台提供/);
  assert.match(messages[0].content,/不使用疑问句/);
  assert.doesNotMatch(messages[0].content,/量规/);
 }
});

test('legacy rating replies get separate lines and standard terminology without replacing concepts',()=>{
 const text='自我评价：请对照量规。\n老师的评价：明确具体⭐⭐⭐（研究重点清楚）；可探究性⭐⭐⭐（可以测量）。\n请继续。';
 const formatted=formatFeedbackForDisplay(text);
 assert.match(formatted,/请对照标准/);
 assert.match(formatted,/老师的评价：\n明确具体⭐⭐⭐（研究重点清楚）；\n可探究性⭐⭐⭐/);
 assert.equal(formatFeedbackForDisplay(formatted),formatted);
 assert.equal(formatFeedbackForDisplay('像距和焦距是不同的量。'),'像距和焦距是不同的量。');
 assert.equal(formatFeedbackForDisplay('请回顾哪一步思考帮助你们同时满足“明确具体”和“可探究性”这些标准呢？'),'请回顾帮助你们满足“明确具体”和“可探究性”这些标准的思考过程，并说明你们采用的方法。');
});

test('all-three-star feedback becomes a metacognitive reflection and closes the stage',()=>{
 const content=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'请逐项自评。',ratings:[{dimension:'观点明晰',stars:3,reason:'判断与理由清楚'},{dimension:'指向证据',stars:3,reason:'引用了具体记录'}],feedback:'模型提出了一条不应继续给出的修改建议。',allThreeStars:true,hasConcepts:false,concepts:[],relatedConcepts:[],conceptPrompt:''}),{stage:6,kind:'content',attempt:2});
 assert.match(content,/回顾帮助你们/);
 assert.match(content,/保存成果并进入下一环节/);
 assert.doesNotMatch(content.split('\n').at(-1),/[？?]/);
 assert.doesNotMatch(content,/修改建议/);
 assert.equal(isStructuredFeedbackComplete(JSON.stringify({ratings:[{stars:3},{stars:3}]})),true);
 assert.equal(isStructuredFeedbackComplete(JSON.stringify({ratings:[{stars:3},{stars:2}]})),false);
});

test('concept guidance appears only when the answer contains a lesson concept',()=>{
 assert.match(fallbackConceptPrompt({lessonId:'bending-light',text:'我们改变入射角并观察折射角。'}),/入射角.*折射角/);
 assert.equal(fallbackConceptPrompt({lessonId:'bending-light',text:'我们分工合作并认真记录。'}),'');
 assert.match(fallbackConceptPrompt({lessonId:'bending-light',text:'我们观察折射角。'}),/“折射角”.*“入射角”/);
 const withoutConcept=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'请逐项自评。',ratings:[{dimension:'明确具体',stars:2,reason:'任务步骤较清楚'},{dimension:'可探究性',stars:2,reason:'能够继续操作验证'}],feedback:'请补充具体的科学变量。',allThreeStars:false,hasConcepts:false,concepts:[],relatedConcepts:[],conceptPrompt:''}),{stage:1,kind:'content',attempt:1});
 assert.doesNotMatch(withoutConcept,/知识答疑提示/);
 const invalidPrompt=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'请逐项自评。',ratings:[{dimension:'明确具体',stars:2,reason:'包含变量'},{dimension:'可探究性',stars:2,reason:'可以验证'}],feedback:'继续完善。',allThreeStars:false,hasConcepts:true,concepts:['物距'],relatedConcepts:['像距'],conceptPrompt:'点击左侧小科。'}),{stage:1,kind:'content',attempt:1});
 assert.match(invalidPrompt,/老师的评价/);assert.doesNotMatch(invalidPrompt,/知识答疑提示/);
 const unrelated=formatStructuredFeedback(JSON.stringify({selfAssessmentGuide:'请逐项自评。',ratings:[{dimension:'明确具体',stars:2,reason:'包含变量'},{dimension:'可探究性',stars:2,reason:'可以验证'}],feedback:'继续完善。',allThreeStars:false,hasConcepts:true,concepts:['物距'],relatedConcepts:['像距'],conceptPrompt:'你们提到“物距”，可以联系“像距”。'}),{stage:1,kind:'content',attempt:1,lessonId:'geometric-optics-basics',text:'我们认真分工。'});
 assert.match(unrelated,/老师的评价/);assert.doesNotMatch(unrelated,/知识答疑提示/);
});
