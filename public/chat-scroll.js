export const BOTTOM_TOLERANCE=32;

export function isNearBottom(element,tolerance=BOTTOM_TOLERANCE){
 return element.scrollHeight-element.clientHeight-element.scrollTop<=tolerance;
}

export function updateMessageList(element,update,{forceBottom=false}={}){
 const previousTop=element.scrollTop,followLatest=forceBottom||isNearBottom(element);
 update();
 element.scrollTop=followLatest?element.scrollHeight:previousTop;
}
