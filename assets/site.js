/* WaterLux Installations | site script
   1. Mobile nav toggle
   2. Ad tracking loader (GA4 + Meta pixel), set IDs below
   3. Attribution capture (UTMs, ad click IDs, landing page, referrer)
   4. Lead form handler: validates, posts to /api/lead (Vercel function -> GoHighLevel),
      then sends the visitor to the thank-you page to book on the GHL calendar. */
(function () {
  'use strict';

  /* ---------- SETTINGS: paste your IDs here (leave blank to skip) ---------- */
  var GA4_ID = '';          // e.g. 'G-XXXXXXXXXX'
  var META_PIXEL_ID = '';   // e.g. '123456789012345'
  /* ------------------------------------------------------------------------- */

  /* 1. Mobile nav */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* 2. Tracking */
  if (GA4_ID) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID);
  }
  if (META_PIXEL_ID) {
    /* Standard Meta pixel bootstrap */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }
  function track(name, data) {
    try { if (window.gtag) window.gtag('event', name, data || {}); } catch (e) {}
    try { if (window.fbq && name === 'generate_lead') window.fbq('track', 'Lead'); } catch (e) {}
  }

  /* Phone tap tracking */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]');
    if (a) track(a.getAttribute('href').indexOf('sms:') === 0 ? 'text_click' : 'call_click', { page: location.pathname });
  });

  /* 3. Attribution: first touch kept for 90 days, last touch per session */
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid'];
  function store(kind) { try { return window[kind]; } catch (e) { return null; } }
  var ls = store('localStorage'), ss = store('sessionStorage');
  function readJSON(s, k) { try { return JSON.parse(s.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJSON(s, k, v) { try { s.setItem(k, JSON.stringify(v)); } catch (e) {} }
  (function captureAttribution() {
    var params = new URLSearchParams(location.search);
    var touch = { landing: location.pathname, referrer: document.referrer || '', at: new Date().toISOString() };
    var hasParams = false;
    KEYS.forEach(function (k) { var v = params.get(k); if (v) { touch[k] = v.slice(0, 200); hasParams = true; } });
    if (ls) {
      var first = readJSON(ls, 'wl_first');
      if (!first || (Date.now() - new Date(first.at).getTime()) > 90 * 864e5) writeJSON(ls, 'wl_first', touch);
    }
    if (ss && (hasParams || !readJSON(ss, 'wl_last'))) writeJSON(ss, 'wl_last', touch);
  })();
  function attribution() {
    return { first: ls ? readJSON(ls, 'wl_first') : null, last: ss ? readJSON(ss, 'wl_last') : null, page: location.pathname };
  }


  /* 4. Lead forms */
  function digits(s) { return (s || '').replace(/\D/g, ''); }
  function validPhone(s) { var d = digits(s); return d.length === 10 || (d.length === 11 && d[0] === '1'); }
  function validEmail(s) { return !s || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

  document.querySelectorAll('form.lead-form').forEach(function (form) {
    var started = Date.now();
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type="submit"]');
    var btnText = btn ? btn.textContent : '';

    function fail(text, field) {
      if (msg) { msg.textContent = text; msg.className = 'form-msg err'; }
      if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    }
    form.addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (msg) { msg.textContent = ''; msg.className = 'form-msg'; }
      var f = form.elements;
      var name = (f.name && f.name.value || '').trim();
      var phone = (f.phone && f.phone.value || '').trim();
      var email = (f.email && f.email.value || '').trim();

      if (!name) return fail('Please add your name.', f.name);
      if (!validPhone(phone)) return fail('Please enter a 10 digit phone number.', f.phone);
      if (f.email && f.email.required && !email) return fail('Please add your email.', f.email);
      if (!validEmail(email)) return fail('That email address looks off. Please check it.', f.email);
      if (f.zip && f.zip.required && !/^\d{5}$/.test(f.zip.value.trim())) return fail('Please enter a 5 digit ZIP code.', f.zip);

      var consentBox = f.sms_consent;
      var consentText = form.querySelector('[data-consent-text]');
      var payload = {
        form: form.getAttribute('data-form') || 'lead',
        name: name,
        phone: phone,
        email: email,
        zip: f.zip ? f.zip.value.trim() : '',
        address: f.address ? f.address.value.trim() : '',
        own_rent: f.own_rent ? (form.querySelector('[name="own_rent"]:checked') || {}).value || '' : '',
        water_source: f.water_source ? (form.querySelector('[name="water_source"]:checked') || {}).value || '' : '',
        message: f.message ? f.message.value.trim().slice(0, 2000) : '',
        sms_consent: !!(consentBox && consentBox.checked),
        sms_consent_text: consentText ? consentText.textContent.replace(/\s+/g, ' ').trim() : '',
        website: f.website ? f.website.value : '',          // honeypot, must stay empty
        elapsed_ms: Date.now() - started,
        attribution: attribution(),
        quiz: ss ? readJSON(ss, 'wl_quiz') : null
      };

      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body && res.body.error || 'send failed');
          track('generate_lead', { form: payload.form });
          writeJSON(ss || { setItem: function () {} }, 'wl_lead', { name: name, phone: phone, email: email, form: payload.form });
          var next = form.getAttribute('data-redirect') || '/thank-you/';
          location.href = next;
        })
        .catch(function (err) {
          if (btn) { btn.disabled = false; btn.textContent = btnText; }
          fail((err && err.message && err.message !== 'send failed' && err.message.length < 140 ? err.message + ' ' : '') +
            'If this keeps happening, call or text (636) 538-9009 and we will get you scheduled.');
        });
    });
  });

  /* Thank-you page: load the GHL booking calendar, prefilled with what they just typed */
  var cal = document.getElementById('ghl-calendar');
  if (cal) {
    var calId = cal.getAttribute('data-calendar-id');
    var lead = ss ? readJSON(ss, 'wl_lead') : null;
    var nameEl = document.querySelector('[data-lead-name]');
    if (lead && lead.name && nameEl) nameEl.textContent = ', ' + lead.name.split(' ')[0];
    if (!calId || calId.indexOf('PASTE') === 0) {
      cal.innerHTML = '<div class="ph" style="min-height:600px">Booking calendar goes here<small>Add your GHL calendar ID in thank-you/index.html (see README)</small></div>';
    } else {
      var src = 'https://api.leadconnectorhq.com/widget/booking/' + encodeURIComponent(calId);
      if (lead) {
        var parts = (lead.name || '').trim().split(/\s+/);
        var q = new URLSearchParams();
        if (parts[0]) q.set('first_name', parts[0]);
        if (parts.length > 1) q.set('last_name', parts.slice(1).join(' '));
        if (lead.phone) q.set('phone', lead.phone);
        if (lead.email) q.set('email', lead.email);
        if (q.toString()) src += '?' + q.toString();
      }
      var iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'Book your free water test';
      iframe.setAttribute('scrolling', 'no');
      iframe.id = calId + '_wl';
      cal.innerHTML = '';
      cal.appendChild(iframe);
      var s = document.createElement('script');
      s.src = 'https://link.msgsndr.com/js/form_embed.js';
      s.async = true;
      document.body.appendChild(s);
    }
  }

  /* Footer year */
  var y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();
})();
