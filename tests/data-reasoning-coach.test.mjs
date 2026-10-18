import test from 'node:test';
import assert from 'node:assert/strict';
import {dataReasoningDialogues,shouldShowDataReasoningCoach} from '../public/data-reasoning-coach.js';

test('data reasoning coach is a two-page bridge from stage four to stage five',()=>{
 assert.equal(shouldShowDataReasoningCoach(4,5,false),true);
 assert.equal(shouldShowDataReasoningCoach(4,5,true),false);
 assert.equal(shouldShowDataReasoningCoach(3,5,false),false);
});

test('all three lessons provide two complete rule-based reasoning pages',()=>{
 assert.deepEqual(Object.keys(dataReasoningDialogues).sort(),['bending-light','energy-skate-park','geometric-optics-basics'].sort());
 for(const dialogue of Object.values(dataReasoningDialogues)){
  assert.equal(dialogue.pages.length,2);
  assert.ok(dialogue.goal);
  for(const page of dialogue.pages){
   assert.ok(page.method&&page.title&&page.instruction);
   assert.ok(page.questions.length>=1);
   for(const item of page.questions){
    assert.ok(item.options.length>=2);
    assert.equal(item.options.filter(option=>option.correct).length,1);
    assert.ok(item.correctFeedback);
   }
  }
 }
});

test('lesson-specific rules cover the intended scientific reasoning methods',()=>{
 assert.deepEqual(dataReasoningDialogues['bending-light'].pages.map(page=>page.method),['归纳推理','比较推理']);
 assert.deepEqual(dataReasoningDialogues['geometric-optics-basics'].pages.map(page=>page.method),['分类推理','归纳推理']);
 assert.deepEqual(dataReasoningDialogues['energy-skate-park'].pages.map(page=>page.method),['控制变量推理','守恒与转化推理']);
});
