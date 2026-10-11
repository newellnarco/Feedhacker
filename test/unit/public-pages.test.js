"use strict";
// FH-074: the public site (docs/, served by GitHub Pages) is the ONLY part of FeedHacker that
// outsiders can reach — the repository is private. The Chrome Web Store refused to publish
// 0.12.0 with "Support URL is not reachable", and the landing page and privacy policy both
// linked to github.com/newellnarco/Feedhacker, a 404 to everyone but the maintainer. These
// checks keep every public page pointing only at things the public can open.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const DOCS = path.join(__dirname, "..", "..", "docs");
const pages = fs.readdirSync(DOCS).filter((f) => f.endsWith(".html"));
const read = (f) => fs.readFileSync(path.join(DOCS, f), "utf8");
const hrefs = (html) => [...html.matchAll(/\bhref="([^"]+)"/g)].map((m) => m[1]);

test("no public page links into the private repository", () => {
  for (const f of pages) {
    const bad = hrefs(read(f)).filter((h) => /github\.com\/newellnarco\/feedhacker/i.test(h));
    assert.deepStrictEqual(bad, [], `${f} links to the private repo`);
  }
});

test("every relative link on a public page resolves to a published file", () => {
  for (const f of pages) {
    for (const h of hrefs(read(f))) {
      if (/^(https?:|mailto:|#)/.test(h)) continue;
      const target = h.split("#")[0];
      assert.ok(fs.existsSync(path.join(DOCS, target)), `${f} links to missing ${h}`);
    }
  }
});

test("the support page exists and the landing page and privacy policy link to it", () => {
  assert.ok(pages.includes("support.html"), "docs/support.html is the store's Support URL");
  for (const f of ["index.html", "privacy-policy.html"]) {
    assert.ok(hrefs(read(f)).includes("support.html"), `${f} links to support.html`);
  }
});

test("the store listing names the public support page as its Support URL", () => {
  const listing = fs.readFileSync(path.join(__dirname, "..", "..", "store", "listing.md"), "utf8");
  assert.match(listing, /\*\*Support URL:\*\* `https:\/\/newellnarco\.github\.io\/Feedhacker\/support\.html`/);
});

test("the support page gives the publisher's email and website", () => {
  const h = hrefs(read("support.html"));
  assert.ok(h.includes("mailto:info@maxresearchcollective.com"), "contact email");
  assert.ok(h.includes("https://www.maxresearchcollective.com"), "publisher website");
});
