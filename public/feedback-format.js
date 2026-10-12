// Apply the same rating layout to replies saved before the formatting update.
export function formatFeedbackForDisplay(text){
 return text.replaceAll('量规','标准').replace(/老师的评价：[ \t]*(?=\S)/g,'老师的评价：\n')
  .replace(/；[ \t]*(?=[^；\n（）]{1,16}⭐)/g,'；\n')
  .replace(/请回顾哪一步思考帮助你们同时满足([^？\n]+)这些标准呢？/g,'请回顾帮助你们满足$1这些标准的思考过程，并说明你们采用的方法。');
}
