export type Lang = "ko" | "en";
export type Placement = "rule" | "coordinates";
export type MultiCategory = "single" | "each";
export type SizeAxis = "split" | "shared";
export type ExploreMode = "scatter" | "field" | "genre" | "size" | "saturation" | "year";

export interface LocaleText {
  ko: string;
  en: string;
}

export interface Settings {
  lang: Lang;
  artistName: LocaleText;
  statement: LocaleText;
  contact: string;
  midGray: string;
  showSpecSentence: boolean;
  placement: Placement;
  multiCategory: MultiCategory;
  sizeAxis: SizeAxis;
  musicMediumId: string;
  copyrightTimeZone: string;
  referenceWidth: number;
  referenceHeight: number;
  expandMs: number;
  holdMs: number;
  fadeMs: number;
  wipeMs: number;
  respectReducedMotion: boolean;
  showSampleBanner: boolean;
}

export interface Quote {
  text: LocaleText;
  source: LocaleText;
}

export interface Concept {
  id: string;
  word: LocaleText;
  dictionary: LocaleText;
  artistMeaning: LocaleText;
  quotes: Quote[];
  related: string[];
  x?: number;
  y?: number;
}

export interface Work {
  id: string;
  title: LocaleText;
  medium: string;
  fields: string[];
  genres: string[];
  year: number | null;
  size: number | null;
  durationSec: number | null;
  saturation: number | null;
  mood: number | null;
  unit: LocaleText;
  concepts: string[];
  x?: number;
  y?: number;
}

export interface Term {
  id: string;
  label: LocaleText;
}

export interface Catalog {
  sample: boolean;
  media: Term[];
  fields: Term[];
  genres: Term[];
  concepts: Concept[];
  works: Work[];
}

export interface Site {
  settings: Settings;
  catalog: Catalog;
}

export interface Placed {
  key: string;
  id: string;
  kind: "concept" | "work" | "label";
  x: number;
  y: number;
}

export const WORLD = { w: 1200, h: 800 };
export const VISITOR_KEY = "artist-homepage-visitor";

const PLACEMENTS = new Set<Placement>(["rule", "coordinates"]);
const MULTIS = new Set<MultiCategory>(["single", "each"]);
const AXES = new Set<SizeAxis>(["split", "shared"]);
const MODES = new Set<ExploreMode>(["scatter", "field", "genre", "size", "saturation", "year"]);

export function tx(text: LocaleText, lang: Lang): string {
  const value = text[lang]?.trim();
  if (value) return value;
  return text.ko.trim() || text.en.trim();
}

export function isExploreMode(value: string): value is ExploreMode {
  return MODES.has(value as ExploreMode);
}

export function calendarYear(date: Date, timeZone: string): number | null {
  try {
    const year = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(date);
    const parsed = Number(year);
    return Number.isInteger(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function formatClock(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const hour = read("hour");
    const minute = read("minute");
    const second = read("second");
    if (!hour || !minute || !second) return null;
    return `${hour}:${minute}:${second}`;
  } catch {
    return null;
  }
}

export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone || null;
  } catch {
    return null;
  }
}

export function knownBrowser(userAgent: string): boolean {
  if (/Edg\//.test(userAgent)) return true;
  if (/Chrome\//.test(userAgent) || /Chromium\//.test(userAgent)) return true;
  if (/Firefox\//.test(userAgent)) return true;
  if (/Safari\//.test(userAgent) && /Version\//.test(userAgent)) return true;
  return false;
}

export function shouldWarn(
  read: { width: number | null; height: number | null; userAgent: string | null },
  settings: Pick<Settings, "referenceWidth" | "referenceHeight">,
): boolean {
  const widthKnown = positive(read.width);
  const heightKnown = positive(read.height);
  const agent = read.userAgent?.trim() ?? "";
  const agentKnown = agent.length > 0;
  if (!widthKnown && !heightKnown && !agentKnown) return false;
  if (widthKnown && heightKnown && (read.width! < settings.referenceWidth || read.height! < settings.referenceHeight)) {
    return true;
  }
  if (agentKnown && !knownBrowser(agent)) return true;
  return false;
}

export function shade(hex: string, delta: number): string | null {
  const matched = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!matched) return null;
  const value = Number.parseInt(matched[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    clamp(channel + delta, 0, 255),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function motionPlan(
  settings: Pick<Settings, "expandMs" | "holdMs" | "fadeMs" | "wipeMs" | "respectReducedMotion">,
  prefersReduced: boolean,
): { expandMs: number; holdMs: number; fadeMs: number; wipeMs: number } {
  if (prefersReduced && settings.respectReducedMotion) {
    return { expandMs: 0, holdMs: 0, fadeMs: 0, wipeMs: 0 };
  }
  return {
    expandMs: clamp(settings.expandMs, 0, 2000),
    holdMs: clamp(settings.holdMs, 0, 10000),
    fadeMs: clamp(settings.fadeMs, 0, 2000),
    wipeMs: clamp(settings.wipeMs, 0, 2000),
  };
}

export function applyOverrides(base: Settings, raw: unknown): Settings {
  if (!isRecord(raw)) return { ...base, artistName: { ...base.artistName }, statement: { ...base.statement } };
  const next = copySettings(base);
  const lang = raw.lang;
  if (lang === "ko" || lang === "en") next.lang = lang;
  const artistName = localeOf(raw.artistName);
  if (artistName) next.artistName = artistName;
  const statement = localeOf(raw.statement);
  if (statement) next.statement = statement;
  if (typeof raw.contact === "string") next.contact = raw.contact.trim();
  if (typeof raw.midGray === "string" && shade(raw.midGray, 0)) next.midGray = raw.midGray;
  if (typeof raw.showSpecSentence === "boolean") next.showSpecSentence = raw.showSpecSentence;
  if (isPlacement(raw.placement)) next.placement = raw.placement;
  if (isMulti(raw.multiCategory)) next.multiCategory = raw.multiCategory;
  if (isAxis(raw.sizeAxis)) next.sizeAxis = raw.sizeAxis;
  if (typeof raw.musicMediumId === "string" && raw.musicMediumId.trim()) next.musicMediumId = raw.musicMediumId.trim();
  if (typeof raw.copyrightTimeZone === "string" && calendarYear(new Date(), raw.copyrightTimeZone) !== null) {
    next.copyrightTimeZone = raw.copyrightTimeZone;
  }
  assignNumber(next, "referenceWidth", raw.referenceWidth, 320, 8000);
  assignNumber(next, "referenceHeight", raw.referenceHeight, 320, 8000);
  assignNumber(next, "expandMs", raw.expandMs, 0, 2000);
  assignNumber(next, "holdMs", raw.holdMs, 0, 10000);
  assignNumber(next, "fadeMs", raw.fadeMs, 0, 2000);
  assignNumber(next, "wipeMs", raw.wipeMs, 0, 2000);
  if (typeof raw.respectReducedMotion === "boolean") next.respectReducedMotion = raw.respectReducedMotion;
  if (typeof raw.showSampleBanner === "boolean") next.showSampleBanner = raw.showSampleBanner;
  return next;
}

export interface VisitorState {
  overrides: unknown;
  bookmarks: string[];
}

export function readVisitor(raw: string | null): VisitorState {
  if (!raw) return { overrides: {}, bookmarks: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return { overrides: {}, bookmarks: [] };
    const bookmarks = Array.isArray(parsed.bookmarks)
      ? parsed.bookmarks.filter((item): item is string => typeof item === "string")
      : [];
    return { overrides: parsed.overrides ?? {}, bookmarks };
  } catch {
    return { overrides: {}, bookmarks: [] };
  }
}

export function frequency(concept: Concept, catalog: Catalog): { quotes: number; works: number; mentions: number } {
  const quotes = concept.quotes.length;
  const works = catalog.works.filter((work) => work.concepts.includes(concept.id)).length;
  const mentionedBy = catalog.concepts.filter((item) => item.id !== concept.id && item.related.includes(concept.id)).length;
  return { quotes, works, mentions: quotes + works + mentionedBy };
}

export function place(catalog: Catalog, mode: ExploreMode, settings: Settings): Placed[] {
  if (mode === "field" || mode === "genre") return placeOrbital(catalog, mode, settings.multiCategory);
  if (mode === "size") return placeSize(catalog, settings);
  if (mode === "saturation") return placeChroma(catalog, settings.musicMediumId);
  if (mode === "year") return placeYear(catalog);
  return placeScatter(catalog, settings.placement);
}

export function linkSegments(catalog: Catalog, placed: Placed[], mode: ExploreMode, multi: MultiCategory): Array<[string, string]> {
  const keys = new Map<string, string[]>();
  for (const node of placed) {
    const list = keys.get(node.id) ?? [];
    list.push(node.key);
    keys.set(node.id, list);
  }
  const edges = new Set<string>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    edges.add(from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`);
  };
  for (const concept of catalog.concepts) {
    const fromKeys = keys.get(concept.id) ?? [];
    for (const related of concept.related) {
      for (const from of fromKeys) {
        for (const to of keys.get(related) ?? []) add(from, to);
      }
    }
  }
  for (const work of catalog.works) {
    for (const workKey of keys.get(work.id) ?? []) {
      for (const conceptId of work.concepts) {
        for (const conceptKey of keys.get(conceptId) ?? []) add(workKey, conceptKey);
      }
    }
  }
  if ((mode === "field" || mode === "genre") && multi === "single") {
    const axis = mode === "field" ? "fields" : "genres";
    for (const work of catalog.works) {
      const [primary, ...rest] = work[axis];
      const workKeys = (keys.get(work.id) ?? []).filter((key) => key.endsWith(`@${primary}`));
      for (const category of rest) {
        for (const workKey of workKeys) add(workKey, `label:${category}`);
      }
    }
  }
  return [...edges].map((edge) => edge.split("\u0000") as [string, string]);
}

export function metricOf(work: Work, musicMediumId: string): number | null {
  if (work.medium === musicMediumId) return work.durationSec;
  return work.size;
}

export function chromaOf(work: Work, musicMediumId: string): number | null {
  if (work.medium === musicMediumId) return work.mood;
  return work.saturation;
}

export function parseSite(data: unknown): Site {
  const root = record(data, "site");
  return {
    settings: parseSettings(record(root.settings, "settings")),
    catalog: parseCatalog(record(root.catalog, "catalog")),
  };
}

function placeScatter(catalog: Catalog, placement: Placement): Placed[] {
  const placed: Placed[] = [];
  catalog.concepts.forEach((concept, index) => {
    placed.push({
      key: concept.id,
      id: concept.id,
      kind: "concept",
      ...pointFor(concept, placement, spiral(index, catalog.concepts.length, 470, 390, 40, 210)),
    });
  });
  const groups = groupsOf(catalog);
  groups.forEach((group, groupIndex) => {
    const span = (Math.PI * 2) / Math.max(groups.length, 1);
    const base = -Math.PI / 2 + span * (groupIndex + 0.5);
    group.works.forEach((work, workIndex) => {
      const spread = Math.min(span * 0.72, 0.9);
      const step = group.works.length <= 1 ? 0 : spread / (group.works.length - 1);
      const angle = base - spread / 2 + step * workIndex;
      const radius = 330 + (workIndex % 2) * 28;
      placed.push({
        key: work.id,
        id: work.id,
        kind: "work",
        ...pointFor(work, placement, {
          x: 470 + Math.cos(angle) * radius,
          y: 390 + Math.sin(angle) * radius * 0.86,
        }),
      });
    });
  });
  return placed;
}

function placeOrbital(catalog: Catalog, mode: "field" | "genre", multi: MultiCategory): Placed[] {
  const terms = mode === "field" ? catalog.fields : catalog.genres;
  const axis = mode === "field" ? "fields" : "genres";
  const used = terms.filter((term) => catalog.works.some((work) => work[axis].includes(term.id)));
  const placed: Placed[] = catalog.concepts.map((concept, index) => ({
    key: concept.id,
    id: concept.id,
    kind: "concept" as const,
    ...spiral(index, catalog.concepts.length, 470, 400, 18, 120),
  }));
  used.forEach((term, index) => {
    const radius = 175 + index * (used.length <= 1 ? 0 : 230 / Math.max(used.length - 1, 1));
    placed.push({ key: `label:${term.id}`, id: term.id, kind: "label", x: 470 + radius, y: 400 });
    const members = catalog.works.filter((work) => {
      const categories = work[axis];
      if (!categories.includes(term.id)) return false;
      if (multi === "each") return true;
      return categories[0] === term.id;
    });
    members.forEach((work, workIndex) => {
      const angle = -Math.PI / 2 + ((Math.PI * 2) / Math.max(members.length, 1)) * workIndex;
      placed.push({
        key: `${work.id}@${term.id}`,
        id: work.id,
        kind: "work",
        x: 470 + Math.cos(angle) * radius,
        y: 400 + Math.sin(angle) * radius * 0.9,
      });
    });
  });
  const parked = catalog.works.filter((work) => work[axis].length === 0);
  parked.forEach((work, index) => {
    placed.push({ key: work.id, id: work.id, kind: "work", x: 1080, y: 80 + index * 36 });
  });
  return placed;
}

function placeSize(catalog: Catalog, settings: Settings): Placed[] {
  const placed = conceptRow(catalog, 150);
  const lanes = settings.sizeAxis === "shared" ? [{ id: "all", works: catalog.works }] : groupsOf(catalog);
  lanes.forEach((lane, index) => {
    const values = lane.works.map((work) => metricOf(work, settings.musicMediumId)).filter(isNumber);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const span = max - min || 1;
    const y = lanes.length === 1 ? 430 : 250 + (index * 420) / Math.max(lanes.length - 1, 1);
    if (settings.sizeAxis === "split") placed.push({ key: `label:${lane.id}`, id: lane.id, kind: "label", x: 64, y });
    lane.works.forEach((work, workIndex) => {
      const value = metricOf(work, settings.musicMediumId);
      const t = value === null ? 0 : (value - min) / span;
      const jitter = (workIndex - (lane.works.length - 1) / 2) * 18;
      placed.push({ key: work.id, id: work.id, kind: "work", x: 180 + t * 900, y: y + jitter });
    });
  });
  return placed;
}

function placeChroma(catalog: Catalog, musicMediumId: string): Placed[] {
  const placed = conceptRow(catalog, 140);
  const groups = groupsOf(catalog);
  groups.forEach((group, lane) => {
    const y = 230 + lane * (480 / Math.max(groups.length, 1));
    placed.push({
      key: `label:${group.id}`,
      id: group.id,
      kind: "label",
      x: 70,
      y,
    });
    group.works.forEach((work, index) => {
      const value = chromaOf(work, musicMediumId);
      const t = value === null ? 0 : clamp(value, 0, 100) / 100;
      placed.push({
        key: work.id,
        id: work.id,
        kind: "work",
        x: 160 + t * 920,
        y: y + (index - (group.works.length - 1) / 2) * 16,
      });
    });
  });
  return placed;
}

function placeYear(catalog: Catalog): Placed[] {
  const placed = conceptRow(catalog, 160);
  const dated = catalog.works.filter((work) => work.year !== null);
  const years = dated.map((work) => work.year as number);
  const min = years.length ? Math.min(...years) : 0;
  const max = years.length ? Math.max(...years) : 1;
  const span = max - min || 1;
  for (const work of dated.slice().sort((a, b) => (a.year! - b.year!) || a.id.localeCompare(b.id))) {
    const same = dated.filter((item) => item.year === work.year).sort((a, b) => a.id.localeCompare(b.id));
    const slot = same.findIndex((item) => item.id === work.id);
    placed.push({
      key: work.id,
      id: work.id,
      kind: "work",
      x: 140 + ((work.year! - min) / span) * 860,
      y: 520 + (slot - (same.length - 1) / 2) * 28,
    });
  }
  const undated = catalog.works.filter((work) => work.year === null);
  if (undated.length) placed.push({ key: "label:undated", id: "undated", kind: "label", x: 1080, y: 430 });
  undated.forEach((work, index) => {
    placed.push({ key: work.id, id: work.id, kind: "work", x: 1080, y: 470 + index * 32 });
  });
  return placed;
}

function conceptRow(catalog: Catalog, y: number): Placed[] {
  return catalog.concepts.map((concept, index) => {
    const span = catalog.concepts.length <= 1 ? 0 : 860 / (catalog.concepts.length - 1);
    return { key: concept.id, id: concept.id, kind: "concept" as const, x: 150 + span * index, y };
  });
}

function pointFor(item: { x?: number; y?: number }, placement: Placement, fallback: { x: number; y: number }): { x: number; y: number } {
  if (placement === "coordinates" && isNumber(item.x) && isNumber(item.y)) return { x: item.x, y: item.y };
  return fallback;
}

function spiral(index: number, count: number, cx: number, cy: number, inner: number, outer: number): { x: number; y: number } {
  const t = count <= 1 ? 0 : index / (count - 1);
  const angle = index * 2.399963;
  const radius = inner + t * (outer - inner);
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.78 };
}

function groupsOf(catalog: Catalog): Array<{ id: string; works: Work[] }> {
  const known = new Set(catalog.media.map((medium) => medium.id));
  const groups = catalog.media.map((medium) => ({
    id: medium.id,
    works: catalog.works.filter((work) => work.medium === medium.id),
  }));
  const extras = catalog.works.filter((work) => !known.has(work.medium));
  if (extras.length) groups.push({ id: "other", works: extras });
  return groups.filter((group) => group.works.length > 0);
}

function parseSettings(raw: Record<string, unknown>): Settings {
  const lang = raw.lang === "en" ? "en" : "ko";
  const midGray = typeof raw.midGray === "string" && shade(raw.midGray, 0) ? raw.midGray : "#808080";
  return {
    lang,
    artistName: requiredLocale(raw.artistName, "settings.artistName"),
    statement: requiredLocale(raw.statement, "settings.statement"),
    contact: typeof raw.contact === "string" ? raw.contact.trim() : "",
    midGray,
    showSpecSentence: raw.showSpecSentence === true,
    placement: isPlacement(raw.placement) ? raw.placement : "rule",
    multiCategory: isMulti(raw.multiCategory) ? raw.multiCategory : "single",
    sizeAxis: isAxis(raw.sizeAxis) ? raw.sizeAxis : "split",
    musicMediumId: typeof raw.musicMediumId === "string" && raw.musicMediumId.trim() ? raw.musicMediumId.trim() : "music",
    copyrightTimeZone:
      typeof raw.copyrightTimeZone === "string" && calendarYear(new Date(), raw.copyrightTimeZone) !== null
        ? raw.copyrightTimeZone
        : "Asia/Seoul",
    referenceWidth: numberIn(raw.referenceWidth, 1280, 320, 8000),
    referenceHeight: numberIn(raw.referenceHeight, 720, 320, 8000),
    expandMs: numberIn(raw.expandMs, 180, 0, 2000),
    holdMs: numberIn(raw.holdMs, 2000, 0, 10000),
    fadeMs: numberIn(raw.fadeMs, 200, 0, 2000),
    wipeMs: numberIn(raw.wipeMs, 520, 0, 2000),
    respectReducedMotion: raw.respectReducedMotion !== false,
    showSampleBanner: raw.showSampleBanner !== false,
  };
}

function parseCatalog(raw: Record<string, unknown>): Catalog {
  const concepts = arrayOf(raw.concepts, "catalog.concepts").map((item, index) => parseConcept(item, `catalog.concepts[${index}]`));
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const works = arrayOf(raw.works, "catalog.works").map((item, index) => parseWork(item, `catalog.works[${index}]`, conceptIds));
  return {
    sample: raw.sample === true,
    media: arrayOf(raw.media, "catalog.media").map((item, index) => parseTerm(item, `catalog.media[${index}]`)),
    fields: arrayOf(raw.fields, "catalog.fields").map((item, index) => parseTerm(item, `catalog.fields[${index}]`)),
    genres: arrayOf(raw.genres, "catalog.genres").map((item, index) => parseTerm(item, `catalog.genres[${index}]`)),
    concepts,
    works,
  };
}

function parseTerm(data: unknown, path: string): Term {
  const raw = record(data, path);
  const id = requiredString(raw.id, `${path}.id`);
  return { id, label: requiredLocale(raw.label, `${path}.label`) };
}

function parseConcept(data: unknown, path: string): Concept {
  const raw = record(data, path);
  const related = stringList(raw.related, `${path}.related`);
  const quotes = arrayOf(raw.quotes, `${path}.quotes`).map((item, index) => {
    const quote = record(item, `${path}.quotes[${index}]`);
    return {
      text: requiredLocale(quote.text, `${path}.quotes[${index}].text`),
      source: requiredLocale(quote.source, `${path}.quotes[${index}].source`),
    };
  });
  return {
    id: requiredString(raw.id, `${path}.id`),
    word: requiredLocale(raw.word, `${path}.word`),
    dictionary: requiredLocale(raw.dictionary, `${path}.dictionary`),
    artistMeaning: requiredLocale(raw.artistMeaning, `${path}.artistMeaning`),
    quotes,
    related,
    ...optionalPoint(raw),
  };
}

function parseWork(data: unknown, path: string, conceptIds: Set<string>): Work {
  const raw = record(data, path);
  const concepts = stringList(raw.concepts, `${path}.concepts`);
  for (const concept of concepts) {
    if (!conceptIds.has(concept)) throw new Error(`${path}.concepts references missing concept ${concept}`);
  }
  return {
    id: requiredString(raw.id, `${path}.id`),
    title: requiredLocale(raw.title, `${path}.title`),
    medium: requiredString(raw.medium, `${path}.medium`),
    fields: stringList(raw.fields, `${path}.fields`),
    genres: stringList(raw.genres, `${path}.genres`),
    year: nullableNumber(raw.year, `${path}.year`),
    size: nullableNumber(raw.size, `${path}.size`),
    durationSec: nullableNumber(raw.durationSec, `${path}.durationSec`),
    saturation: nullableNumber(raw.saturation, `${path}.saturation`),
    mood: nullableNumber(raw.mood, `${path}.mood`),
    unit: requiredLocale(raw.unit, `${path}.unit`),
    concepts,
    ...optionalPoint(raw),
  };
}

function optionalPoint(raw: Record<string, unknown>): { x?: number; y?: number } {
  if (typeof raw.x === "number" && Number.isFinite(raw.x) && typeof raw.y === "number" && Number.isFinite(raw.y)) {
    return { x: raw.x, y: raw.y };
  }
  return {};
}

function copySettings(base: Settings): Settings {
  return { ...base, artistName: { ...base.artistName }, statement: { ...base.statement } };
}

function assignNumber<K extends "referenceWidth" | "referenceHeight" | "expandMs" | "holdMs" | "fadeMs" | "wipeMs">(
  settings: Settings,
  key: K,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  settings[key] = clamp(value, min, max);
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function requiredLocale(value: unknown, path: string): LocaleText {
  const locale = localeOf(value);
  if (!locale) throw new Error(`${path} needs ko and en text`);
  return locale;
}

function localeOf(value: unknown): LocaleText | null {
  if (!isRecord(value) || typeof value.ko !== "string" || typeof value.en !== "string") return null;
  return { ko: value.ko, en: value.en };
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} needs text`);
  return value.trim();
}

function stringList(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${path} needs a list of text`);
  return value.map((item) => item.trim()).filter(Boolean);
}

function nullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${path} needs a number or null`);
}

function arrayOf(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} needs a list`);
  return value;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} needs an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlacement(value: unknown): value is Placement {
  return typeof value === "string" && PLACEMENTS.has(value as Placement);
}

function isMulti(value: unknown): value is MultiCategory {
  return typeof value === "string" && MULTIS.has(value as MultiCategory);
}

function isAxis(value: unknown): value is SizeAxis {
  return typeof value === "string" && AXES.has(value as SizeAxis);
}

function positive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
