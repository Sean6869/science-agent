const legacyModels = new Set(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']);

export function cleanEnvValue(value) {
 return typeof value==='string'?value.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g,'').trim():'';
}

export function deepseekConfig(env = process.env) {
 const configured = cleanEnvValue(env.DEEPSEEK_MODEL) || 'deepseek-flash';
 const model = legacyModels.has(configured) ? 'deepseek-flash' : configured;
 const thinking = cleanEnvValue(env.DEEPSEEK_THINKING) || (configured === 'deepseek-reasoner' ? 'enabled' : 'disabled');
 const effort = cleanEnvValue(env.DEEPSEEK_REASONING_EFFORT) || 'low';
 if (!['deepseek-flash', 'deepseek-v4-pro'].includes(model)) throw new Error('Unsupported DeepSeek model');
 if (!['enabled', 'disabled'].includes(thinking) || !['low', 'high', 'max'].includes(effort)) throw new Error('Invalid DeepSeek thinking configuration');
 return {model, thinking: {type: thinking}, ...(thinking === 'enabled'
  ? {reasoning_effort: effort, max_tokens: 8192}
  : {temperature: 0.2, max_tokens: 700})};
}

export async function completeFeedback(messages, {env = process.env, fetchImpl = fetch, responseFormat} = {}) {
 const apiKey=cleanEnvValue(env.DEEPSEEK_API_KEY);
 if (!apiKey) throw new Error('DeepSeek key is not configured');
 const config = deepseekConfig(env);
 const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  signal: AbortSignal.timeout(config.thinking.type === 'enabled' ? 60000 : 25000),
  headers: {'content-type': 'application/json', authorization: `Bearer ${apiKey}`},
  body: JSON.stringify({...config, stream: false, messages, ...(responseFormat?{response_format:responseFormat}:{})})
 });
 if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
 const result = await response.json();
 const choice = result?.choices?.[0];
 const content = choice?.message?.content;
 if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) {
  const error=new Error('Incomplete DeepSeek feedback');
  error.code=choice?.finish_reason==='stop'&&typeof content==='string'&&!content.trim()?'empty_response':'incomplete_response';
  throw error;
 }
 return content.trim();
}
