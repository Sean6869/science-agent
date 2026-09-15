import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNarrator} from '../public/narration.js';

function audioDouble(source) {
 const listeners={};
 return {source,currentTime:12,paused:false,preload:'',addEventListener(type,fn){listeners[type]=fn;},play(){listeners.playing();},pause(){this.paused=true;},emit(type){listeners[type]?.();}};
}

test('stage narration plays packaged audio and reports playback state',()=>{
 const audio=[],states=[];
 const narrator=createNarrator({createAudio:source=>{const item=audioDouble(source);audio.push(item);return item;},onState:value=>states.push(value)});
 assert.equal(narrator.play('/audio/stage-1.mp3'),true);
 assert.equal(audio[0].source,'/audio/stage-1.mp3');
 assert.equal(audio[0].preload,'auto');
 assert.equal(narrator.isPlaying(),true);
 audio[0].emit('ended');
 assert.equal(narrator.isPlaying(),false);
 assert.deepEqual(states,[false,true,false]);
});

test('entering another stage stops and rewinds the previous audio',()=>{
 const audio=[];
 const narrator=createNarrator({createAudio:source=>{const item=audioDouble(source);audio.push(item);return item;}});
 narrator.play('/audio/stage-1.mp3');
 narrator.play('/audio/stage-2.mp3');
 assert.equal(audio[0].paused,true);
 assert.equal(audio[0].currentTime,0);
 assert.equal(narrator.isPlaying(),true);
 narrator.stop();
 assert.equal(audio[1].paused,true);
 assert.equal(audio[1].currentTime,0);
});
