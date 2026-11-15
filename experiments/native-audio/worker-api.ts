/** Preserve existing card history calls while HA assigns the authenticated owner. */
export async function workerApi(hass: any, method: string, path: string, data: any = {}) {
  const parsed = new URL(path, 'http://butler.invalid/');
  const route = parsed.pathname.replace(/^\/?backend_butler\/chat\/?/, '');
  const operation = route || 'send';
  const verb = ['history', 'conversations'].includes(operation) ? 'GET' : 'POST';
  if (!['history', 'conversations', 'switch', 'delete', 'cancel', 'warm', 'send'].includes(operation) || method !== verb) throw new Error('Unsupported history operation');
  // Native sessions acquire history on connect. Warming a text/A2A session here
  // would race that acquisition for the same persistent conversation lease.
  if (operation === 'warm') return { warming: false };
  const fields = { ...data };
  parsed.searchParams.forEach((value, key) => { fields[key] = value; });
  const result = await hass.callWS({type: 'butler_native_audio_poc/history', operation, data: fields});
  if (result.status >= 400) throw {status_code: result.status, body: result.body, error: 'Conversation request failed'};
  return result.body;
}
