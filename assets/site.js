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
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
  function fmtPhone(v) {
    var d = digits(v); if (d.length === 11 && d[0] === '1') d = d.slice(1); d = d.slice(0, 10);
    if (d.length > 6) return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    if (d.length > 3) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    if (d.length) return '(' + d;
    return '';
  }
  var DOMAIN_FIX = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com',
    'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com',
    'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'aol.co': 'aol.com', 'charter.ner': 'charter.net', 'att.ner': 'att.net' };

  /* Each rule returns '' when the box is good, or a friendly note on what to fix */
  var RULES = {
    name: function (v) { v = v.trim(); if (!v) return 'Please add your name.'; if (v.length < 2) return 'Please add your full name.'; return ''; },
    phone: function (v) { if (!digits(v)) return 'Please add your mobile number.'; return validPhone(v) ? '' : 'Phone numbers need 10 digits, like (636) 555-0123.'; },
    email: function (v) { v = v.trim(); if (!v) return 'Please add your email.'; return validEmail(v) ? '' : 'Please check your email. It should look like name@example.com.'; },
    zip: function (v) { v = v.trim(); if (!v) return 'Please add your ZIP code.'; return /^\d{5}$/.test(v) ? '' : 'ZIP codes are 5 numbers, like 63367.'; }
  };

  document.querySelectorAll('form.lead-form').forEach(function (form) {
    var started = Date.now();
    var msg = form.querySelector('.form-msg');
    var btn = form.querySelector('button[type="submit"]');
    var btnText = btn ? btn.textContent : '';

    function wrap(input) { return input && input.closest('.field'); }
    function setState(input, err) {
      var w = wrap(input); if (!w) return;
      var e = w.querySelector('.ferr');
      if (err) { input.setAttribute('aria-invalid', 'true'); w.classList.add('has-err'); w.classList.remove('is-ok'); if (e) e.textContent = err; }
      else { input.removeAttribute('aria-invalid'); w.classList.remove('has-err'); if (e) e.textContent = ''; w.classList.toggle('is-ok', !!input.value.trim() && !w.querySelector('.email-fix')); }
    }
    function check(input, strict) {
      var rule = RULES[input.name]; if (!rule) return '';
      var err = rule(input.value);
      if (!strict && !input.value.trim()) { setState(input, ''); return err; }  // don't scold an untouched box
      setState(input, err);
      return err;
    }
    function suggestEmail(input) {
      var w = wrap(input); if (!w) return;
      var old = w.querySelector('.email-fix'); if (old) old.remove();
      var v = input.value.trim(), at = v.lastIndexOf('@'); if (at < 1) return;
      var fix = DOMAIN_FIX[v.slice(at + 1).toLowerCase()]; if (!fix) return;
      var better = v.slice(0, at + 1) + fix;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'email-fix'; b.innerHTML = 'Did you mean <b></b>? Tap to fix.';
      b.querySelector('b').textContent = better;
      b.addEventListener('click', function () { input.value = better; b.remove(); check(input, true); });
      w.appendChild(b);
      w.classList.remove('is-ok');
    }
    function fail(text, field) {
      if (msg) { msg.textContent = text; msg.className = 'form-msg err'; }
      if (field) field.focus();
    }

    form.addEventListener('input', function (e) {
      var t = e.target;
      if (t.name === 'phone') {
        var pos = t.selectionStart == null ? t.value.length : t.selectionStart;
        var before = digits(t.value.slice(0, pos)).length;   // digits left of the cursor
        var f = fmtPhone(t.value);
        if (f !== t.value) {
          t.value = f;
          var i = 0, seen = 0;
          while (i < f.length && seen < before) { if (/\d/.test(f[i])) seen++; i++; }
          try { t.setSelectionRange(i, i); } catch (x) {}
        }
      }
      if (t.name === 'zip') { var z = digits(t.value).slice(0, 5); if (z !== t.value) t.value = z; }
      if (!RULES[t.name]) return;
      // While typing: clear the note as soon as it's fixed, and show the check mark when complete
      if (!RULES[t.name](t.value)) setState(t, '');
      else if (wrap(t).classList.contains('has-err')) check(t, true);
      else wrap(t).classList.remove('is-ok');
      if (msg && msg.classList.contains('err')) { msg.textContent = ''; msg.className = 'form-msg'; }
    });
    form.addEventListener('focusout', function (e) {
      if (RULES[e.target.name]) { check(e.target, false); if (e.target.name === 'email') suggestEmail(e.target); }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (msg) { msg.textContent = ''; msg.className = 'form-msg'; }
      var f = form.elements;
      var first = null, count = 0;
      ['name', 'phone', 'email', 'zip'].forEach(function (k) {
        var el = f[k]; if (!el || !el.tagName) return;
        if (check(el, true)) { count++; if (!first) first = el; }
      });
      if (first) return fail(count === 1 ? 'Almost there. Please fix the box marked in red.' : 'Almost there. Please fix the ' + count + ' boxes marked in red.', first);
      var name = f.name.value.trim();
      var phone = f.phone.value.trim();
      var email = (f.email && f.email.value || '').trim();

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
    var calUrl = cal.getAttribute('data-calendar-url') || '';
    var calId = cal.getAttribute('data-calendar-id') || '';
    var lead = ss ? readJSON(ss, 'wl_lead') : null;
    var nameEl = document.querySelector('[data-lead-name]');
    if (lead && lead.name && nameEl) nameEl.textContent = ', ' + lead.name.split(' ')[0];
    if (!/^https:\/\//.test(calUrl) && (!calId || calId.indexOf('PASTE') === 0)) {
      cal.innerHTML = '<div class="ph" style="min-height:600px">Booking calendar goes here<small>Add your GHL calendar ID in thank-you/index.html (see README)</small></div>';
    } else {
      var src = /^https:\/\//.test(calUrl) ? calUrl.split('?')[0] : 'https://api.leadconnectorhq.com/widget/booking/' + encodeURIComponent(calId);
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
      iframe.title = 'Book your free water consultation';
      iframe.setAttribute('scrolling', 'no');
      iframe.id = (calId || calUrl.split('/').pop()) + '_wl';
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
