import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessons} from '../lessons.mjs';
import {presetKnowledge} from '../knowledge-agent.mjs';
import {presetFeedback} from '../metacognitive-agent.mjs';
test('every typical question has a preset concept answer and unknown questions have course guidance',()=>{
 for(const lesson of lessons){
  for(const text of lesson.questions){const reply=presetKnowledge(text,lesson.id);assert.equal(reply.source,'static');assert.doesNotMatch(reply.content,/暂时|重试|选择本课典型问题/);}
  const reply=presetKnowledge('一个还没收录的问题',lesson.id);assert.match(reply.content,/同伴/);assert.doesNotMatch(reply.content,/重试|连上|服务/);
 }
 assert.match(presetKnowledge('请给出完整凸透镜成像规律和焦距公式','geometric-optics-basics').content,/记录多组/);
});
test('static inquiry feedback covers every submission stage without fabricating a grade or service failure',()=>{
 for(const stage of [1,2,3,5,6])for(const kind of ['content','self_assessment'])for(const attempt of [1,2,3]){
  const reply=presetFeedback({stage,kind,attempt});assert.match(reply,/自我评价：/);assert.match(reply,/老师的评价：/);assert.ok(reply.includes(`还剩${3-attempt}次`));assert.doesNotMatch(reply,/暂时不可用|重试|服务恢复|⭐/);
 }
});
