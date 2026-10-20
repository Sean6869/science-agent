import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conclusionTasks,conclusionFieldCount,formatConclusion} from '../public/conclusion-form.js';

test('each lesson has a two-part conclusion worksheet with complete validated output',()=>{
 for(const [lessonId,task] of Object.entries(conclusionTasks)){
  assert.equal(task.sections.length,2,lessonId);
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
