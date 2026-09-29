export const issueURL = value => typeof value === 'string' && /^https:\/\/github\.com\/Sy14r\/PimpMyElectron\/issues\/[1-9]\d*$/.test(value);
export function validateReport(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['title', 'body', 'requestId'].includes(k))) throw Error('Invalid report.');
  const {title, body, requestId} = value;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || /[\r\n\x00-\x1f]/.test(title) || typeof body !== 'string' || !body.trim() || body.length > 6000 || body.includes('\0')) throw Error('Enter a title and description within the size limits.');
  if (typeof requestId !== 'string' || !/^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw Error('Invalid report identifier.');
  const age = now - Number(requestId.slice(0, 13));
  if (age < -300000 || age > 7 * 86400000) throw Error('This report is over a week old. Copy it before starting a new report.');
  return {title: title.trim(), body: body.trim(), requestId};
}
