import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeQuery, containsDevanagari } from "../../src/catalog/language";
import { isEnemiesToLoversQuery, buildFtsQuery } from "../../src/catalog/tropes";

describe("Phase 5BQ Multilingual & Typo Search Unit Tests", () => {
  it("detects Devanagari script correctly", () => {
    assert.equal(containsDevanagari("मुझे एक धमाकेदार एक्शन मूवी चाहिए"), true);
    assert.equal(containsDevanagari("mujhe ek dhamakedar action movie chahiye"), false);
    assert.equal(containsDevanagari("romantic movie"), false);
  });

  it("extracts inferred media type from natural Hindi and English queries", () => {
    const q1 = analyzeQuery("mujhe ek dhamakedar action movie chahiye");
    assert.equal(q1.inferredContentType, "MOVIE");

    const q2 = analyzeQuery("मुझे एक रोमांटिक फिल्म चाहिए जिसमें अचानक ट्विस्ट आए");
    assert.equal(q2.inferredContentType, "MOVIE");

    const q3 = analyzeQuery("कोई मजेदार फैमिली कॉमेडी सीरीज बताओ");
    assert.equal(q3.inferredContentType, "SERIES");

    const q4 = analyzeQuery("A cynical high school student who sees through everyone");
    assert.equal(q4.inferredContentType, undefined);
  });

  it("recovers typos in query keywords", () => {
    const q1 = analyzeQuery("mujhe ek dhamakedar acton movi chahiye");
    assert.equal(q1.hasTypoCorrection, true);
    assert.ok(q1.searchTokens.includes("action"));

    const q2 = analyzeQuery("romntic suspense movie with unexpected twist");
    assert.equal(q2.hasTypoCorrection, true);
    assert.ok(q2.searchTokens.includes("romantic"));

    const q3 = analyzeQuery("enemies to lovrs rivalry");
    assert.equal(q3.hasTypoCorrection, true);
    assert.ok(q3.searchTokens.includes("lovers"));
  });

  it("maps Hinglish keywords to grounded English catalog concepts", () => {
    const q1 = analyzeQuery("ek ladka apne dushman ki beti se pyar karne lagta hai");
    assert.equal(q1.isHindiOrHinglish, true);
    assert.ok(q1.searchTokens.includes("hero") || q1.searchTokens.includes("boy"));
    assert.ok(q1.searchTokens.includes("enemies") || q1.searchTokens.includes("enemy"));
    assert.ok(q1.searchTokens.includes("daughter"));
    assert.ok(q1.searchTokens.includes("love") || q1.searchTokens.includes("romance"));
  });

  it("maps Devanagari keywords to grounded English concepts", () => {
    const q1 = analyzeQuery("एक लड़का अपने दुश्मन की बेटी से प्यार करने लगता है");
    assert.equal(q1.isHindiOrHinglish, true);
    assert.ok(q1.searchTokens.includes("hero") || q1.searchTokens.includes("boy"));
    assert.ok(q1.searchTokens.includes("enemies") || q1.searchTokens.includes("enemy"));
    assert.ok(q1.searchTokens.includes("daughter"));
    assert.ok(q1.searchTokens.includes("love") || q1.searchTokens.includes("romance"));
  });

  it("identifies enemies-to-lovers in Hindi, Hinglish, typos, and natural English", () => {
    assert.equal(isEnemiesToLoversQuery("enemies to lovrs rivalry"), true);
    assert.equal(isEnemiesToLoversQuery("I want a movie where enemies fall in love"), true);
    assert.equal(isEnemiesToLoversQuery("ek ladka apne dushman ki beti se pyar karne lagta hai"), true);
    assert.equal(isEnemiesToLoversQuery("एक लड़का अपने दुश्मन की बेटी से प्यार करने लगता है"), true);
    assert.equal(isEnemiesToLoversQuery("A hero falls in love with his enemy's daughter"), false); // hero + enemy daughter (family feud, not enemies to lovers)
  });

  it("preserves exact title search tokens without modification", () => {
    const q1 = analyzeQuery("Breaking Bad");
    assert.equal(q1.isHindiOrHinglish, false);
    assert.equal(q1.hasTypoCorrection, false);
    assert.deepEqual(q1.searchTokens, ["breaking", "bad"]);

    const q2 = analyzeQuery("Sam & Cat");
    assert.equal(q2.isHindiOrHinglish, false);
    assert.deepEqual(q2.searchTokens, ["sam", "cat"]);
  });

  it("builds valid FTS queries for Hinglish and Devanagari queries", () => {
    const fts1 = buildFtsQuery("mujhe ek dhamakedar action movie chahiye");
    assert.ok(fts1.includes("action"));

    const fts2 = buildFtsQuery("aisi story jisme hero baar baar past mein chala jata hai");
    assert.ok(fts2.includes("past") || fts2.includes("loop") || fts2.includes("reliving"));

    const fts3 = buildFtsQuery("कोई मजेदार फैमिली कॉमेडी सीरीज बताओ");
    assert.ok(fts3.includes("comedy") || fts3.includes("family"));
  });
});
