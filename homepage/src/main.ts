import rawSite from "../public/site.json";
import {
  VISITOR_KEY,
  WORLD,
  applyOverrides,
  calendarYear,
  chromaOf,
  deviceTimeZone,
  formatClock,
  frequency,
  linkSegments,
  metricOf,
  motionPlan,
  parseSite,
  place,
  readVisitor,
  shade,
  shouldWarn,
  tx,
  type Concept,
  type ExploreMode,
  type Lang,
  type Placed,
  type Settings,
  type Term,
  type Work,
} from "./logic";
import { t, type StringKey } from "./strings";

const site = parseSite(rawSite);
const app = document.querySelector("#app");
if (!app) throw new Error("missing app");

const stored = readVisitor(localStorage.getItem(VISITOR_KEY));
let settings = applyOverrides(site.settings, stored.overrides);
let bookmarks = new Set(stored.bookmarks);
let screen: "gate" | "explore" | "search" = "gate";
let mode: ExploreMode = "scatter";
let popup: { kind: "concept" | "work"; id: string } | null = null;
let sheet = false;
let query = "";
let mediumFilter = "";
let fieldFilter = "";
let genreFilter = "";
let bookmarksOnly = false;
let sortKey = "title";
let sortDir: 1 | -1 = 1;
let entering = false;
const view = { x: 0, y: 0, s: 1 };
let fitKey = "";
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

type FocusMark = { id: string; start: number | null; end: number | null };

boot();

function boot(): void {
  motionQuery.addEventListener("change", () => {
    paintTheme();
    render();
  });
  window.addEventListener("resize", () => {
    paintWarning();
    if (screen === "explore") maybeFit(true);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (popup) {
      popup = null;
      render();
      return;
    }
    if (sheet) {
      sheet = false;
      render();
    }
  });
  window.setInterval(paintTime, 1000);
  render();
}

function render(): void {
  const mark = captureFocus();
  app!.replaceChildren();
  paintTheme();
  app!.append(chrome());
  if (screen === "gate") app!.append(gate());
  if (screen === "explore") app!.append(explore());
  if (screen === "search") app!.append(search());
  app!.append(legal());
  if (sheet) app!.append(settingsSheet());
  if (popup) app!.append(detail());
  restoreFocus(mark);
  paintTime();
}

function chrome(): HTMLElement {
  const bar = el("div", "chrome");
  if (screen !== "gate") {
    bar.append(button(t(settings.lang, "home"), () => {
      screen = "gate";
      popup = null;
      render();
    }));
  }
  bar.append(
    button(t(settings.lang, "langKo"), () => setLang("ko"), settings.lang === "ko"),
    button(t(settings.lang, "langEn"), () => setLang("en"), settings.lang === "en"),
    button(t(settings.lang, "settings"), () => {
      sheet = !sheet;
      if (sheet) popup = null;
      render();
    }, sheet),
  );
  return bar;
}

function gate(): HTMLElement {
  const root = el("div", "gate");
  const explorePane = el("button", "pane explore-pane");
  explorePane.type = "button";
  explorePane.append(el("span", "pane-copy", exploreCopy()));
  explorePane.addEventListener("click", (event) => enter("explore", event, "#000000", "#ffffff"));
  const searchPane = el("button", "pane search-pane");
  searchPane.type = "button";
  searchPane.append(el("span", "pane-copy", t(settings.lang, "searchLead")));
  searchPane.addEventListener("click", (event) => enter("search", event, "#ffffff", "#000000"));
  const mid = el("div", "pane mid");
  const clocks = el("div", "clocks");
  clocks.append(
    paragraph("clock-label raised", t(settings.lang, "deviceClock")),
    paragraph("clock-time raised", "—", { "data-clock": "device" }),
    paragraph("clock-label raised", t(settings.lang, "koreaClock")),
    paragraph("clock-time raised", "—", { "data-clock": "korea" }),
    paragraph("warn raised", t(settings.lang, "warn"), { "data-warn": "" }),
  );
  const warn = clocks.querySelector("[data-warn]");
  const width = Number.isFinite(window.innerWidth) ? window.innerWidth : null;
  const height = Number.isFinite(window.innerHeight) ? window.innerHeight : null;
  warn?.toggleAttribute("hidden", !shouldWarn({ width, height, userAgent: navigator.userAgent || null }, settings));
  mid.append(clocks);
  root.append(explorePane, mid, searchPane);
  bindHover(root, explorePane, searchPane);
  queueMicrotask(paintWarning);
  return root;
}

function bindHover(root: HTMLElement, explorePane: HTMLElement, searchPane: HTMLElement): void {
  const set = (name: string) => {
    root.classList.toggle("is-explore", name === "is-explore");
    root.classList.toggle("is-search", name === "is-search");
  };
  explorePane.addEventListener("pointerenter", () => set("is-explore"));
  searchPane.addEventListener("pointerenter", () => set("is-search"));
  root.addEventListener("pointerleave", () => set(""));
  explorePane.addEventListener("focus", () => set("is-explore"));
  searchPane.addEventListener("focus", () => set("is-search"));
}

function explore(): HTMLElement {
  const root = el("div", "explore");
  const tabs = el("div", "tabs");
  const modes: Array<[ExploreMode, StringKey]> = [
    ["scatter", "scatter"],
    ["field", "field"],
    ["genre", "genre"],
    ["size", "size"],
    ["saturation", "saturation"],
    ["year", "year"],
  ];
  for (const [value, key] of modes) {
    const tab = button(t(settings.lang, key), () => {
      mode = mode === value && value !== "scatter" ? "scatter" : value;
      render();
    });
    tab.setAttribute("aria-selected", mode === value ? "true" : "false");
    tabs.append(tab);
  }
  const viewport = el("div", "viewport");
  const world = el("div", "world");
  world.style.width = `${WORLD.w}px`;
  world.style.height = `${WORLD.h}px`;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "links");
  svg.setAttribute("viewBox", `0 0 ${WORLD.w} ${WORLD.h}`);
  svg.setAttribute("width", String(WORLD.w));
  svg.setAttribute("height", String(WORLD.h));
  const nodes = el("div", "nodes");
  world.append(svg, nodes);
  viewport.append(world);
  root.append(tabs, paragraph("hint", t(settings.lang, "panHint")), paragraph("sample", t(settings.lang, "sample")), viewport);
  const sample = root.querySelector(".sample");
  if (sample) sample.toggleAttribute("hidden", !(site.catalog.sample && settings.showSampleBanner));
  queueMicrotask(() => {
    paintWorld();
    maybeFit(false);
    bindMap(viewport);
  });
  return root;
}

function paintWorld(): void {
  const host = document.querySelector(".nodes");
  const svg = document.querySelector(".links");
  if (!host || !svg) return;
  host.replaceChildren();
  svg.replaceChildren();
  const placed = place(site.catalog, mode, settings);
  const byKey = new Map(placed.map((node) => [node.key, node]));
  for (const [from, to] of linkSegments(site.catalog, placed, mode, settings.multiCategory)) {
    const start = byKey.get(from);
    const end = byKey.get(to);
    if (!start || !end) continue;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(start.x));
    line.setAttribute("y1", String(start.y));
    line.setAttribute("x2", String(end.x));
    line.setAttribute("y2", String(end.y));
    svg.append(line);
  }
  for (const node of placed) host.append(mapNode(node));
  if (!placed.length) host.append(paragraph("empty", t(settings.lang, "noItems")));
}

function mapNode(node: Placed): HTMLElement {
  if (node.kind === "label") {
    const label = el("span", "map-label", termName(node.id));
    placeNode(label, node);
    return label;
  }
  const concept = site.catalog.concepts.find((item) => item.id === node.id);
  const work = site.catalog.works.find((item) => item.id === node.id);
  const text = concept ? tx(concept.word, settings.lang) : work ? tx(work.title, settings.lang) : node.id;
  const control = el("button", "node", text);
  control.type = "button";
  placeNode(control, node);
  control.addEventListener("click", () => {
    popup = { kind: concept ? "concept" : "work", id: node.id };
    sheet = false;
    render();
  });
  return control;
}

function placeNode(node: HTMLElement, placed: Placed): void {
  node.style.left = `${placed.x}px`;
  node.style.top = `${placed.y}px`;
}

function bindMap(viewport: HTMLElement): void {
  let drag: { id: number; x: number; y: number; vx: number; vy: number } | null = null;
  viewport.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest(".node")) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    viewport.classList.add("is-grabbing");
    viewport.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    view.x = drag.vx + (event.clientX - drag.x);
    view.y = drag.vy + (event.clientY - drag.y);
    applyView();
  });
  const end = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    viewport.classList.remove("is-grabbing");
  };
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const next = clamp(view.s * (event.deltaY > 0 ? 0.9 : 1.1), 0.25, 4);
    const ratio = next / view.s;
    view.x = mx - (mx - view.x) * ratio;
    view.y = my - (my - view.y) * ratio;
    view.s = next;
    applyView();
  }, { passive: false });
}

function maybeFit(force: boolean): void {
  const key = `${mode}:${window.innerWidth}x${window.innerHeight}`;
  if (!force && fitKey === key) {
    applyView();
    return;
  }
  fitKey = key;
  const viewport = document.querySelector(".viewport");
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const scale = Math.min(rect.width / WORLD.w, rect.height / WORLD.h);
  view.s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  view.x = (rect.width - WORLD.w * view.s) / 2;
  view.y = (rect.height - WORLD.h * view.s) / 2;
  applyView();
}

function applyView(): void {
  const world = document.querySelector(".world") as HTMLElement | null;
  if (!world) return;
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  world.style.setProperty("--view-scale", String(view.s));
}

function search(): HTMLElement {
  const root = el("div", "search");
  const profile = el("div", "profile");
  profile.append(
    el("h1", "", tx(settings.artistName, settings.lang), { "data-artist": "" }),
    paragraph("", tx(settings.statement, settings.lang), { "data-statement": "" }),
  );
  const sample = paragraph("sample", t(settings.lang, "sample"));
  sample.toggleAttribute("hidden", !(site.catalog.sample && settings.showSampleBanner));
  root.append(sample, profile, filters(), el("div", "table-wrap"));
  queueMicrotask(paintRows);
  return root;
}

function filters(): HTMLElement {
  const row = el("div", "filters");
  const searchField = labeled(t(settings.lang, "filter"), input("search", query, (value) => {
    query = value;
    paintRows();
  }));
  row.append(
    searchField,
    selectFilter(t(settings.lang, "medium"), site.catalog.media, mediumFilter, (value) => {
      mediumFilter = value;
      paintRows();
    }),
    selectFilter(t(settings.lang, "fieldLabel"), site.catalog.fields, fieldFilter, (value) => {
      fieldFilter = value;
      paintRows();
    }),
    selectFilter(t(settings.lang, "genreLabel"), site.catalog.genres, genreFilter, (value) => {
      genreFilter = value;
      paintRows();
    }),
  );
  const check = el("label", "check");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = bookmarksOnly;
  box.addEventListener("change", () => {
    bookmarksOnly = box.checked;
    paintRows();
  });
  check.append(box, document.createTextNode(t(settings.lang, "bookmarks")));
  row.append(check);
  return row;
}

function paintRows(): void {
  const wrap = document.querySelector(".table-wrap");
  if (!wrap) return;
  const works = visibleWorks();
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const column of columns()) {
    const cell = document.createElement("th");
    const control = button(column.label + (sortKey === column.key ? (sortDir > 0 ? " ↑" : " ↓") : ""), () => {
      sortDir = sortKey === column.key ? (sortDir > 0 ? -1 : 1) : 1;
      sortKey = column.key;
      paintRows();
    });
    cell.append(control);
    cell.setAttribute("aria-sort", sortKey === column.key ? (sortDir > 0 ? "ascending" : "descending") : "none");
    head.append(cell);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const body = document.createElement("tbody");
  for (const work of works) {
    const row = document.createElement("tr");
    row.className = "work-row";
    for (const column of columns()) {
      const cell = document.createElement("td");
      cell.textContent = column.value(work);
      row.append(cell);
    }
    row.addEventListener("click", () => {
      popup = { kind: "work", id: work.id };
      sheet = false;
      render();
    });
    body.append(row);
  }
  table.append(thead, body);
  wrap.replaceChildren(table);
  if (!works.length) wrap.append(paragraph("empty", t(settings.lang, "emptyRows")));
}

function columns(): Array<{ key: string; label: string; value: (work: Work) => string }> {
  const lang = settings.lang;
  return [
    { key: "title", label: t(lang, "title"), value: (work) => tx(work.title, lang) },
    { key: "medium", label: t(lang, "medium"), value: (work) => termName(work.medium) },
    { key: "field", label: t(lang, "fieldLabel"), value: (work) => work.fields.map((id) => termName(id)).join(", ") },
    { key: "genre", label: t(lang, "genreLabel"), value: (work) => work.genres.map((id) => termName(id)).join(", ") },
    { key: "year", label: t(lang, "yearLabel"), value: (work) => work.year === null ? t(lang, "undated") : String(work.year) },
    { key: "size", label: t(lang, "sizeLabel"), value: (work) => measure(work) },
    { key: "chroma", label: t(lang, "chromaLabel"), value: (work) => chromaLabel(work) },
    { key: "concepts", label: t(lang, "concepts"), value: (work) => work.concepts.map((id) => conceptWord(id)).join(", ") },
  ];
}

function visibleWorks(): Work[] {
  const needle = query.trim().toLowerCase();
  return site.catalog.works.filter((work) => {
    if (mediumFilter && work.medium !== mediumFilter) return false;
    if (fieldFilter && !work.fields.includes(fieldFilter)) return false;
    if (genreFilter && !work.genres.includes(genreFilter)) return false;
    if (bookmarksOnly && !bookmarks.has(markOf("work", work.id))) return false;
    if (!needle) return true;
    return columns().some((column) => column.value(work).toLowerCase().includes(needle));
  }).sort((a, b) => compareWorks(a, b) * sortDir);
}

function compareWorks(a: Work, b: Work): number {
  const numeric = sortKey === "year" || sortKey === "size" || sortKey === "chroma";
  if (numeric) {
    const av = sortNumber(a);
    const bv = sortNumber(b);
    if (av === null && bv === null) return a.id.localeCompare(b.id);
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv || a.id.localeCompare(b.id);
  }
  const column = columns().find((item) => item.key === sortKey);
  return (column ? column.value(a) : "").localeCompare(column ? column.value(b) : "");
}

function sortNumber(work: Work): number | null {
  if (sortKey === "year") return work.year;
  if (sortKey === "size") return metricOf(work, settings.musicMediumId);
  return chromaOf(work, settings.musicMediumId);
}

function legal(): HTMLElement {
  const block = el("footer", "legal");
  const year = calendarYear(new Date(), settings.copyrightTimeZone);
  const name = tx(settings.artistName, settings.lang);
  block.append(paragraph("", t(settings.lang, "legalAi"), { "data-legal": "ai" }));
  const body = year === null
    ? t(settings.lang, "noYear")
    : t(settings.lang, "legalBody").replace("{year}", String(year)).replace("{name}", name);
  block.append(paragraph("", body, { "data-legal": "body" }));
  block.append(paragraph("", t(settings.lang, "nameCredit")));
  if (settings.contact) {
    const line = el("p");
    line.append(`${t(settings.lang, "inquiry")}: `);
    const link = el("a", "", settings.contact);
    link.href = `mailto:${settings.contact}`;
    line.append(link);
    block.append(line);
  }
  return block;
}

function detail(): HTMLElement {
  const layer = el("div", "popup-layer");
  layer.addEventListener("click", (event) => {
    if (event.target === layer) {
      popup = null;
      render();
    }
  });
  const panel = el("div", "popup");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  const concept = popup?.kind === "concept" ? site.catalog.concepts.find((item) => item.id === popup?.id) : undefined;
  const work = popup?.kind === "work" ? site.catalog.works.find((item) => item.id === popup?.id) : undefined;
  if (concept) fillConcept(panel, concept);
  else if (work) fillWork(panel, work);
  layer.append(panel);
  queueMicrotask(() => panel.querySelector("button")?.focus());
  return layer;
}

function fillConcept(panel: HTMLElement, concept: Concept): void {
  const key = markOf("concept", concept.id);
  panel.append(
    el("h2", "", tx(concept.word, settings.lang)),
    button(bookmarks.has(key) ? t(settings.lang, "bookmarkRemove") : t(settings.lang, "bookmarkAdd"), () => toggleMark(key), bookmarks.has(key)),
    heading(t(settings.lang, "dictionary")),
    paragraph("", tx(concept.dictionary, settings.lang)),
    heading(t(settings.lang, "artistMeaning")),
    paragraph("", tx(concept.artistMeaning, settings.lang)),
    heading(t(settings.lang, "quotes")),
  );
  if (!concept.quotes.length) panel.append(paragraph("", "—"));
  for (const quote of concept.quotes) {
    panel.append(paragraph("", `“${tx(quote.text, settings.lang)}” ${tx(quote.source, settings.lang)}`));
  }
  panel.append(heading(t(settings.lang, "relatedWords")), chips(concept.related.map((id) => ({
    label: conceptWord(id),
    pressed: false,
    onClick: () => openConcept(id),
  }))));
  const works = site.catalog.works.filter((item) => item.concepts.includes(concept.id));
  panel.append(heading(t(settings.lang, "relatedWorks")), chips(works.map((item) => ({
    label: tx(item.title, settings.lang),
    pressed: false,
    onClick: () => openWork(item.id),
  }))));
  const count = frequency(concept, site.catalog);
  panel.append(
    heading(t(settings.lang, "frequency")),
    paragraph("", t(settings.lang, "frequencyValue")
      .replace("{quotes}", String(count.quotes))
      .replace("{works}", String(count.works))
      .replace("{mentions}", String(count.mentions))),
    button(t(settings.lang, "close"), closePopup),
  );
}

function fillWork(panel: HTMLElement, work: Work): void {
  const key = markOf("work", work.id);
  panel.append(
    el("h2", "", tx(work.title, settings.lang)),
    button(bookmarks.has(key) ? t(settings.lang, "bookmarkRemove") : t(settings.lang, "bookmarkAdd"), () => toggleMark(key), bookmarks.has(key)),
    paragraph("", [termName(work.medium), work.fields.map((id) => termName(id)).join(", "), work.genres.map((id) => termName(id)).join(", "), work.year === null ? t(settings.lang, "undated") : String(work.year), measure(work), chromaLabel(work)].filter(Boolean).join(" · ")),
    heading(t(settings.lang, "concepts")),
    chips(work.concepts.map((id) => ({ label: conceptWord(id), pressed: false, onClick: () => openConcept(id) }))),
    button(t(settings.lang, "close"), closePopup),
  );
}

function settingsSheet(): HTMLElement {
  const panel = el("aside", "sheet");
  panel.append(el("h2", "", t(settings.lang, "settings")), paragraph("help", t(settings.lang, "settingsIntro")));
  panel.append(
    labeledInput(t(settings.lang, "name") + " KO", "text", settings.artistName.ko, "set-name-ko", (value) => {
      settings.artistName = { ...settings.artistName, ko: value };
      changed();
    }),
    labeledInput(t(settings.lang, "name") + " EN", "text", settings.artistName.en, "set-name-en", (value) => {
      settings.artistName = { ...settings.artistName, en: value };
      changed();
    }),
    labeledArea(t(settings.lang, "statement") + " KO", settings.statement.ko, "set-statement-ko", (value) => {
      settings.statement = { ...settings.statement, ko: value };
      changed();
    }),
    labeledArea(t(settings.lang, "statement") + " EN", settings.statement.en, "set-statement-en", (value) => {
      settings.statement = { ...settings.statement, en: value };
      changed();
    }),
    labeledInput(t(settings.lang, "contact"), "email", settings.contact, "set-contact", (value) => {
      settings.contact = value.trim();
      changed(true);
    }),
  );
  const color = labeledInput(t(settings.lang, "midGray"), "color", settings.midGray, "set-gray", (value) => {
    if (!shade(value, 0)) return;
    settings.midGray = value;
    changed();
  });
  panel.append(color, paragraph("help", t(settings.lang, "midHelp")));
  panel.append(
    checkField(t(settings.lang, "specToggle"), settings.showSpecSentence, "set-spec", (value) => {
      settings.showSpecSentence = value;
      changed();
      paintGateCopy();
    }),
    paragraph("help", t(settings.lang, "specHelp")),
    choiceField(t(settings.lang, "placement"), settings.placement, "set-placement", [
      ["rule", t(settings.lang, "placementRule")],
      ["coordinates", t(settings.lang, "placementCoordinates")],
    ], (value) => {
      settings.placement = value as Settings["placement"];
      changed();
      paintWorld();
    }),
    paragraph("help", t(settings.lang, "placementHelp")),
    choiceField(t(settings.lang, "multi"), settings.multiCategory, "set-multi", [
      ["single", t(settings.lang, "multiSingle")],
      ["each", t(settings.lang, "multiEach")],
    ], (value) => {
      settings.multiCategory = value as Settings["multiCategory"];
      changed();
      paintWorld();
    }),
    paragraph("help", t(settings.lang, "multiHelp")),
    choiceField(t(settings.lang, "sizeAxis"), settings.sizeAxis, "set-axis", [
      ["split", t(settings.lang, "sizeSplit")],
      ["shared", t(settings.lang, "sizeShared")],
    ], (value) => {
      settings.sizeAxis = value as Settings["sizeAxis"];
      changed();
      paintWorld();
    }),
    labeledInput(t(settings.lang, "zone"), "text", settings.copyrightTimeZone, "set-zone", (value) => {
      const next = applyOverrides(settings, { copyrightTimeZone: value });
      settings.copyrightTimeZone = next.copyrightTimeZone;
      changed(true);
    }),
    labeledInput(t(settings.lang, "musicId"), "text", settings.musicMediumId, "set-music", (value) => {
      if (!value.trim()) return;
      settings.musicMediumId = value.trim();
      changed();
      paintWorld();
      paintRows();
    }),
    numberField(t(settings.lang, "refWidth"), settings.referenceWidth, "set-width", 320, 8000, (value) => {
      settings.referenceWidth = value;
      changed();
      paintWarning();
    }),
    numberField(t(settings.lang, "refHeight"), settings.referenceHeight, "set-height", 320, 8000, (value) => {
      settings.referenceHeight = value;
      changed();
      paintWarning();
    }),
    numberField(t(settings.lang, "expand"), settings.expandMs, "set-expand", 0, 2000, (value) => {
      settings.expandMs = value;
      changed();
    }),
    numberField(t(settings.lang, "hold"), settings.holdMs, "set-hold", 0, 10000, (value) => {
      settings.holdMs = value;
      changed();
    }),
    numberField(t(settings.lang, "fade"), settings.fadeMs, "set-fade", 0, 2000, (value) => {
      settings.fadeMs = value;
      changed();
    }),
    numberField(t(settings.lang, "wipe"), settings.wipeMs, "set-wipe", 0, 2000, (value) => {
      settings.wipeMs = value;
      changed();
    }),
    checkField(t(settings.lang, "reduced"), settings.respectReducedMotion, "set-reduced", (value) => {
      settings.respectReducedMotion = value;
      changed();
    }),
    checkField(t(settings.lang, "sampleToggle"), settings.showSampleBanner, "set-sample", (value) => {
      settings.showSampleBanner = value;
      changed(true);
    }),
  );
  const actions = el("div", "row-actions");
  actions.append(button(t(settings.lang, "reset"), resetSettings), button(t(settings.lang, "close"), () => {
    sheet = false;
    render();
  }));
  panel.append(actions);
  return panel;
}

function enter(next: "explore" | "search", event: MouseEvent, fill: string, ink: string): void {
  if (entering) return;
  const plan = motionPlan(settings, motionQuery.matches);
  if (plan.wipeMs === 0 && plan.holdMs === 0) {
    screen = next;
    popup = null;
    render();
    return;
  }
  entering = true;
  const copy = (event.currentTarget as HTMLElement).querySelector(".pane-copy");
  const lift = document.querySelector("#lift") as HTMLElement | null;
  const wipe = document.querySelector("#wipe") as HTMLElement | null;
  if (!lift || !wipe || !copy) {
    entering = false;
    screen = next;
    render();
    return;
  }
  const rect = copy.getBoundingClientRect();
  if (copy instanceof HTMLElement) copy.style.visibility = "hidden";
  lift.hidden = false;
  lift.textContent = copy.textContent;
  lift.style.left = `${rect.left}px`;
  lift.style.top = `${rect.top}px`;
  lift.style.width = `${rect.width}px`;
  lift.style.color = ink;
  lift.style.transition = "none";
  const radius = Math.hypot(
    Math.max(event.clientX, window.innerWidth - event.clientX),
    Math.max(event.clientY, window.innerHeight - event.clientY),
  );
  wipe.hidden = false;
  wipe.style.background = fill;
  wipe.style.width = `${radius * 2}px`;
  wipe.style.height = `${radius * 2}px`;
  wipe.style.left = `${event.clientX}px`;
  wipe.style.top = `${event.clientY}px`;
  wipe.style.transition = "none";
  wipe.style.transform = "translate(-50%, -50%) scale(0)";
  requestAnimationFrame(() => {
    wipe.style.transition = `transform ${plan.wipeMs}ms ease-out`;
    wipe.style.transform = "translate(-50%, -50%) scale(1)";
  });
  window.setTimeout(() => {
    lift.style.transition = `color ${plan.fadeMs}ms linear`;
    lift.style.color = fill;
  }, plan.holdMs);
  window.setTimeout(() => {
    entering = false;
    lift.hidden = true;
    wipe.hidden = true;
    screen = next;
    popup = null;
    render();
  }, plan.holdMs + plan.fadeMs + 40);
}

function paintTheme(): void {
  const root = document.documentElement;
  root.style.setProperty("--mid", settings.midGray);
  root.style.setProperty("--mid-light", shade(settings.midGray, 78) ?? "#ffffff");
  root.style.setProperty("--mid-dark", shade(settings.midGray, -78) ?? "#000000");
  root.style.setProperty("--expand", `${motionPlan(settings, motionQuery.matches).expandMs}ms`);
  document.body.dataset.screen = screen;
  document.documentElement.lang = settings.lang;
  document.title = tx(settings.artistName, settings.lang);
}

function paintTime(): void {
  const now = new Date();
  const device = deviceTimeZone();
  const deviceNode = document.querySelector("[data-clock='device']");
  const koreaNode = document.querySelector("[data-clock='korea']");
  if (deviceNode) deviceNode.textContent = device ? formatClock(now, device) ?? "—" : "—";
  if (koreaNode) koreaNode.textContent = formatClock(now, "Asia/Seoul") ?? "—";
  const year = calendarYear(now, settings.copyrightTimeZone);
  const body = document.querySelector("[data-legal='body']");
  if (body) {
    const name = tx(settings.artistName, settings.lang);
    body.textContent = year === null
      ? t(settings.lang, "noYear")
      : t(settings.lang, "legalBody").replace("{year}", String(year)).replace("{name}", name);
  }
}

function paintWarning(): void {
  const node = document.querySelector("[data-warn]");
  if (!node) return;
  const width = Number.isFinite(window.innerWidth) ? window.innerWidth : null;
  const height = Number.isFinite(window.innerHeight) ? window.innerHeight : null;
  node.toggleAttribute("hidden", !shouldWarn({ width, height, userAgent: navigator.userAgent || null }, settings));
}

function paintGateCopy(): void {
  const node = document.querySelector(".explore-pane .pane-copy");
  if (node) node.textContent = exploreCopy();
}

function changed(rebuildLegal = false): void {
  persist();
  paintTheme();
  paintTime();
  const artist = document.querySelector("[data-artist]");
  if (artist) artist.textContent = tx(settings.artistName, settings.lang);
  const statement = document.querySelector("[data-statement]");
  if (statement) statement.textContent = tx(settings.statement, settings.lang);
  document.querySelectorAll(".sample").forEach((node) => {
    node.toggleAttribute("hidden", !(site.catalog.sample && settings.showSampleBanner));
  });
  if (rebuildLegal) {
    const foot = document.querySelector(".legal");
    foot?.replaceWith(legal());
  }
}

function persist(): void {
  localStorage.setItem(VISITOR_KEY, JSON.stringify({ overrides: settings, bookmarks: [...bookmarks] }));
}

function resetSettings(): void {
  settings = applyOverrides(site.settings, {});
  bookmarks = new Set();
  query = "";
  mediumFilter = "";
  fieldFilter = "";
  genreFilter = "";
  bookmarksOnly = false;
  localStorage.removeItem(VISITOR_KEY);
  render();
}

function setLang(lang: Lang): void {
  settings.lang = lang;
  persist();
  render();
}

function toggleMark(key: string): void {
  if (bookmarks.has(key)) bookmarks.delete(key);
  else bookmarks.add(key);
  persist();
  render();
}

function openConcept(id: string): void {
  popup = { kind: "concept", id };
  render();
}

function openWork(id: string): void {
  popup = { kind: "work", id };
  render();
}

function closePopup(): void {
  popup = null;
  render();
}

function exploreCopy(): string {
  const lead = t(settings.lang, "exploreLead");
  return settings.showSpecSentence ? `${lead}${t(settings.lang, "exploreSpec")}` : lead;
}

function termName(id: string): string {
  if (id === "undated") return t(settings.lang, "undated");
  const lists = [site.catalog.media, site.catalog.fields, site.catalog.genres];
  for (const list of lists) {
    const found = list.find((item) => item.id === id);
    if (found) return tx(found.label, settings.lang);
  }
  return id;
}

function conceptWord(id: string): string {
  const concept = site.catalog.concepts.find((item) => item.id === id);
  return concept ? tx(concept.word, settings.lang) : id;
}

function measure(work: Work): string {
  const value = metricOf(work, settings.musicMediumId);
  if (value === null) return "—";
  return `${value}${tx(work.unit, settings.lang)}`;
}

function chromaLabel(work: Work): string {
  const value = chromaOf(work, settings.musicMediumId);
  if (value === null) return "—";
  const name = work.medium === settings.musicMediumId ? t(settings.lang, "mood") : t(settings.lang, "saturationWord");
  return `${name} ${value}`;
}

function markOf(kind: "concept" | "work", id: string): string {
  return `${kind}:${id}`;
}

function labeled(text: string, control: HTMLElement): HTMLLabelElement {
  const field = el("label", "") as HTMLLabelElement;
  field.append(text, control);
  return field;
}

function labeledInput(text: string, type: string, value: string, id: string, onInput: (value: string) => void): HTMLLabelElement {
  const control = document.createElement("input");
  control.type = type;
  control.id = id;
  control.value = value;
  control.addEventListener("input", () => onInput(control.value));
  const field = el("label", "field", undefined, { for: id }) as HTMLLabelElement;
  field.append(text, control);
  return field;
}

function labeledArea(text: string, value: string, id: string, onInput: (value: string) => void): HTMLLabelElement {
  const control = document.createElement("textarea");
  control.id = id;
  control.value = value;
  control.addEventListener("input", () => onInput(control.value));
  const field = el("label", "field", undefined, { for: id }) as HTMLLabelElement;
  field.append(text, control);
  return field;
}

function numberField(text: string, value: number, id: string, min: number, max: number, onValue: (value: number) => void): HTMLLabelElement {
  return labeledInput(text, "number", String(value), id, (raw) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onValue(clamp(parsed, min, max));
  });
}

function checkField(text: string, checked: boolean, id: string, onValue: (value: boolean) => void): HTMLLabelElement {
  const control = document.createElement("input");
  control.type = "checkbox";
  control.id = id;
  control.checked = checked;
  control.addEventListener("change", () => onValue(control.checked));
  const field = el("label", "check", undefined, { for: id }) as HTMLLabelElement;
  field.append(control, document.createTextNode(text));
  return field;
}

function choiceField(text: string, value: string, id: string, options: Array<[string, string]>, onValue: (value: string) => void): HTMLLabelElement {
  const control = document.createElement("select");
  control.id = id;
  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === value;
    control.append(option);
  }
  control.addEventListener("change", () => onValue(control.value));
  const field = el("label", "field", undefined, { for: id }) as HTMLLabelElement;
  field.append(text, control);
  return field;
}

function selectFilter(text: string, terms: Term[], value: string, onValue: (value: string) => void): HTMLLabelElement {
  const id = `filter-${text}`;
  return choiceField(text, value, id, [["", t(settings.lang, "all")], ...terms.map((term): [string, string] => [term.id, tx(term.label, settings.lang)])], onValue);
}

function input(type: string, value: string, onInput: (value: string) => void): HTMLInputElement {
  const control = document.createElement("input");
  control.type = type;
  control.value = value;
  control.addEventListener("input", () => onInput(control.value));
  return control;
}

function chips(items: Array<{ label: string; pressed: boolean; onClick: () => void }>): HTMLElement {
  const row = el("div", "chips");
  if (!items.length) row.append(paragraph("", "—"));
  for (const item of items) row.append(button(item.label, item.onClick, item.pressed));
  return row;
}

function heading(text: string): HTMLElement {
  return el("h3", "", text);
}

function paragraph(className: string, text: string, attrs?: Record<string, string>): HTMLParagraphElement {
  return el("p", className, text, attrs);
}

function button(text: string, onClick: () => void, pressed = false): HTMLButtonElement {
  const control = el("button", "", text);
  control.type = "button";
  control.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  if (pressed) control.setAttribute("aria-pressed", "true");
  return control;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  }
  return node;
}

function captureFocus(): FocusMark | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) || !active.id) return null;
  return { id: active.id, start: active.selectionStart, end: active.selectionEnd };
}

function restoreFocus(mark: FocusMark | null): void {
  if (!mark) return;
  const node = document.getElementById(mark.id);
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    node.focus();
    if (mark.start !== null && mark.end !== null) node.setSelectionRange(mark.start, mark.end);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
