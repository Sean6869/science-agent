const legacyModels = new Set(['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']);

export function deepseekConfig(env = process.env) {
 const configured = env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
 const model = legacyModels.has(configured) ? 'deepseek-flash' : configured;
 const thinking = env.DEEPSEEK_THINKING?.trim() || (configured === 'deepseek-reasoner' ? 'enabled' : 'disabled');
 const effort = env.DEEPSEEK_REASONING_EFFORT?.trim() || 'low';
 if (!['deepseek-flash', 'deepseek-v4-pro'].includes(model)) throw new Error('Unsupported DeepSeek model');
 if (!['enabled', 'disabled'].includes(thinking) || !['low', 'high', 'max'].includes(effort)) throw new Error('Invalid DeepSeek thinking configuration');
 return {model, thinking: {type: thinking}, ...(thinking === 'enabled'
  ? {reasoning_effort: effort, max_tokens: 8192}
  : {temperature: 0.2, max_tokens: 700})};
}

export async function completeFeedback(messages, {env = process.env, fetchImpl = fetch} = {}) {
 if (!env.DEEPSEEK_API_KEY?.trim()) throw new Error('DeepSeek key is not configured');
 const config = deepseekConfig(env);
 const response = await fetchImpl('https://api.deepseek.com/chat/completions', {
  method: 'POST',
  signal: AbortSignal.timeout(config.thinking.type === 'enabled' ? 60000 : 25000),
  headers: {'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY.trim()}`},
  body: JSON.stringify({...config, stream: false, messages})
 });
 if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
 const result = await response.json();
 const choice = result?.choices?.[0];
 const content = choice?.message?.content;
 if (choice?.finish_reason !== 'stop' || typeof content !== 'string' || !content.trim()) throw new Error('Incomplete DeepSeek feedback');
 return content.trim();
}
