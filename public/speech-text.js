export function normalizeSpeechTranscript(text){
 return String(text||'').replace(/[。．]/g,'，');
}
