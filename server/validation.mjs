import { fail } from './errors.mjs';
import { UUID } from './config.mjs';
const bad = message => fail(400, 'invalid_input', message);
export function keys(data, allowed, required = allowed) {
  if (Object.keys(data).some(k => !allowed.includes(k))) bad('Unexpected fields are not allowed.');
  if (required.some(k => !Object.hasOwn(data, k))) bad('Required fields are missing.');
}
function text(value, label, max, optional = false) {
  if (optional && (value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) bad(`Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
}
function one(value, allowed, label) { if (!allowed.includes(value)) bad(`Choose a valid ${label}.`); return value; }
function bool(value) { if (typeof value !== 'boolean') bad('Checkbox values must be true or false.'); return value; }
function price(value) {
  if (value === null || value === '') return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d{1,8}(\.\d{1,2})?$/.test(String(value)) || !Number.isFinite(Number(value))) bad('Enter a nonnegative LKR price with up to two decimal places, or leave it blank.');
  return Number(value);
}
export function recordId(value) { if (!UUID.test(value || '')) bad('Invalid record ID.'); return value; }
export function version(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))) bad('Reload this record before making changes.');
  return value;
}
export function validateRecord(kind, data) {
  let out;
  if (kind === 'products') {
    keys(data, ['name','category','description','compatibility','authorization_notes','legitimacy_confirmed','published']);
    out = { name: text(data.name,'product name',120), category: one(data.category,['Entertainment','Creative','AI & Productivity','Other'],'category'), description: text(data.description,'description',2000), compatibility: text(data.compatibility,'compatibility',300,true), authorization_notes: text(data.authorization_notes,'authorization notes',3000,true), legitimacy_confirmed: bool(data.legitimacy_confirmed), published: bool(data.published) };
  } else if (kind === 'packages') {
    keys(data, ['product_id','name','duration','price_lkr','availability','support_terms','published']);
    out = { product_id: recordId(data.product_id), name: text(data.name,'package name',120), duration: text(data.duration,'duration',120,true), price_lkr: price(data.price_lkr), availability: one(data.availability,['contact','available','unavailable'],'availability'), support_terms: text(data.support_terms,'support terms',1500,true), published: bool(data.published) };
  } else if (kind === 'services') {
    keys(data, ['service_code','platform','name','method','description','scope','price_lkr','estimated_delivery','support_terms','compliance_notes','legitimacy_confirmed','published']);
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(data.service_code || '')) bad('Service ID must be 3–40 uppercase letters, digits or hyphens.');
    out = { service_code: data.service_code, platform: one(data.platform,['YouTube','Instagram','TikTok','Facebook','Telegram','WhatsApp'],'platform'), name: text(data.name,'service name',120), method: one(data.method,['paid_advertising','content_strategy','creator_outreach','community_promotion'],'promotion method'), description: text(data.description,'description',2000), scope: text(data.scope,'scope',300,true), price_lkr: price(data.price_lkr), estimated_delivery: text(data.estimated_delivery,'confirmed delivery information',300,true), support_terms: text(data.support_terms,'confirmed support terms',1500,true), compliance_notes: text(data.compliance_notes,'compliance notes',3000,true), legitimacy_confirmed: bool(data.legitimacy_confirmed), published: bool(data.published) };
  } else if (kind === 'contacts') {
    keys(data, ['whatsapp_number','telegram_url','support_email','support_note']);
    out = { whatsapp_number: text(data.whatsapp_number,'WhatsApp number',15,true), telegram_url: text(data.telegram_url,'Telegram URL',60,true), support_email: text(data.support_email,'support email',254,true), support_note: text(data.support_note,'support note',500,true) };
    if (out.whatsapp_number && !/^[1-9]\d{9,14}$/.test(out.whatsapp_number)) bad('Use an international WhatsApp number with digits only.');
    if (out.telegram_url && !/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/.test(out.telegram_url)) bad('Use your verified https://t.me/username link.');
    if (out.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.support_email)) bad('Enter a valid support email.');
  } else bad('Unknown record type.');
  if (out.published && 'legitimacy_confirmed' in out && !out.legitimacy_confirmed) bad('Review authorization and platform compliance before publishing.');
  return out;
}
export function loginInput(data) {
  keys(data,['email','password']);
  const email = text(data.email,'email',254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 1024) bad('Enter your owner email and password.');
  return { email, password: data.password };
}
