import test from 'node:test';
import assert from 'node:assert/strict';
import {assessmentsByLesson,assessmentsForLesson} from '../public/content.js';

test('stage four offers three lesson-specific assessment choices and replies',()=>{
 assert.deepEqual(Object.keys(assessmentsByLesson),['bending-light','geometric-optics-basics','energy-skate-park']);
 for(const choices of Object.values(assessmentsByLesson)){
  assert.deepEqual(choices.map(choice=>choice.id),['needs_revision','partial','sufficient']);
  assert.ok(choices.every(choice=>choice.detail&&choice.reply));
 }
 assert.match(assessmentsForLesson('bending-light')[0].reply,/入射角/);
 assert.match(assessmentsForLesson('geometric-optics-basics')[0].reply,/u>2f/);
 assert.match(assessmentsForLesson('energy-skate-park')[0].reply,/质量对动能的影响/);
 assert.deepEqual(assessmentsForLesson('unknown'),[]);
});
