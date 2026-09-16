export function isSelfAssessmentText(text) {
 const value=String(text||'').trim();
 if(value.length>100)return false;
 return /^(?:(?:我们|我|本组|小组).{0,24})?(?:[一二三123]\s*(?:颗)?星|[⭐★]{1,3})(?:[，,。.！!]|$)/.test(value)
  || /^(?:我们|我|本组|小组).{0,24}(?:[一二三123]\s*(?:颗)?星|[⭐★]{1,3})/.test(value);
}
