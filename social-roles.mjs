export function roleGuidance(type,members,leaderId,challengerId){
 const leader=members.find(m=>m.id===leaderId).name,challenger=members.find(m=>m.id===challengerId).name;
 if(type==='VR')return `${leader}，你与${challenger}组成了人机小组。你的角色分工老师已收到！📝接下来由你担任领航发言员，负责开展实验并提出想法；${challenger}作为虚拟记录与质疑员，陪你完成本节课的探究。提出观点后，请记录依据，再问自己“有没有另一种可能？”、“这个答案合理吗？”。`;
 const intro=`${members.map(m=>m.name).join('、')}，你们的小组分工老师已收到！📝接下来请${leader}担任领航发言员，负责率先提出自己的想法，请${challenger}担任记录与质疑员，负责用笔记录和随后提问。`;
 if(type==='HH')return intro+'\n\n💡提示1：老师建议，在你们小组合作完成科学探究实验中，记录与质疑员不仅要记录，还要主动挑战领航发言员的观点，多提问“有没有另一种可能？”、“这个答案合理吗？”。在每个环节结束后，可以花1分钟检查一下：“我们是不是太快达成同意了？有没有遗漏什么关键信息？”\n\n💡提示2：记得在科学探究过程中至少交换一次角色，让两个人都能体验领航发言和记录质疑的过程。这样能发挥你们俩的最大优势！';
 if(type==='HL'){
  const highMember=members.find(member=>member.level==='high'),lowMember=members.find(member=>member.level==='low');
  const high=highMember?.name||leader,low=lowMember?.name||challenger;
  const mismatched=highMember&&lowMember&&(leaderId!==highMember.id||challengerId!==lowMember.id);
  const reminder=mismatched?`\n\n🔔你们当前的分工与这项建议不一致，请点击“交换角色”，让${high}担任领航发言员、${low}担任记录与质疑员。`:'';
  return intro+`\n\n根据你们的摸底考试情况，老师建议由${high}担任领航发言员，由${low}担任记录与质疑员。${reminder}\n\n💡提示1：${high}同学，请你在提出观点时多向${low}同学解释“我为什么这样想”。向同伴解释的过程能帮助你自己把知识理解得更深入！\n\n💡提示2：${low}同学，请你在${high}同学说完观点后，如果没有听懂，可以提问“为什么？”、“能再解释一下吗？”。向同伴提问的过程能帮助你自己把知识理解得更深入！`;
 }
 return intro+'\n\n💡提示1：老师建议，在你们小组合作完成科学探究实验中，最重要的是两个人一起动脑筋。领航发言员说完后，记录与质疑员可以多提问“为什么你这样说？”、“你确定吗？”。就算暂时不知道答案，一起猜想也是很好的学习！\n\n💡提示2：记得在科学探究过程中至少交换一次角色，让两个人都能体验领航发言和记录质疑的过程。这样你们都能更主动地动脑筋！';
}
