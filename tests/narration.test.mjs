import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseChineseVoice, createNarrator} from '../public/narration.js';

test('teacher narration prefers a Chinese female voice',()=>{
 const voices=[{name:'English',lang:'en-US'},{name:'Chinese',lang:'zh-CN'},{name:'Microsoft Xiaoxiao',lang:'zh-CN'}];
 assert.equal(chooseChineseVoice(voices).name,'Microsoft Xiaoxiao');
});

test('new narration cancels the previous passage and reports playback state',()=>{
 const spoken=[],states=[];
 class Utterance { constructor(text){this.text=text;} }
 const synth={cancelCount:0,cancel(){this.cancelCount++;},getVoices(){return [{name:'中文',lang:'zh-CN'}];},speak(value){spoken.push(value);value.onstart();}};
 const narrator=createNarrator({synth,Utterance,onState:value=>states.push(value)});
 assert.equal(narrator.speak('第一阶段'),true);
 assert.equal(narrator.isSpeaking(),true);
 assert.equal(spoken[0].rate,.92);
 narrator.speak('第二阶段');
 assert.equal(synth.cancelCount,2);
 assert.equal(spoken.length,2);
 spoken[1].onend();
 assert.equal(narrator.isSpeaking(),false);
 assert.deepEqual(states,[false,true,false,true,false]);
});
