export const DEFAULT_STAGE_SECONDS = 5 * 60;

export function createStageTimers(stageIds, durationSeconds = DEFAULT_STAGE_SECONDS) {
 return Object.fromEntries(stageIds.map(id => [id, {
  durationSeconds,
  remainingSeconds: durationSeconds,
  deadline: null,
  running: false,
  warned: false
 }]));
}

export function remainingSeconds(timer, now = Date.now()) {
 return timer.running && Number.isFinite(timer.deadline)
  ? Math.max(0, Math.ceil((timer.deadline - now) / 1000))
  : timer.remainingSeconds;
}

export function startTimer(timer, now = Date.now()) {
 if (timer.running || timer.remainingSeconds <= 0) return false;
 timer.deadline = now + timer.remainingSeconds * 1000;
 timer.running = true;
 return true;
}

export function pauseTimer(timer, now = Date.now()) {
 if (!timer.running) return false;
 timer.remainingSeconds = remainingSeconds(timer, now);
 timer.deadline = null;
 timer.running = false;
 return true;
}

export function resetTimer(timer, durationSeconds) {
 timer.durationSeconds = durationSeconds;
 timer.remainingSeconds = durationSeconds;
 timer.deadline = null;
 timer.running = false;
 timer.warned = false;
}

export function advanceTimer(timer, now = Date.now()) {
 const remaining = remainingSeconds(timer, now);
 let warning = false;
 let finished = false;
 if (timer.running && remaining > 0 && remaining <= 60 && !timer.warned) {
  timer.warned = true;
  warning = true;
 }
 if (timer.running && remaining === 0) {
  timer.remainingSeconds = 0;
  timer.deadline = null;
  timer.running = false;
  finished = true;
 }
 return {remaining, warning, finished};
}

export function formatTime(seconds) {
 const safe = Math.max(0, Math.ceil(seconds));
 return `${String(Math.floor(safe / 60)).padStart(2,'0')}:${String(safe % 60).padStart(2,'0')}`;
}
