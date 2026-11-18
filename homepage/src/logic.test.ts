import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyOverrides,
  calendarYear,
  chromaOf,
  formatClock,
  frequency,
  knownBrowser,
  linkSegments,
  motionPlan,
  parseSite,
  place,
  readVisitor,
  shade,
  shouldWarn,
  type Catalog,
  type Settings,
} from "./logic.ts";

const site = parseSite(JSON.parse(readFileSync(new URL("../public/site.json", import.meta.url), "utf8")));

function fixture(): { settings: Settings; catalog: Catalog } {
  return structuredClone(site);
}

test("copyright year follows the time zone across the new year", () => {
  const before = new Date("2026-12-31T14:59:00Z");
  const after = new Date("2026-12-31T15:30:00Z");
  assert.equal(calendarYear(before, "Asia/Seoul"), 2026);
  assert.equal(calendarYear(after, "Asia/Seoul"), 2027);
  assert.equal(formatClock(after, "Asia/Seoul"), "00:30:00");
  assert.equal(calendarYear(after, "Not/AZone"), null);
  assert.equal(formatClock(after, "Not/AZone"), null);
});

test("unreadable screen values do not raise a warning", () => {
  const settings = site.settings;
  assert.equal(shouldWarn({ width: null, height: null, userAgent: null }, settings), false);
  assert.equal(shouldWarn({ width: null, height: null, userAgent: "   " }, settings), false);
  assert.equal(shouldWarn({ width: Number.NaN, height: 900, userAgent: null }, settings), false);
  assert.equal(shouldWarn({ width: 1000, height: 800, userAgent: null }, settings), true);
  assert.equal(
    shouldWarn({ width: 1400, height: 900, userAgent: "Mozilla/5.0 Chrome/120.0.0.0" }, settings),
    false,
  );
  assert.equal(shouldWarn({ width: 1400, height: 900, userAgent: "SomeBrowser/1.0" }, settings), true);
  assert.equal(knownBrowser("Mozilla/5.0 Version/17.0 Safari/605.1.15"), true);
});

test("visitor overrides replace only valid values and reset to the file", () => {
  const changed = applyOverrides(site.settings, {
    placement: "coordinates",
    multiCategory: "each",
    showSpecSentence: true,
    midGray: "#777777",
    lang: "en",
    copyrightTimeZone: "Mars/Base",
    placementIgnored: true,
  });
  assert.equal(changed.placement, "coordinates");
  assert.equal(changed.multiCategory, "each");
  assert.equal(changed.showSpecSentence, true);
  assert.equal(changed.midGray, "#777777");
  assert.equal(changed.lang, "en");
  assert.equal(changed.copyrightTimeZone, "Asia/Seoul");
  assert.equal(applyOverrides(site.settings, null).placement, "rule");
  assert.deepEqual(readVisitor("not json"), { overrides: {}, bookmarks: [] });
});

test("coordinates and the scatter rule are different and stable", () => {
  const { catalog, settings } = fixture();
  const rule = place(catalog, "scatter", { ...settings, placement: "rule" });
  const again = place(catalog, "scatter", { ...settings, placement: "rule" });
  const saved = place(catalog, "scatter", { ...settings, placement: "coordinates" });
  assert.deepEqual(rule, again);
  const drawing = saved.find((node) => node.id === "d1");
  assert.equal(drawing?.x, 760);
  assert.notEqual(rule.find((node) => node.id === "d1")?.x, 760);
});

test("a work with several categories can sit once or on every orbit", () => {
  const { catalog, settings } = fixture();
  const once = place(catalog, "field", { ...settings, multiCategory: "single" });
  const each = place(catalog, "field", { ...settings, multiCategory: "each" });
  assert.equal(once.filter((node) => node.id === "p2").length, 1);
  assert.equal(each.filter((node) => node.id === "p2").length, 2);
  const lines = linkSegments(catalog, once, "field", "single");
  assert.equal(lines.some((edge) => edge.includes("label:language")), true);
});

test("size grows to the right and music uses length", () => {
  const { catalog, settings } = fixture();
  const placed = place(catalog, "size", { ...settings, sizeAxis: "split" });
  const short = placed.find((node) => node.id === "m1");
  const long = placed.find((node) => node.id === "m2");
  const small = placed.find((node) => node.id === "d1");
  const large = placed.find((node) => node.id === "d2");
  assert.ok(short && long && small && large);
  assert.ok(long.x > short.x);
  assert.ok(large.x > small.x);
});

test("saturation uses mood for music and keeps undated works at the end", () => {
  const { catalog, settings } = fixture();
  const chroma = place(catalog, "saturation", settings);
  const pale = chroma.find((node) => node.id === "p2");
  const vivid = chroma.find((node) => node.id === "p1");
  const calm = chroma.find((node) => node.id === "m1");
  const heavy = chroma.find((node) => node.id === "m2");
  assert.ok(pale && vivid && calm && heavy);
  assert.ok(vivid.x > pale.x);
  assert.ok(heavy.x > calm.x);
  assert.equal(chromaOf(catalog.works.find((work) => work.id === "m2")!, "music"), 70);
  const years = place(catalog, "year", settings);
  const early = years.find((node) => node.id === "v2");
  const late = years.find((node) => node.id === "p2");
  const undated = years.find((node) => node.id === "t2");
  assert.ok(early && late && undated);
  assert.ok(late.x > early.x);
  assert.ok(undated.x > late.x);
});

test("frequency counts writings, works, and mentions", () => {
  const boundary = site.catalog.concepts.find((concept) => concept.id === "boundary");
  assert.ok(boundary);
  const count = frequency(boundary, site.catalog);
  assert.equal(count.quotes, 1);
  assert.equal(count.works, 2);
  assert.equal(count.mentions, 5);
});

test("reduced motion removes the entrance wait", () => {
  assert.deepEqual(motionPlan(site.settings, true), { expandMs: 0, holdMs: 0, fadeMs: 0, wipeMs: 0 });
  assert.equal(motionPlan({ ...site.settings, respectReducedMotion: false }, true).holdMs, 2000);
});

test("middle gray derives a lighter and darker shadow", () => {
  assert.equal(shade("#808080", 78), "#cecece");
  assert.equal(shade("#808080", -78), "#323232");
  assert.equal(shade("gray", 10), null);
});

test("the shipped content file parses and its links resolve", () => {
  assert.equal(site.catalog.sample, true);
  assert.equal(site.settings.midGray, "#808080");
  const placed = place(site.catalog, "scatter", site.settings);
  assert.ok(linkSegments(site.catalog, placed, "scatter", "single").length > 0);
  assert.throws(() => parseSite({}), /settings/);
});
