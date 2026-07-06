"use strict";
// Shared test setup. The extension modules use a UMD wrapper that attaches their
// API to `self`; in Node we point `self` at the global object so every module sees
// the others (feed.js needs FeedHackerScorer/Matcher/Filters, etc.), exactly as
// they'd share `window` in the browser.
global.self = global;

// Tests run against the compiled output in build/ (see `pretest` -> tsc).
const filters = require("../build/filters.js");
const logger = require("../build/logger.js");
const selectors = require("../build/selectors.js");
const matcher = require("../build/matcher.js");
const scorer = require("../build/scorer.js");
const authors = require("../build/authors.js");
const customfilters = require("../build/customfilters.js");
const update = require("../build/update.js");
const feed = require("../build/feed.js");

const { JSDOM } = require("jsdom");

function makeDoc(html) {
  const dom = new JSDOM(html || "<!doctype html><html><body></body></html>", {
    url: "https://www.linkedin.com/feed/"
  });
  return dom.window.document;
}

module.exports = { filters, logger, selectors, matcher, scorer, authors, customfilters, update, feed, makeDoc, JSDOM };
