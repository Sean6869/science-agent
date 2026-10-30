// The pinned PhET build uses centimetres. Read its real ruler geometry, including
// the current scene zoom and ScreenView layout transform, rather than a screen-size ratio.
export function readLensScale(frame){
 try{
  const iframe=Array.from(frame.querySelectorAll('iframe')).find(el=>!el.hidden&&el.id==='lab-geometric-optics-basics');
  const sim=iframe?.contentWindow?.phet?.joist?.sim;
  if(!sim||sim.isHomeScreenProperty?.value)return null;
  const view=sim.selectedScreenProperty.value.view,queue=[view],seen=new Set();
  while(queue.length){
   const node=queue.pop();if(seen.has(node))continue;seen.add(node);
   if(node.ruler?.orientation==='horizontal'){
    const graphic=node.children[0],length=node.ruler.length;
    const rulerWidth=graphic?.children[0]?.rectWidth;
    const scale=graphic?.getLocalToGlobalMatrix().getScaleVector();
    const rect=iframe.getBoundingClientRect();
    const x=rulerWidth/length*Math.abs(scale.x)*rect.width/iframe.contentWindow.innerWidth;
    const y=rulerWidth/length*Math.abs(scale.y)*rect.height/iframe.contentWindow.innerHeight;
    return Number.isFinite(x)&&Number.isFinite(y)&&x>0&&y>0?{x,y}:null;
   }
   queue.push(...(node.children||[]));
  }
 }catch{} // A loading or unavailable simulation must never produce an invented distance.
 return null;
}

export function createLengthTool(frame){
 const make=(tag,text,cls)=>{const el=document.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el;};
 const root=make('div',null,'angle-tool length-tool');root.hidden=true;
 const measure=make('button','测距','angle-tool-button'),reset=make('button','重置','angle-tool-reset');
 measure.type=reset.type='button';
 const hint='点击测距，选择两个端点',readout=make('output',hint,'angle-tool-readout');
 const credit=make('a','PhET · CC BY-NC 4.0','length-tool-credit');credit.href='https://phet.colorado.edu';credit.target='_blank';credit.rel='noopener';credit.title='Simulation by PhET Interactive Simulations, University of Colorado Boulder, licensed under CC BY-NC 4.0';
 const layer=make('div',null,'angle-tool-layer');layer.hidden=true;
 const canvas=make('canvas',null,'angle-tool-canvas');layer.append(canvas);root.append(measure,readout,reset,credit);frame.append(root,layer);
 let scale=null,points=[],measuring=false,width=0,height=0;
 const draw=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);ctx.strokeStyle='#376ddb';ctx.fillStyle='#fff';ctx.lineWidth=2;for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();ctx.stroke();}if(points.length===2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.stroke();}};
 const stop=()=>{measuring=false;layer.style.pointerEvents='none';measure.classList.remove('active');};
 const clear=()=>{stop();scale=null;points=[];layer.hidden=true;readout.textContent=hint;};
 measure.onclick=()=>{
  if(measuring){clear();return;}
  clear();scale=readLensScale(frame);
  if(!scale){readout.textContent='请等待实验加载并进入实验';return;}
  const rect=frame.getBoundingClientRect();width=rect.width;height=rect.height;
  const ratio=window.devicePixelRatio||1;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.getContext('2d').setTransform(ratio,0,0,ratio,0,0);
  measuring=true;layer.hidden=false;layer.style.pointerEvents='auto';measure.classList.add('active');readout.textContent='请选择两个端点（厘米）';draw();
 };
 reset.onclick=clear;
 layer.onclick=event=>{
  if(!measuring)return;
  const rect=layer.getBoundingClientRect();points.push({x:event.clientX-rect.left,y:event.clientY-rect.top});draw();
  if(points.length!==2){readout.textContent='请选择第二个端点';return;}
  const dx=points[0].x-points[1].x,dy=points[0].y-points[1].y;
  if(Math.hypot(dx,dy)<2){points=[];readout.textContent='两点过近，请重新选择';draw();return;}
  const current=readLensScale(frame);
  if(!current||Math.abs(current.x/scale.x-1)>.001||Math.abs(current.y/scale.y-1)>.001){clear();return;}
  readout.textContent=`长度约 ${Math.hypot(dx/scale.x,dy/scale.y).toFixed(1)} 厘米`;stop();
 };
 const checkScale=()=>{
  if(root.hidden||!scale)return;
  const rect=frame.getBoundingClientRect(),current=readLensScale(frame);
  if(Math.abs(width-rect.width)>1||Math.abs(height-rect.height)>1||!current||Math.abs(current.x/scale.x-1)>.001||Math.abs(current.y/scale.y-1)>.001)clear();
 };
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(checkScale).observe(frame);
 window.addEventListener('resize',clear);window.setInterval(checkScale,300);
 root.reset=clear;return root;
}
