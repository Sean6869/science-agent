import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSpeechTranscript} from '../public/speech-text.js';

test('speech recognition uses Chinese commas instead of sentence periods',()=>{
 assert.equal(normalizeSpeechTranscript('先改变入射角。再记录折射角．'),'先改变入射角，再记录折射角，');
});
