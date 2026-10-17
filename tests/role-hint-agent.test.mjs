import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRoleHintMessages,fallbackPersonalizedRoleHint,parsePersonalizedRoleHint,pretestProfile} from '../role-hint-agent.mjs';
import {roleHints} from '../public/role-hints.js';

test('pretest profile selects the expected support band',()=>{
 assert.equal(pretestProfile([{quizId:'a',score:30},{quizId:'b',score:40}]).band,'foundational');
 assert.equal(pretestProfile([{quizId:'a',score:60},{quizId:'b',score:60}]).band,'developing');
 assert.equal(pretestProfile([{quizId:'a',score:90},{quizId:'b',score:80}]).band,'advanced');
});

test('fallback role reminder keeps the template, name, role, record duty and encouragement',()=>{
 const template=roleHints[2],profile=pretestProfile([{quizId:'lesson-1',score:60}]);
 const hint=fallbackPersonalizedRoleHint({template,studentName:'蒋泽宇',role:'记录与质疑员',profile});
 assert.match(hint.prompt,/蒋泽宇/);
 assert.match(hint.prompt,/记录与质疑员/);
 assert.match(hint.prompt,/自变量、因变量、无关变量/);
 assert.match(hint.record,/蒋泽宇.*记录.*实验任务单/);
 assert.match(hint.encouragement,/蒋泽宇/);
 assert.doesNotMatch(Object.values(hint).join(''),/60|developing|前测分数/);
});

test('model prompt uses private pretest data without exposing it in the response',()=>{
 const payload={template:roleHints[0],studentName:'许博文',role:'领航发言员',profile:pretestProfile([{quizId:'lesson-1',score:80}])};
 const messages=buildRoleHintMessages(payload);
 assert.match(messages[0].content,/不能删除、替换或改变模板/);
 assert.match(messages[0].content,/不要在输出中透露分数/);
 assert.match(messages[1].content,/许博文/);
 const parsed=parsePersonalizedRoleHint(JSON.stringify({prompt:'许博文，你担任领航发言员，请先提出清楚的科学问题。',record:'许博文，请提醒同伴记录到实验任务单。',encouragement:'许博文，你的清楚表达会帮助小组继续前进！'}),payload);
 assert.equal(parsed.source,'model');
 assert.throws(()=>parsePersonalizedRoleHint(JSON.stringify({prompt:'请提出问题。',record:'请记录。',encouragement:'加油！'}),payload),/Incomplete personalized role hint/);
});
