// Apply the same rating layout to replies saved before the formatting update.
export function formatFeedbackForDisplay(text){
 return text.replaceAll('量规','标准').replace(/老师的评价：[ \t]*(?=\S)/g,'老师的评价：\n')
  .replace(/；[ \t]*(?=[^；\n（）]{1,16}⭐)/g,'；\n')
  .replace(/请回顾哪一步思考帮助你们同时满足([^？\n]+)这些标准呢？/g,'请回顾帮助你们满足$1这些标准的思考过程，并说明你们采用的方法。');
}

// Identify the feedback paragraph, rather than a lesson-specific advice phrase.
// This also handles archived replies whose advice and quota shared one line.
export function feedbackDisplayLines(text){
 const formatted=formatFeedbackForDisplay(text).replace(/([^\n])\s*(?=本环节还剩\d+次内容提交机会|本次星级自评不占用内容提交次数)/g,'$1\n');
 const conclusion=formatted.startsWith('结论判定：');let afterRating=false;
 return formatted.split('\n').map(line=>{
  const rating=/^[^⭐\n]{1,30}⭐/.test(line);
  if(rating)afterRating=true;
  const metadata=/^(?:自我评价|老师的评价|知识答疑提示|参考星级|引导自评|本环节|本次|证据核对|结论判定)：?/.test(line);
  return {text:line,emphasis:!conclusion&&!!line.trim()&&!rating&&!metadata&&(afterRating||line.startsWith('反馈评语：'))};
 });
}
