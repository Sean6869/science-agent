export const lessons = [
 {id:'bending-light',title:'光的折射'},
 {id:'geometric-optics-basics',title:'几何光学：基础'},
 {id:'circuit-construction-kit-ac',title:'电路组装和欧姆定律'}
].map((lesson,index)=>({...lesson,number:index+1,url:`https://phet.colorado.edu/sims/html/${lesson.id}/latest/${lesson.id}_zh_CN.html`}));
export const defaultLessonId=lessons[0].id;
