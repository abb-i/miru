// Miru — Overlay renderer (shared by the breath and block pages)
// Builds self-contained, theme-aware DOM into a given root (document.body of a
// full extension page). Exposes window.MiruOverlay.

(() => {
  const SPIRAL = 'M24 28 C24 28 24 20 28 16 C32 12 36 14 36 20 C36 28 30 36 22 40 C14 44 10 40 12 34 C14 26 20 18 28 14 C36 10 42 14 42 22 C42 32 36 42 26 48';

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

/* Breath */
.miru-breath{display:flex;flex-direction:column;align-items:center;gap:2.6rem;transition:opacity .5s ease;}
.miru-breath.hide{opacity:0;}
.miru-orb{position:relative;width:220px;height:220px;display:flex;align-items:center;justify-content:center;
  transform:scale(1);opacity:.85;will-change:transform,opacity;}
.miru-ring{position:absolute;left:50%;top:50%;border-radius:50%;border:1.5px solid var(--green);}
.miru-ring.r1{width:64px;height:64px;margin:-32px 0 0 -32px;opacity:.95;animation:miru-drift 9s ease-in-out infinite;}
.miru-ring.r2{width:124px;height:124px;margin:-62px 0 0 -62px;opacity:.5;animation:miru-drift 9s ease-in-out infinite .7s;}
.miru-ring.r3{width:188px;height:188px;margin:-94px 0 0 -94px;opacity:.22;animation:miru-drift 9s ease-in-out infinite 1.4s;}
.miru-core{position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;border-radius:50%;
  background:radial-gradient(circle, var(--green) 0%, transparent 66%);opacity:.16;}
.miru-spiral{position:absolute;left:50%;top:50%;width:46px;height:54px;margin:-27px 0 0 -23px;opacity:.5;}
@keyframes miru-drift{0%,100%{transform:scale(1);}50%{transform:scale(1.06);}}
.miru-phase{font-size:12px;text-transform:uppercase;letter-spacing:.32em;color:var(--accent);text-indent:.32em;min-height:1em;
  transition:opacity .4s ease;}
.miru-word{font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-weight:300;font-size:32px;color:var(--text);
  opacity:0;transition:opacity .6s ease;min-height:1.3em;text-align:center;padding:0 24px;}
.miru-word.show{opacity:.92;}

.miru-pill{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);font-family:ui-monospace,Menlo,monospace;
  font-size:10px;color:var(--muted);background:var(--surface);border:.5px solid var(--border);border-radius:20px;
  padding:5px 14px;max-width:70vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.miru-skip{position:fixed;bottom:28px;right:30px;font-size:11px;color:var(--muted);cursor:pointer;opacity:0;
  transition:opacity .5s ease;user-select:none;}
.miru-skip.show{opacity:.7;}
.miru-skip:hover{opacity:1;color:var(--accent);}

/* Continue choice */
.miru-choice{display:none;flex-direction:column;align-items:center;gap:1.3rem;text-align:center;padding:0 24px;}
.miru-choice.show{display:flex;animation:miru-rise .7s ease both;}
.miru-arrive{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:300;font-size:36px;color:var(--text);}
.miru-q{font-size:13px;color:var(--muted);max-width:340px;}
.miru-q b{font-weight:400;color:var(--text);}
.miru-actions{display:flex;gap:1rem;align-items:center;margin-top:.6rem;flex-wrap:wrap;justify-content:center;}
.miru-continue{font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:300;font-size:18px;color:#f7f5ef;
  background:var(--green);border:none;border-radius:8px;padding:11px 28px;cursor:pointer;transition:background .2s ease;}
.miru-continue:hover{background:var(--green-dark);}
.miru-ghost{font-size:13px;color:var(--muted);background:none;border:.5px solid var(--border);border-radius:20px;
  padding:10px 22px;cursor:pointer;transition:all .2s ease;}
.miru-ghost:hover{color:var(--text);border-color:var(--muted);}

/* Block */
.miru-block{display:flex;flex-direction:column;align-items:center;gap:1.6rem;text-align:center;padding:0 24px;
  animation:miru-rise .9s ease both;}
.miru-block .miru-spiral-lg{opacity:.9;animation:miru-pulse 7s ease-in-out infinite;}
@keyframes miru-pulse{0%,100%{opacity:.78;transform:scale(1);}50%{opacity:1;transform:scale(1.04);}}
.miru-not{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:38px;color:var(--text);}
@keyframes miru-rise{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:none;}}
`;

  function ensureStyle(root) {
    if (root.querySelector('style[data-miru]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-miru', '1');
    s.textContent = CSS;
    root.appendChild(s);
  }
  function spiralSVG(w, h, cls) {
    return `<svg class="${cls}" viewBox="0 0 48 56" width="${w}" height="${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="${SPIRAL}" stroke="#2da96e" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.9"/></svg>`;
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
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&family=DM+Sans:wght@300;400&display=swap';
    (document.head || document.documentElement).appendChild(link);
  }

  function renderBreath(root, opts) {
    ensureStyle(root);
    const o = document.createElement('div');
    o.className = 'miru-overlay miru-' + (opts.theme === 'light' ? 'light' : 'dark');
    const domain = hostnameOf(opts.domain || '');
    o.innerHTML = `
      <div class="miru-breath">
        <div class="miru-orb">
          <div class="miru-core"></div>
          <div class="miru-ring r3"></div>
          <div class="miru-ring r2"></div>
          <div class="miru-ring r1"></div>
          ${spiralSVG(46, 54, 'miru-spiral')}
        </div>
        <div class="miru-phase">Breathe</div>
        <div class="miru-word"></div>
      </div>
      <div class="miru-choice">
        <div class="miru-arrive"></div>
        <div class="miru-q">${domain ? `Continue to <b>${domain}</b>?` : 'Continue?'}</div>
        <div class="miru-actions">
          <button class="miru-continue">continue</button>
          <button class="miru-ghost miru-back">go back</button>
        </div>
      </div>
      ${domain ? `<div class="miru-pill">${domain}</div>` : ''}
      <div class="miru-skip">skip</div>`;
    root.appendChild(o);

    const orb = o.querySelector('.miru-orb');
    const phaseEl = o.querySelector('.miru-phase');
    const wordEl = o.querySelector('.miru-word');
    const skipEl = o.querySelector('.miru-skip');
    const breathView = o.querySelector('.miru-breath');
    const choiceView = o.querySelector('.miru-choice');

    const PHASES = [
      { n: 'Inhale', ms: 4000, s: 1.55, op: 1.0 },
      { n: 'Hold',   ms: 3000, s: 1.55, op: 1.0 },
      { n: 'Exhale', ms: 5000, s: 1.0,  op: 0.6 }
    ];
    let idx = 0, phaseTimer = null, ended = false;

    function runPhase() {
      const p = PHASES[idx];
      const secs = p.ms / 1000;
      orb.style.transition = `transform ${secs}s cubic-bezier(.37,0,.63,1), opacity ${secs}s ease`;
      orb.style.transform = `scale(${p.s})`;
      orb.style.opacity = p.op;
      phaseEl.textContent = p.n;
      if (p.n === 'Inhale') rotateWord();
      phaseTimer = setTimeout(() => { idx = (idx + 1) % PHASES.length; runPhase(); }, p.ms);
    }
    function rotateWord() {
      wordEl.classList.remove('show');
      setTimeout(() => { wordEl.textContent = word(opts.pool || 'navigation'); wordEl.classList.add('show'); }, 550);
    }
    wordEl.textContent = word(opts.pool || 'navigation');
    requestAnimationFrame(() => wordEl.classList.add('show'));
    runPhase();

    const autoTimer = setTimeout(endBreath, Math.max(3, opts.duration || 15) * 1000);

    function endBreath() {
      if (ended) return;
      ended = true;
      clearTimeout(phaseTimer);
      clearTimeout(autoTimer);
      if (opts.askContinue) {
        breathView.classList.add('hide');
        setTimeout(() => {
          breathView.style.display = 'none';
          const pill = o.querySelector('.miru-pill'); if (pill) pill.style.display = 'none';
          skipEl.style.display = 'none';
          o.querySelector('.miru-arrive').textContent = word('focusStart') || 'Arriving.';
          choiceView.classList.add('show');
        }, 500);
      } else {
        dismiss(opts.onDone);
      }
    }

    if (opts.skippable) skipEl.classList.add('show');
    else setTimeout(() => skipEl.classList.add('show'), 5000);
    skipEl.addEventListener('click', endBreath);

    o.querySelector('.miru-continue').addEventListener('click', () => dismiss(opts.onContinue));
    o.querySelector('.miru-back').addEventListener('click', () => dismiss(opts.onBack));

    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (!ended) endBreath();
      else dismiss(opts.askContinue ? opts.onContinue : opts.onDone);
    }
    document.addEventListener('keydown', onKey, true);

    function dismiss(cb) {
      clearTimeout(phaseTimer);
      clearTimeout(autoTimer);
      o.classList.add('fade-out');
      setTimeout(() => {
        document.removeEventListener('keydown', onKey, true);
        o.remove();
        if (typeof cb === 'function') cb();
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
        ${spiralSVG(50, 58, 'miru-spiral-lg')}
        <div class="miru-not"></div>
        ${domain ? `<div class="miru-pill" style="position:static;transform:none;">${domain}</div>` : ''}
        <button class="miru-ghost miru-back">go back</button>
      </div>`;
    root.appendChild(o);
    o.querySelector('.miru-not').textContent = word(opts.night ? 'night' : 'blocker') || 'Not today.';

    function leave() { dismiss(opts.onBack); }
    o.querySelector('.miru-back').addEventListener('click', leave);
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

  window.MiruOverlay = { injectFonts, renderBreath, renderBlock };
})();
