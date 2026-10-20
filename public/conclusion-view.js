import {conclusionTasks,formatConclusion,migrateConclusionFields} from './conclusion-form.js';

export function conclusionPresentation(template){
 const introduction=template.match(/^（([^\n]+)）\n/);
 const topic=introduction?.[1]||'';
 const body=(introduction?template.slice(introduction[0].length):template).replace(/：\n/g,'：');
 const segments=body.split(/((?:在固定|在无摩擦|在有摩擦|当光线从|当物体离)[^：\n]+：)/g)
  .filter(Boolean).map(text=>({text,condition:/^(?:在固定|在无摩擦|在有摩擦|当光线从|当物体离)[^：\n]+：$/.test(text)}));
 return {topic,segments};
}

export function mountConclusionForm(form,{lessonId,draft,onChange,onSubmit}){
 form.replaceChildren();const task=conclusionTasks[lessonId];if(!task)return;
 form.noValidate=true;
 draft.fields=migrateConclusionFields(lessonId,draft.fields||[],draft.conclusionSchemaVersion||1);draft.conclusionSchemaVersion=2;
 let page=Math.max(0,Math.min(task.sections.length-1,Math.trunc(Number(draft.conclusionPage)||0)));
 const node=(tag,text,className)=>{const item=document.createElement(tag);if(text)item.textContent=text;if(className)item.className=className;return item;};
 const header=node('header',null,'conclusion-heading'),heading=node('h3',task.title);heading.id='conclusionTitle';
 const topic=node('span',null,'conclusion-topic');
 header.append(heading,topic);form.append(header);
 const viewport=node('div',null,'conclusion-pages'),cards=[],controls=[];let offset=0;
 task.sections.forEach((section,sectionIndex)=>{
  const card=node('section',null,'conclusion-section');card.append(node('h4',section.title));
  const paragraph=node('p',null,'conclusion-paragraph');
  for(const segment of conclusionPresentation(section.template).segments){
   const target=segment.condition?node('strong',null,'conclusion-condition'):paragraph;
   segment.text.split(/\{(\d+)\}/g).forEach((part,index)=>{
   if(index%2===0){target.append(document.createTextNode(part));return;}
   const field=section.fields[Number(part)],position=offset+Number(part),control=node('select');
   const blank=node('option','请选择');blank.value='';control.append(blank);
   for(const value of field.options){const option=node('option',value);option.value=value;control.append(option);}
   control.name=`conclusion-${position}`;control.required=true;control.setAttribute('aria-label',`${section.title}：${field.label}`);
   control.style.setProperty('--blank-width',`${Math.max(6,...field.options.map(value=>value.length+3))}em`);
   control.value=draft.fields[position]||'';
   control.oninput=()=>{draft.fields[position]=control.value;status.textContent='';onChange();};
   controls[position]={control,page:sectionIndex};target.append(control);
  });
   if(segment.condition)paragraph.append(target);
  }
  offset+=section.fields.length;card.append(paragraph);cards.push(card);viewport.append(card);
 });form.append(viewport);
 const actions=node('div',null,'conclusion-actions'),previous=node('button','上一页'),progress=node('span',null,'conclusion-progress'),next=node('button','下一页'),send=node('button','提交全部结论','primary'),status=node('small',null,'conclusion-status');
 previous.type=next.type='button';send.type='submit';status.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 function showPage(index){
  page=index;draft.conclusionPage=page;status.textContent='';cards.forEach((card,index)=>{card.hidden=index!==page;});
  topic.textContent=conclusionPresentation(task.sections[page].template).topic;topic.hidden=!topic.textContent;
  previous.disabled=page===0;next.disabled=page===cards.length-1;progress.textContent=`${page+1} / ${cards.length}`;viewport.scrollTop=0;
 }
 previous.onclick=()=>{showPage(page-1);onChange();};next.onclick=()=>{showPage(page+1);onChange();};
 actions.append(previous,progress,next,send);form.append(actions,status);showPage(page);
 form.onsubmit=event=>{
  event.preventDefault();const missing=controls.find(({control})=>!control.value);
  if(missing){showPage(missing.page);onChange();status.textContent='请完成本页的空格后再提交全部结论。';missing.control.focus();missing.control.reportValidity();return;}
  try{status.textContent='';onSubmit(event,formatConclusion(lessonId,controls.map(({control})=>control.value)));}catch(error){status.textContent=error.message;}
 };
}
