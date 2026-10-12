export function codapanUrl(source){
 const url=new URL(source);url.searchParams.set('autoplay','1');return url.toString();
}

export function createLessonVideo({userId,onWatched=()=>{}}={}){
 let lesson=window.__scienceLesson||null,dialog=null;
 const button=document.createElement('button');button.type='button';button.className='intro-video-button';
 const key=()=>lesson?.id&&`science-intro-video-v1:${userId}:${lesson.id}`;
 const isWatched=()=>{try{return !!key()&&localStorage.getItem(key())==='watched';}catch{return false;}};
 const hasMedia=()=>!!lesson?.videoEmbed;
 const render=()=>{button.hidden=!hasMedia();button.textContent=isWatched()?'重新观看导入视频':'▶ 开始观看导入视频';button.setAttribute('aria-label',`${lesson?.title||''}${button.textContent.replace('▶ ','')}`);};
 const closeDialog=()=>{if(!dialog)return;const frame=dialog.querySelector('iframe');if(frame)frame.src='about:blank';dialog.close();dialog.remove();dialog=null;};
 const setLesson=next=>{if(dialog)closeDialog();lesson=next;render();};
 const markWatched=status=>{try{localStorage.setItem(key(),'watched');}catch{}status.textContent='已确认看完，现在可以提出科学问题。';const complete=dialog?.querySelector('.intro-video-actions .primary');if(complete){complete.textContent='已看完';complete.disabled=true;}render();onWatched(true);};
 button.onclick=()=>{
  if(!hasMedia()||dialog)return;
  dialog=document.createElement('dialog');dialog.className='intro-video-dialog';
  const header=document.createElement('header'),title=document.createElement('h2'),logo=document.createElement('img');title.textContent=`第 ${lesson.number} 节课导入视频`;logo.src='/assets/xiaoke-logo-transparent.png?v=20260917';logo.alt='小科';header.append(title,logo);
  const media=document.createElement('div');media.className='intro-video-media';
  const frame=document.createElement('iframe');frame.src=codapanUrl(lesson.videoEmbed);frame.title=`${lesson.title}导入视频`;frame.allow='autoplay *; fullscreen *; encrypted-media *; picture-in-picture *';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';frame.scrolling='no';media.append(frame);
  const status=document.createElement('p');status.className='intro-video-status';status.textContent=isWatched()?'这段视频已经看完，可以再次观看。':'请完整观看视频，结束后点击“我已看完”。';
  const actions=document.createElement('div');actions.className='intro-video-actions';
  const complete=document.createElement('button');complete.type='button';complete.className='school-button primary';complete.textContent=isWatched()?'已看完':'我已看完';complete.disabled=isWatched();complete.onclick=()=>markWatched(status);
  const close=document.createElement('button');close.type='button';close.className='school-button';close.textContent='关闭';close.onclick=closeDialog;actions.append(complete,close);
  dialog.append(header,media,status,actions);document.body.append(dialog);dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});dialog.showModal();
 };
 window.addEventListener('science:lesson-change',event=>setLesson(event.detail));render();return {button,isWatched,setLesson};
}
