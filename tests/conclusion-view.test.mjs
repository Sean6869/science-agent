import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountConclusionForm,conclusionPresentation} from '../public/conclusion-view.js';
import {conclusionTasks} from '../public/conclusion-form.js';

class Element{
 constructor(tag){this.tag=tag;this.children=[];this.value='';this.style={setProperty(){}};}
 append(...children){this.children.push(...children);}
 replaceChildren(){this.children=[];}
 setAttribute(){}
 focus(){this.focused=true;}
 reportValidity(){this.reported=true;}
}
const all=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>all(child,tag))];
test('all worksheets present inline conditions and move parenthetical topics into the heading',()=>{
 for(const task of Object.values(conclusionTasks))for(const section of task.sections){
  const presentation=conclusionPresentation(section.template),body=presentation.segments.map(segment=>segment.text).join('');
  assert.doesNotMatch(body,/：\n/);
  assert.equal(body.replaceAll('\n',''),section.template.replace(/^（[^\n]+）\n/,'').replaceAll('\n',''));
  for(const segment of presentation.segments.filter(item=>item.condition))assert.ok(segment.text.endsWith('：'));
 }
 const energy=conclusionPresentation(conclusionTasks['energy-skate-park'].sections[0].template);
 assert.equal(energy.topic,'动能的影响因素');
 assert.equal(energy.segments.filter(item=>item.condition).length,2);
 assert.match(energy.segments[0].text,/在固定物体速度不变的条件下：$/);
 const lens=conclusionPresentation(conclusionTasks['geometric-optics-basics'].sections[0].template);
 assert.ok(lens.segments.some(item=>item.condition&&item.text.includes('{0}')));
});
test('paging keeps answers, validates hidden blanks, and submits every paragraph together',()=>{
 const original=globalThis.document;
 globalThis.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text,children:[]})};
 try{for(const [lessonId,task] of Object.entries(conclusionTasks)){
  const form=new Element('form'),draft={fields:[]};let submitted,changes=0;
  mountConclusionForm(form,{lessonId,draft,onChange:()=>changes++,onSubmit:(_,text)=>{submitted=text;}});
  const cards=all(form,'section'),selects=all(form,'select'),buttons=all(form,'button'),submit=()=>form.onsubmit({preventDefault(){}});
  assert.equal(cards.filter(card=>!card.hidden).length,1);
  for(const control of selects){control.value=control.children[1].value;control.oninput();}
  const last=selects.at(-1),answer=last.value;last.value='';last.oninput();submit();
  assert.equal(submitted,undefined);assert.equal(cards.at(-1).hidden,false);assert.equal(last.focused,true);assert.equal(last.reported,true);
  last.value=answer;last.oninput();buttons[0].onclick();buttons[1].onclick();
  assert.equal(selects[0].value,draft.fields[0]);submit();
  assert.equal((submitted.match(/【实验结论/g)||[]).length,task.sections.length);assert.ok(changes>0);
  const remounted=new Element('form');mountConclusionForm(remounted,{lessonId,draft,onChange(){},onSubmit(){}});
  assert.equal(all(remounted,'select')[0].value,draft.fields[0]);assert.equal(all(remounted,'section').findIndex(card=>!card.hidden),draft.conclusionPage);
 }}finally{globalThis.document=original;}
});
