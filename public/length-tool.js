export function createLengthTool(frame){
 const make=(tag,text,cls)=>{const el=document.createElement(tag);el.className=cls||'';if(text)el.textContent=text;return el;};
 const root=make('div',null,'angle-tool length-tool');root.hidden=true;
 const calibrate=make('button','校准','angle-tool-button'),measure=make('button','测距','angle-tool-button'),reset=make('button','重置','angle-tool-reset');
 for(const b of [calibrate,measure,reset])b.type='button';
 const input=make('input');input.type='number';input.min='0.1';input.max='10000';input.step='any';input.value='100';input.setAttribute('aria-label','校准长度（毫米）');
 const unit=make('span','毫米'),readout=make('output','先校准：输入尺上已知长度，再点选对应两端','angle-tool-readout');
 const layer=make('div',null,'angle-tool-layer');layer.hidden=true;
 const canvas=make('canvas',null,'angle-tool-canvas');layer.append(canvas);root.append(calibrate,input,unit,measure,reset,readout);frame.append(root,layer);
 let scale=null,points=[],mode=null,reference=0,width=0,height=0;
 measure.disabled=true;
 const draw=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,width,height);ctx.strokeStyle='#376ddb';ctx.fillStyle='#fff';ctx.lineWidth=2;for(const p of points){ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill();ctx.stroke();}if(points.length===2){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);ctx.lineTo(points[1].x,points[1].y);ctx.stroke();}};
 const stop=()=>{mode=null;layer.style.pointerEvents='none';calibrate.classList.remove('active');measure.classList.remove('active');};
 const clear=()=>{stop();scale=null;points=[];measure.disabled=true;layer.hidden=true;readout.textContent='先校准：输入尺上已知长度，再点选对应两端';};
 const start=kind=>{const rect=frame.getBoundingClientRect();width=rect.width;height=rect.height;const ratio=window.devicePixelRatio||1;canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.getContext('2d').setTransform(ratio,0,0,ratio,0,0);stop();mode=kind;points=[];layer.hidden=false;layer.style.pointerEvents='auto';(kind==='calibrate'?calibrate:measure).classList.add('active');readout.textContent=kind==='calibrate'?'请点选尺上这段已知长度的两个端点':'请点选待测长度的两个端点（缩放实验后需重新校准）';draw();};
 calibrate.onclick=()=>{reference=Number(input.value);if(!Number.isFinite(reference)||reference<=0||reference>10000){readout.textContent='请输入有效的校准长度（0～10000毫米）';return;}scale=null;measure.disabled=true;start('calibrate');};
 measure.onclick=()=>{if(scale)start('measure');};reset.onclick=clear;input.oninput=clear;
 layer.onclick=event=>{if(!mode)return;const rect=layer.getBoundingClientRect();points.push({x:event.clientX-rect.left,y:event.clientY-rect.top});draw();if(points.length!==2)return;const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);if(distance<2){points=[];readout.textContent='两点过近，请重新选择两个端点';draw();return;}if(mode==='calibrate'){scale=reference/distance;measure.disabled=false;readout.textContent='已校准，点击“测距”选择两个端点';}else readout.textContent=`长度约 ${(distance*scale).toFixed(1)} 毫米`;stop();};
 const checkSize=()=>{const rect=frame.getBoundingClientRect();if((scale||mode)&&(Math.abs(width-rect.width)>1||Math.abs(height-rect.height)>1))clear();};
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(checkSize).observe(frame);window.addEventListener('resize',clear);
 root.reset=clear;return root;
}
