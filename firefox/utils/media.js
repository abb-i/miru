// Miru — Capture watch (runs in the page's own MAIN world)
//
// The periodic breath belongs everywhere except mid-call and mid-recording, so
// Miru needs to know when a microphone, camera or screen capture is live. That
// is only observable from inside the page, where getUserMedia lives — so this
// wraps it and marks <html data-miru-capture> while any track is running. The
// worker reads that one attribute (see captureActive in background.js); nothing
// else crosses between the worlds, and no page data is ever read.
//
// Frames report upward by postMessage, so a call inside an iframe (most video
// apps) still marks the top document.
(() => {
  const ATTR = 'data-miru-capture';
  const md = navigator.mediaDevices;
  if (!md || md.__miruWatched) return;
  md.__miruWatched = true;

  let live = 0;              // capturing tracks in this frame
  const frames = new Set();  // child frames currently reporting capture

  function anyLive() {
    // A frame removed from the DOM can never send its "off" — prune the dead.
    for (const w of [...frames]) {
      try { if (w.closed) frames.delete(w); } catch (e) { frames.delete(w); }
    }
    return live > 0 || frames.size > 0;
  }

  function mark() {
    if (window !== window.top) {
      try { parent.postMessage({ __miruCapture: anyLive() }, '*'); } catch (e) {}
      return;
    }
    const el = document.documentElement;
    if (!el) return;
    if (anyLive()) el.setAttribute(ATTR, '1');
    else el.removeAttribute(ATTR);
  }

  addEventListener('message', (e) => {
    if (!e.data || typeof e.data.__miruCapture !== 'boolean') return;
    if (e.data.__miruCapture) frames.add(e.source);
    else frames.delete(e.source);
    mark();
  });

  // Each track is counted once and released once — a track can both fire
  // 'ended' and be stopped by hand, so the release is guarded.
  function watch(stream) {
    for (const t of stream.getTracks()) {
      live++;
      let held = true;
      const release = () => {
        if (!held) return;
        held = false;
        live = Math.max(0, live - 1);
        mark();
      };
      t.addEventListener('ended', release, { once: true });
      const stop = t.stop.bind(t);
      t.stop = function () { stop(); release(); };
    }
    mark();
  }

  for (const name of ['getUserMedia', 'getDisplayMedia']) {
    const orig = md[name];
    if (typeof orig !== 'function') continue;
    md[name] = function (...args) {
      return orig.apply(this, args).then((stream) => {
        try { watch(stream); } catch (e) {}
        return stream;
      });
    };
  }
})();
