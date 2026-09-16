export const lessons = [
 {id:'bending-light',title:'光的折射',questions:['什么是入射光线、折射光线、法线？','什么是入射角、折射角？如何进行测量？','光垂直射到水面或玻璃表面时，传播方向会改变吗？']},
 {id:'geometric-optics-basics',title:'探究凸透镜的成像规律',questions:['什么是实像？什么是虚像？实像和虚像如何区分？','什么是凸透镜的焦距？','什么是凸透镜的直径？']},
 {id:'circuit-construction-kit-ac',title:'基础电路与欧姆定律',questions:['什么是电路？一个完整电路一般由哪几部分组成？','什么是电源、导线、开关、用电器？各自有什么作用？','什么是通路、断路、短路？短路有什么危险？']}
].map((lesson,index)=>({...lesson,number:index+1,url:`https://phet.colorado.edu/sims/html/${lesson.id}/latest/${lesson.id}_zh_CN.html`}));
export const defaultLessonId=lessons[0].id;
