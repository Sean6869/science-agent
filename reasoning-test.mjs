import {completeStructured} from './deepseek.mjs';

export const reasoningTest={
 title:'科学推理能力测试',
 introduction:[
  '周末，小华帮妈妈做家务。他发现：妈妈把洗好的衣服晾在有阳光、通风好的阳台上，衣服干得很快。',
  '弟弟把一杯水洒在桌面上，小华用抹布擦完后，桌面很快就干了；但桌角的一小滩水，过了很久还没干。',
  '妈妈用拖把拖地后，地面湿了一大片；打开电风扇吹一会儿，地面就干得快多了。',
  '小华想知道：为什么同样都是水，有的干得快，有的干得慢？水变干的过程叫蒸发，请你设计实验探究影响蒸发快慢的因素。'
 ],
 hints:[
  '水的温度：冷水、温水和热水的蒸发快慢会不会不同？',
  '水的表面积：水聚在一起与摊开成薄层时，蒸发快慢会不会不同？',
  '水表面空气流动的快慢：用扇子扇、用风扇吹与不吹相比，蒸发快慢会不会不同？',
  '周围空气的湿度：在干燥和潮湿的环境中，蒸发快慢会不会不同？'
 ],
 apparatus:[
  ['滴管','吸取和滴加少量水，控制水量相同'],
  ['玻璃板（若干块）','承载水滴，便于观察并控制水的表面积'],
  ['冷水、温水、热水','改变水的温度'],
  ['小风扇、塑料扇子','改变水表面空气流动的快慢'],
  ['计时器（秒表）','记录水完全蒸发所需时间'],
  ['干燥剂、加湿器','改变周围空气的湿度']
 ],
 questions:[
  {id:'1',text:'根据上面的生活现象，提出一个可以通过实验来探究的科学问题。'},
  {id:'2',text:'在开始探究之前，你会提出什么实验假设？请写出假设，并说明提出假设的依据。'},
  {id:'3',text:'请简要写出实验方案，包括需要保持不变的条件、准备改变的条件、需要观察或测量的内容和实验步骤。'},
  {id:'4',text:'在实验中，你打算收集哪些数据、记录哪些实验现象？请写出计划记录的关键数据和现象。'},
  {id:'5',text:'设想你已完成实验并获得计划中的数据和现象。请说明你会如何从这些证据中推理出实验结论。'}
 ]
};

const rubric=[
 '第1题（0–20）：问题须可实验检验，并清楚包含一个可改变因素与蒸发快慢这一结果变量；宽泛、封闭或不可操作的问题酌情扣分。',
 '第2题（0–20）：假设须为有方向的陈述，说明自变量如何影响蒸发快慢，并给出与生活现象或已有知识相符的依据。',
 '第3题（0–20）：方案须明确自变量、因变量、控制变量、器材与可执行步骤；应体现公平比较和适当重复。',
 '第4题（0–20）：数据计划须能量化或有序比较蒸发快慢，例如等量水完全蒸发所需时间，并记录条件、重复数据和关键现象。',
 '第5题（0–20）：结论须引用设想的数据趋势，在实验范围和条件内解释变量关系；不得脱离证据扩大结论。'
];

export function buildReasoningScoringMessages(answers){
 const response=reasoningTest.questions.map(question=>`${question.id}. ${question.text}\n学生回答：${answers[question.id]}`).join('\n\n');
 return [
  {role:'system',content:`你是一名严谨的初中物理科学推理能力测评员。请根据同一套分析量规评分，不因语言华丽程度加分，也不要把未写出的内容自行补全。每题0至20分，只能给整数，总分必须等于五题之和。\n${rubric.join('\n')}\n只返回JSON：{"items":[{"id":"1","score":0,"reason":"简短、可复核的评分依据"}],"total":0}。items必须恰好包含1至5题，顺序一致。`},
  {role:'user',content:`测试背景：探究影响水蒸发快慢的因素。可考虑温度、表面积、空气流动和空气湿度。\n\n${response}`}
 ];
}

export function parseReasoningScore(raw){
 const data=typeof raw==='string'?JSON.parse(raw):raw;
 if(!data||!Array.isArray(data.items)||data.items.length!==5)throw new Error('Invalid reasoning score');
 const items=data.items.map((item,index)=>{
  const id=String(index+1),score=Number(item?.score),reason=String(item?.reason||'').trim();
  if(String(item?.id)!==id||!Number.isInteger(score)||score<0||score>20||!reason||reason.length>500)throw new Error('Invalid reasoning score item');
  return {id,score,reason};
 });
 const total=items.reduce((sum,item)=>sum+item.score,0);
 if(data.total!==total)return {items,total};
 return {items,total};
}

export async function scoreReasoningResponses(answers,options={}){
 return completeStructured(buildReasoningScoringMessages(answers),parseReasoningScore,options);
}
