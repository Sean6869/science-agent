const preferredTeacherVoices = /xiaoxiao|晓晓|huihui|慧慧|yaoyao|瑶瑶|tingting|婷婷|female/i;

export function chooseChineseVoice(voices = []) {
 const chinese = voices.filter(voice => /^zh(?:-|_)/i.test(voice.lang));
 return chinese.find(voice => preferredTeacherVoices.test(voice.name))
  || chinese.find(voice => /^zh(?:-|_)cn$/i.test(voice.lang))
  || chinese[0]
  || null;
}

export function createNarrator({synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, onState = () => {}} = {}) {
 let current = null;
 const supported = Boolean(synth && Utterance);

 function stop() {
  if (supported) synth.cancel();
  current = null;
  onState(false);
 }

 function speak(text) {
  stop();
  if (!supported || !text?.trim()) return false;
  const utterance = new Utterance(text.trim());
  utterance.lang = 'zh-CN';
  utterance.rate = 0.92;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  utterance.voice = chooseChineseVoice(synth.getVoices()) || utterance.voice;
  utterance.onstart = () => { if (current === utterance) onState(true); };
  const finish = () => { if (current === utterance) { current = null; onState(false); } };
  utterance.onend = finish;
  utterance.onerror = finish;
  current = utterance;
  synth.speak(utterance);
  return true;
 }

 return {supported, speak, stop, isSpeaking: () => current !== null};
}
