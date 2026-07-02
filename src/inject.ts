// FeedHacker — page-world (MAIN) loader hook. Runs at document_start, BEFORE LinkedIn
// boots, and wraps IntersectionObserver so we capture the real feed-loader callback
// LinkedIn registers on its bottom sentinel. A "feedhacker:kick" event then invokes that
// callback directly with a synthetic "intersecting" entry — calling LinkedIn's OWN
// load-more code, not faking a scroll (synthetic scrolls are ignored by LinkedIn).
(function () {
  "use strict";
  if (window.__feedhackerLoaderHook) return;
  window.__feedhackerLoaderHook = true;
  var Native = window.IntersectionObserver;
  if (!Native) return;

  var records = [];
  function Patched(cb, opts) {
    var inst = new Native(cb, opts);
    var rec = { cb: cb, inst: inst, targets: [] };
    records.push(rec);
    var obs = inst.observe.bind(inst);
    inst.observe = function (el) { if (rec.targets.indexOf(el) === -1) rec.targets.push(el); return obs(el); };
    if (inst.unobserve) {
      var uno = inst.unobserve.bind(inst);
      inst.unobserve = function (el) { var i = rec.targets.indexOf(el); if (i >= 0) rec.targets.splice(i, 1); return uno(el); };
    }
    if (inst.disconnect) {
      var dis = inst.disconnect.bind(inst);
      inst.disconnect = function () { rec.targets.length = 0; return dis(); };
    }
    return inst;
  }
  Patched.prototype = Native.prototype;
  try { Object.defineProperty(window, "IntersectionObserver", { value: Patched, writable: true, configurable: true }); }
  catch (e) { try { (window as any).IntersectionObserver = Patched; } catch (e2) { return; } }

  function entry(t) {
    var r;
    try { r = t.getBoundingClientRect(); } catch (e) { r = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    return {
      isIntersecting: true, intersectionRatio: 1, target: t,
      time: (window.performance && performance.now) ? performance.now() : Date.now(),
      boundingClientRect: r, intersectionRect: r,
      rootBounds: { top: 0, left: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight, x: 0, y: 0 }
    };
  }

  // Invoke the loader-like observers. Heuristic: infinite-scroll sentinels are watched by
  // observers with only a FEW targets (image lazy-loaders watch many), so firing the
  // small-target observers hits LinkedIn's feed loader without mass-firing everything.
  function kick(broad) {
    var fired = 0;
    records.forEach(function (rec) {
      if (!broad && rec.targets.length > 3) return;
      var live = rec.targets.filter(function (t) { return t && t.isConnected; });
      if (!live.length) return;
      try { rec.cb(live.map(entry), rec.inst); fired++; } catch (e) {}
    });
    return fired;
  }

  // Per-load token, shared via a documentElement attribute (both worlds see the DOM, but a
  // generic page script no longer knows the exact event name to fire). Not a hard boundary —
  // a page script can read the attribute — but it defeats blind/hardcoded-name abuse, and the
  // kick only drives LinkedIn's own feed loader (carries no data).
  var TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { document.documentElement.setAttribute("data-feedhacker-hook", TOKEN); } catch (e) {}
  document.addEventListener("feedhacker:kick:" + TOKEN, function () { kick(false); }, true);
  document.addEventListener("feedhacker:kickBroad:" + TOKEN, function () { kick(true); }, true);
})();
