import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
async function mount(locked){
 const lessons=[{id:'one',number:1,title:'第一课',url:'one'},{id:'two',number:2,title:'第二课',url:'two'},{id:'three',number:3,title:'第三课',url:'three'}],events={},nodes={};
 const node=()=>({hidden:false,classList:{add(){},remove(){}},addEventListener(){},append(){}});
 for(const id of ['lessonSelector','lab','loading','lessonArtwork','previousLesson','nextLesson'])nodes[id]=node();nodes.lab.parentElement=node();
 const window={addEventListener:(key,callback)=>events[key]=callback,dispatchEvent:event=>{events[event.type]?.(event);}},document={getElementById:id=>nodes[id],createElement:node},sessionStorage={getItem:()=> 'three',setItem(){}};
 let source=await readFile(new URL('../public/experiment-workspace.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?\n/,'');source=source.slice(0,source.indexOf('\nfunction createAngleTool')).replace('export async function','async function');
 const context={window,document,sessionStorage,fetch:async()=>({ok:true,json:async()=>({lessons:locked?[lessons[0]]:lessons,defaultLessonId:'one',currentLessonId:locked?'one':null})}),createLengthTool:()=>({reset(){}}),createAngleTool:()=>({reset(){}}),CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},setTimeout:()=>0,clearTimeout(){}};
 runInNewContext(source+'\nglobalThis.mount=createExperimentWorkspace;',context);await context.mount();return {window,nodes,events};
}
test('locked course ignores another cached course, arrows and stale group lesson events',async()=>{
 const view=await mount(true);assert.equal(view.window.__scienceLesson.id,'one');assert.equal(view.nodes.previousLesson.disabled,true);assert.equal(view.nodes.nextLesson.disabled,true);
 view.nodes.nextLesson.onclick();view.events['science:select-lesson']({detail:{lessonId:'two'}});assert.equal(view.window.__scienceLesson.id,'one');
});
test('free course selection retains cached choice and original arrow navigation',async()=>{
 const view=await mount(false);assert.equal(view.window.__scienceLesson.id,'three');assert.equal(view.nodes.nextLesson.disabled,false);view.nodes.nextLesson.onclick();assert.equal(view.window.__scienceLesson.id,'one');
 view.events['science:select-lesson']({detail:{lessonId:'two'}});assert.equal(view.window.__scienceLesson.id,'two');
});
