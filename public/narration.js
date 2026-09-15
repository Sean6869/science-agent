export function createNarrator({
 createAudio = globalThis.Audio ? source => new globalThis.Audio(source) : null,
 onState = () => {}
} = {}) {
 let current = null;
 const supported = typeof createAudio === 'function';

 function stop() {
  const previous = current;
  current = null;
  if (previous) {
   previous.pause();
   try { previous.currentTime = 0; } catch {}
  }
  onState(false);
 }

 function play(source) {
  stop();
  if (!supported || !source) return false;
  const audio = createAudio(source);
  const finish = () => {
   if (current === audio) {
    current = null;
    onState(false);
   }
  };
  audio.preload = 'auto';
  audio.addEventListener('playing', () => { if (current === audio) onState(true); });
  audio.addEventListener('ended', finish);
  audio.addEventListener('error', finish);
  current = audio;
  Promise.resolve(audio.play()).catch(finish);
  return true;
 }

 return {supported, play, stop, isPlaying: () => current !== null};
}
