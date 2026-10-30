import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {readLensScale} from '../public/length-tool.js';

function rulerFrame(){
 let zoom=1,width=800;
 const graphic={children:[{rectWidth:520}],getLocalToGlobalMatrix:()=>({getScaleVector:()=>({x:zoom,y:zoom})})};
 const view={children:[{children:[{ruler:{orientation:'horizontal',length:260},children:[graphic]}]}]};
 const iframe={id:'lab-geometric-optics-basics',hidden:false,getBoundingClientRect:()=>({width,height:500}),contentWindow:{innerWidth:800,innerHeight:500,phet:{joist:{sim:{selectedScreenProperty:{value:{view}}}}}}};
 return {iframe,querySelectorAll:()=>[iframe],getBoundingClientRect:()=>({left:20,top:30,width,height:500}),zoom:value=>zoom=value,resize:value=>width=value};
}

test('ruler scale follows native scene zoom and iframe scaling; unavailable experiments never invent units',()=>{
 const frame=rulerFrame();assert.deepEqual(readLensScale(frame),{x:2,y:2});
 frame.zoom(.5);assert.deepEqual(readLensScale(frame),{x:1,y:1});
 frame.resize(400);assert.deepEqual(readLensScale(frame),{x:.5,y:1});
 frame.iframe.hidden=true;assert.equal(readLensScale(frame),null);
 frame.iframe.hidden=false;Object.defineProperty(frame.iframe,'contentWindow',{get:()=>{throw Error('cross origin');}});assert.equal(readLensScale(frame),null);
});

test('direct centimetre measurement releases clicks and resets on zoom, resize, cancellation, or unavailable sim',async()=>{
 const noop=()=>{},events={};let observe,check;
 const context2d=new Proxy({},{get:()=>noop,set:()=>true});
 const frame=rulerFrame();
 const node=tag=>({tag,children:[],style:{},classList:{add:noop,remove:noop},append(...nodes){this.children.push(...nodes);},getContext:()=>context2d,getBoundingClientRect:frame.getBoundingClientRect});
 frame.children=[];frame.append=(...nodes)=>frame.children.push(...nodes);
 const context={document:{createElement:node},window:{devicePixelRatio:2,addEventListener:(key,fn)=>events[key]=fn,setInterval:fn=>check=fn},ResizeObserver:class{constructor(fn){observe=fn;}observe(){}}};
 const source=(await readFile(new URL('../public/length-tool.js',import.meta.url),'utf8')).replaceAll('export function','function');runInNewContext(source+'\nglobalThis.mount=createLengthTool;',context);
 const root=context.mount(frame),[measure,readout,reset]=root.children,layer=frame.children[1];root.hidden=false;
 const click=(x,y)=>layer.onclick({clientX:x+20,clientY:y+30});
 assert.equal(root.children.some(n=>n.tag==='input'),false);
 measure.onclick();click(0,0);click(0,0);assert.match(readout.textContent,/过近/);
 click(20,20);click(80,100);assert.equal(readout.textContent,'长度约 50.0 厘米');assert.equal(layer.style.pointerEvents,'none');
 frame.zoom(.5);check();assert.equal(layer.hidden,true);
 measure.onclick();click(20,20);click(80,100);assert.equal(readout.textContent,'长度约 100.0 厘米');
 frame.resize(400);observe();assert.equal(layer.hidden,true);
 measure.onclick();measure.onclick();assert.equal(layer.hidden,true);
 measure.onclick();events.resize();assert.equal(layer.hidden,true);
 frame.iframe.hidden=true;measure.onclick();assert.match(readout.textContent,/等待/);assert.equal(layer.hidden,true);
 frame.iframe.hidden=false;measure.onclick();click(0,0);frame.zoom(1);click(100,0);assert.equal(layer.hidden,true);
 measure.onclick();root.reset();assert.equal(layer.hidden,true);reset.onclick();
});

test('centimetre geometry integration pins the unmodified official PhET build',async()=>{
 const html=await readFile(new URL('../public/vendor/phet/geometric-optics-basics-1.3.18_zh_CN.html',import.meta.url));
 assert.equal(createHash('sha256').update(html).digest('hex'),'c47495c79a142acd185d278fda55cc5b0871342fc062a8c2bd22cf73705fd9de');
 assert.match(html.toString(),/Jp\.centimetersStringProperty/);
});
