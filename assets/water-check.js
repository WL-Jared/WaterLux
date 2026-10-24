/* WaterLux Water Check
   ----------------------------------------------------------------------------
   HOW TO EDIT THE RECOMMENDATIONS
   1. SYSTEMS: the 6 systems. Change names, one-liners or page links here.
   2. SYMPTOMS: every checkbox on the questionnaire. For each one:
        label    what the customer sees
        systems  which systems it points to, most important first
                 (use the keys from SYSTEMS: carbon, softener, complete, air, uv, ro)
        why      short reason shown in the results
        wellOnly / cityOnly (optional) only apply that system for that water source
        next     (optional) "where to look" advice shown in the results
   3. COMBINE: when a customer needs both a softener and a carbon tower,
      the results recommend WaterLux Complete (one tank that does both).
   ---------------------------------------------------------------------------- */
(function () {
  'use strict';

  var SYSTEMS = {
    complete: { name: 'WaterLux Complete', short: 'Softening and carbon filtration in one tank, custom built for your family', url: '/complete-system/' },
    softener: { name: 'WaterLux Soft', short: 'Removes the hard minerals behind spots and scale', url: '/systems/water-softener/' },
    carbon:   { name: 'WaterLux Carbon', short: 'Whole-home filtration for chlorine taste and smell', url: '/systems/carbon-tower/' },
    air:      { name: 'Air Injection System', short: 'Removes iron, manganese and rotten egg smell', url: '/systems/air-injection/' },
    uv:       { name: 'UV Light', short: 'A chemical-free finishing stage for well water', url: '/systems/uv-light/' },
    ro:       { name: 'WaterLux RO Pro50', short: 'Pure-tasting drinking water at your kitchen sink', url: '/systems/reverse-osmosis/' }
  };

  var SYMPTOMS = {
    spots:      { label: 'Spots on dishes or glasses', systems: ['softener'], why: 'Spots and cloudy film are left behind by hard minerals.' },
    scale:      { label: 'Scale on faucets, showerheads or fixtures', systems: ['softener'], why: 'White, crusty scale is hardness (calcium and magnesium) building up.' },
    chlorine:   { label: 'Chlorine or bleach smell', systems: ['carbon'], why: 'That pool smell is the chlorine or chloramines used to treat city water. Carbon filters it out.' },
    egg:        { label: 'Rotten egg smell', systems: ['air'], why: 'A rotten egg smell is hydrogen sulfide gas, most common in well water.' },
    odor:       { label: 'Another unusual odor (musty, earthy, metallic)', systems: ['carbon', 'air'], why: 'Musty and earthy odors come from compounds that carbon filters out. Metallic odors come from iron.' },
    orange:     { label: 'Orange or reddish-brown stains in sinks or toilets', systems: ['air'], why: 'Orange and rust-colored stains are a classic sign of iron in your water.' },
    black:      { label: 'Black or dark gray stains', systems: ['air'], why: 'Dark stains are manganese, which often shows up alongside iron.' },
    bluegreen:  { label: 'Blue-green stains', systems: [], why: 'Blue-green stains come from acidic water reacting with copper pipes.',
                  next: "We'll test your water's pH at your free test. If your pipes are affected, a plumber may also need to take a look." },
    dryskin:    { label: 'Extremely dry skin or hair', systems: ['softener', 'carbon'], why: 'Hard minerals and chlorine in your water are what leave skin and hair feeling dry.' },
    taste:      { label: 'Bad taste (bleach, metallic, salty or earthy)', systems: ['ro', 'carbon'], why: 'WaterLux RO Pro50 gives you the cleanest-tasting drinking water, and carbon improves taste at every tap.' }
  };

  var ORDER = ['spots', 'scale', 'chlorine', 'egg', 'odor', 'orange', 'black', 'bluegreen', 'dryskin', 'taste'];

  /* ---------------------------------------------------------------------- */

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function recommend(picked, source) {
    var score = {}, reasons = {}, nexts = [];
    picked.forEach(function (id) {
      var s = SYMPTOMS[id];
      if (!s) return;
      s.systems.forEach(function (key, idx) {
        score[key] = (score[key] || 0) + (idx === 0 ? 3 : 1);
        (reasons[key] = reasons[key] || []).push(s.label);
      });
      if (s.next) nexts.push(s.next);
    });
    /* Water source nudges */
    if (source === 'well') {
      score.uv = (score.uv || 0) + 1;
      (reasons.uv = reasons.uv || []).push('Private well (a finishing stage for well water)');
    }
    if (source === 'city' && score.air && !picked.some(function (p) { return p === 'egg' || p === 'orange' || p === 'black'; })) {
      delete score.air;
    }
    /* Softener + carbon together = Complete System */
    if (score.softener && score.carbon) {
      score.complete = score.softener + score.carbon + 1;
      reasons.complete = (reasons.softener || []).concat(reasons.carbon || []).filter(function (v, i, a) { return a.indexOf(v) === i; });
      delete score.softener; delete score.carbon;
    }
    var keys = Object.keys(score).sort(function (a, b) { return score[b] - score[a]; });
    return { keys: keys, reasons: reasons, nexts: nexts };
  }

  function render(widget) {
    var grid = widget.querySelector('[data-symptoms]');
    if (!grid) return;
    grid.innerHTML = ORDER.map(function (id) {
      return '<label><input type="checkbox" name="symptom" value="' + id + '"><span>' + esc(SYMPTOMS[id].label) + '</span></label>';
    }).join('') + '<label><input type="checkbox" name="symptom" value="none"><span>None of these, just curious</span></label>';

    var result = widget.querySelector('[data-wc-result]');
    var btn = widget.querySelector('[data-wc-go]');
    var msg = widget.querySelector('[data-wc-msg]');

    widget.addEventListener('change', function (e) {
      if (e.target.name !== 'symptom') return;
      var none = widget.querySelector('[name="symptom"][value="none"]');
      if (e.target === none && none.checked) widget.querySelectorAll('[name="symptom"]').forEach(function (x) { if (x !== none) x.checked = false; });
      else if (e.target !== none && e.target.checked) none.checked = false;
      if (msg) msg.textContent = '';
    });

    btn.addEventListener('click', function () {
      var picked = [].slice.call(widget.querySelectorAll('[name="symptom"]:checked')).map(function (x) { return x.value; });
      var srcEl = widget.querySelector('[name="wc_source"]:checked');
      var source = srcEl ? srcEl.value : '';
      if (!picked.length) { if (msg) msg.textContent = 'Check at least one box, or "None of these."'; return; }
      if (!source) { if (msg) msg.textContent = 'Let us know where your water comes from.'; return; }
      var real = picked.filter(function (p) { return p !== 'none'; });
      var r = recommend(real, source);
      var book = widget.getAttribute('data-book') || '/free-water-test/#book';
      var html = '';
      if (!r.keys.length && !r.nexts.length) {
        html += '<h3>Good news so far.</h3><p>Nothing you checked points to a specific problem. Every home\'s water is different, though, and many issues (like hardness levels or chlorine) are easy to miss. A free test gives you a clear picture.</p>';
      } else {
        html += '<h3>Here\'s what we\'d recommend looking at.</h3><p>Based on what you checked, these systems are the best match. Your free water test confirms exactly what your home needs.</p>';
        html += '<div class="wc-recs">' + r.keys.map(function (k, i) {
          var s = SYSTEMS[k];
          var why = (r.reasons[k] || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
          return '<a class="wc-rec' + (i === 0 ? ' top' : '') + '" href="' + s.url + '">' + (i === 0 ? '<span class="wc-badge">Best match</span>' : '') +
            '<b>' + esc(s.name) + '</b><span>' + esc(s.short) + '</span>' + (why ? '<small>Because you noticed:</small><ul>' + why + '</ul>' : '') + '<em>Learn more about this system</em></a>';
        }).join('') + '</div>';
        var whys = real.map(function (p) { return SYMPTOMS[p] && SYMPTOMS[p].why; }).filter(Boolean);
        if (whys.length) html += '<details class="wc-why"><summary>Why these recommendations?</summary><ul>' + whys.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></details>';
      }
      if (r.nexts.length) {
        html += '<div class="wc-next"><b>Good to know</b>' + r.nexts.filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (n) { return '<p>' + n + '</p>'; }).join('') + '</div>';
      }
      html += '<p class="note">Only a test at your sink tells you for sure. Booking takes about 30 seconds, and your free consultation goes at your pace.</p>' +
        '<div class="btn-row" style="margin-top:14px"><a class="btn btn-blue" href="' + esc(book) + '">Book My Free Water Consultation</a><button type="button" class="btn btn-line" data-wc-restart>Start Over</button></div>';
      result.innerHTML = html;
      result.hidden = false;
      widget.querySelector('[data-wc-form]').hidden = true;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });

      var save = { symptoms: real.map(function (p) { return SYMPTOMS[p].label; }), source: source, recs: r.keys.map(function (k) { return SYSTEMS[k].name; }) };
      try { sessionStorage.setItem('wl_quiz', JSON.stringify(save)); } catch (e) {}
      document.querySelectorAll('form.lead-form [name="water_source"][value="' + source + '"]').forEach(function (x) { x.checked = true; });
      try { if (window.gtag) window.gtag('event', 'water_check_complete', { top: r.keys[0] || 'none' }); } catch (e) {}

      result.querySelector('[data-wc-restart]').addEventListener('click', function () {
        widget.querySelectorAll('input').forEach(function (x) { x.checked = false; });
        result.hidden = true;
        widget.querySelector('[data-wc-form]').hidden = false;
        widget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  document.querySelectorAll('[data-water-check]').forEach(render);
})();
