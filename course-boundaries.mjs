export const courseBoundaries={
 'bending-light':{
  title:'光的折射',
  scope:'只讨论入射光线、折射光线、法线、入射角、折射角、介质组合、折射率和垂直入射等本课内容。',
  forbidden:['凸透镜','物距','像距','焦距','焦点','光屏','实像','虚像','成像','倒立','正立','动能','重力势能','机械能','热能','能量滑板','滑板','摩擦力']
 },
 'geometric-optics-basics':{
  title:'凸透镜成像',
  scope:'只讨论凸透镜、物距、像距、焦距、光屏以及像的大小、正倒、虚实和位置等本课内容。',
  forbidden:['入射角','折射角','法线','折射率','垂直入射','动能','重力势能','机械能','热能','能量滑板','滑板','摩擦力']
 },
 'energy-skate-park':{
  title:'能量滑板公园',
  scope:'只讨论动能、重力势能、机械能、摩擦、热能、高度和速度变化等本课内容。',
  forbidden:['入射角','折射角','法线','折射率','垂直入射','凸透镜','物距','像距','焦距','焦点','光屏','实像','虚像','成像','倒立','正立']
 }
};

export function courseBoundary(lessonId){return courseBoundaries[lessonId]||null;}

export function assertCourseReply(text,lessonId){
 const boundary=courseBoundary(lessonId);if(!boundary)return;
 const leaked=boundary.forbidden.find(term=>String(text).includes(term));
 if(leaked){const error=new Error(`Reply crossed the ${boundary.title} course boundary with “${leaked}”`);error.code='course_boundary_violation';throw error;}
}
