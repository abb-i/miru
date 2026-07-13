// Miru — Overlay renderer (shared by the breath, block and onboarding pages)
// Builds self-contained, theme-aware DOM into a given root (document.body of a
// full extension page). Exposes window.MiruOverlay.
//
// The breath is the unfurling fern: Miru's spiral draws itself into being on
// the inhale, holds complete, and releases on the exhale — seeds drift free,
// ripples spread with each in-breath. There is no skip: the breath always
// completes its whole cycles, and a quiet row of dots shows how far along it is.

(() => {
  const SPIRAL = 'M24 28 C24 28 24 20 28 16 C32 12 36 14 36 20 C36 28 30 36 22 40 C14 44 10 40 12 34 C14 26 20 18 28 14 C36 10 42 14 42 22 C42 32 36 42 26 48';

  // Guided breath patterns. `draw` is how much of the spiral is drawn at the
  // end of the phase (0..1); `release` frees seeds; `still` shimmers gently.
  const PATTERNS = {
    settle: {
      label: 'Settle', hint: 'in 4 · hold 3 · out 6',
      desc: 'A steady, exhale-weighted breath. The default.',
      phases: [
        { n: 'Inhale', ms: 4000, draw: 1, s: 1.3, glow: 0.3 },
        { n: 'Hold',   ms: 3000, draw: 1, s: 1.3, glow: 0.3, still: true },
        { n: 'Exhale', ms: 6000, draw: 0, s: 1,   glow: 0.12, release: true }
      ]
    },
    sigh: {
      label: 'Sigh', hint: 'in · in again · long out',
      desc: 'Two inhales, one long exhale — the fastest way the body knows to settle.',
      phases: [
        { n: 'Inhale',       ms: 2600, draw: 0.7, s: 1.16, glow: 0.22 },
        { n: 'Inhale again', ms: 1400, draw: 1,   s: 1.34, glow: 0.32 },
        { n: 'Exhale',       ms: 7000, draw: 0,   s: 1,    glow: 0.1, release: true }
      ]
    },
    box: {
      label: 'Box', hint: '4 · 4 · 4 · 4',
      desc: 'Equal sides, like the walls of a quiet room.',
      phases: [
        { n: 'Inhale', ms: 4000, draw: 1, s: 1.3, glow: 0.3 },
        { n: 'Hold',   ms: 4000, draw: 1, s: 1.3, glow: 0.3, still: true },
        { n: 'Exhale', ms: 4000, draw: 0, s: 1,   glow: 0.12, release: true },
        { n: 'Still',  ms: 4000, draw: 0, s: 1,   glow: 0.12, still: true }
      ]
    }
  };
  const EASE = 'cubic-bezier(.37,0,.63,1)';

  const CSS = `
.miru-overlay{position:fixed;inset:0;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;
  z-index:2147483647;font-family:'DM Sans',system-ui,-apple-system,Segoe UI,sans-serif;font-weight:300;
  -webkit-font-smoothing:antialiased;background:var(--bg);color:var(--text);opacity:1;}
.miru-overlay>*{animation:miru-in .8s ease both;}
.miru-overlay.fade-out{animation:miru-out .4s ease forwards;}
@keyframes miru-in{from{opacity:0}to{opacity:1}}
@keyframes miru-out{to{opacity:0}}
.miru-overlay.miru-dark{--bg:#16160f;--text:#ece9df;--muted:#9d9b91;--accent:#7dd4a8;--green:#2da96e;--green-dark:#1d7a4e;--border:#34332a;--surface:#23231c;}
.miru-overlay.miru-light{--bg:#f7f5ef;--text:#3d3d3a;--muted:#888780;--accent:#1d7a4e;--green:#2da96e;--green-dark:#1d7a4e;--border:#c8c6bd;--surface:#ede9df;}

/* Breath — the unfurling fern */
.miru-breath{display:flex;flex-direction:column;align-items:center;gap:2.2rem;transition:opacity .5s ease;}
.miru-breath.hide{opacity:0;}
.miru-orb{position:relative;width:240px;height:240px;display:flex;align-items:center;justify-content:center;
  transform:scale(1);will-change:transform;}
.miru-glow{position:absolute;left:50%;top:50%;width:180px;height:180px;margin:-90px 0 0 -90px;border-radius:50%;
  background:radial-gradient(circle, var(--green) 0%, transparent 62%);opacity:.12;}
.miru-fern{position:relative;width:118px;height:138px;overflow:visible;}
.miru-fern path{fill:none;stroke-width:1.7;stroke-linecap:round;}
.miru-fern-ghost{stroke:var(--green);opacity:.14;}
.miru-fern-live{stroke:var(--green);opacity:.95;filter:drop-shadow(0 0 6px rgba(45,169,110,.35));}
.miru-orb.still .miru-fern-live{animation:miru-shimmer 2.8s ease-in-out infinite;}
@keyframes miru-shimmer{0%,100%{opacity:.88;}50%{opacity:1;}}
.miru-ripple{position:absolute;left:50%;top:50%;width:200px;height:200px;margin:-100px 0 0 -100px;border-radius:50%;
  border:1px solid var(--green);opacity:0;transform:scale(.55);pointer-events:none;
  animation:miru-ripple var(--dur) cubic-bezier(.2,.55,.4,1) forwards;}
@keyframes miru-ripple{from{opacity:.28;transform:scale(.55);}to{opacity:0;transform:scale(1.45);}}
.miru-seed{position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:50%;background:var(--green);
  opacity:0;pointer-events:none;animation:miru-seed var(--dur) ease-out forwards;}
@keyframes miru-seed{from{opacity:.55;transform:translate(0,0) scale(1);}to{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.6);}}

.miru-phase{font-size:12px;text-transform:uppercase;letter-spacing:.32em;color:var(--accent);text-indent:.32em;min-height:1em;}
.miru-word{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:32px;color:var(--text);
  opacity:0;transition:opacity .6s ease;min-height:1.3em;text-align:center;padding:0 24px;}
.miru-word.show{opacity:.92;}
.miru-sub{font-size:13px;color:var(--muted);min-height:1em;text-align:center;padding:0 24px;margin-top:-1.4rem;}
.miru-cycles{display:flex;gap:9px;margin-top:-.9rem;}
.miru-cycles i{width:4px;height:4px;border-radius:50%;background:var(--muted);opacity:.4;
  transition:background .8s ease,opacity .8s ease;}
.miru-cycles i.done{background:var(--green);opacity:.9;}

.miru-pill{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);font-family:ui-monospace,Menlo,monospace;
  font-size:10px;color:var(--muted);background:var(--surface);border:.5px solid var(--border);border-radius:20px;
  padding:5px 14px;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* Continue choice */
.miru-choice{display:none;flex-direction:column;align-items:center;gap:1.3rem;text-align:center;padding:0 24px;}
.miru-choice.show{display:flex;animation:miru-rise .7s ease both;}
.miru-arrive{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:300;font-size:36px;color:var(--text);}
.miru-q{font-size:13px;color:var(--muted);max-width:340px;}
.miru-q b{font-weight:400;color:var(--text);}
.miru-intent{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:22px;color:var(--text);
  background:none;border:none;border-bottom:.5px solid var(--border);outline:none;text-align:center;
  padding:6px 10px;width:min(300px,80vw);transition:border-color .3s ease;}
.miru-intent:focus{border-color:var(--green);}
.miru-intent::placeholder{color:var(--muted);opacity:.55;}
.miru-actions{display:flex;gap:1rem;align-items:center;margin-top:.6rem;flex-wrap:wrap;justify-content:center;}
.miru-continue{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:19px;color:#f7f5ef;
  background:var(--green);border:none;border-radius:8px;padding:11px 28px;cursor:pointer;transition:background .2s ease;}
.miru-continue:hover{background:var(--green-dark);}
.miru-ghost{font-size:13px;color:var(--muted);background:none;border:.5px solid var(--border);border-radius:20px;
  padding:10px 22px;cursor:pointer;transition:all .2s ease;}
.miru-ghost:hover{color:var(--text);border-color:var(--muted);}

/* Block */
.miru-block{display:flex;flex-direction:column;align-items:center;gap:1.6rem;text-align:center;padding:0 24px;
  animation:miru-rise .9s ease both;}
.miru-block .miru-spiral-lg{opacity:.9;}
.miru-not{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:38px;color:var(--text);}
.miru-peek{font-size:12px;color:var(--muted);background:none;border:none;cursor:pointer;
  letter-spacing:.02em;opacity:.65;transition:opacity .2s ease,color .2s ease;padding:4px 8px;margin-top:-.6rem;}
.miru-peek:hover{opacity:1;color:var(--text);}
.miru-peek-note{font-size:11px;color:var(--muted);opacity:.5;letter-spacing:.02em;margin-top:-1rem;}
@keyframes miru-rise{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
`;

  function ensureStyle(root) {
    // Prefer a constructable stylesheet: it applies even under a strict page CSP
    // (where an injected <style> can be dropped) when the breath rides on top of
    // an arbitrary site. Fall back to a <style> element where it isn't supported.
    const doc = root.ownerDocument || document;
    try {
      if (doc.adoptedStyleSheets && 'replaceSync' in CSSStyleSheet.prototype) {
        if (doc.__miruSheet) return;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        doc.__miruSheet = true;
        return;
      }
    } catch (e) { /* fall through to a plain <style> */ }
    if (root.querySelector('style[data-miru]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-miru', '1');
    s.textContent = CSS;
    root.appendChild(s);
  }
  function word(pool) { return (typeof getWord === 'function') ? getWord(pool) : ''; }
  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
  }
  function injectFonts() {
    if (document.getElementById('miru-fonts')) return;
    const link = document.createElement('link');
    link.id = 'miru-fonts';
    link.rel = 'stylesheet';
    // Bundled locally — no network request, keeps "nothing leaves your device" true.
    link.href = chrome.runtime.getURL('assets/fonts/fonts.css');
    (document.head || document.documentElement).appendChild(link);
  }

  function renderBreath(root, opts) {
    ensureStyle(root);
    const o = document.createElement('div');
    o.className = 'miru-overlay miru-' + (opts.theme === 'light' ? 'light' : 'dark');
    const domain = hostnameOf(opts.domain || '');
    const pattern = PATTERNS[opts.pattern] || PATTERNS.settle;
    const cycleMs = pattern.phases.reduce((a, p) => a + p.ms, 0);
    const totalCycles = Math.max(1, Math.round(((opts.duration || 15) * 1000) / cycleMs)) + (opts.extraCycles || 0);

    o.innerHTML = `
      <div class="miru-breath">
        <div class="miru-orb">
          <div class="miru-glow"></div>
          <svg class="miru-fern" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
            <path class="miru-fern-ghost" d="${SPIRAL}"/>
            <path class="miru-fern-live" d="${SPIRAL}"/>
          </svg>
        </div>
        <div class="miru-phase">Breathe</div>
        <div class="miru-word"></div>
        ${opts.subtitle ? `<div class="miru-sub">${opts.subtitle}</div>` : ''}
        ${totalCycles > 1 ? `<div class="miru-cycles">${'<i></i>'.repeat(totalCycles)}</div>` : ''}
      </div>
      <div class="miru-choice">
        <div class="miru-arrive"></div>
        ${opts.intentionPrompt
          ? `<div class="miru-q">One word to carry into today.</div>
             <input class="miru-intent" maxlength="40" placeholder="e.g. clarity" spellcheck="false" autocomplete="off">`
          : `<div class="miru-q">${domain ? `Continue to <b>${domain}</b>?` : 'Continue?'}</div>`}
        <div class="miru-actions">
          <button class="miru-continue">continue</button>
          <button class="miru-ghost miru-back">go back</button>
        </div>
      </div>
      ${domain ? `<div class="miru-pill">${domain}</div>` : ''}`;
    root.appendChild(o);

    const orb = o.querySelector('.miru-orb');
    const glow = o.querySelector('.miru-glow');
    const live = o.querySelector('.miru-fern-live');
    const phaseEl = o.querySelector('.miru-phase');
    const wordEl = o.querySelector('.miru-word');
    const breathView = o.querySelector('.miru-breath');
    const choiceView = o.querySelector('.miru-choice');
    const intentEl = o.querySelector('.miru-intent');
    const cycleDots = o.querySelectorAll('.miru-cycles i');

    // The spiral starts undrawn; each inhale draws it, each exhale releases it.
    const L = live.getTotalLength();
    live.style.strokeDasharray = String(L);
    live.style.strokeDashoffset = String(L);
    live.getBoundingClientRect(); // flush so the first transition animates

    let idx = 0, cycle = 0, prevDraw = 0, phaseTimer = null, ended = false;

    function spawnRipple(ms) {
      const r = document.createElement('div');
      r.className = 'miru-ripple';
      r.style.setProperty('--dur', ms + 'ms');
      orb.appendChild(r);
      setTimeout(() => r.remove(), ms + 100);
    }
    function releaseSeeds(ms) {
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('div');
        s.className = 'miru-seed';
        s.style.setProperty('--dur', Math.round(ms * (0.7 + Math.random() * 0.3)) + 'ms');
        s.style.setProperty('--dx', Math.round(-46 + Math.random() * 92) + 'px');
        s.style.setProperty('--dy', Math.round(-70 - Math.random() * 50) + 'px');
        s.style.animationDelay = Math.round(Math.random() * ms * 0.15) + 'ms';
        orb.appendChild(s);
        setTimeout(() => s.remove(), ms + 400);
      }
    }
    function runPhase() {
      const p = pattern.phases[idx];
      const secs = p.ms / 1000;
      live.style.transition = `stroke-dashoffset ${secs}s ${EASE}`;
      live.style.strokeDashoffset = String(L * (1 - p.draw));
      orb.style.transition = `transform ${secs}s ${EASE}`;
      orb.style.transform = `scale(${p.s})`;
      glow.style.transition = `opacity ${secs}s ease`;
      glow.style.opacity = String(p.glow);
      orb.classList.toggle('still', !!p.still);
      phaseEl.textContent = p.n;
      if (p.draw > prevDraw) spawnRipple(p.ms);
      if (p.release) releaseSeeds(p.ms);
      prevDraw = p.draw;
      if (idx === 0 && cycle > 0) rotateWord();
      phaseTimer = setTimeout(() => {
        idx++;
        if (idx >= pattern.phases.length) {
          idx = 0;
          if (cycleDots[cycle]) cycleDots[cycle].classList.add('done');
          cycle++;
          if (cycle >= totalCycles) { endBreath(); return; }
        }
        runPhase();
      }, p.ms);
    }
    function rotateWord() {
      wordEl.classList.remove('show');
      setTimeout(() => { wordEl.textContent = word(opts.pool || 'navigation'); wordEl.classList.add('show'); }, 550);
    }
    wordEl.textContent = word(opts.pool || 'navigation');
    requestAnimationFrame(() => wordEl.classList.add('show'));
    runPhase();

    function endBreath() {
      if (ended) return;
      ended = true;
      clearTimeout(phaseTimer);
      if (opts.askContinue) {
        breathView.classList.add('hide');
        setTimeout(() => {
          breathView.style.display = 'none';
          o.querySelector('.miru-arrive').textContent = word('focusStart') || 'Arriving.';
          choiceView.classList.add('show');
          if (intentEl) intentEl.focus();
        }, 500);
      } else {
        dismiss(opts.onDone);
      }
    }

    const intention = () => (intentEl ? intentEl.value.trim() : '');
    o.querySelector('.miru-continue').addEventListener('click', () => dismiss(opts.onContinue, intention()));
    o.querySelector('.miru-back').addEventListener('click', () => dismiss(opts.onBack, intention()));
    if (intentEl) intentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dismiss(opts.onContinue, intention());
    });

    // The breath itself cannot be skipped. Keys only act once it has finished.
    function onKey(e) {
      if (e.key !== 'Escape' || !ended) return;
      dismiss(opts.askContinue ? opts.onContinue : opts.onDone, intention());
    }
    document.addEventListener('keydown', onKey, true);

    function dismiss(cb, value) {
      clearTimeout(phaseTimer);
      o.classList.add('fade-out');
      setTimeout(() => {
        document.removeEventListener('keydown', onKey, true);
        o.remove();
        if (typeof cb === 'function') cb(value);
      }, 400);
    }
    return { destroy: () => dismiss() };
  }

  function renderBlock(root, opts) {
    ensureStyle(root);
    const o = document.createElement('div');
    o.className = 'miru-overlay miru-' + (opts.theme === 'light' ? 'light' : 'dark');
    const domain = hostnameOf(opts.domain || '');
    o.innerHTML = `
      <div class="miru-block">
        <svg class="miru-spiral-lg" viewBox="0 0 48 56" width="50" height="58" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="${SPIRAL}" stroke="#2da96e" stroke-width="1.6" stroke-linecap="round" fill="none"/>
        </svg>
        <div class="miru-not"></div>
        ${domain ? `<div class="miru-pill" style="position:static;transform:none;">${domain}</div>` : ''}
        <button class="miru-ghost miru-back">go back</button>
        ${opts.onPeek ? `<button class="miru-peek">stay five minutes</button>` : ''}
        ${opts.onPeek && opts.peekNote ? `<div class="miru-peek-note">${opts.peekNote}</div>` : ''}
      </div>`;
    root.appendChild(o);
    o.querySelector('.miru-not').textContent = word('blocker') || 'Not today.';

    // The spiral draws itself in once — a held breath, not an alarm.
    const p = o.querySelector('.miru-spiral-lg path');
    const L = p.getTotalLength();
    p.style.strokeDasharray = String(L);
    p.style.strokeDashoffset = String(L);
    p.getBoundingClientRect();
    p.style.transition = `stroke-dashoffset 2.6s ${EASE}`;
    p.style.strokeDashoffset = '0';

    function leave() { dismiss(opts.onBack); }
    o.querySelector('.miru-back').addEventListener('click', leave);
    const peekBtn = o.querySelector('.miru-peek');
    if (peekBtn && typeof opts.onPeek === 'function') peekBtn.addEventListener('click', () => dismiss(opts.onPeek));
    function onKey(e) { if (e.key === 'Escape') leave(); }
    document.addEventListener('keydown', onKey, true);

    function dismiss(cb) {
      o.classList.add('fade-out');
      setTimeout(() => {
        document.removeEventListener('keydown', onKey, true);
        o.remove();
        if (typeof cb === 'function') cb();
      }, 400);
    }
    return { destroy: () => dismiss() };
  }

  window.MiruOverlay = { injectFonts, renderBreath, renderBlock, PATTERNS };
})();
