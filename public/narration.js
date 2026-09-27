export function createNarrator({
 createAudio = globalThis.Audio ? source => new globalThis.Audio(source) : null,
 onState = () => {},
 onError = () => {},
 onLoading = () => {}
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
  const fail = () => { if (current === audio) { finish(); onError(); } };
  audio.addEventListener('error', fail);
  current = audio;
  onLoading();
  Promise.resolve(audio.play()).catch(fail);
  return true;
 }

 return {supported, play, stop, isPlaying: () => current !== null};
}
