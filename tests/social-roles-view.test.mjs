import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as flush} from 'node:timers/promises';

class Element{
 constructor(){this.children=[];this.attributes={};this.classList={add(){}};}
 set textContent(text){this.text=String(text);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(child=>child.textContent||'').join('');}
 append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
 replaceChildren(...children){this.text='';this.children=[];this.append(...children);}
 setAttribute(key,value){this.attributes[key]=value;}
 querySelector(){return null;}
 addEventListener(){}
 showModal(){this.open=true;}
 close(){this.open=false;}
 remove(){}
}
function find(node,predicate){return predicate(node)?node:node.children.map(child=>find(child,predicate)).find(Boolean);}
async function mount(aiEnabled=true){
 const body=new Element(),bar=new Element(),window={schoolUser:{id:'A',aiEnabled},addEventListener(){}};let audioRequests=0;
 const fixture={window,document:{body,createElement:()=>new Element()},fetch:async()=>{audioRequests++;return new Response('',{status:503});},setInterval:()=>0,alert:()=>{}};
 const key='roleView'+crypto.randomUUID().replaceAll('-','');globalThis[key]=fixture;
 const source=(await readFile(new URL('../public/social-roles.js',import.meta.url),'utf8'))
  .replace("'./narration.js'",JSON.stringify(new URL('../public/narration.js',import.meta.url).href));
 try{const module=await import('data:text/javascript;base64,'+Buffer.from(`const {window,document,fetch,setInterval,alert}=globalThis.${key};\n`+source).toString('base64'));return {body,bar,setup:module.setupRoles,audioRequests:()=>audioRequests};}finally{delete globalThis[key];}
}
const members=[{id:'A',name:'学生甲'},{id:'B',name:'学生乙'}];
const conflict=()=>Object.assign(new Error('角色分工已变化，请重新确认'),{status:409});

test('a partner completing role assignment first recovers to guidance without reloading',async()=>{
 const view=await mount();let reads=0,submits=0;
 const api=async(_,change)=>{if(change){submits++;throw conflict();}return ++reads===1?{version:0,members,type:'HL'}:{version:1,members,type:'HL',leaderId:'A',challengerId:'B',guidance:'按最新分工开始探究。'};};
 const setup=view.setup(api,view.bar);await flush();const dialog=view.body.children[0],form=dialog.children[0];
 await form.onsubmit({preventDefault(){}});
 assert.match(form.textContent,/合作建议/);assert.equal(submits,1);assert.equal(reads,2);
 find(form,node=>node.textContent==='开始探究'&&node.children.length===0).onclick();await setup;
 assert.equal(dialog.open,false);
});

test('a stale swap reads the latest roles without applying a second swap',async()=>{
 const view=await mount();let reads=0,submits=0;
 const api=async(_,change)=>{if(change){submits++;throw conflict();}return {version:++reads,members,type:'HL',leaderId:reads===1?'A':'B',challengerId:reads===1?'B':'A',guidance:'合作建议'};};
 await view.setup(api,view.bar);const swap=find(view.bar,node=>node.attributes['aria-label']==='交换角色');await swap.onclick();
 assert.equal(submits,1);assert.equal(reads,2);assert.match(view.bar.textContent,/领航：学生乙/);
});

test('static students submit initial roles and enter directly with no advice, swap or audio',async()=>{
 const view=await mount(false);let saved=false,started=0;
 const api=async(_,change)=>{if(change)saved=true;return {version:saved?1:0,members,type:'HL',scaffoldingEnabled:false,leaderId:saved?'A':null,challengerId:saved?'B':null,guidance:null};};
 const pending=view.setup(api,view.bar,{onStartExploration:()=>started++});await flush();const dialog=view.body.children[0],form=dialog.children[0];
 assert.match(form.textContent,/小组角色分工/);assert.doesNotMatch(form.textContent,/带领小组开展|合作建议/);
 await form.onsubmit({preventDefault(){}});await pending;
 assert.equal(saved,true);assert.equal(dialog.open,false);assert.equal(started,1);assert.equal(view.audioRequests(),0);
 assert.match(view.bar.textContent,/领航：学生甲/);assert.equal(find(view.bar,n=>['合作建议','交换角色'].includes(n.attributes['aria-label'])),undefined);
});

test('static students with saved roles see only their assignment',async()=>{
 const view=await mount(false);await view.setup(async()=>({version:1,members,type:'HL',scaffoldingEnabled:false,leaderId:'A',challengerId:'B',guidance:null}),view.bar);
 assert.equal(view.body.children.length,0);assert.equal(view.audioRequests(),0);assert.equal(view.bar.children.length,1);
});
