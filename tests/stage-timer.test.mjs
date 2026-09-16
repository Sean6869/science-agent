import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceTimer,createStageTimers,formatTime,pauseTimer,remainingSeconds,resetTimer,startTimer} from '../public/stage-timer.js';

test('stage timer uses an absolute deadline and survives delayed ticks',()=>{
 const timer=createStageTimers([1],300)[1];
 assert.equal(startTimer(timer,1000),true);
 assert.equal(remainingSeconds(timer,31000),270);
 assert.equal(remainingSeconds(timer,181500),120);
 pauseTimer(timer,181500);
 assert.equal(timer.remainingSeconds,120);
 assert.equal(timer.running,false);
 startTimer(timer,200000);
 assert.equal(remainingSeconds(timer,230000),90);
});

test('last-minute warning and finish fire exactly once',()=>{
 const timer=createStageTimers([1],300)[1];
 startTimer(timer,0);
 assert.deepEqual(advanceTimer(timer,239000),{remaining:61,warning:false,finished:false});
 assert.deepEqual(advanceTimer(timer,240000),{remaining:60,warning:true,finished:false});
 assert.deepEqual(advanceTimer(timer,241000),{remaining:59,warning:false,finished:false});
 assert.deepEqual(advanceTimer(timer,300000),{remaining:0,warning:false,finished:true});
 assert.deepEqual(advanceTimer(timer,301000),{remaining:0,warning:false,finished:false});
});

test('reset applies teacher duration and time formatting is stable',()=>{
 const timer=createStageTimers([1])[1];
 resetTimer(timer,8*60);
 assert.equal(timer.durationSeconds,480);
 assert.equal(formatTime(480),'08:00');
 assert.equal(formatTime(59.2),'01:00');
 assert.equal(formatTime(0),'00:00');
});
