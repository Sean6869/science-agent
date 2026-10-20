// Preserve click order and ignore reads started before a newer local selection.
export function createGroupLearningSync({read,write,onState,onRead=()=>{}}){
 let generation=0,pendingWrites=0,queue=Promise.resolve(),reading=false,lastRevision='';
 function publish(selection){
  const epoch=++generation;pendingWrites++;
  const task=queue.then(async()=>{const state=await write(selection);if(epoch===generation&&state?.updatedAt)lastRevision=state.updatedAt;});
  queue=task.catch(()=>{});
  return queue.finally(()=>{pendingWrites--;});
 }
 async function sync(){
  if(reading||pendingWrites)return;reading=true;const epoch=generation;
  try{
   const state=await read();if(epoch!==generation)return;onRead();
   if(state?.updatedAt&&state.updatedAt===lastRevision)return;
   if(state?.updatedAt)lastRevision=state.updatedAt;
   await onState(state);
  }catch{}finally{reading=false;}
 }
 return {publish,sync};
}
