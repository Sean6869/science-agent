import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldShowHalfwayEncouragement} from '../public/stage-milestone.js';

test('halfway encouragement appears only on the first transition from stage three to four',()=>{
 assert.equal(shouldShowHalfwayEncouragement(3,4,false),true);
 assert.equal(shouldShowHalfwayEncouragement(3,4,true),false);
 assert.equal(shouldShowHalfwayEncouragement(2,4,false),false);
 assert.equal(shouldShowHalfwayEncouragement(4,3,false),false);
});
