import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conclusionTasks,conclusionFieldCount,formatConclusion,evaluateConclusion,formatConclusionEvaluation,migrateConclusionFields} from '../public/conclusion-form.js';

test('each lesson has a complete validated conclusion worksheet',()=>{
 for(const [lessonId,task] of Object.entries(conclusionTasks)){
  assert.equal(task.sections.length,lessonId==='bending-light'?4:2,lessonId);
  const fields=task.sections.flatMap(section=>section.fields);
  assert.equal(fields.length,conclusionFieldCount(lessonId));
  const values=fields.map(field=>field.options?.[0]||'任务单记录：第一组与第二组有一致趋势');
  const result=formatConclusion(lessonId,values);
  assert.match(result,/实验结论一/);
  assert.match(result,/实验结论二/);
  if(fields.some(field=>!field.options))assert.match(result,/任务单记录/);
  assert.ok(formatConclusion(lessonId,fields.map(field=>field.options?.[0]||'观'.repeat(200))).length<=2000);
  assert.throws(()=>formatConclusion(lessonId,values.slice(1)),/全部结论空格/);
  assert.throws(()=>formatConclusion(lessonId,values.map((value,index)=>index===0?'':value)),/全部结论空格/);
 }
});

test('the convex-lens worksheet contains only guided selections',()=>{
 const fields=conclusionTasks['geometric-optics-basics'].sections.flatMap(section=>section.fields);
 assert.ok(fields.every(field=>Array.isArray(field.options)));
 assert.ok(fields.every(field=>field.label!=='支持结论的任务单数据'));
});

test('refraction feedback checks every blank in the added third and fourth conclusions',()=>{
 const fields=conclusionTasks['bending-light'].sections.flatMap(section=>section.fields);
 const values=fields.map(field=>field.options?.[0]||'入射角30度与60度的两组实验数据');
 assert.equal(evaluateConclusion('bending-light',formatConclusion('bending-light',values)).correct,true);
 for(let index=6;index<fields.length;index++){
  const wrong=[...values];wrong[index]=fields[index].options[1];
  const result=evaluateConclusion('bending-light',formatConclusion('bending-light',wrong));
  assert.equal(result.correct,false,fields[index].label);
  assert.match(result.errors.join(''),index<10?/实验结论三/:/实验结论四/);
 }
});

test('every template blank is rendered once and old evidence fields migrate without shifting answers',()=>{
 for(const task of Object.values(conclusionTasks))for(const section of task.sections){
  assert.deepEqual([...section.template.matchAll(/\{(\d+)\}/g)].map(match=>Number(match[1])),section.fields.map((_,index)=>index));
  assert.ok(section.fields.every(field=>field.options));
 }
 assert.deepEqual(migrateConclusionFields('bending-light',Array.from({length:15},(_,index)=>String(index))),['0','1','2','4','5','6','8','9','10','11','12','13','14']);
 assert.deepEqual(migrateConclusionFields('energy-skate-park',Array.from({length:13},(_,index)=>String(index))),['0','1','3','4','5','6','7','8','9','10','11','12']);
 assert.deepEqual(migrateConclusionFields('bending-light',['增大','小于','靠近','旧证据','增大']),['增大','小于','靠近','增大']);
 assert.deepEqual(migrateConclusionFields('bending-light',['增大','小于','靠近','增大'],2),['增大','小于','靠近','增大']);
});

test('each incorrect selection is rejected in every lesson, including fixed conditions',()=>{
 for(const [lessonId,task] of Object.entries(conclusionTasks)){
  const fields=task.sections.flatMap(section=>section.fields),answers=fields.map(field=>field.options[0]);
  assert.equal(evaluateConclusion(lessonId,formatConclusion(lessonId,answers)).correct,true);
  fields.forEach((field,index)=>{const wrong=[...answers];wrong[index]=field.options[1];assert.equal(evaluateConclusion(lessonId,formatConclusion(lessonId,wrong)).correct,false,`${lessonId} ${field.label}`);});
 }
});

test('submitted conclusions follow the task-sheet sentence templates',()=>{
 const bending=conclusionTasks['bending-light'].sections.flatMap(section=>section.fields);
 const bendingText=formatConclusion('bending-light',bending.map(field=>field.options?.[0]||'入射角30°时折射角20°，入射角60°时折射角40°'));
 assert.match(bendingText,/当光线从空气斜射入水中时：随着入射角增大，折射角增大，折射角小于入射角。折射光线靠近法线/);
 assert.match(bendingText,/当光线从水中斜射入空气中时：随着入射角增大，折射角增大，折射角大于入射角。折射光线远离法线/);
 assert.match(bendingText,/折射率小的介质斜射入折射率大的介质时，折射角小于入射角，折射光线靠近法线/);
 assert.match(bendingText,/折射率大的介质斜射入折射率小的介质时，折射角大于入射角，折射光线远离法线/);
 assert.match(bendingText,/垂直射向水面\/玻璃时，光线的传播方向不改变，此时入射角为0度，折射角为0度/);

 const geometric=conclusionTasks['geometric-optics-basics'].sections.flatMap(section=>section.fields);
 const geometricText=formatConclusion('geometric-optics-basics',geometric.map(field=>field.options[0]));
 assert.match(geometricText,/在固定焦距不变的条件下：当物体离凸透镜的距离大于一倍焦距时/);
 assert.match(geometricText,/像距越大，像的大小越大/);
 assert.match(geometricText,/像与物体左右颠倒，上下颠倒/);
 assert.match(geometricText,/像与物体左右不颠倒，上下不颠倒/);
 assert.match(geometricText,/像与物体在凸透镜的同侧/);

 const energy=conclusionTasks['energy-skate-park'].sections.flatMap(section=>section.fields);
 const energyText=formatConclusion('energy-skate-park',energy.map(field=>field.options?.[0]||'质量60kg、速度10m\/s时动能3000J'));
 assert.match(energyText,/在固定物体速度不变的条件下：物体的质量越大，动能越大/);
 assert.match(energyText,/在无摩擦（摩擦力=0）的条件下/);
 assert.match(energyText,/总能量（动能\+势能\+热能）不变/);
});

test('stage five feedback judges fixed conclusion answers instead of asking for metacognitive self-assessment',()=>{
 const fields=conclusionTasks['geometric-optics-basics'].sections.flatMap(section=>section.fields);
 const correctText=formatConclusion('geometric-optics-basics',fields.map(field=>field.options[0]));
 assert.equal(evaluateConclusion('geometric-optics-basics',correctText).correct,true);
 const correctFeedback=formatConclusionEvaluation('geometric-optics-basics',correctText,1);
 assert.match(correctFeedback,/结论判定：✅ 结论正确/);
 assert.doesNotMatch(correctFeedback,/自我评价|请回顾|你们会评几星/);
 assert.match(formatConclusionEvaluation('geometric-optics-basics',correctText,3),/本环节还剩0次内容提交机会/);

 const wrongText=correctText.replace('像距越大','像距越小');
 const wrong=evaluateConclusion('geometric-optics-basics',wrongText);
 assert.equal(wrong.correct,false);
 assert.match(formatConclusionEvaluation('geometric-optics-basics',wrongText,1),/结论判定：❌ 结论需要订正/);
 assert.match(formatConclusionEvaluation('geometric-optics-basics',wrongText,1),/物距大于一倍焦距时/);
});
