import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {setImmediate as flush} from 'node:timers/promises';

class Element{
 constructor(){this.children=[];this.dataset={};this.value='';this.isConnected=true;this.classList={add(){}};}
 set textContent(text){this.text=String(text);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(child=>child.textContent||'').join('');}
 append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
 replaceChildren(...children){this.text='';this.children=[];this.append(...children);}
 setAttribute(){}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 querySelector(selector){return selector==='[data-export]'?this.children.find(child=>child.dataset.export):null;}
}
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};};
async function views(api){
 const screen=new Element(),actions=new Element();screen.querySelector=selector=>selector==='.management-actions'?actions:null;
 const intervals=[],fixture={api},document={getElementById:()=>screen,createElement:()=>new Element()};
 let source=await readFile(new URL('../public/school.js',import.meta.url),'utf8');
 source=source.replace(/^import .*;\r?\n/gm,'').replace('export async function apiFetch','async function apiFetch');
 source=source.slice(0,source.lastIndexOf('\nboot().catch'));
 const context={document,fixture,Intl,Date,Map,Set,encodeURIComponent,setInterval:callback=>{intervals.push(callback);return intervals.length;},clearInterval(){}};
 runInNewContext(source+'\napi=fixture.api;identity={role:"admin"};selectedClass="class-a";globalThis.views={progressPanel,conversationsPanel};',context);
 return {...context.views,actions,intervals};
}

test('a late dashboard refresh cannot change the selected student-account view',async()=>{
 const delayed=deferred();let loads=0,current=true;
 const report={lessonId:'bending-light',lessons:[{id:'bending-light',number:1}],rows:[]};
 const harness=await views(async url=>url.includes('inquiry-clear-requests')?{requests:[]}:(++loads===1?report:delayed.promise));
 const panel=new Element(),filter=new Element();
 await harness.progressPanel(panel,filter,harness.actions,()=>current);
 harness.intervals[0]();current=false;panel.isConnected=false;harness.actions.textContent='学生账号操作';const before=panel.textContent;
 delayed.resolve(report);await flush();
 assert.equal(harness.actions.textContent,'学生账号操作');assert.equal(panel.textContent,before);
});

test('a slow conversation filter cannot replace the latest student selection',async()=>{
 const delayed=deferred();
 const harness=await views(async url=>{
  if(url.includes('/students'))return {students:[{id:'A',name:'甲'},{id:'B',name:'乙'}]};
  if(url.includes('student=A'))return delayed.promise;
  return {conversations:url.includes('student=B')?[{id:'new',name:'乙',className:'测试班',agent:'knowledge',userText:'乙的新记录',reply:'新回答',createdAt:null}]:[]};
 });
 const panel=new Element(),filter=new Element();await harness.conversationsPanel(panel,filter);
 filter.value='A';filter.onchange();filter.value='B';filter.onchange();await flush();
 delayed.resolve({conversations:[{id:'old',name:'甲',userText:'甲的过期记录'}]});await flush();
 assert.match(panel.textContent,/乙的新记录/);assert.doesNotMatch(panel.textContent,/甲的过期记录/);
});
