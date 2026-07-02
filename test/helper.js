"use strict";
// Shared test setup. The extension modules use a UMD wrapper that attaches their
// API to `self`; in Node we point `self` at the global object so every module sees
// the others (feed.js needs FeedHackerScorer/Matcher/Filters, etc.), exactly as
// they'd share `window` in the browser.
global.self = global;

const filters = require("../filters.js");
const logger = require("../logger.js");
const selectors = require("../selectors.js");
const matcher = require("../matcher.js");
const scorer = require("../scorer.js");
const authors = require("../authors.js");
const customfilters = require("../customfilters.js");
const feed = require("../feed.js");

const { JSDOM } = require("jsdom");

function makeDoc(html) {
  const dom = new JSDOM(html || "<!doctype html><html><body></body></html>", {
    url: "https://www.linkedin.com/feed/"
  });
  return dom.window.document;
}

module.exports = { filters, logger, selectors, matcher, scorer, authors, customfilters, feed, makeDoc, JSDOM };
