"use strict";
var FILTERS = [
  ["Sloppy", "AI slop"], ["Promoted", "Promoted posts"], ["Newsletter", "Newsletter signups"],
  ["Hiring", "Hiring posts"], ["Likes", "Reaction reshares"], ["Job", "New-job announcements"],
  ["Anniversary", "Work anniversaries"], ["Cert", "Training & certification"]
];
var DISPLAY = ["nameNames", "hideCompletely", "hideSlopComments"];
var DEFAULTS = { nameNames: false, hideCompletely: false, hideSlopComments: false, aggressive: false };
FILTERS.forEach(function (f) { DEFAULTS["mute" + f[0]] = (f[0] === "Sloppy"); DEFAULTS["solo" + f[0]] = false; });

var box = document.getElementById("filters");
FILTERS.forEach(function (f) {
  var row = document.createElement("div"); row.className = "frow";
  var name = document.createElement("span"); name.className = "fname"; name.textContent = f[1];
  var m = document.createElement("button"); m.className = "ms"; m.textContent = "M"; m.dataset.key = "mute" + f[0]; m.dataset.kind = "m";
  var s = document.createElement("button"); s.className = "ms"; s.textContent = "S"; s.dataset.key = "solo" + f[0]; s.dataset.kind = "s";
  row.appendChild(name); row.appendChild(m); row.appendChild(s);
  if (f[0] === "Sloppy") {   // Aggressive toggle sits next to AI slop
    var a = document.createElement("button"); a.className = "ms"; a.textContent = "A"; a.dataset.key = "aggressive"; a.dataset.kind = "a";
    a.title = "Aggressive: also apply broader, higher-false-positive AI-slop rules";
    row.appendChild(a);
  }
  box.appendChild(row);
});

function paint(b, on) {
  var cls = b.dataset.kind === "m" ? "m-on" : b.dataset.kind === "s" ? "s-on" : "a-on";
  b.classList.toggle(cls, !!on);
}

chrome.storage.sync.get(DEFAULTS, function (st) {
  document.querySelectorAll(".ms").forEach(function (b) { paint(b, st[b.dataset.key]); });
  DISPLAY.forEach(function (id) { document.getElementById(id).checked = !!st[id]; });
});

document.querySelectorAll(".ms").forEach(function (b) {
  b.addEventListener("click", function () {
    chrome.storage.sync.get(DEFAULTS, function (st) {
      var nv = !st[b.dataset.key];
      var patch = {}; patch[b.dataset.key] = nv;
      chrome.storage.sync.set(patch);
      paint(b, nv);
    });
  });
});
DISPLAY.forEach(function (id) {
  document.getElementById(id).addEventListener("change", function (e) {
    var p = {}; p[id] = e.target.checked; chrome.storage.sync.set(p);
  });
});
