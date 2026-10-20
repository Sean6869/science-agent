import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setImmediate as flush} from 'node:timers/promises';

class Element{
 constructor(){this.children=[];this.value='';this.disabled=false;this.scrollTop=0;this.clientHeight=300;this.scrollHeight=300;}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(child=>child.textContent||'').join('');}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.text='';this.children=[...children];}
 setAttribute(){}
 before(node){this.beforeNode=node;}
 closest(){return null;}
 querySelectorAll(){return this.children;}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function mount(apiFetch){
 const ids=Object.fromEntries(['knowledgePromptList','knowledgeMessages','knowledgeDraft','knowledgeComposer','knowledgeSend'].map(id=>[id,new Element()]));
 const listeners=new Map(),storage=new Map();
 const window={schoolUser:{id:'test-student',name:'测试学生'},schoolGroup:{id:'test-group'},__scienceLesson:{id:'A',questions:[]},addEventListener(name,callback){listeners.set(name,callback);}};
 const document={getElementById:id=>ids[id],createElement:()=>new Element(),createTextNode:text=>({textContent:text})};
 const harness={apiFetch,window,document,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
 const slot='knowledgeView'+crypto.randomUUID().replaceAll('-','');globalThis[slot]=harness;
 let source=await readFile(new URL('../public/knowledge-chat.js',import.meta.url),'utf8');
 source=source.replace("import {apiFetch} from './school.js';",`const {apiFetch,window,document,sessionStorage}=globalThis.${slot};const setInterval=()=>0,clearInterval=()=>{};`)
  .replace("'./chat-scroll.js'",JSON.stringify(new URL('../public/chat-scroll.js',import.meta.url).href));
 try{const {createKnowledgeChat}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));createKnowledgeChat();}finally{delete globalThis[slot];}
 return {ids,switchLesson(id){window.__scienceLesson={id,questions:[]};listeners.get('science:lesson-change')({detail:window.__scienceLesson});}};
}

test('an old A-to-B-to-A sync cannot replace the latest lesson history or quota',async()=>{
 const oldHistory=deferred(),oldQuota=deferred();let historyCalls=0,quotaCalls=0;
 const view=await mount(async url=>{
  if(url.includes('group-conversations')){historyCalls++;if(historyCalls===1)return oldHistory.promise;return Response.json({conversations:[{turnId:'new',userText:'最新记录',reply:'最新回答',status:'complete'}]});}
  quotaCalls++;if(quotaCalls===1)return oldQuota.promise;return Response.json({limit:3,remaining:1});
 });
 view.switchLesson('B');view.switchLesson('A');await flush();
 oldHistory.resolve(Response.json({conversations:[{turnId:'old',userText:'过期记录',status:'pending'}]}));oldQuota.resolve(Response.json({limit:3,remaining:3}));await flush();
 assert.match(view.ids.knowledgeMessages.textContent,/最新记录/);
 assert.doesNotMatch(view.ids.knowledgeMessages.textContent,/过期记录/);
 assert.equal(view.ids.knowledgeSend.disabled,false);
 assert.match(view.ids.knowledgeComposer.beforeNode.textContent,/剩余 1 \/ 3/);
});

test('an old lesson failure cannot insert retries or unlock a new lesson request',async()=>{
 const first=deferred(),second=deferred();
 const view=await mount(async(url,options={})=>{
  if(options.method==='POST')return JSON.parse(options.body).lessonId==='A'?first.promise:second.promise;
  return Response.json(url.includes('group-conversations')?{conversations:[]}:{limit:null});
 });await flush();
 const send=()=>view.ids.knowledgeComposer.onsubmit({preventDefault(){}});
 view.ids.knowledgeDraft.value='A的问题';send();view.switchLesson('B');await flush();
 view.ids.knowledgeDraft.value='B的问题';send();assert.equal(view.ids.knowledgeSend.disabled,true);
 first.reject(new Error('A timeout'));await flush();
 assert.equal(view.ids.knowledgeSend.disabled,true);
 assert.doesNotMatch(view.ids.knowledgeMessages.textContent,/暂时无法连接|A的问题/);
 assert.match(view.ids.knowledgeMessages.textContent,/B的问题/);
 second.resolve(Response.json({content:'B回答'}));await flush();
 assert.equal(view.ids.knowledgeSend.disabled,false);
});
