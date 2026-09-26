export const lessons = [
 {id:'bending-light',title:'光的折射',questions:['什么是入射光线、折射光线、法线？','什么是入射角、折射角？如何进行测量？','光垂直射到水面或玻璃表面时，传播方向会改变吗？']},
 {id:'geometric-optics-basics',title:'探究凸透镜的成像规律',questions:['什么是实像？什么是虚像？实像和虚像如何区分？','什么是凸透镜的焦距？','什么是凸透镜的直径？']},
 {id:'energy-skate-park',title:'能量滑板公园',url:'https://phet.colorado.edu/sims/html/energy-skate-park/latest/energy-skate-park_all.html?locale=zh_CN',questions:['什么是动能？','什么是重力势能？高度以哪里为起点？','什么是摩擦？滑板运动时为什么会产生热能？']}
].map((lesson,index)=>({...lesson,number:index+1,url:lesson.url||`https://phet.colorado.edu/sims/html/${lesson.id}/latest/${lesson.id}_zh_CN.html`}));
export const defaultLessonId=lessons[0].id;
