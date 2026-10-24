/* WaterLux lead intake: Vercel serverless function at /api/lead
   Receives website form posts and saves them in GoHighLevel (API v2):
     1. Creates or updates the contact (matched by phone/email)
     2. Adds tags (these are what your GHL workflows trigger on)
     3. Adds a note with the form answers, ad source, and the SMS consent record
     4. Optionally creates an opportunity in your pipeline
   The GHL token lives only in Vercel environment variables, never in page code.

   Required environment variables (Vercel > Project > Settings > Environment Variables):
     GHL_PRIVATE_TOKEN   Private Integration token from GHL (Settings > Private Integrations)
     GHL_LOCATION_ID     Your GHL sub-account (location) ID
   Optional:
     GHL_PIPELINE_ID         Pipeline to drop new leads into
     GHL_PIPELINE_STAGE_ID   Stage within that pipeline (for example "New Lead")
     ALLOWED_ORIGINS         Comma list, defaults to https://waterluxit.com,https://www.waterluxit.com
*/
'use strict';

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

const FORM_LABELS = {
  'free-water-test': 'Free Water Test',
  'contact': 'Contact Form',
  'home': 'Free Water Test (Home Page)',
  'complete-system': 'Free Water Test (Complete System Page)'
};

/* Light per-instance rate limit: 5 posts per IP per 10 minutes */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
}

function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}

function slug(s) {
  return clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function ghl(path, method, body, token) {
  const r = await fetch(GHL_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Version: GHL_VERSION,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text.slice(0, 500) }; }
  if (!r.ok) {
    const err = new Error('GHL ' + method + ' ' + path + ' failed: ' + r.status);
    err.status = r.status;
    err.detail = json;
    throw err;
  }
  return json;
}

function touchLine(label, t) {
  if (!t) return label + ': (none)';
  const bits = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']
    .filter((k) => t[k]).map((k) => k.replace('utm_', '') + '=' + clean(t[k], 120));
  if (t.gclid) bits.push('gclid');
  if (t.fbclid) bits.push('fbclid');
  if (t.msclkid) bits.push('msclkid');
  return label + ': landed on ' + clean(t.landing, 120) +
    (t.referrer ? ' from ' + clean(t.referrer, 200) : ' (direct)') +
    (bits.length ? ' | ' + bits.join(', ') : '') +
    (t.at ? ' | ' + clean(t.at, 40) : '');
}

function adSourceTag(t) {
  if (!t) return null;
  if (t.fbclid || /facebook|fb|instagram|ig|meta/i.test(t.utm_source || '')) return 'src-facebook';
  if (t.gclid || /google/i.test(t.utm_source || '')) return (/cpc|ppc|paid/i.test(t.utm_medium || '') || t.gclid) ? 'src-google-ads' : 'src-google';
  if (t.utm_source) return 'src-' + slug(t.utm_source);
  if (t.referrer && /google\./i.test(t.referrer)) return 'src-google-organic';
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const allowed = (process.env.ALLOWED_ORIGINS || 'https://waterluxit.com,https://www.waterluxit.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin || '';
  const originOk = !origin || allowed.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (originOk && origin) res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!originOk) return res.status(403).json({ error: 'Forbidden.' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ error: 'Invalid request.' });

  /* Bots: honeypot filled or form submitted inhumanly fast. Pretend success, save nothing. */
  if (clean(b.website) || (Number(b.elapsed_ms) > 0 && Number(b.elapsed_ms) < 2500)) {
    return res.status(200).json({ ok: true });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes.' });

  const name = clean(b.name, 100);
  const phone = toE164(b.phone);
  const email = clean(b.email, 150).toLowerCase();
  if (!name) return res.status(400).json({ error: 'Please add your name.' });
  if (!phone) return res.status(400).json({ error: 'Please enter a 10 digit phone number.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Please check your email address.' });

  const formKey = slug(b.form) || 'lead';
  const formLabel = FORM_LABELS[formKey] || 'Website Form';
  const parts = name.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  const zip = /^\d{5}$/.test(clean(b.zip, 10)) ? clean(b.zip, 10) : '';
  const address = clean(b.address, 200);
  const ownRent = clean(b.own_rent, 20);
  const waterSource = clean(b.water_source, 20);
  const message = clean(b.message, 2000);
  const consent = b.sms_consent === true;
  const consentText = clean(b.sms_consent_text, 1000);
  const att = (b.attribution && typeof b.attribution === 'object') ? b.attribution : {};
  const submittedAt = new Date().toISOString();
  const qz = (b.quiz && typeof b.quiz === 'object') ? b.quiz : null;
  const list = (v, n) => Array.isArray(v) ? v.slice(0, 15).map((x) => clean(x, n || 60)).join(', ') : '';
  const quizLine = qz ? 'Water Check: ' + [
    list(qz.symptoms) ? 'noticed ' + list(qz.symptoms) : (list(qz.notice, 20) ? 'noticed ' + list(qz.notice, 20) : 'noticed nothing specific'),
    qz.source ? 'water source ' + clean(qz.source, 20) : null,
    list(qz.recs) ? 'site recommended ' + list(qz.recs) : null
  ].filter(Boolean).join(' | ') : null;

  const token = process.env.GHL_PRIVATE_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  /* Everything we know about this lead, written to the logs so nothing is lost if GHL is down */
  const record = { submittedAt, formLabel, name, phone, email, zip, address, ownRent, waterSource, message, consent, page: clean(att.page, 120), ip };

  if (!token || !locationId) {
    console.error('LEAD NOT SENT: GHL env vars missing.', JSON.stringify(record));
    return res.status(500).json({ error: 'Our booking system is not connected yet.' });
  }

  const tags = ['website-lead', 'form-' + formKey];
  if (ownRent) tags.push(ownRent === 'own' ? 'homeowner' : 'renter');
  if (waterSource) tags.push('water-' + slug(waterSource));
  if (consent) tags.push('sms-opt-in');
  const srcTag = adSourceTag(att.last) || adSourceTag(att.first);
  if (srcTag) tags.push(srcTag);
  if (b.quiz && typeof b.quiz === 'object') tags.push('took-water-check');

  try {
    /* 1. Create or update the contact */
    const contactBody = {
      locationId,
      firstName,
      lastName: lastName || undefined,
      name,
      phone,
      email: email || undefined,
      postalCode: zip || undefined,
      address1: address || undefined,
      source: 'Website - ' + formLabel
    };
    const up = await ghl('/contacts/upsert', 'POST', contactBody, token);
    const contactId = up && (up.contact && up.contact.id || up.id);
    if (!contactId) throw new Error('GHL upsert returned no contact id');

    /* 2. Tags (adds to existing tags, never removes) */
    await ghl('/contacts/' + contactId + '/tags', 'POST', { tags }, token);

    /* 3. Note with answers, attribution and consent record */
    const lines = [
      'WEBSITE LEAD: ' + formLabel,
      'Submitted: ' + submittedAt,
      'Page: ' + (clean(att.page, 120) || '(unknown)'),
      ownRent ? 'Own or rent: ' + ownRent : null,
      waterSource ? 'Water source: ' + waterSource : null,
      zip ? 'ZIP: ' + zip : null,
      address ? 'Address: ' + address : null,
      message ? 'Message: ' + message : null,
      quizLine,
      '',
      touchLine('First visit', att.first),
      touchLine('This visit', att.last),
      '',
      'SMS consent: ' + (consent ? 'YES, opted in' : 'NO, did not check the box'),
      consent ? 'Consent captured: ' + submittedAt + ' | IP ' + ip + ' | ' + clean(req.headers['user-agent'], 200) : null,
      consent && consentText ? 'Consent language shown: "' + consentText + '"' : null
    ].filter((l) => l !== null);
    await ghl('/contacts/' + contactId + '/notes', 'POST', { body: lines.join('\n') }, token);

    /* 4. Optional opportunity */
    const pipelineId = process.env.GHL_PIPELINE_ID;
    const stageId = process.env.GHL_PIPELINE_STAGE_ID;
    if (pipelineId && stageId) {
      try {
        await ghl('/opportunities/', 'POST', {
          locationId, pipelineId, pipelineStageId: stageId, contactId,
          name: name + ' - ' + formLabel, status: 'open', source: 'Website - ' + formLabel
        }, token);
      } catch (e) {
        /* A duplicate open opportunity is not worth failing the lead over */
        console.warn('Opportunity not created:', e.message, JSON.stringify(e.detail || {}));
      }
    }

    console.log('LEAD SAVED', contactId, formLabel, up.new ? '(new contact)' : '(existing contact)');
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('LEAD FAILED:', e.message, JSON.stringify(e.detail || {}), 'RECORD:', JSON.stringify(record));
    return res.status(502).json({ error: 'We could not save your request just now.' });
  }
};
