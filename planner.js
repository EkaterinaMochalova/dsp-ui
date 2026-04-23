const PLANNER_CDN_BASE = (() => {
  try {
    const src = document.currentScript?.src || '';
    return src.replace(/\/planner\.js.*$/, '/');
  } catch(e) { return ''; }
})();

console.log("planner.js loaded");

/**
 * FIXES in this version:
 * 1) ✅ Weekly schedule (“рваное / по дням”) now works end-to-end:
 *    - added computeScheduleHoursForPeriod()
 *    - fixed validation + avg hours/day calc for weekly schedule
 *
 * 2) ✅ formatsMode is not defined:
 *    - formatsMode/manualFormats are now derived from brief.formats at the start of onCalcClick()
 *
 * 3) ✅ Calc button enablement bug:
 *    - progress previously counted 5 checks but compared to 4 → fixed requiredCount=5
 *
 * 4) ✅ summaryText referenced selectedFormatsText but it was not defined → fixed.
 */

// ========== GLOBAL ==========
window.PLANNER = window.PLANNER || {};

const REF = "planner";
const SCREENS_CSV_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8ee9a99e0c35ce605d736b69e049edd975e1528f/inventories_sync.csv";

const TIERS_JSON_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8684fb51e3081987ae494eaaf5bacbd7b5e47160/tiers_v1.json";

// ===== CITY -> REGION =====
const CITY_REGIONS_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@f6f96a16980cda4d7165e692526ef08f2cd0c22e/city_regions.json";

// ===== Labels =====
const FORMAT_LABELS = {
  BILLBOARD: { label: "Билборды", desc: "экраны 3×6 м вдоль трасс" },
  CITY_BOARD: { label: "City Board", desc: "небольшие экраны в центре города, видимые и авто-, и пешеходному траффику" },
  CITY_FORMAT: { label: "Ситиформаты", desc: "вертикальные экраны, остановки/пешеходные зоны" },
  CITY_FORMAT_RC: { label: "Ситиформаты на МЦК", desc: "экраны на МЦК" },
  CITY_FORMAT_RD: { label: "Ситиформаты на вокзалах", desc: "экраны на вокзале" },
  CITY_FORMAT_WD: { label: "Ситиформаты в метро", desc: "экраны в метро" },
  RW_PLATFORM: { label: "Ситиформаты на МЦД", desc: "экраны на МЦД" },
  METRO_SCREEN_3X1: { label: "Горизонтальные экраны в метро", desc: "экраны в метро" },
  MEDIAFACADE: { label: "Медиафасады", desc: "огромные экраны на стенах домов" },
  METRO_LIGHTBOX: { label: "Metro Lightbox", desc: "экраны в метро, горизонтальные" },
  OTHER: { label: "Indoor-экраны", desc: "экраны внутри БЦ, ТЦ и иных помещений" },
  PVZ_SCREEN: { label: "Экраны в ПВЗ", desc: "экраны в пунктах выдачи заказов" },
  SKY_DIGITAL: { label: "Аэропорты", desc: "экраны в аэропортах" },
  SUPERSITE: { label: "Суперсайты", desc: "крупные конструкции с высокой дальностью видимости" }
};

// Экспортируем метки форматов наружу (для UI-скриптов в Tilda)
window.PLANNER = window.PLANNER || {};
window.PLANNER.FORMAT_LABELS = FORMAT_LABELS;
window.PLANNER.ui = window.PLANNER.ui || {};
window.PLANNER.ui.photosAllowed = false;

// (опционально) чтобы проще было обращаться из любого места
window.FORMAT_LABELS = window.FORMAT_LABELS || FORMAT_LABELS;

// ===== POI =====
const POI_QUERIES = {
  fitness: `
    nwr(area.a)["leisure"="fitness_centre"];
    nwr(area.a)["amenity"="gym"];
    nwr(area.a)["sport"="fitness"];
    nwr(area.a)["leisure"="sports_centre"]["sport"="fitness"];
  `,
  pet_store: `
    nwr(area.a)["shop"="pet"];
    nwr(area.a)["shop"="pet_grooming"];
    nwr(area.a)["amenity"="veterinary"];
  `,
  supermarket: `
    nwr(area.a)["shop"="supermarket"];
    nwr(area.a)["shop"="convenience"];
    nwr(area.a)["shop"="hypermarket"];
  `,
  mall: `
    nwr(area.a)["shop"="mall"];
  `,
  cafe: `
    nwr(area.a)["amenity"="cafe"];
    nwr(area.a)["shop"="coffee"];
  `,
  restaurant: `
    nwr(area.a)["amenity"="restaurant"];
    nwr(area.a)["amenity"="fast_food"];
    nwr(area.a)["amenity"="food_court"];
  `,
  pharmacy: `
    nwr(area.a)["amenity"="pharmacy"];
  `,
  school: `
    nwr(area.a)["amenity"="school"];
  `,
  university: `
    nwr(area.a)["amenity"="university"];
    nwr(area.a)["amenity"="college"];
  `,
  hospital: `
    nwr(area.a)["amenity"="hospital"];
    nwr(area.a)["amenity"="clinic"];
  `,
  gas_station: `
    nwr(area.a)["amenity"="fuel"];
  `,
  bank: `
    nwr(area.a)["amenity"="bank"];
    nwr(area.a)["amenity"="atm"];
  `,
  transport: `
    nwr(area.a)["public_transport"];
    nwr(area.a)["railway"="station"];
    nwr(area.a)["railway"="subway_entrance"];
  `
};

const POI_LABELS = {
  fitness: "Фитнес-клубы",
  pet_store: "Зоомагазины",
  supermarket: "Супермаркеты",
  mall: "Торговые центры",
  cafe: "Кафе / кофе",
  restaurant: "Рестораны / фастфуд",
  pharmacy: "Аптеки",
  school: "Школы",
  university: "ВУЗы",
  hospital: "Больницы / клиники",
  gas_station: "АЗС",
  bank: "Банки / банкоматы",
  transport: "Транспорт (метро/станции)"
};

// ===== Model =====
const BID_MULTIPLIER = 1.8;
const SC_OPT = 30;
const SC_MAX = 60;
const RECO_HOURS_PER_DAY = 12; // для режима "нужна рекомендация"

// ===== State =====
const state = {
  screens: [],
  screensAll: [],
  citiesAll: [],
  formatsAll: [],

  // ===== Regions =====
  regionsAll: [],
  regionsByCity: {},

  // ===== Diagnostics =====
  unknownCities: [],
  unknownCitiesTop: [],

  // ===== UI =====
  selectedCity: null,
  selectedFormats: new Set(),
  selectedRegions: [], // ✅ мультивыбор регионов
  selectedRegion: null, // ✅ обратная совместимость
  lastChosen: [],

  // Owners (optional)
  ownersAll: [],          // ✅ список операторов
  selectedOwners: new Set(),

  // Polygon zone filter: null | [[lat,lon], ...]
  polygonFilter: null,

  // DSP warmup
  dspInventoryCache: null,
  dspInventoryWarmupPromise: null,
  dspInventoryWarmupDone: false,
  dspRegionToCities: {},

  // VK Affinity data: Map<GID, {segmentName: affinityValue}>
  affinityMap: null,
  affinityStats: null,
};

window.PLANNER.state = state;

// ===== VK AFFINITY =====
const AFFINITY_SKIP_COLS = new Set([
  'GID','source_file',
  'Возраст','Занятость','Индивидуальный доход','Наличие детей',
  'Наличие образования','Пол','Премиум','Семейное положение','Черты характера'
]);

const AFFINITY_GROUPS = {
  "Пол":         ["Женщины", "Мужчины"],
  "Возраст":     ["<17", "18-24", "25-34", "35-44", "45-54", ">55"],
  "Доход":       ["Низкий", "Эконом класс", "Средний", "Средний класс", "Выше ср.", "Высокий", "Премиум базовый", "Премиум средний", "Премиум высокий", "Премиум класс"],
  "Семья":       ["Есть дети", "Нет детей", "Женат/Замужем", "Не женат/Не замужем"],
  "Образование": ["Есть высшее", "Нет высшего", "Среднее образование"],
  "Занятость":   ["Работает", "Не работает"],
  "Черты":       ["Импульсивность", "Интроверсия", "Любознательность", "Практичность", "Самоконтроль", "Сдержанность", "Творчество", "Экстраверсия", "Эмоциональность"],
};
window.PLANNER.AFFINITY_GROUPS = AFFINITY_GROUPS;

async function loadAffinityJSON(urlOverride) {
  const url = urlOverride || (PLANNER_CDN_BASE ? PLANNER_CDN_BASE + 'affinity_data.json' : null);
  if (!url) throw new Error("CDN base URL not detected");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const json = await resp.json();
  // json = { h: [colName, ...], d: { GID: [v0, v1, ...], ... } }
  const headers = json.h;
  const rawData = json.d;
  const map = new Map();
  for (const [gid, vals] of Object.entries(rawData)) {
    const rec = {};
    for (let i = 0; i < headers.length; i++) {
      const v = vals[i];
      if (v !== null && v !== undefined && v !== 0) rec[headers[i]] = v;
    }
    map.set(gid, rec);
  }
  state.affinityMap = map;

  // Precompute per-segment stats: coverage at thresholds 1.0, 1.3, 1.5, 2.0
  const stats = {};
  const total = map.size;
  for (const seg of headers) {
    if (AFFINITY_SKIP_COLS.has(seg)) continue;
    let sum = 0, n = 0, c10 = 0, c11 = 0, c12 = 0, c13 = 0, c15 = 0, c20 = 0;
    for (const rec of map.values()) {
      const v = rec[seg] ?? 0;
      if (v > 0) { sum += v; n++; }
      if (v >= 1.0) c10++;
      if (v >= 1.1) c11++;
      if (v >= 1.2) c12++;
      if (v >= 1.3) c13++;
      if (v >= 1.5) c15++;
      if (v >= 2.0) c20++;
    }
    stats[seg] = { mean: n > 0 ? Math.round(sum / n * 100) / 100 : 0, total, c10, c11, c12, c13, c15, c20 };
  }
  state.affinityStats = stats;

  window.dispatchEvent(new CustomEvent("planner:affinity-loaded", { detail: { count: map.size } }));
  return map.size;
}
window.PLANNER.loadAffinityJSON = loadAffinityJSON;

function getReachModeFromUI() {
  return document.querySelector('input[name="reach_mode"]:checked')?.value || "balanced";
}

// ===== Приоритет операторов при подборе экранов =====
// Экраны preferred-операторов идут первыми внутри каждой географической ячейки.
// Порядок важен: чем меньше индекс, тем выше приоритет.
const PREFERRED_OWNER_KEYWORDS = [
  "рим",           // 1
  "рц",            // 2  (РЦ / Рекламный центр)
  "расверо",       // 3
  "хэт-трик",      // 4
  "мособлреклама", // 5
  "инсайт медиа",  // 6
  "аффикс",        // 7
  "санлайт",       // 8  (СанЛайт / Sunlight)
  "sunlight",      // 8  alias
  "илан",          // 9
  "аляска",        // 10
  "rgb",           // 11
  "postex",        // 12
  "lume",          // 13
];

function ownerPriority(screen) {
  const owner = String(screen.owner ?? screen.Owner ?? "").toLowerCase();
  for (let i = 0; i < PREFERRED_OWNER_KEYWORDS.length; i++) {
    if (owner.includes(PREFERRED_OWNER_KEYWORDS[i])) return i + 1;
  }
  return PREFERRED_OWNER_KEYWORDS.length + 1; // все остальные — ниже
}

function targetPlaysPerHourPerScreen(mode) {
  // max_reach = больше всего экранов (низкий pph → нужно больше экранов)
  // balanced   = средне
  // max_freq   = меньше всего экранов (высокий pph → концентрируем показы)
  if (mode === "max_reach") return 5;
  if (mode === "max_freq")  return 50;
  return 25; // balanced
}

// ===== Utils =====
function el(id) { return document.getElementById(id); }

function setStatus(msg) {
  const s = el("status");
  if (s) s.textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

// ===== Event Logging (Google Sheets webhook) =====
const LOG_WEBHOOK_URL = window.LOG_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbzRDpqKB9DupqXeBaiMrWkQTakHZxb7Nr-75afBl6481KXxFI3cFUEiXDxNzj9iP9pN/exec";

function logEvent(eventName) {
  try {
    const calc  = window.PLANNER?.lastCalc;
    const brief = calc?.brief || {};
    const meta  = calc?.meta  || {};
    const email = getDspUserEmail?.() || window.sessionStorage?.getItem("dsp_user_email") || "—";

    const regions = (brief.geo?.regions || []).join(", ");
    const formats = brief.formats?.mode === "auto"
      ? "Все"
      : (brief.formats?.selected || []).join(", ");
    const budget  = meta.totalBudget || brief.budget?.amount || "";
    const dates   = brief.dates?.start && brief.dates?.end
      ? `${brief.dates.start} — ${brief.dates.end}` : "";
    const strategy = brief.reachMode || "";
    const screens  = calc?.chosen?.length ?? "";
    const plays    = meta.totalPlays ?? "";
    const ots      = meta.totalOts ?? "";

    const payload = { event: eventName, email, regions, formats, budget, dates, strategy, screens, plays, ots };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(LOG_WEBHOOK_URL, JSON.stringify(payload));
    } else {
      fetch(LOG_WEBHOOK_URL, {
        method: "POST", body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" }, // text/plain avoids CORS preflight
        keepalive: true
      }).catch(() => {});
    }
    console.log("[log]", eventName, payload);
  } catch (e) {
    console.warn("[log] error:", e);
  }
}

/**
 * Ray-casting point-in-polygon.
 * polygon: [[lat, lon], ...]  (closed or open — doesn't matter)
 */
function pointInPolygon(lat, lon, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = ((xi > lon) !== (xj > lon)) &&
      (lat < (yj - yi) * (lon - xi) / (xj - xi) + yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Count screensAll inside current polygon filter */
function countScreensInPolygon(polygon, screens) {
  if (!polygon || polygon.length < 3) return 0;
  return (screens || state.screensAll).filter(
    s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && pointInPolygon(s.lat, s.lon, polygon)
  ).length;
}

function normalizeKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function cssButtonBase(btn) {
  if (!btn) return;
  btn.classList.add("ux-btn");
  btn.style.padding = "8px 10px";
  btn.style.borderRadius = "999px";
  btn.style.border = "1px solid #ddd";
  btn.style.background = "#fff";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "13px";
}

function getBudgetMode() {
  return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
}

// ✅ ВАЖНО: значения должны совпадать с тем, что ждёт hoursPerDay()
function getScheduleType() {
  // ожидаемые значения: all_day | peak | custom | weekly
  return document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
}

function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (res.errors && res.errors.length) console.warn("CSV parse errors:", res.errors.slice(0, 8));
  return res.data || [];
}

function toNumber(x) {
  if (x == null) return NaN;
  const s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function avgNumber(arr) {
  let sum = 0, cnt = 0;
  for (const v of arr) {
    if (Number.isFinite(v)) { sum += v; cnt++; }
  }
  return cnt ? (sum / cnt) : null;
}

// Like avgNumber but treats 0 as missing data (useful for OTS where 0 = no data)
function avgNumberNonZero(arr) {
  let sum = 0, cnt = 0;
  for (const v of arr) {
    if (Number.isFinite(v) && v > 0) { sum += v; cnt++; }
  }
  return cnt ? (sum / cnt) : null;
}

function areRegionsReady() {
  return Array.isArray(state.regionsAll) && state.regionsAll.length > 0;
}

function setRegionsUIReady(isReady) {
  const input = el("city-search");
  const spinner = el("region-spinner");
  const overlay = el("region-overlay");

  if (input) {
    input.disabled = !isReady;
    input.placeholder = isReady ? "Введите регион…" : "Загружаю список регионов…";
  }
  if (spinner) spinner.style.display = isReady ? "none" : "block";
  if (overlay) overlay.style.display = isReady ? "none" : "flex";

  if (!isReady) {
    const sug = el("city-suggestions");
    if (sug) sug.innerHTML = "";
  }
}

function daysInclusive(startStr, endStr) {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.floor((e - s) / (24 * 3600 * 1000)) + 1;
}

function hoursPerDay(schedule) {
  if (schedule?.type === "all_day") return 15;
  if (schedule?.type === "peak") return 7;

  if (schedule?.type === "custom") {
    const a = _timeToMin(schedule.from || "07:00");
    const b = _timeToMin(schedule.to || "22:00");
    if (a == null || b == null) return 0;

    // allow overnight
    const minutes = (b >= a) ? (b - a) : ((1440 - a) + b);
    return Math.max(0, minutes / 60);
  }

  // weekly handled elsewhere
  return 15;
}

// mon..sun
function _weekdayKeyFromDate(dt) {
  // JS: 0=Sun..6=Sat
  const d = dt.getDay();
  return (d === 0) ? "sun" :
    (d === 1) ? "mon" :
      (d === 2) ? "tue" :
        (d === 3) ? "wed" :
          (d === 4) ? "thu" :
            (d === 5) ? "fri" : "sat";
}

// "HH:MM" -> minutes 0..1440
function _timeToMin(t) {
  const s = String(t || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function _hoursForWeekdayIntervals(intervals) {
  if (!Array.isArray(intervals) || !intervals.length) return 0;

  let minutes = 0;
  for (const it of intervals) {
    const a = _timeToMin(it?.from);
    const b = _timeToMin(it?.to);
    if (a == null || b == null) continue;
    // allow overnight
    if (b >= a) minutes += (b - a);
    else minutes += (1440 - a) + b;
  }
  return Math.max(0, minutes / 60);
}

// ✅ NEW: compute schedule hours for a period (supports weekly + legacy)
function computeScheduleHoursForPeriod(schedule, startStr, endStr) {
  const days = daysInclusive(startStr, endStr);

  if (schedule?.type === "weekly") {
  const mode = schedule.mode || "by_dow";
  const weekly = schedule.weekly || {};
  const globalIntervals = Array.isArray(schedule.globalIntervals) ? schedule.globalIntervals : [];

  let totalHours = 0;

  const start = new Date(startStr + "T00:00:00");
  for (let i = 0; i < days; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    if (mode === "global") {
      totalHours += _hoursForWeekdayIntervals(globalIntervals);
    } else {
      const key = _weekdayKeyFromDate(dt);
      totalHours += _hoursForWeekdayIntervals(weekly[key]);
    }
  }

  const avgHpd = days ? (totalHours / days) : 0;
  return { days, totalHours, avgHpd };
}

  const hpd = hoursPerDay(schedule || { type: "all_day" });
  return { days, totalHours: hpd * days, avgHpd: hpd };
}

function _getByAnyId(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

window.getWeeklyScheduleFromUI = function getWeeklyScheduleFromUI() {
  const keys = ["mon","tue","wed","thu","fri","sat","sun"];
  const out = { mon:[], tue:[], wed:[], thu:[], fri:[], sat:[], sun:[] };

  // Новая модель: блоки [{days, times:[{from,to}]}]
  const groups = window.PLANNER?.state?.weeklyGroups;
  if (Array.isArray(groups) && groups.length) {
    for (const grp of groups) {
      for (const t of (grp.times || [])) {
        if (!t.from || !t.to) continue;
        for (const k of keys) {
          if (grp.days?.[k]) out[k].push({ from: t.from, to: t.to });
        }
      }
    }
    return out;
  }

  // Fallback: старая модель weeklyIntervals
  const intervals = window.PLANNER?.state?.weeklyIntervals;
  if (Array.isArray(intervals)) {
    for (const intv of intervals) {
      if (!intv.from || !intv.to) continue;
      for (const k of keys) {
        if (intv.days?.[k]) out[k].push({ from: intv.from, to: intv.to });
      }
    }
    return out;
  }

  return out;
};

function getWeeklyModeFromUI() {
  // radio name="weekly_mode" values: "global" | "by_dow"
  return document.querySelector('input[name="weekly_mode"]:checked')?.value || "by_dow";
}

window.getGlobalScheduleFromUI = function getGlobalScheduleFromUI() {
  // reads rows from #global-rows, same row markup but classes g-from / g-to
  const out = [];

  const wrap = document.getElementById("global-rows");
  if (!wrap) return out;

  const rows = [...wrap.querySelectorAll(".row")];
  for (const row of rows) {
    const from = String(row.querySelector(".g-from")?.value || "").trim();
    const to   = String(row.querySelector(".g-to")?.value || "").trim();
    if (!from || !to) continue;
    out.push({ from, to });
  }
  return out;
};

function formatMeta(fmt) {
  return FORMAT_LABELS[fmt] || {
    label: fmt,
    desc: "Описание формата пока не задано (можно добавить в словарь FORMAT_LABELS)."
  };
}

function getScreensFilteredByOwner(pool) {
  const sel = state.selectedOwners;
  if (!sel || sel.size === 0) return pool;
  return (pool || []).filter(s => sel.has(String(s.owner ?? "").trim()));
}

// ===== UI: selection extra =====
function renderSelectionExtra() {
  const mode = el("selection-mode")?.value || "city_even";
  const extra = el("selection-extra");
  if (!extra) return;
  extra.innerHTML = "";

  if (mode === "near_address") {
    extra.innerHTML = `
      <!-- Список адресов (сворачивается) -->
      <div id="addr-list-wrap" style="margin-bottom:8px;">
        <div id="addr-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        <button type="button" id="addr-list-toggle" style="display:none; margin-top:6px; width:100%;
          padding:7px; border:1px solid #e0d9ff; border-radius:10px; background:#faf8ff;
          color:#5B3EF5; font-size:12px; cursor:pointer; font-weight:500;">
          Показать все адреса
        </button>
      </div>

      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        <button type="button" id="addr-add-btn" style="
          flex:1; min-width:120px; padding:8px; border:1.5px dashed #c4b5fd; border-radius:10px;
          background:#faf8ff; color:#5B3EF5; font-size:13px; cursor:pointer;">
          + Добавить адрес
        </button>
        <button type="button" id="addr-import-btn" style="
          flex:1; min-width:120px; padding:8px; border:1.5px dashed #c4b5fd; border-radius:10px;
          background:#faf8ff; color:#5B3EF5; font-size:13px; cursor:pointer;">
          ↓ Импортировать список
        </button>
      </div>

      <!-- Панель импорта (скрыта по умолчанию) -->
      <div id="addr-import-panel" style="display:none; background:#f8f7ff; border:1px solid #c4b5fd;
           border-radius:12px; padding:12px; margin-bottom:8px;">
        <div style="font-size:12px; font-weight:600; color:#5B3EF5; margin-bottom:8px;">
          Вставьте адреса (по одному на строку) или загрузите файл (.xlsx, .csv, .txt):
        </div>
        <textarea id="addr-paste-area" rows="6" placeholder="ул. Ленина 1, Москва&#10;пр. Мира 10, Москва&#10;…"
          style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ddd;
                 border-radius:8px; font-size:13px; resize:vertical; font-family:inherit;"></textarea>
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px;
                 border:1px solid #c4b5fd; border-radius:8px; background:#fff;
                 color:#5B3EF5; font-size:13px; cursor:pointer;">
            📂 Загрузить файл
            <input type="file" id="addr-file-input" accept=".xlsx,.csv,.txt" style="display:none;">
          </label>
          <button type="button" id="addr-import-apply" style="
            padding:8px 18px; background:#5B3EF5; color:#fff; border:none;
            border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">
            Добавить адреса
          </button>
          <button type="button" id="addr-import-cancel" style="
            padding:8px 14px; background:#fff; color:#888; border:1px solid #ddd;
            border-radius:8px; font-size:13px; cursor:pointer;">
            Отмена
          </button>
          <span id="addr-import-status" style="font-size:12px; color:#667085;"></span>
        </div>
      </div>

      <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-top:4px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        Геокодируем каждый адрес и берём экраны в радиусе от любого из них.
      </div>
    `;

    function addAddressRow(value) {
      const list = el("addr-list");
      if (!list) return;
      const row = document.createElement("div");
      row.className = "addr-row";
      row.style.cssText = "display:flex; gap:6px; align-items:center;";
      const inp = document.createElement("input");
      inp.type = "text"; inp.placeholder = "Адрес";
      inp.value = value || "";
      inp.style.cssText = "flex:1; padding:10px; border:1px solid #ddd; border-radius:10px; font-size:14px;";
      inp.className = "planner-addr-input";
      const del = document.createElement("button");
      del.type = "button"; del.textContent = "×";
      del.style.cssText = "background:none; border:none; font-size:20px; color:#aaa; cursor:pointer; line-height:1; padding:0 4px;";
      del.addEventListener("click", () => { row.remove(); });
      row.appendChild(inp); row.appendChild(del);
      list.appendChild(row);
      attachAddressSuggest(inp);
      return inp;
    }

    const ADDR_COLLAPSE_LIMIT = 5;
    let addrCollapsed = false;

    function updateAddrToggle() {
      const list    = el("addr-list");
      const toggle  = el("addr-list-toggle");
      if (!list || !toggle) return;
      const rows = list.querySelectorAll(".addr-row");
      if (rows.length <= ADDR_COLLAPSE_LIMIT) {
        rows.forEach(r => r.style.display = "flex");
        toggle.style.display = "none";
        addrCollapsed = false;
        return;
      }
      toggle.style.display = "block";
      rows.forEach((r, i) => { r.style.display = (addrCollapsed && i >= ADDR_COLLAPSE_LIMIT) ? "none" : "flex"; });
      const hidden = addrCollapsed ? rows.length - ADDR_COLLAPSE_LIMIT : 0;
      toggle.textContent = addrCollapsed
        ? `Показать все адреса (ещё ${hidden})`
        : `Свернуть список (${rows.length} адресов)`;
    }

    function bulkAddAddresses(lines) {
      const clean = lines.map(l => String(l || "").trim()).filter(Boolean);
      if (!clean.length) return 0;
      // Clear empty rows first
      document.querySelectorAll(".planner-addr-input").forEach(i => {
        if (!i.value.trim()) i.closest(".addr-row")?.remove();
      });
      clean.forEach(addr => addAddressRow(addr));
      // Auto-collapse if many addresses
      if (clean.length > ADDR_COLLAPSE_LIMIT) {
        addrCollapsed = true;
      }
      updateAddrToggle();
      return clean.length;
    }

    el("addr-list-toggle")?.addEventListener("click", () => {
      addrCollapsed = !addrCollapsed;
      updateAddrToggle();
    });

    addAddressRow(); // первый адрес

    el("addr-add-btn")?.addEventListener("click", () => {
      const inp = addAddressRow();
      inp?.focus();
    });

    // Кнопка открытия панели импорта
    el("addr-import-btn")?.addEventListener("click", () => {
      const panel = el("addr-import-panel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    el("addr-import-cancel")?.addEventListener("click", () => {
      const panel = el("addr-import-panel");
      if (panel) panel.style.display = "none";
    });

    // Загрузка файла — авто-добавление без нажатия кнопки
    el("addr-file-input")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = el("addr-import-status");
      if (status) status.textContent = "Читаю файл…";
      const name = file.name.toLowerCase();
      try {
        let lines = [];

        if (name.endsWith(".txt")) {
          const text = await file.text();
          lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        } else if (name.endsWith(".csv")) {
          const text = await file.text();
          // Detect header row
          const result = window.Papa?.parse(text, { header: true, skipEmptyLines: true });
          if (result?.data?.length) {
            lines = _extractAddrLines(result.data);
          } else {
            // No header — use first column
            const r2 = window.Papa?.parse(text, { skipEmptyLines: true });
            lines = (r2?.data || []).map(row => String(row[0] || "").trim()).filter(Boolean);
          }

        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await file.arrayBuffer();
          const wb  = window.XLSX?.read(buf, { type: "array" });
          const ws  = wb?.Sheets?.[wb.SheetNames[0]];
          const rows = window.XLSX?.utils?.sheet_to_json(ws, { defval: "" }) || [];
          if (rows.length) {
            lines = _extractAddrLines(rows);
          } else {
            // Fallback: raw array
            const raw = window.XLSX?.utils?.sheet_to_json(ws, { header: 1 }) || [];
            lines = raw.slice(1).map(row => String(row[0] || "").trim()).filter(Boolean);
          }
        }

        // Auto-add immediately
        const added = bulkAddAddresses(lines);
        if (status) status.textContent = added ? `Добавлено: ${added} адресов` : "Нет адресов в файле";
        // Close import panel
        const panel = el("addr-import-panel");
        if (panel && added) panel.style.display = "none";
        // Also update textarea for reference
        const textarea = el("addr-paste-area");
        if (textarea) textarea.value = lines.join("\n");

      } catch(err) {
        if (status) status.textContent = "Ошибка чтения файла";
        console.error("[addr-import]", err);
      }
      e.target.value = "";
    });

    // Применить импорт из textarea (ручная вставка)
    el("addr-import-apply")?.addEventListener("click", () => {
      const text = el("addr-paste-area")?.value || "";
      const lines = text.split(/\r?\n/);
      const added = bulkAddAddresses(lines);
      const status = el("addr-import-status");
      if (status) status.textContent = added ? `Добавлено: ${added}` : "Нет адресов";
      if (added) {
        const panel = el("addr-import-panel");
        if (panel) panel.style.display = "none";
        if (el("addr-paste-area")) el("addr-paste-area").value = "";
      }
    });

    return;
  }

  if (mode === "poi") {
    const keys = Object.keys(POI_QUERIES || {});
    const options = keys.map(k => `<option value="${k}">${POI_LABELS[k] || k}</option>`).join("");

    extra.innerHTML = `
      <select id="poi-type"
              style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
        ${options}
      </select>

      <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус вокруг POI, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">

      <div style="font-size:12px; color:#666; margin-top:6px;">
        POI-тип берём из OpenStreetMap (Overpass), затем выбираем экраны вокруг POI.
      </div>
    `;
    return;
  }

  if (mode === "route") {
    extra.innerHTML = `
      <input id="route-from" type="text" placeholder="Точка А"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="route-to" type="text" placeholder="Точка Б"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="planner-radius" type="number" min="50" value="300" placeholder="Радиус от маршрута, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        MVP: маршрут сохраняем в бриф (без построения).
      </div>
    `;
    attachAddressSuggest(el("route-from"));
    attachAddressSuggest(el("route-to"));
    return;
  }

  if (mode === "highway") {
    extra.innerHTML = `
      <input id="highway-name" type="text" placeholder="Название дороги, например: Рублёвское шоссе"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус от дороги, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        Введите название магистрали, шоссе или улицы. Экраны будут подобраны вдоль всей дороги в заданном радиусе.
      </div>
    `;
    return;
  }

  if (mode === "manual_screens") {
    extra.innerHTML = `
      <textarea id="manual-gids"
        placeholder="Вставьте GID-ы экранов — по одному на строку или через запятую/пробел/таб.&#10;&#10;Пример:&#10;GID-12345&#10;GID-67890, GID-11111"
        style="width:100%; height:130px; padding:10px; border:1px solid #ddd; border-radius:10px;
               font-size:13px; resize:vertical; box-sizing:border-box; font-family:monospace;"></textarea>
      <div id="manual-gids-status" style="font-size:12px; color:#666; margin-top:6px;">
        Введите GID-ы — после расчёта будут использованы только эти экраны.
      </div>
      <button id="manual-gids-download-unmatched" type="button" style="display:none; margin-top:8px;
        padding:6px 14px; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;
        font-size:12px; color:#856404; cursor:pointer; font-weight:600;">
        ↓ Скачать не найденные GID-ы
      </button>
    `;

    // Живой счётчик совпадений при вводе
    const ta = el("manual-gids");
    const statusEl = el("manual-gids-status");
    if (ta && statusEl) {
      ta.addEventListener("input", () => {
        const ids = _parseManualGids(ta.value);
        if (!ids.length) {
          statusEl.textContent = "Введите GID-ы — после расчёта будут использованы только эти экраны.";
          statusEl.style.color = "#666";
          return;
        }
        const allScreens = state.screens || [];
        const matched = allScreens.filter(s => ids.has(_screenIdOf(s)));
        statusEl.textContent = `Найдено в инвентаре: ${matched.length} из ${ids.size} указанных GID-ов`;
        statusEl.style.color = matched.length > 0 ? "#5b3ef5" : "#dc2626";
      });
    }
    return;
  }
}

// Парсит текст с GID-ами → Set строк
function _parseManualGids(text) {
  const raw = String(text || "");
  const tokens = raw.split(/[\n,\r\t ]+/).map(t => t.trim()).filter(Boolean);
  return new Set(tokens);
}

// ===== City -> Region loader =====
async function loadCityRegions() {
  try {
    const res = await fetch(CITY_REGIONS_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error("city_regions http " + res.status);

    const json = await res.json();
    const regionsRaw = (json?.regions && typeof json.regions === "object") ? json.regions : null;
    if (!regionsRaw) throw new Error("city_regions has no 'regions' object");

    const cityToRegion = {};
    let citiesCount = 0;
    let regionsCount = 0;

    for (const [k, v] of Object.entries(regionsRaw)) {
      if (typeof v === "string") {
        const key = normalizeKey(k);
        if (key) {
          cityToRegion[key] = String(v).trim();
          citiesCount++;
        }
        continue;
      }

      if (Array.isArray(v)) {
        const region = String(k).trim();
        regionsCount++;
        for (const city of v) {
          const key = normalizeKey(city);
          if (!key) continue;
          cityToRegion[key] = region;
          citiesCount++;
        }
        continue;
      }
    }

    window.PLANNER.cityRegions = cityToRegion;
    window.PLANNER.cityRegionsMeta = json?.meta || null;

    console.log("[city_regions] loaded:", { cities: citiesCount, regions: regionsCount || "n/a" });
    return true;
  } catch (e) {
    console.warn("[city_regions] load failed:", e);
    window.PLANNER.cityRegions = {};
    window.PLANNER.cityRegionsMeta = null;
    return false;
  }
}

const _MUNICIPAL_PREFIXES = /^(городской\s+округ|муниципальный\s+округ|муниципальный\s+район|г\.\s*о\.\s*|г\.\s*|город\s+)/i;

function normalizeGeoName(s) {
  return normalizeKey(String(s || "").replace(_MUNICIPAL_PREFIXES, ""));
}

function screenMatchesGeoChoice(screen, choice) {
  const pick = normalizeGeoName(choice);
  if (!pick) return false;
  const r = normalizeGeoName(screen?.region || "");
  const c = normalizeGeoName(screen?.city || "");
  return (
    r === pick || c === pick ||
    (r && (r.includes(pick) || pick.includes(r))) ||
    (c && (c.includes(pick) || pick.includes(c)))
  );
}

function getRegionForCity(city) {
  const map = window.PLANNER?.cityRegions;
  if (!map) return "Не назначено";
  const r = map[normalizeKey(city)] ?? map[normalizeGeoName(city)];
  return (typeof r === "string" && r.trim()) ? r.trim() : "Не назначено";
}

function isLikelyAddressLikeName(value) {
  const s = normalizeKey(value);
  if (!s) return false;
  if (/\d/.test(s)) return true;
  if (/[«»"']/u.test(String(value || ""))) return true;
  if (/\s-\s/.test(String(value || ""))) return true;
  return /(ул|улица|проспект|пр-т|шоссе|проезд|пер|переулок|наб|набережная|бульвар|пл|площадь|ост\.|остановк|дом|д\.)/.test(s);
}

function getRegionForDspCity(city) {
  const raw = String(city || "").trim();
  if (!raw) return "Не назначено";

  const mapped = getRegionForCity(raw);
  if (mapped !== "Не назначено") return mapped;

  if (isLikelyAddressLikeName(raw)) return "Не назначено";
  return raw;
}

// ===== Regions UI (мультивыбор) =====
const REGIONS_COLLAPSE_LIMIT = 10;
if (typeof state._regionsCollapsed === "undefined") state._regionsCollapsed = false;

function renderSelectedRegions() {
  const wrap = el("region-selected");
  if (!wrap) return;

  const clearBtn = el("regions-clear");

  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  wrap.innerHTML = "";

  if (clearBtn) clearBtn.style.display = regions.length ? "inline-block" : "none";

  const visible = state._regionsCollapsed ? regions.slice(0, REGIONS_COLLAPSE_LIMIT) : regions;

  visible.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.cssText = "display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border:1px solid #ddd; border-radius:999px; background:#fff;";

    const label = document.createElement("span");
    label.textContent = r;

    const x = document.createElement("button");
    x.type = "button"; x.textContent = "×";
    x.setAttribute("aria-label", `Удалить ${r}`);
    x.style.cssText = "border:0; background:transparent; cursor:pointer; font-size:18px; line-height:1; padding:0 2px;";

    x.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      state.selectedRegions = (state.selectedRegions || []).filter(xx => String(xx).trim() !== r);
      state.selectedRegion = (state.selectedRegions[0] || null);
      if (state.selectedRegions.length <= REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = false;
      renderSelectedRegions();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });

    chip.appendChild(label); chip.appendChild(x);
    wrap.appendChild(chip);
  });

  // Toggle button
  if (regions.length > REGIONS_COLLAPSE_LIMIT) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.style.cssText = "margin-top:6px; width:100%; padding:6px; border:1px solid #e0d9ff; border-radius:10px; background:#faf8ff; color:#5B3EF5; font-size:12px; cursor:pointer; font-weight:500;";
    const hidden = regions.length - REGIONS_COLLAPSE_LIMIT;
    toggle.textContent = state._regionsCollapsed
      ? `Показать все регионы (ещё ${hidden})`
      : `Свернуть (${regions.length} регионов)`;
    toggle.addEventListener("click", () => {
      state._regionsCollapsed = !state._regionsCollapsed;
      renderSelectedRegions();
    });
    wrap.appendChild(toggle);
  }
}

function renderRegionSuggestions(q) {
  const sug = el("city-suggestions");
  if (!sug) return;
  sug.innerHTML = "";
  if (!q) return;

  if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];

  const qq = q.toLowerCase();
  // Search regions first, then fall back to cities not covered by a region name
  const regionMatches = state.regionsAll.filter(r => r.toLowerCase().includes(qq));
  const cityMatches = (state.citiesAll || [])
    .filter(c => c.toLowerCase().includes(qq) && !state.regionsAll.includes(c))
    .slice(0, 6);
  const matches = [...new Set([...regionMatches, ...cityMatches])].slice(0, 12);

  matches.forEach(r => {
    const b = document.createElement("button");
    cssButtonBase(b);
    b.textContent = "+ " + r;

    b.addEventListener("click", () => {
      if (!state.selectedRegions.includes(r)) state.selectedRegions.push(r);
      state.selectedRegion = state.selectedRegions[0] || null;

      if (el("city-search")) el("city-search").value = "";
      sug.innerHTML = "";

      renderSelectedRegions();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });

    sug.appendChild(b);
  });
}

// ===== Data load =====
async function loadScreens() {
  setStatus("Загружаю список экранов…");
  console.log("[screens] url:", SCREENS_CSV_URL);

  const res = await fetch(SCREENS_CSV_URL, { cache: "force-cache" });
  console.log("[screens] status:", res.status, res.statusText);
  if (!res.ok) throw new Error("Не удалось загрузить CSV: " + res.status);

  const text = await res.text();
  const rows = parseCSV(text);

  state.screens = rows.map(r => {
    const city = String(r.city ?? r.City ?? r.CITY ?? "").trim();
    const format = String(r.format ?? r.Format ?? r.FORMAT ?? "").trim();
    const address = String(r.address ?? r.Address ?? r.ADDRESS ?? "").trim();

    const screenId =
      r.screen_id ?? r.screenId ??
      r.inventory_id ?? r.inventoryId ??
      r.id ?? "";

    return {
      ...r,
      screen_id: String(screenId).trim(),
      city,
      format,
      address,
      minBid: toNumber(r.minBid ?? r.min_bid ?? r.MINBID ?? r.minbid),
      ots: toNumber(r.ots ?? r.OTS),
      grp: toNumber(r.grp ?? r.GRP),
      lat: toNumber(r.lat ?? r.Lat ?? r.LAT),
      lon: toNumber(r.lon ?? r.Lon ?? r.LON ?? r.lng ?? r.Lng ?? r.LNG)
    };
  });

  // Interpolate missing OTS (ots=0 or NaN) using average OTS of screens
  // with the same format. This prevents zero-OTS screens from dragging
  // down the pool average when some screens simply lack measurement data.
  // Exception: Магнит screens always keep OTS=0 (their data is unreliable).
  const isMagnitScreen = s => {
    const o = String(s.owner ?? "").toLowerCase();
    return o.includes("магнит") || _ZERO_OTS_OWNERS.some(k => o.includes(k));
  };
  const otsByFormat = {};
  for (const s of state.screens) {
    if (isMagnitScreen(s)) continue; // exclude from average computation
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (isMagnitScreen(s)) { s.ots = 0; continue; } // Магнит: OTS = 0, no interpolation
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format]) {
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
    }
  }

  // ── OTS cap: убираем аномально высокие значения ──────────────────────────
  // Данные по выбросам на основе анализа инвентаря (percentile 99 + запас):
  // BILLBOARD  p99=125  → cap 150   (Russ Outdoor ЮВХ выбросы до 6061)
  // SUPERSITE  p99=196  → cap 200
  // OTHER               → cap 100
  // MEDIAFACADE p99≈1645 → cap 2000  (фасады — высокий OTS норм, но 2224+ лишнее)
  const OTS_CAPS = {
    BILLBOARD:   150,
    SUPERSITE:   200,
    OTHER:       100,
    MEDIAFACADE: 2000,
  };
  for (const s of state.screens) {
    const cap = OTS_CAPS[s.format];
    if (cap && Number.isFinite(s.ots) && s.ots > cap) {
      s.ots = cap;
    }
  }

  state.citiesAll = [...new Set(state.screens.map(s => s.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  state.regionsByCity = {};
  state.regionsAll = [];

  for (const c of state.citiesAll) {
    const reg = getRegionForCity(c);
    state.regionsByCity[c] = reg;
    if (!state.regionsAll.includes(reg)) state.regionsAll.push(reg);
  }

  state.ownersAll = [...new Set(
  state.screens
    .map(s => String(s.owner ?? s.Owner ?? "").trim())
    .filter(Boolean)
)].sort((a,b) => a.localeCompare(b, "ru"));
  state.regionsAll.sort((a, b) => a.localeCompare(b, "ru"));

  // ✅ регионы готовы — снимаем блокировку
  setRegionsUIReady(true);

  // проставляем region каждому экрану
  for (const s of state.screens) {
    s.region = state.regionsByCity[s.city] || "Не назначено";
  }

  renderFormats();
  renderSelectedRegions();
  renderOwners();

  setStatus(
    `Всего доступно: ` +
    `Экранов: ${state.screens.length}. ` +
    `Городов: ${state.citiesAll.length}. ` +
    `Форматов: ${state.formatsAll.length}. ` +
    `Регионов: ${state.regionsAll.length}.`
  );

  window.PLANNER.ready = true;
  window.dispatchEvent(
    new CustomEvent("planner:screens-ready", {
      detail: { count: state.screens.length }
    })
  );
}

function renderOwners() {
  // Карточки операторов рендерит widget.html (own-card).
  // Здесь только уведомляем его об изменении данных через событие.
  window.dispatchEvent(new CustomEvent("planner:filters-changed"));
}

function getScreensFilteredByOwner(pool) {
  const sel = state.selectedOwners;
  if (!sel || sel.size === 0) return pool;
  return (pool || []).filter(s => sel.has(String(s.owner ?? "").trim()));
}

// ===== UI: formats =====
function renderFormats() {
  const wrap = el("formats-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  state.formatsAll.forEach(fmt => {
    const meta = formatMeta(fmt);
    const b = document.createElement("button");
    cssButtonBase(b);
    b.style.borderRadius = "14px";
    b.style.padding = "10px 12px";
    b.style.textAlign = "left";
    b.style.maxWidth = "240px";

    const fmtCount = state.screensAll.filter(s => s.format === fmt).length;
    const fmtCountTxt = fmtCount > 0 ? `${fmtCount} экр.` : "";
    b.innerHTML = `
      <div style="font-weight:700;">${escapeHtml(meta.label)}</div>
      <div style="font-size:12px; color:#666;">${escapeHtml(meta.desc)}</div>
      ${fmtCountTxt ? `<div style="font-size:11px; color:#999; margin-top:4px;">${fmtCountTxt}</div>` : ""}
    `;

    const sync = () => { b.style.borderColor = state.selectedFormats.has(fmt) ? "#111" : "#ddd"; };
    sync();

    b.addEventListener("click", () => {
      if (el("formats-auto")?.checked) return;
      if (state.selectedFormats.has(fmt)) state.selectedFormats.delete(fmt);
      else state.selectedFormats.add(fmt);
      sync();
      renderProgress();
    });

    wrap.appendChild(b);
  });
}

// ===== Brief =====
function buildBrief() {
  const root = document.getElementById("planner-widget") || document;

  const budgetMode = getBudgetMode();

  const budgetVal = Number(el("budget-input")?.value || 0);
  const goalOtsVal = Number(el("goal-ots")?.value || 0);

  const commEnabled = !!el("commission-enabled")?.checked;
  const commRate    = commEnabled ? Math.max(0, Number(el("commission-rate")?.value || 0)) : 0;
  const budgetNet   = (budgetMode === "fixed" && commRate > 0)
    ? budgetVal / (1 + commRate / 100)
    : budgetVal;

  const budgetOk =
    (budgetMode === "recommendation") ||
    (budgetMode === "fixed" && budgetVal > 0) ||
    (budgetMode === "goal_ots" && goalOtsVal > 0);

  const scheduleType = getScheduleType(); // all_day | peak | custom | weekly
  const timeFrom = el("time-from")?.value;
  const timeTo = el("time-to")?.value;

  const weeklyMode = (scheduleType === "weekly") ? getWeeklyModeFromUI() : null;

const weekly = (scheduleType === "weekly" && typeof getWeeklyScheduleFromUI === "function")
  ? getWeeklyScheduleFromUI()
  : null;

const globalIntervals = (scheduleType === "weekly" && typeof getGlobalScheduleFromUI === "function")
  ? getGlobalScheduleFromUI()
  : [];

  const selectionMode = el("selection-mode")?.value || "city_even";

  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  const singleRegionFallback = String(state.selectedRegion || "").trim();
  const regionOne = regions.length ? regions[0] : (singleRegionFallback || null);

  const brief = {
    budget: {
      mode: budgetMode,
      amount: budgetMode === "fixed" ? Number(budgetNet || 0) : null,
      currency: "RUB",
      perCity: (() => {
        if (budgetMode !== "fixed" || !document.getElementById("per-city-enabled")?.checked) return null;
        const isPct = window._perCityMode === "pct";
        const totalBudget = Number(document.getElementById("budget-input")?.value || 0);
        const map = {};
        document.querySelectorAll("#per-city-rows .per-city-row").forEach(row => {
          const region = row.dataset.region;
          const val = Number(row.querySelector("input")?.value || 0);
          if (!region || val <= 0) return;
          map[region] = isPct ? Math.floor(totalBudget * val / 100) : val;
        });
        return Object.keys(map).length > 0 ? map : null;
      })()
    },
    dates: {
      start: el("date-start")?.value || null,
      end: el("date-end")?.value || null
    },
    schedule: (() => {
      if (scheduleType === "weekly") {
  return {
    type: "weekly",
    mode: weeklyMode || "by_dow",                 // ✅ NEW
    globalIntervals: globalIntervals || [],       // ✅ NEW (рваный "общее")
    weekly: weekly || { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } // existing
  };
}
      return {
        type: scheduleType,
        from: scheduleType === "custom" ? (timeFrom || null) : null,
        to: scheduleType === "custom" ? (timeTo || null) : null
      };
    })(),
    geo: {
      region: regionOne,
      regions: regions.length ? regions : (regionOne ? [regionOne] : [])
    },
    formats: {
      mode: el("formats-auto")?.checked ? "auto" : "manual",
      selected: el("formats-auto")?.checked ? [] : [...state.selectedFormats]
    },
    selection: { mode: selectionMode },
    grp: {
      enabled: !!el("grp-enabled")?.checked,
      min: toNumber(el("grp-min")?.value ?? 0),
      max: toNumber(el("grp-max")?.value ?? 9.98)
    },
    constructions: {
      enabled:     !!el("constructions-enabled")?.checked,
      count:       toNumber(el("constructions-count")?.value ?? 0),
      playsPerHour: toNumber(el("constructions-ppm")?.value ?? 0) || 0,
    },
    audience: {
      enabled: !!el("audience-enabled")?.checked,
      segments: (() => {
        const segs = [];
        document.querySelectorAll('#audience-segment-wrap input[type="checkbox"]:checked')
          .forEach(cb => segs.push(cb.value));
        return segs;
      })(),
      topPct: parseInt(el("audience-top-pct")?.value || "10", 10) / 100,
    },
    bidMode: el("bid-mode-min")?.checked ? "min" : "recommended",
    reachMode: getReachModeFromUI(),
    goal: {
      ots: (() => {
        const v = el("goal-ots")?.value;
        const n = toNumber(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      })()
    },
    _ui: { budgetOk }
  };

  const qsVal = (sel) => (root.querySelector(sel)?.value ?? "");
  const pickAnyNum = (fallback, ...sels) => {
    for (const s of sels) {
      const v = qsVal(s);
      if (v !== "" && v != null) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };
  const pickAnyVal = (...sels) => {
    for (const s of sels) {
      const v = qsVal(s);
      if (String(v).trim()) return String(v).trim();
    }
    return "";
  };

  if (selectionMode === "near_address") {
    // Collect all address inputs (new multi-address UI)
    const addrInputs = [...document.querySelectorAll(".planner-addr-input")];
    const addresses = addrInputs.map(i => String(i.value || "").trim()).filter(Boolean);
    // Fallback: old single input
    if (!addresses.length) {
      const single = pickAnyVal("#planner-addr", "#addr");
      if (single) addresses.push(single);
    }
    brief.selection.addresses = addresses;
    brief.selection.address   = addresses[0] || ""; // backward compat
    brief.selection.radius_m  = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "poi") {
    brief.selection.poi_type = String(qsVal("#poi-type") || "pet_store").trim();
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "route") {
    brief.selection.route_from = pickAnyVal("#route-from");
    brief.selection.route_to = pickAnyVal("#route-to");
    brief.selection.radius_m = pickAnyNum(300, "#planner-radius", "#radius");
  }
  if (selectionMode === "highway") {
    brief.selection.highway_name = el("highway-name")?.value || "";
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "manual_screens") {
    brief.selection.manual_gids = _parseManualGids(el("manual-gids")?.value || "");
  }

  if (!Number.isFinite(brief.grp.min)) brief.grp.min = 0;
  if (!Number.isFinite(brief.grp.max)) brief.grp.max = 9.98;
  brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
  brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
  if (brief.grp.max < brief.grp.min) [brief.grp.min, brief.grp.max] = [brief.grp.max, brief.grp.min];

  return brief;
}

// ===== Tiers =====
async function loadTiers() {
  try {
    const res = await fetch(TIERS_JSON_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error("tiers json http " + res.status);
    const json = await res.json();

    const tiers = json?.tiers && typeof json.tiers === "object" ? json.tiers : null;
    if (!tiers) throw new Error("tiers json has no 'tiers' object");

    window.PLANNER.tiers = tiers;
    window.PLANNER.tiersMeta = {
      version: json?.version || "unknown",
      generated_at: json?.generated_at || null
    };

    console.log("[tiers] loaded:", Object.keys(tiers).length, "regions", window.PLANNER.tiersMeta);
    return true;
  } catch (e) {
    console.warn("[tiers] load failed:", e);
    window.PLANNER.tiers = {};
    window.PLANNER.tiersMeta = { version: "missing", generated_at: null };
    return false;
  }
}

// now name = REGION
function getTierForGeo(name) {
  const key = String(name || "").trim();
  const t = window.PLANNER?.tiers?.[key];
  return (t === "M" || t === "SP" || t === "A" || t === "B" || t === "C" || t === "D") ? t : "C";
}

// ===== Helpers =====
async function fetchRouteOSRM(A, B) {
  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${A.lon},${A.lat};${B.lon},${B.lat}` +
    "?overview=full&geometries=geojson";

  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("OSRM HTTP " + r.status);
  const j = await r.json();

  const coords = j?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  return coords; // [ [lon,lat], ... ]
}

// Yandex geocode of a road name → returns {center, bbox} or null
async function geocodeRoadYandex(roadName, regionHint) {
  const key = window.YANDEX_MAPS_KEY;
  if (!key) return null;
  const query = regionHint ? `${roadName}, ${regionHint}` : roadName;
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${key}&geocode=${encodeURIComponent(query)}&results=1&format=json&kind=street`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Yandex geocode HTTP " + r.status);
  const j = await r.json();
  const member = j?.response?.GeoObjectCollection?.featureMember?.[0];
  if (!member) return null;
  const gobj = member.GeoObject;
  const pos = gobj?.Point?.pos?.split(" ");
  const lower = gobj?.boundedBy?.Envelope?.lowerCorner?.split(" ");
  const upper = gobj?.boundedBy?.Envelope?.upperCorner?.split(" ");
  if (!pos || !lower || !upper) return null;
  return {
    center: { lon: Number(pos[0]), lat: Number(pos[1]) },
    bbox: {
      minLon: Number(lower[0]), minLat: Number(lower[1]),
      maxLon: Number(upper[0]), maxLat: Number(upper[1]),
    }
  };
}

// Parse Overpass response elements into [[lon,lat], ...] polyline
function _parseOverpassPolyline(data) {
  const nodes = {};
  for (const el of (data.elements || [])) {
    if (el.type === "node") nodes[el.id] = el;
  }
  const allPoints = [];
  for (const el of (data.elements || [])) {
    if (el.type === "way" && Array.isArray(el.nodes)) {
      for (const nid of el.nodes) {
        const n = nodes[nid];
        if (n) allPoints.push([n.lon, n.lat]);
      }
    }
  }
  return allPoints;
}

async function fetchHighwayGeometry(roadName, regionHint) {
  const q = String(roadName || "").trim();
  if (!q) return null;

  const qSafe = q.replace(/"/g, "");
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  // Step 1: Try Yandex to get the road's bounding box
  let bbox = null;
  if (window.YANDEX_MAPS_KEY) {
    try {
      const yRes = await geocodeRoadYandex(q, regionHint);
      if (yRes?.bbox) {
        bbox = yRes.bbox;
        console.log(`[highway] Yandex bbox for «${q}»:`, bbox);
      }
    } catch(e) {
      console.warn("[highway] Yandex geocode road failed:", e.message);
    }
  }

  // Step 2: Try Overpass with bbox (targeted = faster, less rate-limited)
  // bbox query: [south,west,north,east]
  const bboxStr = bbox
    ? `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
    : null;

  // Expand bbox slightly (0.05° ≈ 5 km padding)
  const bboxExpandedStr = bbox
    ? `${bbox.minLat - 0.05},${bbox.minLon - 0.05},${bbox.maxLat + 0.05},${bbox.maxLon + 0.05}`
    : null;

  const makeQuery = (useBbox) => useBbox
    ? `[out:json][timeout:15];(way["name"~"${qSafe}",i]["highway"](${useBbox});>;);out body;`
    : `[out:json][timeout:20];(way["name"~"${qSafe}",i]["highway"];>;);out body;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    // Try bbox query first (if we have one), then full query
    const queries = bboxExpandedStr
      ? [makeQuery(bboxExpandedStr), makeQuery(null)]
      : [makeQuery(null)];

    for (const overpassQuery of queries) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(overpassQuery),
          signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) {
          if (resp.status === 429) { console.warn("[highway] Overpass 429 on", endpoint); break; }
          throw new Error("Overpass HTTP " + resp.status);
        }
        const data = await resp.json();
        const pts = _parseOverpassPolyline(data);
        if (pts.length >= 2) {
          console.log(`[highway] got ${pts.length} points from ${endpoint}`);
          return pts;
        }
      } catch(e) {
        console.warn(`[highway] ${endpoint} failed:`, e.message);
      }
    }
  }

  // Step 3: Fallback — if Yandex gave us a bbox, synthesize a simple diagonal polyline
  // so screens near the road corridor are still matched
  if (bbox) {
    console.warn("[highway] Overpass unavailable, falling back to Yandex bbox diagonal");
    return [
      [bbox.minLon, bbox.minLat],
      [bbox.maxLon, bbox.maxLat],
    ];
  }

  return null;
}

function getLatLon(s) {
  const lat = Number(
    s?.lat ?? s?.LAT ?? s?.latitude ?? s?.Latitude ?? s?.y ?? s?.Y
  );
  const lon = Number(
    s?.lon ?? s?.LON ?? s?.lng ?? s?.longitude ?? s?.Longitude ?? s?.x ?? s?.X
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function distancePointToPolylineMeters(P, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const A = { lon: line[i][0], lat: line[i][1] };
    const B = { lon: line[i + 1][0], lat: line[i + 1][1] };
    const d = distancePointToSegmentMeters(P, A, B);
    if (d < best) best = d;
  }
  return best;
}

function distancePointToSegmentMeters(P, A, B) {
  const R = 6371000;
  const lat0 = (A.lat + B.lat) * 0.5 * Math.PI / 180;

  const ax = A.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const ay = A.lat * Math.PI / 180 * R;
  const bx = B.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const by = B.lat * Math.PI / 180 * R;
  const px = P.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const py = P.lat * Math.PI / 180 * R;

  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;

  let t = (ab2 === 0) ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;

  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickScreensNearPolyline(screens, lineLonLat, radiusM) {
  const out = [];
  for (const s of screens) {
    const p = getLatLon(s);
    if (!p) continue;

    const d = distancePointToPolylineMeters({ lon: p.lon, lat: p.lat }, lineLonLat);
    if (d <= radiusM) out.push(s);
  }
  return out;
}

function _screenIdOf(s) {
  return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim();
}

// Replace a chosen screen with nearest similar one from the pool
function replaceScreen(screenId) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return null;

  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return null;

  const old = chosen[idx];
  const oldLoc = getLatLon(old);
  const dist = window.GeoUtils?.haversineMeters;

  const allScreens = state.screensAll || [];
  const chosenIds = new Set(chosen.map(s => _screenIdOf(s)));

  // Candidates: same format, same region, not chosen, has coordinates
  let candidates = allScreens.filter(s => {
    const sid = _screenIdOf(s);
    if (!sid || chosenIds.has(sid)) return false;
    if (s.format !== old.format) return false;
    if (s.region && old.region && s.region !== old.region) return false;
    const loc = getLatLon(s);
    if (!loc) return false;
    return true;
  });

  // Fallback: any format, same region
  if (!candidates.length) {
    candidates = allScreens.filter(s => {
      const sid = _screenIdOf(s);
      if (!sid || chosenIds.has(sid)) return false;
      if (s.region && old.region && s.region !== old.region) return false;
      return !!getLatLon(s);
    });
  }

  if (!candidates.length) return null;

  // Sort by distance to old screen (if we have old coords and haversine)
  if (oldLoc && dist) {
    candidates.sort((a, b) => {
      const la = getLatLon(a), lb = getLatLon(b);
      const da = dist(oldLoc.lat, oldLoc.lon, la.lat, la.lon);
      const db = dist(oldLoc.lat, oldLoc.lon, lb.lat, lb.lon);
      return da - db;
    });
  }

  const replacement = candidates[0];
  chosen.splice(idx, 1, replacement);

  window.dispatchEvent(new CustomEvent("planner:screen-replaced", {
    detail: { removed: old, added: replacement }
  }));

  return replacement;
}

// Remove a chosen screen (no replacement)
function removeScreen(screenId) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return false;
  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return false;
  const removed = chosen.splice(idx, 1)[0];
  window.dispatchEvent(new CustomEvent("planner:screen-removed", {
    detail: { removed }
  }));
  return true;
}

function pickScreensByMinBid(screens, n) {
  const sorted = [...screens].sort((a, b) => {
    const pa = ownerPriority(a), pb = ownerPriority(b);
    if (pa !== pb) return pa - pb;
    const aa = Number.isFinite(a.minBid) ? a.minBid : 1e18;
    const bb = Number.isFinite(b.minBid) ? b.minBid : 1e18;
    if (aa !== bb) return aa - bb;
    return String(a.screen_id || "").localeCompare(String(b.screen_id || ""));
  });
  return sorted.slice(0, n);
}

function gridKey(lat, lon, stepKm = 2) {
  const R = 6371;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const xKm = R * lonRad * Math.cos(latRad);
  const yKm = R * latRad;

  const gx = Math.floor(yKm / stepKm);
  const gy = Math.floor(xKm / stepKm);
  return `${gx}:${gy}`;
}

function gridStepKmForCount(n) {
  if (n <= 10) return 6;
  if (n <= 25) return 4;
  if (n <= 60) return 2.5;
  return 2;
}

function computeScreensNeededForPlays(totalPlaysTheory, days, hpd, pphTarget, budgetMode) {
  const maxPlaysPerScreenForPeriod = Math.floor(SC_MAX * days * hpd);
  let screensNeeded = Math.ceil(totalPlaysTheory / Math.max(1, maxPlaysPerScreenForPeriod));
  screensNeeded = Math.max(1, screensNeeded);

  if (budgetMode !== "goal_ots") {
    const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;
    const byStrategy = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, pphTarget)));
    const byHardCap = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, SC_MAX)));
    screensNeeded = Math.max(screensNeeded, byStrategy, byHardCap);
  }

  return screensNeeded;
}

function groupByGrid(screens, stepKm = 2) {
  const map = new Map();
  for (const s of screens) {
    const lat = Number(s.lat ?? s.latitude);
    const lon = Number(s.lon ?? s.lng ?? s.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = gridKey(lat, lon, stepKm);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.values()];
}

function pickScreensUniformByGrid(pool, count, stepKm = 2, perCellMax = 2) {
  const cells = groupByGrid(pool, stepKm);
  for (const cell of cells) {
    // Сначала приоритетные операторы, внутри приоритета — по minBid (дешевле → выше)
    cell.sort((a, b) => {
      const pa = ownerPriority(a), pb = ownerPriority(b);
      if (pa !== pb) return pa - pb;
      return (a.minBid ?? 1e18) - (b.minBid ?? 1e18);
    });
  }
  cells.sort(() => Math.random() - 0.5);

  const result = [];
  const takenPerCell = new Map();

  let i = 0;
  while (result.length < count && cells.length) {
    const cell = cells[i % cells.length];
    const taken = takenPerCell.get(cell) || 0;

    if (taken >= perCellMax) {
      i++;
      if (takenPerCell.size >= cells.length) break;
      continue;
    }

    if (cell.length) {
      result.push(cell.shift());
      takenPerCell.set(cell, taken + 1);
    }
    i++;
  }

  if (result.length < count) {
    const picked = new Set(result);
    const rest = pool.filter(s => !picked.has(s));
    result.push(...pickScreensByMinBid(rest, count - result.length));
  }

  return result.slice(0, count);
}

// ===== XLSX (screens export simple) =====
function downloadXLSX(rows) {
  if (!rows || !rows.length) return;

  const out = rows.map(r => ({
    GID: r.screen_id ?? "",
    format: r.format ?? "",
    placement: r.placement ?? "",
    installation: r.installation ?? "",
    owner_id: r.owner_id ?? "",
    owner: r.owner ?? "",
    city: r.city ?? "",
    address: r.address ?? "",
    lat: r.lat ?? "",
    lon: r.lon ?? ""
  }));

  const ws = XLSX.utils.json_to_sheet(out, {
    header: ["GID", "format", "placement", "installation", "owner_id", "owner", "city", "address", "lat", "lon"]
  });

  ws["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Screens");
  XLSX.writeFile(wb, "screens_selected.xlsx");
}

// ===== Медиаплан (красивый XLSX через ExcelJS) =====
async function downloadMediaPlan() {
  const calc = window.PLANNER?.lastCalc;
  if (!calc) return alert("Сначала нажмите «Рассчитать».");

  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) return alert("ExcelJS не загружен — обновите страницу.");

  const wb = new ExcelJS.Workbook();
  wb.creator = "DSP Planner";

  const brief   = calc.brief   || {};
  const meta    = calc.meta    || {};
  const perReg  = calc.perRegion || [];
  const screens = calc.chosen  || [];
  const fs      = calc.formatStats || {};

  const fmt  = n => Number.isFinite(n) ? Math.round(n).toLocaleString("ru-RU") : "—";
  const fmtR = n => Number.isFinite(n) ? Math.round(n).toLocaleString("ru-RU") + " ₽" : "—";
  const dateStr = s => s ? String(s).split("-").reverse().join(".") : "—";

  const PURPLE    = "5B3EF5";
  const LIGHT     = "EDE9FD";
  const GREY      = "F5F5F7";
  const WHITE     = "FFFFFF";
  const DARK      = "0B1220";
  const RED_LIGHT = "FFE4E4";
  const RED_TEXT  = "CC0000";

  function hdr(ws, row, col, value, opts = {}) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font  = { bold: true, color: { argb: opts.light ? WHITE : DARK }, size: opts.size || 10 };
    cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg || GREY } };
    cell.alignment = { vertical: "middle", horizontal: opts.center ? "center" : "left", wrapText: true };
    if (opts.border) {
      const b = { style: "thin", color: { argb: "CCCCCC" } };
      cell.border = { top: b, left: b, bottom: b, right: b };
    }
    return cell;
  }

  function val(ws, row, col, value, opts = {}) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font  = { color: { argb: opts.color || (opts.muted ? "888888" : DARK) }, size: opts.size || 10 };
    cell.alignment = { vertical: "middle", horizontal: opts.right ? "right" : "left", wrapText: true };
    if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    if (opts.border) {
      const b = { style: "thin", color: { argb: "CCCCCC" } };
      cell.border = { top: b, left: b, bottom: b, right: b };
    }
    return cell;
  }

  // ── Schedule helpers ────────────────────────────────────────────
  const DOW_RU    = { mon:"пн", tue:"вт", wed:"ср", thu:"чт", fri:"пт", sat:"сб", sun:"вс" };
  const DOW_ORDER = ["mon","tue","wed","thu","fri","sat","sun"];

  function scheduleToLabel(sch) {
    if (!sch) return "—";
    const t = sch.type;
    if (t === "all_day") return "Весь день (00:00 – 24:00)";
    if (t === "peak")    return "Прайм (07:00 – 23:00)";
    if (t === "custom") {
      const from = sch.from || "00:00", to = sch.to || "24:00";
      return `${from} – ${to}`;
    }
    if (t === "weekly") {
      if (sch.mode === "global") {
        const ivs = sch.globalIntervals || [];
        return ivs.length ? "Еж. " + ivs.map(i => `${i.from}–${i.to}`).join(", ") : "Еженедельно";
      }
      const weekly = sch.weekly || {};
      const groups = [];
      for (const d of DOW_ORDER) {
        const ivs = weekly[d] || [];
        const key = ivs.map(i => `${i.from}–${i.to}`).join(",");
        if (!key) continue;
        const idx  = DOW_ORDER.indexOf(d);
        const last = groups[groups.length - 1];
        if (last && last.key === key && last.lastIdx === idx - 1) {
          last.days.push(d); last.lastIdx = idx;
        } else {
          groups.push({ key, days: [d], lastIdx: idx, ivs });
        }
      }
      return groups.map(g => {
        const dayStr = g.days.length === 1
          ? DOW_RU[g.days[0]]
          : `${DOW_RU[g.days[0]]}–${DOW_RU[g.days[g.days.length - 1]]}`;
        const timeStr = g.ivs.map(i => `${i.from}–${i.to}`).join(", ");
        return `${dayStr} ${timeStr}`;
      }).join(" / ") || "—";
    }
    return "—";
  }

  function hpdToLabel(sch, hpdAvg) {
    if (!sch || sch.type !== "weekly" || !sch.weekly) {
      return Number.isFinite(hpdAvg) ? hpdAvg.toFixed(1) : "—";
    }
    const weekly = sch.weekly;
    const hpds = {};
    for (const d of DOW_ORDER) {
      const ivs = weekly[d] || [];
      if (!ivs.length) continue;
      let h = 0;
      for (const iv of ivs) {
        const [fh = 0, fm = 0] = String(iv.from || "0:0").split(":").map(Number);
        const [th = 0, tm = 0] = String(iv.to   || "0:0").split(":").map(Number);
        h += (th + tm / 60) - (fh + fm / 60);
      }
      hpds[d] = +(h.toFixed(1));
    }
    const groups = [];
    for (const d of DOW_ORDER) {
      if (!(d in hpds)) continue;
      const h = hpds[d], idx = DOW_ORDER.indexOf(d);
      const last = groups[groups.length - 1];
      if (last && last.h === h && last.lastIdx === idx - 1) {
        last.days.push(d); last.lastIdx = idx;
      } else {
        groups.push({ h, days: [d], lastIdx: idx });
      }
    }
    return groups.map(g => {
      const dayStr = g.days.length === 1
        ? DOW_RU[g.days[0]]
        : `${DOW_RU[g.days[0]]}–${DOW_RU[g.days[g.days.length - 1]]}`;
      return `${dayStr}: ${g.h}`;
    }).join(", ") || (Number.isFinite(hpdAvg) ? hpdAvg.toFixed(1) : "—");
  }

  const REACH_LABELS = {
    max_reach: "Максимальный охват",
    balanced:  "Баланс охват/частота",
    max_freq:  "Максимальная частота"
  };

  // ── Budget extras from DOM ──────────────────────────────────────
  const vatOn    = !!el("vat-enabled")?.checked;
  const vatRate  = vatOn  ? Math.max(0, Number(el("vat-rate")?.value  || 20)) : 0;
  const commOn   = !!el("commission-enabled")?.checked;
  const commRate = commOn ? Math.max(0, Number(el("commission-rate")?.value || 0)) : 0;

  // brief.budget.amount = net (placement) budget after commission deduction
  const netBudget   = brief.budget?.amount || meta.totalBudget || 0;
  const grossBudget = commOn && commRate > 0 ? netBudget * (1 + commRate / 100) : netBudget;
  const commAmount  = grossBudget - netBudget;
  const vatAmount   = vatOn && vatRate > 0 ? netBudget * vatRate / 100 : 0;

  const totalPlaysAll = meta.totalPlays || 1;
  const costPerPlay   = meta.totalBudget > 0 && totalPlaysAll > 0
    ? Math.round(meta.totalBudget / totalPlaysAll) : null;

  // ── Лист 1: Сводка ─────────────────────────────────────────────
  const ws1 = wb.addWorksheet("Сводка");
  ws1.columns = [{ width: 26 }, { width: 32 }, { width: 26 }, { width: 32 }];

  ws1.mergeCells("A1:D1");
  const title = ws1.getCell("A1");
  title.value = "Медиаплан размещения";
  title.font  = { bold: true, size: 16, color: { argb: WHITE } };
  title.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  ws1.getRow(1).height = 36;

  let r = 3;

  const regionsText = (brief.geo?.regions || brief.selectedRegions || []).join(", ") || "—";
  const formatsAuto = brief.formats?.mode === "auto";
  const formatsText = formatsAuto
    ? "Все форматы"
    : ((brief.formats?.selected || []).join(", ") || "—");
  const schLabel    = scheduleToLabel(brief.schedule);
  const hpdLabel    = hpdToLabel(brief.schedule, meta.hpd);
  const reachLabel  = REACH_LABELS[brief.reachMode] || brief.reachMode || "—";
  const bidLabel    = brief.bidMode === "min" ? "Минимальная" : "Рекомендованная";

  const params = [
    ["Регион(ы)",    regionsText,   "Форматы",      formatsText],
    ["Период",       `${dateStr(brief.dates?.start)} — ${dateStr(brief.dates?.end)}`,
                                    "Дней",         meta.days ?? "—"],
    ["Расписание",   schLabel,      "Часов/день",   hpdLabel],
    ["Режим ставки", bidLabel,      "Стратегия",    reachLabel],
  ];
  for (const [k1, v1, k2, v2] of params) {
    hdr(ws1, r, 1, k1, { bg: GREY, border: true });
    val(ws1, r, 2, v1, { border: true });
    hdr(ws1, r, 3, k2, { bg: GREY, border: true });
    val(ws1, r, 4, v2, { border: true });
    ws1.getRow(r).height = 20;
    r++;
  }

  r++;
  ws1.mergeCells(r, 1, r, 4);
  hdr(ws1, r, 1, "Итоги кампании", { bg: PURPLE, light: true, size: 12 });
  ws1.getRow(r).height = 26;
  r++;

  // Бюджет: с разбивкой по НДС/комиссии
  const budgetRows = [];
  if (commOn && commRate > 0) {
    budgetRows.push(["Бюджет размещения", fmtR(netBudget), `Комиссия агентства ${commRate}%`, fmtR(commAmount)]);
    budgetRows.push(["Итого для клиента (с комиссией)", fmtR(grossBudget), "", ""]);
  } else {
    budgetRows.push(["Бюджет размещения", fmtR(netBudget), "", ""]);
  }
  if (vatOn && vatRate > 0) {
    budgetRows.push([`НДС ${vatRate}%`, fmtR(vatAmount), `Итого с НДС`, fmtR(netBudget + vatAmount)]);
    if (commOn && commRate > 0) {
      budgetRows.push(["Итого для клиента с НДС", fmtR(grossBudget + vatAmount), "", ""]);
    }
  }

  const totals = [
    ...budgetRows,
    ["Экраны",        fmt(screens.length),
                                     "Стоимость выхода",   costPerPlay != null ? fmtR(costPerPlay) : "—"],
    ["Выходов всего", fmt(meta.totalPlays),
                                     "Выходов/день",       fmt(meta.totalPlays / Math.max(1, meta.days || 1))],
    ["OTS всего",     fmt(meta.totalOts),
                                     "OTS/день",           fmt(meta.totalOts   / Math.max(1, meta.days || 1))],
  ];
  for (const [k1, v1, k2, v2] of totals) {
    const isFinal = k1.startsWith("Итого для клиента");
    hdr(ws1, r, 1, k1, { bg: isFinal ? PURPLE : LIGHT, light: isFinal, border: true });
    const vCell = val(ws1, r, 2, v1, { border: true });
    if (isFinal) { vCell.font = { bold: true, color: { argb: DARK }, size: 11 }; }
    if (k2) { hdr(ws1, r, 3, k2, { bg: isFinal ? PURPLE : LIGHT, light: isFinal, border: true }); }
    if (v2) { val(ws1, r, 4, v2, { border: true }); }
    ws1.getRow(r).height = isFinal ? 24 : 20;
    r++;
  }

  // ── Лист 2: По регионам и форматам (иерархически) ────────────────
  const ws2 = wb.addWorksheet("По регионам");
  ws2.columns = [
    { width: 32 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }
  ];
  const bidColHdr = brief.bidMode === "min" ? "Ср. ставка (мин), ₽" : "Ср. ставка (реко), ₽";
  ["Регион / Формат", "Экранов", "Выходов всего", "Выходов/день", "Бюджет, ₽", "OTS всего", "OTS/выход (ср.)", bidColHdr].forEach((h, i) => {
    hdr(ws2, 1, i + 1, h, { bg: PURPLE, light: true, center: true, border: true });
  });
  ws2.getRow(1).height = 22;

  // Build region→format→[screens] map
  const rfMap = {}; // region → format → screens[]
  const bidKey = brief.bidMode === "min" ? "minBid" : "recoBid";
  for (const s of screens) {
    const reg = String(s.region || s.city || "—").trim();
    const fmt_ = String(s.format || "—").trim();
    if (!rfMap[reg]) rfMap[reg] = {};
    if (!rfMap[reg][fmt_]) rfMap[reg][fmt_] = [];
    rfMap[reg][fmt_].push(s);
  }

  let ws2Row = 2;
  const perRegSorted = [...perReg].sort((a, b) => (b.budget || 0) - (a.budget || 0));

  for (const reg of perRegSorted) {
    const regionName = reg.region || "—";
    const regionScreens = reg.screens || 0;
    const regionBudget  = reg.budget  || 0;
    const regionPlays   = reg.plays   || 0;
    const regionOts     = reg.ots     || 0;
    const playsPerDay   = meta.days > 0 ? Math.round(regionPlays / meta.days) : 0;

    // Region header row
    ws2.mergeCells(ws2Row, 1, ws2Row, 8);
    const regionCell = ws2.getCell(ws2Row, 1);
    regionCell.value = regionName;
    regionCell.font  = { bold: true, size: 11, color: { argb: WHITE } };
    regionCell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    regionCell.alignment = { vertical: "middle", horizontal: "left", indent: 0 };
    ws2.getRow(ws2Row).height = 22;
    ws2Row++;

    // Avg bid for region (all screens in region)
    const regionBids = (Object.values(rfMap[regionName] || {})).flat().map(s => {
      const b = brief.bidMode === "min" ? s.minBid : (s.recoBid || s.minBid);
      return Number.isFinite(b) && b > 0 ? b : null;
    }).filter(b => b != null);
    const regionAvgBid = regionBids.length > 0
      ? regionBids.reduce((a, b) => a + b, 0) / regionBids.length : null;

    // Region totals row
    [
      "  Итого по региону",
      fmt(regionScreens),
      fmt(regionPlays),
      fmt(playsPerDay),
      Math.round(regionBudget).toLocaleString("ru-RU"),
      Number.isFinite(regionOts) && regionOts > 0 ? fmt(regionOts) : "—",
      "—",
      regionAvgBid != null ? regionAvgBid.toFixed(2) : "—",
    ].forEach((c, ci) => {
      const cell = val(ws2, ws2Row, ci + 1, c, { fill: LIGHT, border: true, right: ci >= 1 });
      cell.font = { bold: true, color: { argb: DARK }, size: 10 };
    });
    ws2.getRow(ws2Row).height = 18;
    ws2Row++;

    // Format rows
    const fmtGroups = rfMap[regionName] || {};
    const sortedFmts = Object.entries(fmtGroups).sort((a, b) => b[1].length - a[1].length);

    sortedFmts.forEach(([fmtName, fmtScreens], fi) => {
      const weight = regionScreens > 0 ? fmtScreens.length / regionScreens : 0;
      const fmtBudget = regionBudget * weight;
      const fmtPlays  = regionPlays  * weight;
      const fmtPlaysDay = meta.days > 0 ? Math.round(fmtPlays / meta.days) : 0;
      const fmtOts    = regionOts    * weight;

      // Avg bid for this format
      const bids = fmtScreens.map(s => {
        const b = brief.bidMode === "min" ? s.minBid : (s.recoBid || s.minBid);
        return Number.isFinite(b) && b > 0 ? b : null;
      }).filter(b => b != null);
      const avgBid = bids.length > 0 ? bids.reduce((a, b) => a + b, 0) / bids.length : null;

      // Avg OTS/play
      const otsVals = fmtScreens.map(s => Number.isFinite(s.ots) && s.ots > 0 ? s.ots : null).filter(x => x != null);
      const avgOts  = otsVals.length > 0 ? otsVals.reduce((a, b) => a + b, 0) / otsVals.length : null;

      const fill = fi % 2 === 0 ? WHITE : GREY;
      [
        "    " + fmtName,
        fmt(fmtScreens.length),
        fmt(Math.round(fmtPlays)),
        fmt(fmtPlaysDay),
        Math.round(fmtBudget).toLocaleString("ru-RU"),
        Number.isFinite(fmtOts) && fmtOts > 0 ? fmt(Math.round(fmtOts)) : "—",
        avgOts != null ? fmt(Math.round(avgOts)) : "—",
        avgBid != null ? avgBid.toFixed(2) : "—",
      ].forEach((c, ci) => val(ws2, ws2Row, ci + 1, c, { fill, border: true, right: ci >= 1 }));
      ws2.getRow(ws2Row).height = 17;
      ws2Row++;
    });

    // Empty separator row
    ws2.getRow(ws2Row).height = 6;
    ws2Row++;
  }

  // ── Лист 3: Экраны ────────────────────────────────────────────
  const ws3 = wb.addWorksheet("Экраны");
  const bidColLabel = brief.bidMode === "min" ? "Мин. ставка, ₽" : "Реко. ставка, ₽";
  ws3.columns = [
    { width: 18 }, { width: 16 }, { width: 18 }, { width: 40 },
    { width: 20 }, { width: 10 }, { width: 10 }, { width: 14 },
    { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 40 }
  ];
  [
    "GID", "Формат", "Город", "Адрес", "Оператор",
    "Широта", "Долгота", bidColLabel,
    "OTS/выход", "Разрешение", "Соотн. сторон", "Сторона", "Фото"
  ].forEach((h, i) => {
    hdr(ws3, 1, i + 1, h, { bg: PURPLE, light: true, center: true, border: true });
  });
  ws3.getRow(1).height = 22;

  screens.forEach((s, i) => {
    const rowIdx = i + 2;

    // Bid value based on selected mode
    const bidVal = brief.bidMode === "min"
      ? (Number.isFinite(s.minBid)  && s.minBid  > 0 ? s.minBid  : null)
      : (Number.isFinite(s.recoBid) && s.recoBid > 0 ? s.recoBid
          : (Number.isFinite(s.minBid) && s.minBid > 0 ? s.minBid : null));
    const noBid = bidVal == null;
    const fill  = noBid ? RED_LIGHT : (i % 2 === 0 ? WHITE : GREY);

    // Aspect ratio — already computed in mapDspInventory
    const aspectRatio = s.aspectRatio || "";

    [
      s.screen_id ?? "", s.format ?? "", s.city ?? "", s.address ?? "",
      s.owner ?? "",
      Number.isFinite(s.lat) ? +s.lat.toFixed(6) : "",
      Number.isFinite(s.lon) ? +s.lon.toFixed(6) : "",
      bidVal != null ? +bidVal.toFixed(2) : "",
      Number.isFinite(s.ots) ? Math.round(s.ots) : "",
      s.resolution ?? "",
      aspectRatio,
      s.side    ?? "",
      s.image_url ?? ""
    ].forEach((c, ci) => {
      const cell = val(ws3, rowIdx, ci + 1, c, { fill, border: true });
      if (ci === 13 && c) {  // Фото — гиперссылка
        cell.value = { text: "Фото", hyperlink: String(c) };
        cell.font  = { color: { argb: "2563EB" }, underline: true, size: 10 };
      }
    });

    // No-bid: red text + note
    if (noBid) {
      const bidCell = ws3.getCell(rowIdx, 8);
      bidCell.value = "нет эфира";
      bidCell.font  = { color: { argb: RED_TEXT }, bold: true, size: 10 };
      try {
        bidCell.note = "Нет эфира в настоящий момент — ставка отсутствует";
      } catch {}
    }

    ws3.getRow(rowIdx).height = 16;
  });


  // Сохранение
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `mediaplan_${(brief.geo?.regions || brief.selectedRegions || []).join("-") || "plan"}_${dateStr(brief.dates?.start)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== File import helpers =====

/**
 * Auto-detects columns in parsed rows (objects with headers) and returns
 * a list of strings suitable for bulkAddAddresses().
 * Supports:
 *  - Dedicated address column: "Адрес", "address", "адрес"
 *  - Dedicated city column: "Город", "city"
 *  - Lat/Lon columns → converted to "@lat,lon" (skip geocoding)
 * Falls back to first text column if nothing detected.
 */
function _extractAddrLines(rows) {
  if (!rows || !rows.length) return [];
  const keys = Object.keys(rows[0]);

  // Normalised header matching
  const findKey = (...patterns) =>
    keys.find(k => patterns.some(p => k.trim().toLowerCase() === p.toLowerCase())) || null;

  const addrKey = findKey("адрес", "address", "Адрес", "Address");
  const cityKey = findKey("город", "city", "Город", "City");
  const latKey  = findKey("lat", "latitude", "широта", "Широта");
  const lonKey  = findKey("lon", "lng", "longitude", "долгота", "Долгота");

  const lines = [];
  for (const row of rows) {
    // If we have lat + lon columns → coordinate point (no geocoding needed)
    if (latKey && lonKey) {
      const lat = Number(String(row[latKey] || "").replace(",", "."));
      const lon = Number(String(row[lonKey] || "").replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        // Prepend address hint if available (shown in UI input)
        const hint = addrKey ? String(row[addrKey] || "").trim() : "";
        lines.push(hint ? `@${lat},${lon} (${hint})` : `@${lat},${lon}`);
        continue;
      }
    }
    // Address column
    if (addrKey) {
      const v = String(row[addrKey] || "").trim();
      if (v) { lines.push(v); continue; }
    }
    // City column
    if (cityKey) {
      const v = String(row[cityKey] || "").trim();
      if (v) { lines.push(v); continue; }
    }
    // Fallback: first non-empty string value
    const first = Object.values(row).map(v => String(v || "").trim()).find(v => v);
    if (first) lines.push(first);
  }
  return lines.filter(Boolean);
}

/**
 * Auto-detects city/region names from parsed rows and matches them
 * against state.regionsAll. Returns { matched: string[], unmatched: string[] }.
 */
function _extractAndMatchCities(rows) {
  if (!rows || !rows.length) return { matched: [], unmatched: [] };
  const keys = Object.keys(rows[0]);

  const findKey = (...patterns) =>
    keys.find(k => patterns.some(p => k.trim().toLowerCase() === p.toLowerCase())) || null;

  const cityKey   = findKey("город", "city", "Город", "City", "регион", "region");
  const addrKey   = findKey("адрес", "address", "Адрес", "Address");

  const regionsAll = Array.isArray(state?.regionsAll) ? state.regionsAll : [];
  const dspCities  = Array.isArray(state?.dspCities)  ? state.dspCities  : [];
  const allKnown   = [...new Set([...regionsAll, ...dspCities])];
  const allKnownLC = allKnown.map(r => r.toLowerCase());

  const rawCities = [];
  for (const row of rows) {
    let val = "";
    if (cityKey) {
      val = String(row[cityKey] || "").trim();
    } else if (addrKey) {
      // Extract first comma-segment as city
      val = String(row[addrKey] || "").split(",")[0].trim();
    } else {
      val = String(Object.values(row)[0] || "").split(",")[0].trim();
    }
    if (val) rawCities.push(val);
  }

  // Deduplicate raw city names
  const uniqueRaw = [...new Set(rawCities)];
  const matched = [], unmatched = [];
  for (const raw of uniqueRaw) {
    const rawLC = raw.toLowerCase();
    // Exact match first
    const exactIdx = allKnownLC.indexOf(rawLC);
    if (exactIdx !== -1) { matched.push(allKnown[exactIdx]); continue; }
    // Partial: known region starts with raw or raw starts with known region
    const partial = allKnown.find((r, i) =>
      allKnownLC[i].startsWith(rawLC) || rawLC.startsWith(allKnownLC[i])
    );
    if (partial) { matched.push(partial); continue; }
    unmatched.push(raw);
  }
  return { matched: [...new Set(matched)], unmatched };
}

// ===== Yandex Geocoding + Suggest =====
// Ключ задаётся в HTML-блоке Tilda: <script>window.YANDEX_MAPS_KEY = "ваш_ключ";</script>

async function geocodeAddressYandex(query, regionHint) {
  const key = window.YANDEX_MAPS_KEY || "";
  const q0 = String(query || "").trim();
  if (!q0) return null;

  // Геокодер Яндекса лучше работает с городом в начале запроса
  const q = regionHint ? `${String(regionHint).trim()}, ${q0}` : q0;

  const url =
    `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(key)}` +
    `&geocode=${encodeURIComponent(q)}&format=json&results=1&lang=ru_RU`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yandex Geocoder HTTP ${res.status}`);

  const json = await res.json();
  const members = json?.response?.GeoObjectCollection?.featureMember;
  if (!Array.isArray(members) || !members.length) return null;

  const pos = members[0]?.GeoObject?.Point?.pos; // "lon lat" — внимание: lon первый!
  if (!pos) return null;

  const [lonStr, latStr] = String(pos).split(" ");
  const lon = Number(lonStr), lat = Number(latStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

/**
 * Геокодинг через Nominatim (OpenStreetMap) — бесплатно, без ключа.
 * Если не находит — пробует Yandex (если задан YANDEX_MAPS_KEY).
 */
async function geocodeAddressNominatim(query, regionHint) {
  const q0 = String(query || "").trim();
  if (!q0) return null;

  // Direct coordinates: "@lat,lon" or "@lat,lon (hint)" format (from coordinate import)
  if (q0.startsWith("@")) {
    const m = q0.match(/^@(-?[\d.]+),(-?[\d.]+)/);
    if (m) {
      const lat = Number(m[1]), lon = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  // Yandex — primary if key available (better quality for Russian addresses)
  if (window.YANDEX_MAPS_KEY) {
    try {
      const pt = await geocodeAddressYandex(query, regionHint);
      if (pt) return pt;
    } catch(e) {
      console.warn("[geo] Yandex failed, falling back to Nominatim:", e.message);
    }
  }

  // Fallback: Nominatim (OpenStreetMap)
  const q = regionHint ? `${String(regionHint).trim()}, ${q0}` : q0;
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "ru", "User-Agent": "DSP-Planner/1.0" }
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const json = await res.json();
    if (Array.isArray(json) && json.length) {
      const lat = Number(json[0].lat);
      const lon = Number(json[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  } catch (e) {
    console.warn("[geo] Nominatim failed:", e.message);
  }

  return null;
}

// Suggest: возвращает [{title, subtitle}] для выпадающего списка
async function suggestYandex(text) {
  const key = window.YANDEX_MAPS_KEY || "";
  if (!key || !String(text || "").trim()) return [];
  try {
    const url =
      `https://suggest-maps.yandex.ru/suggest-geo?v=9&lang=ru_RU&search_type=all` +
      `&results=7&highlight=0&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.results || []).map(r => ({
      title:    r.title?.text    || "",
      subtitle: r.subtitle?.text || "",
    }));
  } catch {
    return [];
  }
}

// Привязывает suggest-дропдаун к инпуту
function attachAddressSuggest(inputEl) {
  if (!inputEl || inputEl._suggestAttached) return;
  inputEl._suggestAttached = true;

  let timer = null;
  let dropdown = null;

  function closeDropdown() {
    dropdown?.remove();
    dropdown = null;
  }

  function openDropdown(items) {
    closeDropdown();
    if (!items.length) return;

    dropdown = document.createElement("div");
    dropdown.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid #ddd;" +
      "border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);width:100%;max-height:220px;" +
      "overflow-y:auto;margin-top:2px;";

    items.forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = "padding:8px 12px;cursor:pointer;font-size:13px;line-height:1.4;";
      row.innerHTML =
        `<div style="font-weight:500;">${escapeHtml(item.title)}</div>` +
        (item.subtitle ? `<div style="color:#888;font-size:11px;">${escapeHtml(item.subtitle)}</div>` : "");
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        inputEl.value = item.title + (item.subtitle ? `, ${item.subtitle}` : "");
        closeDropdown();
      });
      dropdown.appendChild(row);
    });

    // позиционируем относительно враппера
    const wrap = inputEl.parentElement;
    if (wrap && getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    inputEl.insertAdjacentElement("afterend", dropdown);
  }

  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const val = inputEl.value.trim();
    if (!val) { closeDropdown(); return; }
    timer = setTimeout(async () => {
      const items = await suggestYandex(val);
      openDropdown(items);
    }, 300);
  });

  inputEl.addEventListener("blur", () => setTimeout(closeDropdown, 150));
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDropdown(); });
}

function pickScreensNearPoint(screens, center, radiusMeters) {
  const r = Number(radiusMeters || 0);
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon) || !r) return [];

  const dist = window.GeoUtils?.haversineMeters;
  if (!dist) throw new Error("GeoUtils.haversineMeters is missing (need geo.js)");

  return (screens || []).filter(s => {
    const slat = Number(s.lat), slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
    return dist(slat, slon, center.lat, center.lon) <= r;
  });
}

// ===== Overpass =====
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function _fetchOverpass(url, body, timeoutMs = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: "data=" + encodeURIComponent(body),
      signal: ac.signal
    });
  } finally {
    clearTimeout(t);
  }
}

async function _runOverpassWithFailover(body, timeoutMs = 45000) {
  let lastErr = null;
  let attempt = 0;

  for (const url of OVERPASS_URLS) {
    attempt++;
    try {
      const res = await _fetchOverpass(url, body, timeoutMs);
      const txt = await res.text();

      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url} :: ${txt.slice(0, 180)}`);

      let json;
      try { json = JSON.parse(txt); }
      catch { throw new Error(`Overpass non-JSON @ ${url} :: ${txt.slice(0, 180)}`); }

      return json;
    } catch (e) {
      lastErr = e;
      console.warn("[poi] overpass fail:", String(e));
      await _sleep(350 * attempt + Math.floor(Math.random() * 500));
    }
  }

  throw lastErr || new Error("Overpass failed (all endpoints)");
}

function _escapeOverpassString(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function _normalizePOIs(json) {
  const els = Array.isArray(json?.elements) ? json.elements : [];
  return els.map(el => {
    const name = el.tags?.name || "";
    const lat0 = Number(el.lat ?? el.center?.lat);
    const lon0 = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) return null;
    return { id: `${el.type}/${el.id}`, name, lat: lat0, lon: lon0, raw: el };
  }).filter(Boolean);
}

function pickScreensNearPOIs(screens, pois, radiusMeters) {
  const r = Number(radiusMeters || 0);
  if (!r || !Array.isArray(pois) || !pois.length) return [];

  const dist = window.GeoUtils?.haversineMeters;
  if (!dist) throw new Error("GeoUtils.haversineMeters is missing");

  const picked = [];
  for (const s of (screens || [])) {
    const slat = Number(s.lat), slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) continue;

    let ok = false;
    for (const p of pois) {
      if (dist(slat, slon, p.lat, p.lon) <= r) { ok = true; break; }
    }
    if (ok) picked.push(s);
  }
  return picked;
}

function _poiQueryWithScope(poiType, scopeExpr) {
  const raw = POI_QUERIES[poiType];
  if (!raw) throw new Error("Unknown poi_type: " + poiType);
  return String(raw).replace(/nwr\s*\(\s*area\.a\s*\)/g, `nwr(${scopeExpr})`);
}

function _bboxFromScreens(screens) {
  const pts = (screens || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (!pts.length) return null;

  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const padLat = 0.05;
  const padLon = 0.08;

  return {
    minLat: minLat - padLat,
    minLon: minLon - padLon,
    maxLat: maxLat + padLat,
    maxLon: maxLon + padLon
  };
}

function _centerFromBbox(bb) {
  if (!bb) return null;
  return { lat: (bb.minLat + bb.maxLat) / 2, lon: (bb.minLon + bb.maxLon) / 2 };
}

function _estimateRadiusFromBbox(bb) {
  if (!bb) return 25000;
  const latSpan = Math.abs(bb.maxLat - bb.minLat);
  const lonSpan = Math.abs(bb.maxLon - bb.minLon);
  const latKm = latSpan * 111;
  const midLat = (bb.minLat + bb.maxLat) / 2;
  const lonKm = lonSpan * 111 * Math.cos((midLat * Math.PI) / 180);
  const diagKm = Math.sqrt(latKm * latKm + lonKm * lonKm);
  const r = Math.max(8000, Math.min(120000, (diagKm * 0.6) * 1000));
  return Math.round(r);
}

async function fetchPOIsOverpassInRegion(poiType, regionName, screensInRegion, limit = 50) {
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const region = _escapeOverpassString(regionName);
  if (!region) throw new Error("Region is empty");

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 50)));

  try {
    const bodyArea = `
      [out:json][timeout:40];
      (
        area["boundary"="administrative"]["name"="${region}"]["admin_level"~"4|6"];
        area["boundary"="administrative"]["name:ru"="${region}"]["admin_level"~"4|6"];
        area["boundary"="administrative"]["name"="${region}"];
        area["boundary"="administrative"]["name:ru"="${region}"];
      )->.cand;
      .cand->.a;
      (
        ${POI_QUERIES[t]}
      );
      out center ${safeLimit};
    `;
    const json = await _runOverpassWithFailover(bodyArea, 55000);
    const pois = _normalizePOIs(json).slice(0, safeLimit);
    if (pois.length) return pois;
  } catch (e) {
    console.warn("[poi] area attempt failed:", String(e));
  }

  const bb = _bboxFromScreens(screensInRegion || []);
  if (bb) {
    try {
      const scope = `${bb.minLat},${bb.minLon},${bb.maxLat},${bb.maxLon}`;
      const q = _poiQueryWithScope(t, scope);

      const bodyBbox = `
        [out:json][timeout:40];
        (
          ${q}
        );
        out center ${safeLimit};
      `;
      const json2 = await _runOverpassWithFailover(bodyBbox, 55000);
      const pois2 = _normalizePOIs(json2).slice(0, safeLimit);
      if (pois2.length) return pois2;
    } catch (e) {
      console.warn("[poi] bbox attempt failed:", String(e));
    }
  }

  const c = _centerFromBbox(bb);
  if (c) {
    try {
      const r = _estimateRadiusFromBbox(bb);
      const scope = `around:${r},${c.lat},${c.lon}`;
      const q = _poiQueryWithScope(t, scope);

      const bodyAround = `
        [out:json][timeout:40];
        (
          ${q}
        );
        out center ${safeLimit};
      `;
      const json3 = await _runOverpassWithFailover(bodyAround, 55000);
      const pois3 = _normalizePOIs(json3).slice(0, safeLimit);
      if (pois3.length) return pois3;
    } catch (e) {
      console.warn("[poi] around attempt failed:", String(e));
    }
  }

  throw new Error(`POI не найдены: «${POI_LABELS?.[t] || t}» в регионе «${regionName}». Попробуй другой тип или поменяй регион.`);
}

// ===== MULTI-REGION BUDGET ALLOCATION =====
function _tierWeight(t) {
  switch (String(t || "").toUpperCase()) {
    case "M": return 6;
    case "SP": return 5;
    case "A": return 4;
    case "B": return 3;
    case "C": return 2;
    case "D": return 1;
    default: return 2;
  }
}

function allocateBudgetAcrossRegions(totalBudget, regions, opts) {
  const cfg = Object.assign({ minShare: 0.10, maxShare: 0.70 }, (opts || {}));
  const n = (regions || []).length;
  if (!Number.isFinite(totalBudget) || totalBudget <= 0 || n === 0) return [];
  if (n === 1) return [{ region: regions[0].key, budget: Math.floor(totalBudget) }];

  let minShare = cfg.minShare;
  if (n >= 5) minShare = Math.min(minShare, 0.05);
  if (n * minShare > 1) minShare = 1 / n;
  const maxShare = Math.max(minShare, cfg.maxShare);

  const items = regions.map(r => {
    const w = _tierWeight(r.tier);
    return { region: r.key, tier: r.tier, w, share: 0, locked: false };
  });

  const sumW = items.reduce((a, b) => a + (Number.isFinite(b.w) ? b.w : 0), 0) || 1;
  items.forEach(it => it.share = it.w / sumW);

  let lockedSum = 0;
  let freeW = 0;
  items.forEach(it => {
    if (it.share > maxShare) {
      it.share = maxShare;
      it.locked = true;
      lockedSum += it.share;
    } else {
      freeW += it.w;
    }
  });

  let remaining = 1 - lockedSum;
  if (remaining < 0) remaining = 0;

  if (freeW > 0) {
    items.forEach(it => {
      if (!it.locked) it.share = remaining * (it.w / freeW);
    });
  }

  let need = 0;
  items.forEach(it => {
    if (it.share < minShare) {
      need += (minShare - it.share);
      it.share = minShare;
      it.locked = true;
    }
  });

  if (need > 0) {
    const donors = items.filter(it => !it.locked && it.share > minShare);
    const donorSum = donors.reduce((a, b) => a + (b.share - minShare), 0);

    if (donorSum > 0) {
      donors.forEach(d => {
        const giveCap = d.share - minShare;
        const give = need * (giveCap / donorSum);
        d.share -= give;
      });
    } else {
      const equal = 1 / n;
      items.forEach(it => it.share = equal);
    }
  }

  const raw = items.map(it => ({
    region: it.region,
    share: it.share,
    budget: Math.floor(totalBudget * it.share)
  }));

  let sum = raw.reduce((a, b) => a + b.budget, 0);
  let diff = Math.floor(totalBudget) - sum;

  if (diff !== 0) {
    const order = raw
      .map((r, idx) => ({ idx, share: r.share }))
      .sort((a, b) => b.share - a.share)
      .map(x => x.idx);

    let k = 0;
    while (diff !== 0 && k < 1000000) {
      const i = order[k % order.length];
      if (diff > 0) { raw[i].budget += 1; diff -= 1; }
      else {
        if (raw[i].budget > 0) { raw[i].budget -= 1; diff += 1; }
      }
      k++;
    }
  }

  return raw.map(r => ({ region: r.region, budget: r.budget }));
}

// --- Tier weights (for OTS allocation) ---
function tierWeight(tier) {
  const t = String(tier ?? "").toUpperCase().trim();
  if (t === "A" || t === "1") return 1.00;
  if (t === "B" || t === "2") return 0.80;
  if (t === "C" || t === "3") return 0.60;
  return 0.70;
}

function allocateTargetOtsAcrossRegions(totalOts, regions, opts = {}) {
  if (!regions || !regions.length) return [];
  const minShare = opts.minShare ?? 0.10;
  const maxShare = opts.maxShare ?? 0.70;

  const items = regions.map(r => ({
    region: r.key,
    tier: r.tier,
    w: tierWeight(r.tier),
    share: 0
  }));

  const sumW = items.reduce((a, b) => a + b.w, 0) || 1;
  items.forEach(i => i.share = i.w / sumW);

  items.forEach(i => {
    if (i.share < minShare) i.share = minShare;
    if (i.share > maxShare) i.share = maxShare;
  });

  const sumShares = items.reduce((a, b) => a + b.share, 0) || 1;
  items.forEach(i => i.share /= sumShares);

  let out = items.map(i => ({
    region: i.region,
    ots: Math.floor(Number(totalOts) * i.share)
  }));

  let diff = Math.floor(Number(totalOts)) - out.reduce((a, b) => a + b.ots, 0);
  let k = 0;
  while (diff !== 0 && k < 100000) {
    const idx = k % out.length;
    out[idx].ots += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    k++;
  }
  return out;
}

function computeGoalOtsPlan(prepared, totalOtsGoal, opts = {}) {
  const minShare = opts.minShare ?? 0.10;
  const maxShare = opts.maxShare ?? 0.70;

  const regions = prepared.map(r => ({ key: r.region, tier: r.tier }));
  const baseAlloc = allocateTargetOtsAcrossRegions(totalOtsGoal, regions, { minShare, maxShare });

  const plan = {};
  for (const r of prepared) {
    const goal = baseAlloc.find(x => x.region === r.region)?.ots || 0;

    plan[r.region] = {
      goalOts: goal,
      avgOts: (r.avgOts == null || !Number.isFinite(r.avgOts) || r.avgOts <= 0) ? null : Number(r.avgOts),
      capOtsAbs: (r.capOtsAbs == null || !Number.isFinite(r.capOtsAbs) || r.capOtsAbs <= 0) ? 0 : Number(r.capOtsAbs),
      bidPlus20: Number(r.bidPlus20),
      capPlaysAbs: Number(r.capPlaysAbs),
      capBudgetAbs: Number(r.capBudgetAbs),
      playsPlanned: 0,
      budgetPlanned: 0,
      otsPlanned: 0
    };
  }

  function applyGoal(regionKey, addOts) {
    const p = plan[regionKey];
    if (!p) return 0;
    if (!p.avgOts) return addOts;

    const newGoal = p.goalOts + addOts;
    const maxOtsHere = Math.max(0, p.capOtsAbs);
    const targetOtsHere = Math.min(newGoal, maxOtsHere);

    const playsNeed = Math.min(
      p.capPlaysAbs,
      Math.ceil(targetOtsHere / p.avgOts)
    );

    const otsHere = playsNeed * p.avgOts;
    const budgetHere = Math.ceil(playsNeed * p.bidPlus20);

    p.goalOts = targetOtsHere;
    p.playsPlanned = playsNeed;
    p.otsPlanned = otsHere;
    p.budgetPlanned = Math.min(budgetHere, p.capBudgetAbs);

    const unmet = Math.max(0, newGoal - targetOtsHere);
    return unmet;
  }

  let unmetTotal = 0;
  for (const r of prepared) {
    const unmet = applyGoal(r.region, 0);
    unmetTotal += unmet;
  }

  let guard = 0;
  while (unmetTotal > 0 && guard < 10000) {
    guard++;

    const receivers = prepared
      .map(r => r.region)
      .filter(key => {
        const p = plan[key];
        if (!p || !p.avgOts) return false;
        return p.goalOts < p.capOtsAbs;
      });

    if (!receivers.length) break;

    const headroomSum = receivers.reduce((a, key) => {
      const p = plan[key];
      return a + Math.max(0, p.capOtsAbs - p.goalOts);
    }, 0);

    if (headroomSum <= 0) break;

    let distributed = 0;
    for (const key of receivers) {
      const p = plan[key];
      const hr = Math.max(0, p.capOtsAbs - p.goalOts);
      if (hr <= 0) continue;

      const add = Math.min(
        unmetTotal,
        Math.max(1, Math.floor(unmetTotal * (hr / headroomSum)))
      );

      const before = unmetTotal;
      const unmetAfterApply = applyGoal(key, add);
      const actuallyTaken = add - unmetAfterApply;

      unmetTotal = before - actuallyTaken;
      distributed += actuallyTaken;

      if (unmetTotal <= 0) break;
    }

    if (distributed <= 0) break;
  }

  const finalUnmet = Math.max(0, unmetTotal);
  return { plan, finalUnmet };
}

// ===== MAIN =====
async function onCalcClick() {
  // DSP mode: подгружаем инвентарь для выбранных регионов перед расчётом
  if (window.DSP_AUTH_ENABLED && state.dspCities) {
    const brief0 = buildBrief();
    const regions0 = Array.isArray(brief0?.geo?.regions) ? brief0.geo.regions : [];
    if (regions0.length) {
      await dspEnsureInventoryForRegions(regions0);
    }
  }

  const brief = buildBrief();
  const pphTarget = targetPlaysPerHourPerScreen(brief.reachMode);

  if (!brief.dates.start || !brief.dates.end) {
    alert("Выберите даты начала и окончания.");
    return;
  }

  const regions = Array.isArray(brief?.geo?.regions) && brief.geo.regions.length
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : (brief?.geo?.region ? [String(brief.geo.region).trim()] : []);

  if (!regions.length) {
    alert("Выберите регион(ы).");
    return;
  }

  // ✅ formats variables (fixes ReferenceError formatsMode is not defined)
  const formatsMode = brief?.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];
  const selectedFormatsText =
    (formatsMode === "auto")
      ? "Рекомендация"
      : (manualFormats.length ? manualFormats.join(", ") : "—");

  // ✅ budget validation: fixed / recommendation / goal_ots
  if (brief.budget.mode === "fixed") {
    if (!brief.budget.amount || brief.budget.amount <= 0) {
      alert("Введите бюджет или выберите «нужна рекомендация» / «цель по OTS».");
      return;
    }
  }

  if (brief.budget.mode === "goal_ots") {
    if (!brief.goal?.ots || brief.goal.ots <= 0) {
      alert("Введите целевой OTS.");
      return;
    }
  }

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  if (!Number.isFinite(days) || days <= 0) {
    alert("Выберите корректные даты начала и окончания.");
    return;
  }

  // ✅ schedule hours/day
  let hpdFixed = hoursPerDay(brief.schedule);

  if (brief.schedule?.type === "weekly") {
    const meta = computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end);
    hpdFixed = meta.avgHpd;

    if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
      alert("В weekly-графике не задано время вещания (0 часов).");
      return;
    }
  }

  if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
    alert("Проверь расписание.");
    return;
  }

  const hpd = (brief.budget.mode !== "fixed") ? RECO_HOURS_PER_DAY : hpdFixed;

  // aggregates
  let chosenAll = [];
  let totalBudgetFinal = 0;
  let totalPlaysEffectiveAll = 0;

  let otsTotalAll = 0;
  let hasOts = true;

  let warnings = [];
  let anyPOIs = [];
  let perRegionRows = [];

  // Трекинг ненайденных GID (для кнопки «скачать не найденные»)
  const _isManualMode = brief.selection?.mode === "manual_screens";
  const _manualGidSet = _isManualMode ? (brief.selection.manual_gids || new Set()) : new Set();
  const _foundGids    = new Set(); // GID-ы, которые реально попали в расчёт

  const isPOI = (brief.selection?.mode === "poi");
  const isNearAddress = (brief.selection?.mode === "near_address");

  if (isPOI && !window.GeoUtils?.haversineMeters) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  // ===== Pre-geocode addresses (once, before region loop) =====
  let _geocodedPoints = null;
  if (isNearAddress) {
    const addresses = (brief.selection.addresses && brief.selection.addresses.length)
      ? brief.selection.addresses
      : (brief.selection.address ? [brief.selection.address] : []);

    if (!addresses.length) {
      alert("Введите хотя бы один адрес.");
      setStatus(""); return;
    }

    _geocodedPoints = [];
    const GEOCODE_DELAY_MS = 350; // Nominatim rate limit: 1 req/sec
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      setStatus(`Геокодирую ${i + 1}/${addresses.length}: «${addr}»…`);
      try {
        const pt = await geocodeAddressNominatim(addr);
        if (pt) _geocodedPoints.push(pt);
        else console.warn("[geo] not found:", addr);
      } catch (e) {
        console.error("[geo] geocode error:", e);
      }
      // Rate-limit delay for Nominatim (skip if coord or Yandex key set)
      if (!addr.startsWith("@") && !window.YANDEX_MAPS_KEY && i < addresses.length - 1) {
        await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));
      }
    }

    if (!_geocodedPoints.length) {
      alert("Ни один адрес не найден. Попробуй уточнить (город, улица, дом).");
      setStatus(""); return;
    }
    setStatus(`Геокодировано: ${_geocodedPoints.length} из ${addresses.length} адресов`);
    // Сохраняем для возможной выгрузки (как POI)
    window.PLANNER.lastGeocodedPoints = _geocodedPoints.map((pt, i) => ({
      lat: pt.lat, lon: pt.lon,
      name: addresses[i] || `Адрес ${i + 1}`,
      id: `addr_${i}`
    }));
    window.dispatchEvent(new CustomEvent("planner:geocoded-ready", {
      detail: { count: _geocodedPoints.length }
    }));
  }

  // =========================
  // 1) PREPARE POOLS PER REGION
  // =========================
  const prepared = [];
  const sourceScreens = (Array.isArray(state.screens) && state.screens.length)
    ? state.screens
    : (Array.isArray(state.screensAll) ? state.screensAll : []);

  for (const region of regions) {
    const tier = getTierForGeo(region);
    const selectedNorm = normalizeGeoName(region);
    let pool = sourceScreens.filter(s => {
      const r = String(s.region || "").trim();
      const c = String(s.city || "").trim();
      if (r === region || c === region) return true;
      if (!selectedNorm) return false;
      const rn = normalizeGeoName(r);
      const cn = normalizeGeoName(c);
      if (rn === selectedNorm || cn === selectedNorm) return true;
      // Fuzzy fallback for suffix/prefix variants in API city labels.
      return (
        (rn && (rn.includes(selectedNorm) || selectedNorm.includes(rn))) ||
        (cn && (cn.includes(selectedNorm) || selectedNorm.includes(cn)))
      );
    });

    if (!pool.length) {
      console.warn("[DSP] empty pool at region step", {
        selected: region,
        selectedNorm,
        screensTotal: sourceScreens.length,
        source: (Array.isArray(state.screens) && state.screens.length) ? "state.screens" : "state.screensAll",
        sampleRegions: [...new Set(sourceScreens.map(s => String(s.region || "").trim()).filter(Boolean))].slice(0, 10),
        sampleCities: [...new Set(sourceScreens.map(s => String(s.city || "").trim()).filter(Boolean))].slice(0, 10)
      });
    }

    // ✅ uses formatsMode/manualFormats derived above
    if (formatsMode === "manual" && manualFormats.length > 0) {
      const fset = new Set(manualFormats);
      pool = pool.filter(s => fset.has(s.format));
    }

    if (window.PLANNER?.getScreensFilteredByOwner) {
      pool = window.PLANNER.getScreensFilteredByOwner(pool);
    }

    // Фильтр по нарисованному полигону
    const poly = state.polygonFilter;
    if (poly && poly.length >= 3) {
      pool = pool.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && pointInPolygon(s.lat, s.lon, poly));
    }

    if (pool.length === 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов" });
      continue;
    }

    // POI mode
    let pois = [];
    if (isPOI) {
      const poiType = String(brief.selection.poi_type || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 500);

      setStatus(`Ищу POI в регионе «${region}»: ${POI_LABELS?.[poiType] || poiType}…`);

      try {
        pois = await fetchPOIsOverpassInRegion(poiType, region, pool, 50);
      } catch (e) {
        console.error("[poi] error:", e);
        alert(e?.message || `Ошибка Overpass (OSM) для региона «${region}».`);
        setStatus("");
        return;
      }

      anyPOIs = anyPOIs.concat(pois);
      window.PLANNER.lastPOIs = anyPOIs;

      try { renderPOIList(anyPOIs); } catch { }

      const before = pool.length;
      pool = pickScreensNearPOIs(pool, pois, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у POI" });
        continue;
      }

      setStatus(`Экраны у POI: ${pool.length} из ${before} (регион: ${region}, POI: ${pois.length})`);
    }

    // Near address mode — поддержка нескольких адресов
    if (isNearAddress) {
      const screenRadius = Number(brief.selection.radius_m || 500);

      if (!window.GeoUtils?.haversineMeters) {
        alert("GeoUtils не найден. Проверь подключение geo.js");
        setStatus(""); return;
      }

      // Use pre-geocoded points (computed once before the region loop)
      const points = _geocodedPoints || [];

      if (!points.length) {
        alert("Ни один адрес не найден. Попробуй уточнить (город, улица, дом).");
        setStatus(""); return;
      }

      // Берём экраны в радиусе от ЛЮБОГО из найденных точек
      const before = pool.length;
      const screenSet = new Set();
      for (const pt of points) {
        for (const s of pickScreensNearPoint(pool, pt, screenRadius)) {
          screenSet.add(s);
        }
      }
      pool = [...screenSet];

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у адресов" });
        continue;
      }

      setStatus(`Экраны у ${points.length} адресов: ${pool.length} из ${before} (радиус: ${screenRadius} м)`);
    }

    // ROUTE mode
    if (brief.selection?.mode === "route") {
      const fromTxt = String(brief.selection.route_from || "").trim();
      const toTxt = String(brief.selection.route_to || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 300);

      if (!fromTxt || !toTxt) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "не задан маршрут" });
        continue;
      }

      setStatus(`Маршрут для региона «${region}»: ${fromTxt} → ${toTxt}…`);

      let A = null, B = null, routeLine = null;
      try {
        A = await geocodeAddressNominatim(fromTxt, region);
        B = await geocodeAddressNominatim(toTxt, region);
      } catch (e) {
        console.error("[route] geocode error:", e);
      }

      if (!A || !B || !Number.isFinite(A.lat) || !Number.isFinite(A.lon) || !Number.isFinite(B.lat) || !Number.isFinite(B.lon)) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "точки маршрута не найдены" });
        warnings.push(`⚠️ Регион «${region}»: не удалось геокодировать маршрут (${fromTxt} → ${toTxt}).`);
        continue;
      }

      try {
        routeLine = await fetchRouteOSRM(A, B);
      } catch (e) {
        console.error("[route] osrm error:", e);
      }

      if (!Array.isArray(routeLine) || routeLine.length < 2) {
        routeLine = [[A.lon, A.lat], [B.lon, B.lat]];
        warnings.push(`⚠️ Регион «${region}»: OSRM недоступен, использую прямую линию A–B.`);
      }

      const before = pool.length;
      pool = pickScreensNearPolyline(pool, routeLine, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у маршрута" });
        continue;
      }

      setStatus(`Экраны у маршрута: ${pool.length} из ${before} (радиус: ${screenRadius}м)`);
    }

    // HIGHWAY mode
    if (brief.selection?.mode === "highway") {
      const hwName = String(brief.selection.highway_name || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 500);

      if (!hwName) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "не задана магистраль" });
        continue;
      }

      setStatus(`Ищу дорогу «${hwName}» для региона «${region}»…`);

      let hwLine = null;
      try {
        hwLine = await fetchHighwayGeometry(hwName, region);
      } catch (e) {
        console.error("[highway] error:", e);
      }

      if (!Array.isArray(hwLine) || hwLine.length < 2) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "дорога не найдена" });
        warnings.push(`⚠️ Регион «${region}»: не удалось найти дорогу «${hwName}» через OpenStreetMap.`);
        continue;
      }

      const before = pool.length;
      pool = pickScreensNearPolyline(pool, hwLine, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у магистрали" });
        continue;
      }

      setStatus(`Экраны у «${hwName}»: ${pool.length} из ${before} (радиус: ${screenRadius}м)`);
    }

    // Manual GID filter — используем только указанные экраны
    if (brief.selection?.mode === "manual_screens") {
      const gidSet = brief.selection.manual_gids;
      if (gidSet && gidSet.size > 0) {
        const before = pool.length;
        pool = pool.filter(s => {
          const sid = _screenIdOf(s);
          if (gidSet.has(sid)) { _foundGids.add(sid); return true; }
          return false;
        });
        if (!pool.length) {
          perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null,
            note: `ни один из ${gidSet.size} GID-ов не найден в регионе` });
          continue;
        }
        setStatus(`GID-фильтр: ${pool.length} из ${before} в регионе «${region}»`);
      }
    }

    // VK Affinity filter — top-X% by avg affinity score across selected segments
    if (brief.audience?.enabled && brief.audience.segments?.length > 0) {
      if (state.affinityMap?.size > 0) {
        const segs = brief.audience.segments;
        const topPct = brief.audience.topPct ?? 0.10;
        const before = pool.length;
        // Score each screen in pool
        const withScore = pool.map(s => {
          const aff = state.affinityMap.get(_screenIdOf(s));
          const score = aff ? segs.reduce((sum, seg) => sum + (aff[seg] ?? 0), 0) / segs.length : 0;
          return { s, score };
        });
        withScore.sort((a, b) => b.score - a.score);
        const keepN = Math.max(1, Math.ceil(before * topPct));
        pool = withScore.slice(0, keepN).map(x => x.s);
        setStatus(`Аудитория: топ ${Math.round(topPct * 100)}% → ${pool.length} из ${before}`);
        if (!pool.length) {
          perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null,
            note: `аффинити-фильтр: нет экранов в топ ${Math.round(topPct * 100)}% по [${segs.join(", ")}]` });
          continue;
        }
      }
    }

    // In constructions mode keep all screens — avgBid computed from those that have minBid.
    // In regular mode exclude no-bid screens if any bid screens exist (prevents pool inflation).
    if (!(brief.constructions?.enabled && brief.constructions.count > 0)) {
      const hasBidScreens = pool.some(s => Number.isFinite(s.minBid) && s.minBid > 0);
      if (hasBidScreens) {
        pool = pool.filter(s => Number.isFinite(s.minBid) && s.minBid > 0);
      }
    }

    // GRP filter
    let grpDroppedNoValue = 0;
    if (brief.grp?.enabled) {
      grpDroppedNoValue = pool.filter(s => !Number.isFinite(s.grp)).length;

      pool = pool.filter(s =>
        Number.isFinite(s.grp) &&
        s.grp >= brief.grp.min &&
        s.grp <= brief.grp.max
      );

      if (pool.length === 0) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "GRP выкинул всё" });
        warnings.push(`⚠️ Регион «${region}»: GRP-фильтр исключил все экраны (без GRP было: ${grpDroppedNoValue}).`);
        continue;
      }

      warnings.push(`⚠️ Регион «${region}»: GRP-фильтр включён, без GRP исключены (без GRP: ${grpDroppedNoValue}).`);
    }

    const avgBid = avgNumber(pool.map(s => s.minBid));
    if (avgBid == null) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет minBid" });
      continue;
    }
    const bidPlus20 = avgBid * BID_MULTIPLIER;

    // ots = viewers per single play. Use avgNumberNonZero to exclude
    // screens with ots=0 (no data) so they don't pull the average down.
    const avgOts = avgNumberNonZero(pool.map(s => s.ots));

    const capPlaysAbs = Math.floor(SC_MAX * pool.length * days * hpd);
    const capBudgetAbs = Math.floor(capPlaysAbs * bidPlus20);
    const capBudgetAbsMin = Math.floor(capPlaysAbs * avgBid);
    const capOtsAbs = (avgOts == null) ? null : (capPlaysAbs * avgOts);

    prepared.push({
      region, tier, pool,
      avgBid, bidPlus20,
      avgOts,
      capPlaysAbs, capBudgetAbs, capBudgetAbsMin, capOtsAbs
    });
  }

  if (!prepared.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  // =========================
  // 2) INITIAL BUDGETS
  // =========================
  const budgets = {};
  let goalPlan = null;
  let goalPlanUnmet = 0;

  if (brief.budget.mode === "fixed") {
    if (brief.budget.perCity && Object.keys(brief.budget.perCity).length > 0) {
      // User specified per-city budgets — use directly
      for (const r of prepared) {
        budgets[r.region] = Number(brief.budget.perCity[r.region] || 0);
      }
    } else {
      const totalBudget = Number(brief.budget.amount);
      const fixedAllocation = allocateBudgetAcrossRegions(
        totalBudget,
        prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
        { minShare: 0.10, maxShare: 0.70 }
      );
      for (const r of prepared) {
        const found = fixedAllocation?.find(x => x.region === r.region);
        budgets[r.region] = found ? Number(found.budget) : 0;
      }
    }

  } else if (brief.budget.mode === "goal_ots") {
    const totalOtsGoal = Number(brief.goal?.ots || 0);
    if (!Number.isFinite(totalOtsGoal) || totalOtsGoal <= 0) {
      alert("Введите корректную цель OTS.");
      setStatus("");
      return;
    }

    const res = computeGoalOtsPlan(prepared, totalOtsGoal, { minShare: 0.10, maxShare: 0.70 });
    goalPlan = res.plan || null;
    goalPlanUnmet = Number(res.finalUnmet || 0);

    for (const r of prepared) {
      const p = goalPlan?.[r.region];
      budgets[r.region] = p ? Math.floor(p.budgetPlanned || 0) : 0;
    }

    if (goalPlanUnmet > 0) {
      warnings.push(
        `⚠️ Цель OTS недостижима полностью при выбранных фильтрах/датах/времени. Недостаёт примерно: ` +
        `${Math.round(goalPlanUnmet).toLocaleString("ru-RU")} OTS.`
      );
    }

  } else {
    // Recommendation mode
    if (brief.constructions?.enabled && brief.constructions.count > 0) {
      // Бюджет = N конструкций × pphTarget выходов/ч × реальных часов кампании × avg рекомендованная ставка
      // (вне зависимости от города — используем среднюю ставку по всем экранам пула)
      const N = brief.constructions.count;
      const allPoolScreens0 = prepared.flatMap(r => r.pool);
      // Используем уже загруженный recoBid (если DSP-режим) или minBid×BID_MULTIPLIER
      const recoBid = avgEffectiveBid(allPoolScreens0, brief.bidMode, 1);
      const totalBudget = Math.round(N * pphTarget * days * hpdFixed * recoBid);

      const alloc = allocateBudgetAcrossRegions(
        totalBudget,
        prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
        { minShare: 0.10, maxShare: 0.70 }
      );
      for (const r of prepared) {
        const found = alloc?.find(x => x.region === r.region);
        budgets[r.region] = found ? Number(found.budget) : 0;
      }
    } else {
      for (const r of prepared) {
        const BASE_MONTHLY_BY_TIER = { M: 2000000, SP: 1500000, A: 1000000, B: 500000, C: 300000, D: 100000 };
        const baseMonthly = BASE_MONTHLY_BY_TIER[r.tier] ?? BASE_MONTHLY_BY_TIER.C;
        const baseBudgetForPeriod = Math.floor(baseMonthly * (days / 30));

        const maxPlays = Math.floor(SC_MAX * RECO_HOURS_PER_DAY * r.pool.length * days);
        const maxBudget = maxPlays * r.bidPlus20;

        budgets[r.region] = Math.floor(Math.min(baseBudgetForPeriod, maxBudget));
      }
    }
  }

  // =========================
  // 3) REDISTRIBUTION BY CAPACITY (for fixed/reco)
  // =========================
  function redistributeByCapacity(preparedRegions, budgetsMap) {
    let leftover = 0;

    for (const r of preparedRegions) {
      const planned = Number(budgetsMap[r.region] || 0);
      if (!Number.isFinite(planned) || planned <= 0) {
        budgetsMap[r.region] = 0;
        continue;
      }
      const spendable = Math.min(planned, r.capBudgetAbs);
      budgetsMap[r.region] = spendable;
      leftover += (planned - spendable);
    }

    let guard = 0;
    while (leftover > 0 && guard < 50) {
      guard++;

      const headrooms = preparedRegions
        .map(r => {
          const cur = Number(budgetsMap[r.region] || 0);
          const head = Math.max(0, r.capBudgetAbs - cur);
          return { r, head };
        })
        .filter(x => x.head > 0);

      if (!headrooms.length) break;

      const sumHead = headrooms.reduce((a, b) => a + b.head, 0) || 1;

      let movedThisRound = 0;

      for (const h of headrooms) {
        if (leftover <= 0) break;

        const add = Math.min(h.head, Math.floor(leftover * (h.head / sumHead)));
        if (add > 0) {
          budgetsMap[h.r.region] = Number(budgetsMap[h.r.region] || 0) + add;
          leftover -= add;
          movedThisRound += add;
        }
      }

      if (leftover > 0 && movedThisRound === 0) {
        for (const h of headrooms) {
          if (leftover <= 0) break;
          const cur = Number(budgetsMap[h.r.region] || 0);
          const head = Math.max(0, h.r.capBudgetAbs - cur);
          if (head > 0) {
            budgetsMap[h.r.region] = cur + 1;
            leftover -= 1;
          }
        }
      }
    }

    return leftover;
  }

  let leftoverUnspent = 0;
  if (brief.budget.mode !== "goal_ots") {
    leftoverUnspent = redistributeByCapacity(prepared, budgets);
    if (leftoverUnspent > 0) {
      warnings.push(
        `⚠️ Общая ёмкость выбранных регионов ограничена: не удалось распределить ` +
        `${Math.floor(leftoverUnspent).toLocaleString("ru-RU")} ₽ (нет инвентаря).`
      );
    }
  }

  // =========================
  // 3.5) FETCH REAL RECO BIDS (DSP only)
  // =========================
  if (window.DSP_AUTH_ENABLED && getDspToken()) {
    try {
      setStatus("Загружаю прогноз ставок…");
      const allPoolScreens = prepared.flatMap(r => r.pool);
      await dspFetchForecastBids(allPoolScreens, brief);

      // Пересчитываем bidPlus20 по реальным recoBid для каждого региона
      for (const pr of prepared) {
        const recos = pr.pool.map(s => s.recoBid).filter(v => Number.isFinite(v) && v > 0);
        if (recos.length > 0) {
          pr.bidPlus20 = recos.reduce((a, b) => a + b, 0) / recos.length;
          pr.capBudgetAbs = Math.floor(pr.capPlaysAbs * pr.bidPlus20);
        }
      }

      // Если режим constructions — пересчитываем бюджет с реальными recoBid
      if (brief.constructions?.enabled && brief.constructions.count > 0) {
        const allRecos = prepared.flatMap(r => r.pool.map(s => s.recoBid))
          .filter(v => Number.isFinite(v) && v > 0);
        if (allRecos.length > 0) {
          const N = brief.constructions.count;
          const overallAvgReco = allRecos.reduce((a, b) => a + b, 0) / allRecos.length;
          const totalBudget = Math.round(N * pphTarget * days * hpdFixed * overallAvgReco);
          const alloc = allocateBudgetAcrossRegions(
            totalBudget,
            prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
            { minShare: 0.10, maxShare: 0.70 }
          );
          for (const r of prepared) {
            const found = alloc?.find(x => x.region === r.region);
            budgets[r.region] = found ? Number(found.budget) : 0;
          }
        }
      }
      setStatus("");
    } catch (e) {
      console.warn("[DSP] forecast-price fetch failed, using minBid×1.8 fallback", e);
      setStatus("");
    }
  }

  // =========================
  // 4) MAIN CALC PER REGION
  // =========================
  for (const pr of prepared) {
    const region = pr.region;
    const tier = pr.tier;
    const pool = pr.pool;
    const effectiveBid = brief.bidMode === "min" ? pr.avgBid : pr.bidPlus20;
    const effectiveCapBudget = brief.bidMode === "min" ? pr.capBudgetAbsMin : pr.capBudgetAbs;

    let budget = Number(budgets[region] || 0);

    if (!Number.isFinite(budget) || budget <= 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "budget=0" });
      continue;
    }

    budget = Math.min(budget, effectiveCapBudget);

    let totalPlaysTheory = 0;
    if (brief.budget.mode === "goal_ots" && goalPlan && goalPlan[region]) {
      totalPlaysTheory = Math.ceil(Number(goalPlan[region].playsPlanned || 0));
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    } else {
      totalPlaysTheory = Math.floor(budget / effectiveBid);
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    }

    if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory <= 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "цель=0" });
      continue;
    }

    let screensNeeded = computeScreensNeededForPlays(
      totalPlaysTheory,
      days,
      hpd,
      pphTarget,
      brief.budget.mode
    );

    // Если пользователь задал кол-во конструкций — это цель, а не верхний предел.
    // Алгоритм выбирает ровно столько экранов (или меньше, если пул меньше).
    const constructionsTarget = (brief.constructions?.enabled && brief.constructions.count > 0)
      ? brief.constructions.count
      : null;
    let screensChosenCount = constructionsTarget !== null
      ? Math.min(pool.length, constructionsTarget)
      : Math.min(pool.length, screensNeeded);

    let chosen = [];
    let avgChosenBid = pr.avgBid;
    let effectiveChosenBid = effectiveBid;

    for (let attempt = 0; attempt < 2; attempt++) {
      const stepKm = gridStepKmForCount(screensChosenCount);
      const perCellMax = (screensChosenCount <= 15) ? 1 : 2;

      chosen = pickScreensUniformByGrid(
        pool,
        screensChosenCount,
        stepKm,
        perCellMax
      );

      avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
      effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER);

      if (constructionsTarget !== null || !(Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0)) {
        break;
      }

      const totalPlaysTheoryByChosen = Math.floor(budget / effectiveChosenBid);
      const adjustedTotalPlaysTheory = Math.max(totalPlaysTheory, totalPlaysTheoryByChosen);
      const adjustedScreensNeeded = Math.min(
        pool.length,
        computeScreensNeededForPlays(
          adjustedTotalPlaysTheory,
          days,
          hpd,
          pphTarget,
          brief.budget.mode
        )
      );

      if (adjustedScreensNeeded <= screensChosenCount) {
        totalPlaysTheory = adjustedTotalPlaysTheory;
        break;
      }

      screensChosenCount = adjustedScreensNeeded;
      totalPlaysTheory = adjustedTotalPlaysTheory;
    }

    // Если задано кол-во конструкций — частота определяется стратегией (pphTarget).
    // Ручной слайдер ppm игнорируется; для рекомендованного бюджета pphTarget уже
    // заложен в сумму бюджета. Для фиксированного — бюджет кэпит итоговую частоту.
    const ppmManual = Number(brief.constructions?.playsPerHour || 0);
    const ppmOverride = (constructionsTarget !== null)
      ? (
          brief.budget.mode === "recommendation"
            ? (Number.isFinite(ppmManual) && ppmManual > 0 ? ppmManual : pphTarget)
            : pphTarget
        )
      : null;
    const effectivePPH = ppmOverride !== null ? ppmOverride : SC_MAX;

    // Реальный расход = фактические выходы × ставка ВЫБРАННЫХ экранов (не среднее по пулу).
    // Пересчитываем totalPlaysTheory по фактической ставке выбранных экранов — это убирает
    // раздутие, которое возникает в attempt-loop когда выбираются самые дешёвые экраны:
    // дешёвые → низкий effectiveChosenBid → большой totalPlaysTheoryByChosen → while-loop
    // добирает весь пул. Теперь после финального выбора пересчитываем строго по chosen-ставке.
    if (brief.budget.mode !== "goal_ots" && Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0) {
      totalPlaysTheory = Math.floor(budget / effectiveChosenBid);
    }

    let capPlaysByChosen = Math.floor(effectivePPH * chosen.length * days * hpd);
    // Если ppmOverride — теоретический максимум определяется частотой, а не бюджетом.
    // Но всё равно кэпим по бюджету, чтобы не выходить за введённую сумму.
    if (ppmOverride !== null) {
      totalPlaysTheory = capPlaysByChosen;
    }
    let totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen);

    // Кэп по бюджету: сколько выходов можно купить на указанный бюджет
    if (Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0 && Number.isFinite(budget) && budget > 0) {
      const budgetMaxPlays = Math.floor(budget / effectiveChosenBid);
      totalPlaysEffective = Math.min(totalPlaysEffective, budgetMaxPlays);
    }

    // Если выбранных экранов не хватает по ЁМКОСТИ (capPlays < theory) — добираем из пула.
    // Проверяем именно capPlaysByChosen, а не totalPlaysEffective: budget-cap не должен
    // триггерить добор экранов (иначе при дешёвых выбранных экранах добираются все 19).
    if (constructionsTarget === null && ppmOverride === null && chosen.length < pool.length) {
      const pickedSet = new Set(chosen);
      const extraPool = pool.filter(s => !pickedSet.has(s));
      // Sort so preferred operators are added first during capacity expansion
      extraPool.sort((a, b) => {
        const pa = ownerPriority(a), pb = ownerPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.minBid ?? 1e18) - (b.minBid ?? 1e18);
      });
      let guardCount = 0;
      while (capPlaysByChosen < totalPlaysTheory && extraPool.length > 0 && guardCount++ < 20) {
        const shortfall = totalPlaysTheory - capPlaysByChosen;
        // Используем pphTarget, а не SC_MAX — это сохраняет порядок стратегий:
        // max_reach (pphTarget=10) добирает больше экранов, max_freq (pphTarget=60) — меньше
        const playsPerExtraScreen = Math.max(1, Math.floor(pphTarget * days * hpd));
        const extraNeeded = Math.ceil(shortfall / playsPerExtraScreen);
        const toAdd = extraPool.splice(0, Math.min(extraNeeded, extraPool.length));
        chosen = [...chosen, ...toAdd];

        avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
        effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER);

        capPlaysByChosen = Math.floor(SC_MAX * chosen.length * days * hpd);
        const budgetCap = (effectiveChosenBid > 0) ? Math.floor(budget / effectiveChosenBid) : Infinity;
        totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen, budgetCap);
      }
    }

    totalPlaysEffectiveAll += totalPlaysEffective;

    const actualBudget = Math.ceil(totalPlaysEffective * effectiveChosenBid);
    totalBudgetFinal += actualBudget;

    if (brief.budget.mode !== "goal_ots") {
      const playsPerHourPerScreen = (totalPlaysTheory / days / hpd) / Math.max(1, chosen.length);
      if (playsPerHourPerScreen > pphTarget && playsPerHourPerScreen <= SC_MAX) {
        warnings.push(`⚠️ Регион «${region}»: в среднем ${playsPerHourPerScreen.toFixed(1)} выходов/час на экран (выше выбранной стратегии ${pphTarget}).`);
      }
    }

    // OTS = avg(s.ots per play) × totalPlays  — s.ots уже OTS за один выход
    const avgChosenOts = avgNumberNonZero(chosen.map(s => s.ots));
    const otsTotal = avgChosenOts != null
      ? Math.round(totalPlaysEffective * avgChosenOts) : null;
    if (avgChosenOts == null) hasOts = false;
    if (otsTotal != null) otsTotalAll += otsTotal;

    chosenAll = chosenAll.concat(chosen);

    perRegionRows.push({
      region,
      tier,
      budget: actualBudget,
      screens: chosen.length,
      poolSize: pool.length,
      plays: totalPlaysEffective,
      ots: otsTotal,
      note: ""
    });
  }

  if (!chosenAll.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  // Предупреждение если реальный расход значительно меньше заданного бюджета
  if (brief.budget.mode === "fixed" && brief.budget.amount > 0) {
    const inputBudget = Number(brief.budget.amount);
    if (Number.isFinite(totalBudgetFinal) && totalBudgetFinal < inputBudget * 0.9) {
      const gap = inputBudget - totalBudgetFinal;
      warnings.unshift(
        `⚠️ Инвентарь не позволяет освоить весь бюджет. ` +
        `Реальный расход: ${Math.floor(totalBudgetFinal).toLocaleString("ru-RU")} ₽ ` +
        `из ${inputBudget.toLocaleString("ru-RU")} ₽ ` +
        `(не освоено: ${Math.floor(gap).toLocaleString("ru-RU")} ₽).`
      );
    }
  }

  state.lastChosen = chosenAll;

  // Per-format breakdown
  // playsPerScreen: равномерное распределение выходов по экранам
  const playsPerScreen = chosenAll.length > 0 ? totalPlaysEffectiveAll / chosenAll.length : 0;

  const formatStats = {};
  for (const s of chosenAll) {
    const fmt = s.format || "—";
    if (!formatStats[fmt]) {
      formatStats[fmt] = {
        screens: 0,
        otsSum: 0, otsCnt: 0,  // для avg(s.ots per play)
        playsEst: 0,            // оценка выходов по формату (равномерно)
        bidSum: 0, bidCnt: 0,  // для средней ставки по формату
      };
    }
    formatStats[fmt].screens++;
    formatStats[fmt].playsEst += playsPerScreen;
    if (Number.isFinite(s.ots) && s.ots > 0) {
      formatStats[fmt].otsSum += s.ots;
      formatStats[fmt].otsCnt++;
    }
    const bidForStat = brief.bidMode === "min"
      ? (Number.isFinite(s.minBid) && s.minBid > 0 ? s.minBid : null)
      : (Number.isFinite(s.recoBid) && s.recoBid > 0 ? s.recoBid
          : (Number.isFinite(s.minBid) && s.minBid > 0 ? s.minBid : null));
    if (bidForStat != null) { formatStats[fmt].bidSum += bidForStat; formatStats[fmt].bidCnt++; }
  }

  // otsPerPlay = avg(s.ots) — s.ots уже OTS за один выход
  // costPerPlay = средняя ставка по формату (ставка = стоимость одного выхода)
  for (const fd of Object.values(formatStats)) {
    fd.otsPerPlay  = fd.otsCnt > 0 ? Math.round(fd.otsSum / fd.otsCnt) : null;
    fd.avgBid      = fd.bidCnt > 0 ? +(fd.bidSum / fd.bidCnt).toFixed(2) : null;
    fd.costPerPlay = fd.avgBid;   // стоимость выхода = средняя ставка по формату
  }

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.lastCalc = {
    brief,
    chosen: chosenAll,
    perRegion: perRegionRows,
    warnings: warnings || [],
    formatStats,
    meta: {
      days,
      hpd,
      totalBudget: totalBudgetFinal,
      totalPlays: totalPlaysEffectiveAll,
      totalOts: (Number.isFinite(otsTotalAll) ? otsTotalAll : null)
    }
  };

  const nf = (n) => Math.floor(n).toLocaleString("ru-RU");
  const of = (n) => Math.round(n).toLocaleString("ru-RU");

  const playsPerDayAll = totalPlaysEffectiveAll / days;
  const playsPerHourAll = totalPlaysEffectiveAll / days / hpd;

  const perRegionText = (perRegionRows || [])
    .slice()
    .sort((a, b) => (Number(b.budget || 0) - Number(a.budget || 0)))
    .map(r => {
      const b = Number.isFinite(r.budget) ? Math.floor(r.budget).toLocaleString("ru-RU") + " ₽" : "—";
      const p = Number.isFinite(r.plays) ? Math.floor(r.plays).toLocaleString("ru-RU") : "—";
      const o = (r.ots == null || !Number.isFinite(r.ots)) ? "—" : Math.round(r.ots).toLocaleString("ru-RU");
      const sc = Number.isFinite(r.screens) ? Math.floor(r.screens).toLocaleString("ru-RU") : "—";
      const ps = Number.isFinite(r.poolSize) ? `пул: ${Math.floor(r.poolSize).toLocaleString("ru-RU")}` : null;
      const note = String(r.note || "").trim();
      const extra = [ps, note].filter(Boolean).join(", ");
      return `— ${r.region}: бюджет ${b}, выходов ${p}, OTS ${o}, экранов ${sc}${extra ? ` (${extra})` : ""}`;
    })
    .join("\n");

  const summaryText =
    `Бриф:
— Бюджет: ${totalBudgetFinal.toLocaleString("ru-RU")} ₽ ${
      brief.budget.mode === "fixed"
        ? "(распределён по регионам)"
        : (brief.budget.mode === "goal_ots" ? "(под цель OTS)" : "(сумма рекомендаций)")
    }
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd.toFixed(2)})
— Регион(ы): ${regions.join(", ")}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
— Режим ставки: ${brief.bidMode === "min" ? "Минимальная (minBid)" : "Рекомендованная"}
— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}
— Аудитория: ${brief.audience?.enabled && brief.audience.segments?.length > 0
    ? `${brief.audience.segments.join(", ")} (топ ${Math.round((brief.audience.topPct ?? 0.10) * 100)}%)`
    : "—"}
— Конструкций (лимит): ${brief.constructions?.enabled && brief.constructions.count > 0 ? brief.constructions.count : "—"}

Итог (по всем регионам):
— Выходов всего: ${nf(totalPlaysEffectiveAll)}
— Выходов/день: ${nf(playsPerDayAll)}
— Выходов/час (в сумме): ${nf(playsPerHourAll)}${chosenAll.length > 0 && hpd > 0
    ? ` / на экран: ${(playsPerHourAll / chosenAll.length).toFixed(1)}`
    : ""}
— Экранов выбрано: ${chosenAll.length}
— OTS всего: ${hasOts ? of(otsTotalAll) : "—"}

По регионам:
${perRegionText}`
    + (warnings.length ? `\n\n${warnings.slice(0, 6).join("\n")}${warnings.length > 6 ? "\n…" : ""}` : "");

  // ВАЖНО: записываем summary ДО dispatchEvent — иначе render-функции (daysFromRaw, hoursPerDayFromRaw)
  // читают el("summary").textContent и получают пустую строку
  if (el("summary")) el("summary").textContent = summaryText;
  if (el("download-csv")) el("download-csv").disabled = chosenAll.length === 0;
  if (el("download-plan-xlsx")) el("download-plan-xlsx").disabled = chosenAll.length === 0;

  // POI кнопки: включаем при наличии POI или геокодированных адресов
  const hasPois   = Array.isArray(window.PLANNER?.lastPOIs) && window.PLANNER.lastPOIs.length > 0;
  const hasGeoAddr = Array.isArray(window.PLANNER?.lastGeocodedPoints) && window.PLANNER.lastGeocodedPoints.length > 0;
  const hasAnyPoi = hasPois || hasGeoAddr;
  if (el("download-poi-csv"))  el("download-poi-csv").disabled  = !hasAnyPoi;
  if (el("download-poi-xlsx")) el("download-poi-xlsx").disabled = !hasAnyPoi;

  // Ненайденные GID (для кнопки скачать)
  const unmatchedGids = _isManualMode
    ? [..._manualGidSet].filter(g => !_foundGids.has(g))
    : [];
  window.PLANNER.lastUnmatchedGids = unmatchedGids;

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion: perRegionRows, warnings, inputBudget: brief.budget.amount,
              formatStats, meta: window.PLANNER.lastCalc.meta, unmatchedGids }
  }));

  setStatus("");
  logEvent("calc");
}

// ===== Progress / Calc button state =====
function calcCompletion() {
  const brief = buildBrief();

  const regions = Array.isArray(brief?.geo?.regions)
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : [];
  const step1 = regions.length > 0;

  const step2 = !!(brief?.dates?.start && brief?.dates?.end);

 let scheduleOk = true;

if (brief.schedule?.type === "weekly") {
  if (!(brief?.dates?.start && brief?.dates?.end)) {
    scheduleOk = false;
  } else {
    const mode = brief.schedule.mode || "by_dow";
    if (mode === "global") {
      scheduleOk = Array.isArray(brief.schedule.globalIntervals) && brief.schedule.globalIntervals.length > 0;
    } else {
      const w = brief.schedule.weekly || {};
      scheduleOk = ["mon","tue","wed","thu","fri","sat","sun"].some(k => Array.isArray(w[k]) && w[k].length > 0);
    }

    if (scheduleOk) {
      const meta = computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end);
      scheduleOk = Number.isFinite(meta.avgHpd) && meta.avgHpd > 0;
    }
  }
}

  const mode = brief?.budget?.mode || "recommendation";
  const budgetVal = Number(brief?.budget?.amount || 0);
  const goalOtsVal = Number(brief?.goal?.ots || 0);

  const step3 =
    (mode === "recommendation") ||
    (mode === "fixed" && Number.isFinite(budgetVal) && budgetVal > 0) ||
    (mode === "goal_ots" && Number.isFinite(goalOtsVal) && goalOtsVal > 0);

  // Форматы опциональны: если ничего не выбрано — берём все
  const step4 = true;

  const done = [step1, step2, step3, step4, scheduleOk].filter(Boolean).length;
  return { done, step1, step2, step3, step4, scheduleOk, mode };
}

function renderProgress() {
  const p = calcCompletion();

  const requiredCount = 5; // ✅ FIX: we validate 5 checkpoints now
  const ok = (p.done === requiredCount);

  const calcBtn = el("calc-btn");
  if (calcBtn) {
    calcBtn.disabled = !ok;
    calcBtn.style.opacity = ok ? "1" : ".55";
  }
}

function renderBudgetHints() {
  const hint = el("budget-reco-hint");
  if (!hint) return;

  const mode = getBudgetMode();
  hint.style.display = (mode === "recommendation") ? "block" : "none";
}

// ===== POOL PREVIEW =====
function computePoolPreview() {
  const sourceScreens = (Array.isArray(state.screens) && state.screens.length)
    ? state.screens
    : (Array.isArray(state.screensAll) ? state.screensAll : []);
  if (!sourceScreens.length) return null;
  const brief = buildBrief();
  const regions = Array.isArray(brief?.geo?.regions) ? brief.geo.regions : [];
  if (!regions.length) return null;

  // 1. По регионам
  let pool = sourceScreens.filter(s => regions.some(r => screenMatchesGeoChoice(s, r)));

  // 2. По форматам (если ручной выбор) — используем те же поля, что и onCalcClick
  const formatsMode = brief.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief.formats?.selected) ? brief.formats.selected : [];
  if (formatsMode === "manual" && manualFormats.length > 0) {
    const fset = new Set(manualFormats);
    pool = pool.filter(s => fset.has(s.format));
  }
  const countBase = pool.length;

  // 3. После GRP-фильтра
  let poolAfterGrp = pool;
  let countAfterGrp = null;
  if (brief.grp?.enabled) {
    poolAfterGrp = pool.filter(s => {
      if (!Number.isFinite(s.grp) || s.grp <= 0) return false;
      return s.grp >= (brief.grp.min ?? 0) && s.grp <= (brief.grp.max ?? 9.98);
    });
    countAfterGrp = poolAfterGrp.length;
  }

  // 4. После фильтра по операторам
  const selectedOwners = state.selectedOwners ? [...state.selectedOwners] : [];
  let countAfterOwners = null;
  if (selectedOwners.length > 0) {
    countAfterOwners = poolAfterGrp.filter(s => selectedOwners.includes(s.owner)).length;
  }

  // 5. After affinity filter
  let countAfterAffinity = null;
  const poolBeforeAff = selectedOwners.length > 0
    ? poolAfterGrp.filter(s => selectedOwners.includes(s.owner))
    : poolAfterGrp;
  if (brief.audience?.enabled && brief.audience.segments?.length > 0 && state.affinityMap?.size > 0) {
    const topPct = brief.audience.topPct ?? 0.10;
    countAfterAffinity = Math.max(1, Math.ceil(poolBeforeAff.length * topPct));
  }

  const countFinal = countAfterAffinity !== null
    ? countAfterAffinity
    : (countAfterOwners !== null ? countAfterOwners : (countAfterGrp !== null ? countAfterGrp : countBase));

  return { countBase, countAfterGrp, countAfterOwners, countAfterAffinity, countFinal,
           hasGrpFilter: !!brief.grp?.enabled, hasOwnerFilter: selectedOwners.length > 0,
           hasAffinityFilter: !!(brief.audience?.enabled && brief.audience.segments?.length > 0) };
}

window.PLANNER = window.PLANNER || {};
window.PLANNER.computePoolPreview = computePoolPreview;

// ===== BIND UI =====
function bindPlannerUI() {
  document.querySelectorAll(".preset").forEach(b => {
    cssButtonBase(b);
    b.addEventListener("click", () => {
      if (el("date-start")) el("date-start").value = b.dataset.start;
      if (el("date-end")) el("date-end").value = b.dataset.end;
      renderProgress();
    });
  });

  document.querySelectorAll('input[name="budget_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const mode = getBudgetMode();
      const wrap = el("budget-input-wrap");
      if (wrap) wrap.style.display = mode === "fixed" ? "block" : "none";
      if (el("constructions-enabled")?.checked) applyConstructionsState(true);
      renderBudgetHints();
      renderProgress();
    });
  });

  document.querySelectorAll('input[name="reach_mode"]').forEach(x =>
    x.addEventListener("change", renderProgress)
  );

  document.querySelectorAll(".w-add").forEach(btn => {
  btn.addEventListener("click", () => {
    const day = btn.dataset.day; // mon/tue...
    const wrap = document.getElementById(`${day}-rows`);
    if (!wrap) return;

    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="time" class="w-from" value="07:00">
      <input type="time" class="w-to" value="10:00">
      <button type="button" class="w-del">×</button>
    `;
    wrap.appendChild(div);

    div.querySelector(".w-del").addEventListener("click", () => {
      div.remove();
      renderProgress();
    });

    div.querySelectorAll("input").forEach(i => {
      i.addEventListener("input", renderProgress);
      i.addEventListener("change", renderProgress);
    });

    renderProgress();
  });
});

document.querySelectorAll(".g-add").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrap = document.getElementById("global-rows");
    if (!wrap) return;

    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="time" class="g-from" value="07:00">
      <input type="time" class="g-to" value="10:00">
      <button type="button" class="g-del">×</button>
    `;
    wrap.appendChild(div);

    div.querySelector(".g-del").addEventListener("click", () => {
      div.remove();
      renderProgress();
    });

    div.querySelectorAll("input").forEach(i => {
      i.addEventListener("input", renderProgress);
      i.addEventListener("change", renderProgress);
    });

    renderProgress();
  });
});

// delete for global rows
document.addEventListener("click", (e) => {
  const del = e.target?.closest?.(".g-del");
  if (!del) return;
  const row = del.closest(".row");
  if (row) row.remove();
  renderProgress();
});
  
document.addEventListener("click", (e) => {
  const del = e.target?.closest?.(".w-del");
  if (!del) return;
  const row = del.closest(".row");
  if (row) row.remove();
  renderProgress();
});

  document.querySelectorAll('input[name="schedule"]').forEach(r => {
    r.addEventListener("change", () => {
      const v = getScheduleType();
      const customWrap = el("custom-time-wrap");
      const weeklyWrap = el("weekly-wrap");

      if (customWrap) customWrap.style.display = (v === "custom") ? "flex" : "none";
      if (weeklyWrap) weeklyWrap.style.display = (v === "weekly") ? "block" : "none";

      renderProgress();
    });
  });

  // ===== Weekly mode toggle: global / by_dow =====
document.querySelectorAll('input[name="weekly_mode"]').forEach(r => {
  r.addEventListener("change", () => {
    const m = getWeeklyModeFromUI();
    const globalWrap = el("weekly-global-wrap"); // container for global rows
    const byDowWrap  = el("weekly-by-dow-wrap"); // container for mon..sun rows

    if (globalWrap) globalWrap.style.display = (m === "global") ? "block" : "none";
    if (byDowWrap)  byDowWrap.style.display  = (m === "by_dow") ? "block" : "none";

    renderProgress();
  });
});

  const grpEnabled = el("grp-enabled");
  if (grpEnabled) {
    grpEnabled.addEventListener("change", (e) => {
      const wrap = el("grp-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
      renderProgress();
    });
  }

  const constructionsEnabled = el("constructions-enabled");

  function getPphTargetForUI() {
    const mode = document.querySelector('input[name="reach_mode"]:checked')?.value || "max_reach";
    return targetPlaysPerHourPerScreen(mode);
  }

  function applyConstructionsState(checked) {
    const wrap = el("constructions-count-wrap");
    if (wrap) wrap.style.display = checked ? "block" : "none";

    // Constructions:
    // - recommendation: ppm задаётся вручную (слайдер активен)
    // - fixed/goal_ots: ppm задаётся стратегией (слайдер неактивен)
    const ppmRow = el("constructions-ppm")?.closest("div[style]");
    const ppmRange = el("constructions-ppm");
    const ppmVal = el("constructions-ppm-val");
    const ppmNote = el("constructions-ppm-note");
    const budgetMode = getBudgetMode();
    const manualPpmAllowed = checked && budgetMode === "recommendation";

    if (checked && !manualPpmAllowed) {
      if (ppmRange) ppmRange.disabled = true;
      if (ppmRow) ppmRow.style.opacity = "0.4";
      const pph = getPphTargetForUI();
      if (ppmVal) ppmVal.textContent = pph + " (авто)";
      if (ppmNote) ppmNote.style.display = "block";
    } else {
      if (ppmRange) ppmRange.disabled = false;
      if (ppmRow) ppmRow.style.opacity = "";
      if (ppmVal) ppmVal.textContent = ppmRange?.value || "10";
      if (ppmNote) ppmNote.style.display = "none";
    }
  }

  if (constructionsEnabled) {
    constructionsEnabled.addEventListener("change", (e) => {
      applyConstructionsState(e.target.checked);
    });
    // При смене стратегии — обновить отображение частоты
    document.querySelectorAll('input[name="reach_mode"]').forEach(r => {
      r.addEventListener("change", () => {
        if (el("constructions-enabled")?.checked) applyConstructionsState(true);
      });
    });
    // apply initial state on load
    applyConstructionsState(constructionsEnabled.checked);
  }

  document.querySelectorAll('input[name="bid_mode"]').forEach(r => {
    r.addEventListener("change", renderProgress);
  });

  // ppm range slider label sync (only when not disabled by constructions)
  const ppmRange = el("constructions-ppm");
  if (ppmRange) {
    ppmRange.addEventListener("input", (e) => {
      if (e.target.disabled) return;
      const lbl = el("constructions-ppm-val");
      if (lbl) lbl.textContent = e.target.value;
    });
  }

  // "max" кнопка для кол-ва конструкций
  el("constructions-max-btn")?.addEventListener("click", () => {
    const regions = Array.isArray(state.selectedRegions) ? state.selectedRegions : [];
    // Считаем пул: экраны выбранных регионов (с учётом фильтра форматов и операторов)
    let pool = state.screens.filter(s => !regions.length || regions.some(r => screenMatchesGeoChoice(s, r)));
    const fmtsAuto = !!el("formats-auto")?.checked;
    if (!fmtsAuto && state.selectedFormats?.size) {
      pool = pool.filter(s => state.selectedFormats.has(s.format));
    }
    if (typeof window.PLANNER?.getScreensFilteredByOwner === "function") {
      pool = window.PLANNER.getScreensFilteredByOwner(pool);
    }
    const maxCount = pool.length;
    const inp = el("constructions-count");
    if (inp) { inp.value = maxCount; inp.dispatchEvent(new Event("input")); }
    renderProgress();
  });

  const formatsAuto = el("formats-auto");
  if (formatsAuto) {
    formatsAuto.addEventListener("change", (e) => {
      const wrap = el("formats-wrap");
      if (e.target.checked) {
        state.selectedFormats.clear();
        if (wrap) [...wrap.querySelectorAll("button")].forEach(btn => btn.style.borderColor = "#ddd");
      }
      renderProgress();
    });
  }

  const selectionMode = el("selection-mode");
  if (selectionMode) selectionMode.addEventListener("change", () => { renderSelectionExtra(); renderProgress(); });

  const clearRegionsBtn = el("regions-clear");
  if (clearRegionsBtn) {
    clearRegionsBtn.addEventListener("click", () => {
      state.selectedRegions = [];
      state.selectedRegion = null;
      renderSelectedRegions();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });
  }

  // watchers for inputs
  [
    "date-start", "date-end", "budget-input", "goal-ots",
    "formats-auto", "selection-mode", "grp-enabled", "grp-min", "grp-max",
    "time-from", "time-to",
    // weekly fields: if present, update progress on change
    "mon-from", "mon-to", "tue-from", "tue-to", "wed-from", "wed-to",
    "thu-from", "thu-to", "fri-from", "fri-to", "sat-from", "sat-to", "sun-from", "sun-to"
  ].forEach(id => {
    const n = el(id);
    if (n) {
      n.addEventListener("input", renderProgress);
      n.addEventListener("change", renderProgress);
    }
  });

  // ===== Regions search =====
  const regionSearch = el("city-search");
  const sug = el("city-suggestions");

  function regionsReadyNow() {
    if (typeof areRegionsReady === "function") return !!areRegionsReady();
    return Array.isArray(state?.regionsAll) && state.regionsAll.length > 0;
  }

  function showRegionsLoadingHint() {
    if (!sug) return;
    sug.innerHTML = `
      <div style="font-size:12px; color:#667085; padding:8px 0;">
        ⏳ Список регионов загружается… попробуйте через пару секунд.
      </div>
    `;
  }

  if (regionSearch) {
    regionSearch.addEventListener("focus", () => {
      if (!regionsReadyNow()) {
        setRegionsUIReady(false);
        showRegionsLoadingHint();
      }
    });

    regionSearch.addEventListener("input", (e) => {
      if (!regionsReadyNow()) {
        setRegionsUIReady(false);
        showRegionsLoadingHint();
        return;
      }
      renderRegionSuggestions(e.target.value);
    });
  }

  // ===== Выбрать все регионы =====
  el("regions-select-all")?.addEventListener("click", () => {
    const all = Array.isArray(state.regionsAll) ? state.regionsAll : [];
    if (!all.length) return;
    if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
    let added = 0;
    for (const r of all) {
      if (!state.selectedRegions.includes(r)) { state.selectedRegions.push(r); added++; }
    }
    state.selectedRegion = state.selectedRegions[0] || null;
    if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
    renderSelectedRegions();
    renderProgress();
    window.dispatchEvent(new CustomEvent("planner:pool-updated"));
  });

  // ===== City import from file =====
  const regionFileInput = el("region-file-input");
  if (regionFileInput) {
    regionFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const statusEl = el("region-import-status");
      if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Читаю файл…"; }
      const name = file.name.toLowerCase();
      try {
        let rows = [];
        let rawLines = [];

        if (name.endsWith(".txt")) {
          const text = await file.text();
          rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          rows = rawLines.map(l => ({ _val: l }));

        } else if (name.endsWith(".csv")) {
          const text = await file.text();
          const parsed = window.Papa?.parse(text, { header: true, skipEmptyLines: true });
          if (parsed?.data?.length) {
            rows = parsed.data;
          } else {
            const p2 = window.Papa?.parse(text, { skipEmptyLines: true });
            rawLines = (p2?.data || []).map(r => String(r[0] || "").trim()).filter(Boolean);
            rows = rawLines.map(l => ({ _val: l }));
          }

        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await file.arrayBuffer();
          const wb  = window.XLSX?.read(buf, { type: "array" });
          const ws  = wb?.Sheets?.[wb.SheetNames[0]];
          rows = window.XLSX?.utils?.sheet_to_json(ws, { defval: "" }) || [];
          if (!rows.length) {
            const raw = window.XLSX?.utils?.sheet_to_json(ws, { header: 1 }) || [];
            rawLines = raw.slice(1).map(r => String(r[0] || "").trim()).filter(Boolean);
            rows = rawLines.map(l => ({ _val: l }));
          }
        }

        if (!rows.length) {
          if (statusEl) statusEl.textContent = "Файл пустой";
          e.target.value = ""; return;
        }

        // Match cities
        const { matched, unmatched } = _extractAndMatchCities(rows);

        // Add matched regions
        if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
        let added = 0;
        for (const r of matched) {
          if (!state.selectedRegions.includes(r)) {
            state.selectedRegions.push(r);
            added++;
          }
        }
        if (matched.length) {
          state.selectedRegion = state.selectedRegions[0] || null;
          if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
          renderSelectedRegions();
          renderProgress();
          window.dispatchEvent(new CustomEvent("planner:pool-updated"));
        }

        // Status message
        let msg = "";
        if (added > 0) msg += `Добавлено городов: ${added}`;
        else if (matched.length > 0) msg += `Все ${matched.length} городов уже выбраны`;
        else msg += "Не удалось распознать города";
        if (unmatched.length) msg += `. Не найдены: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ` и ещё ${unmatched.length - 5}` : ""}`;
        if (statusEl) statusEl.textContent = msg;

      } catch(err) {
        if (statusEl) statusEl.textContent = "Ошибка чтения файла";
        console.error("[region-import]", err);
      }
      e.target.value = "";
    });
  }

  // ===== Downloads =====
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => { downloadXLSX(state.lastChosen); logEvent("download_gids"); });

  const planBtn = el("download-plan-xlsx");
  if (planBtn) {
    planBtn.disabled = true;
    planBtn.addEventListener("click", () => { downloadMediaPlan(); logEvent("download_plan"); });
  }

  // POI / адреса — скачать CSV/XLSX
  function getPoisForExport() {
    if (Array.isArray(window.PLANNER?.lastPOIs) && window.PLANNER.lastPOIs.length) {
      return window.PLANNER.lastPOIs.map(p => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon }));
    }
    if (Array.isArray(window.PLANNER?.lastGeocodedPoints) && window.PLANNER.lastGeocodedPoints.length) {
      return window.PLANNER.lastGeocodedPoints;
    }
    return [];
  }

  const poiCsvBtn = el("download-poi-csv");
  if (poiCsvBtn) {
    poiCsvBtn.disabled = true;
    poiCsvBtn.addEventListener("click", () => {
      const pois = getPoisForExport();
      if (!pois.length) return;
      const header = "Название,Широта,Долгота";
      const rows = pois.map(p => [`"${String(p.name||"").replace(/"/g,'""')}"`, p.lat, p.lon].join(","));
      const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "poi_addresses.csv"; a.click();
      logEvent("download_poi");
    });
  }

  const poiXlsxBtn = el("download-poi-xlsx");
  if (poiXlsxBtn) {
    poiXlsxBtn.disabled = true;
    poiXlsxBtn.addEventListener("click", async () => {
      const pois = getPoisForExport();
      if (!pois.length) return;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("POI");
      ws.columns = [
        { header: "Название", key: "name", width: 44 },
        { header: "Широта",   key: "lat",  width: 16 },
        { header: "Долгота",  key: "lon",  width: 16 },
      ];
      pois.forEach(p => ws.addRow({ name: p.name, lat: p.lat, lon: p.lon }));
      ws.getRow(1).font = { bold: true };
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "poi_addresses.xlsx"; a.click();
      logEvent("download_poi");
    });
  }

  // ===== Вставить список регионов =====
  const pasteBtn    = el("regions-paste-btn");
  const pasteWrap   = el("regions-paste-wrap");
  const pasteArea   = el("regions-paste-area");
  const pasteGo     = el("regions-paste-go");
  const pasteCancel = el("regions-paste-cancel");

  if (pasteBtn && pasteWrap) {
    pasteBtn.addEventListener("click", () => {
      pasteWrap.style.display = pasteWrap.style.display === "none" ? "block" : "none";
      if (pasteWrap.style.display === "block" && pasteArea) pasteArea.focus();
    });

    if (pasteCancel) pasteCancel.addEventListener("click", () => {
      pasteWrap.style.display = "none";
      if (pasteArea) pasteArea.value = "";
    });

    if (pasteGo && pasteArea) {
      const doImport = () => {
        const text = pasteArea.value.trim();
        if (!text) return;
        // Разбиваем по переносам строк и запятым
        const rawLines = text.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
        const rows = rawLines.map(l => ({ _val: l }));
        const { matched, unmatched } = _extractAndMatchCities(rows);

        if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
        let added = 0;
        for (const r of matched) {
          if (!state.selectedRegions.includes(r)) { state.selectedRegions.push(r); added++; }
        }
        if (matched.length) {
          state.selectedRegion = state.selectedRegions[0] || null;
          if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
          renderSelectedRegions();
          renderProgress();
          window.dispatchEvent(new CustomEvent("planner:pool-updated"));
        }

        const statusEl = el("region-import-status");
        if (statusEl) {
          let msg = added > 0 ? `Добавлено: ${added}` : (matched.length ? `Уже выбраны все (${matched.length})` : "Не удалось распознать города");
          if (unmatched.length) msg += `. Не найдены: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ` и ещё ${unmatched.length - 5}` : ""}`;
          statusEl.style.display = "block";
          statusEl.textContent = msg;
        }

        pasteWrap.style.display = "none";
        pasteArea.value = "";
      };

      pasteGo.addEventListener("click", doImport);
      // Ctrl+Enter тоже запускает
      pasteArea.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doImport(); }
      });
    }
  }

  // ===== Ненайденные GID: кнопка скачать =====
  window.addEventListener("planner:calc-done", (e) => {
    const unmatched = e?.detail?.unmatchedGids || [];
    const btn = el("manual-gids-download-unmatched");
    if (!btn) return;
    if (unmatched.length > 0) {
      btn.style.display = "inline-block";
      btn.textContent = `↓ Скачать не найденные GID-ы (${unmatched.length})`;
      btn.onclick = () => {
        const blob = new Blob([unmatched.join("\n")], { type: "text/plain;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gids_not_found.txt";
        a.click();
      };
    } else {
      btn.style.display = "none";
    }
  });

  // ===== Calc =====
  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());

  // Initial
  renderProgress();
  renderBudgetHints();
  renderSelectionExtra();
}

// ===== DSP FORECAST BIDS =====

// In-memory cache: Map<dspId (number), { recoBid, ts }>
const _recoBidCache = new Map();
const RECO_BID_CACHE_TTL = 60 * 60 * 1000; // 1 час

/**
 * Конвертирует brief.schedule в формат timeSettings для API прогноза ставки.
 * dayOfWeek: 1=Пн … 7=Вс (ISO).  relativeStartTime/End — секунды от начала дня.
 */
function scheduleToTimeSettings(schedule) {
  const DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const toSec = (timeStr) => {
    const m = _timeToMin(timeStr);
    return m == null ? null : m * 60;
  };

  if (schedule?.type === "weekly") {
    const weekly = schedule.weekly || {};
    const result = [];
    for (const [key, intervals] of Object.entries(weekly)) {
      const dow = DOW[key];
      if (!dow || !Array.isArray(intervals)) continue;
      for (const iv of intervals) {
        const s = toSec(iv?.from), e = toSec(iv?.to);
        if (s == null || e == null) continue;
        result.push({ dayOfWeek: dow, relativeStartTime: s, relativeEndTime: e });
      }
    }
    return result;
  }

  // all_day / peak / custom — одно расписание на все дни
  let fromSec, toSec2;
  if (schedule?.type === "all_day") {
    fromSec = 7 * 3600; toSec2 = 22 * 3600;
  } else if (schedule?.type === "peak") {
    fromSec = 7 * 3600; toSec2 = 14 * 3600;
  } else if (schedule?.type === "custom") {
    fromSec = toSec(schedule.from || "07:00") ?? 7 * 3600;
    toSec2  = toSec(schedule.to   || "22:00") ?? 22 * 3600;
  } else {
    fromSec = 7 * 3600; toSec2 = 22 * 3600;
  }

  const result = [];
  for (let dow = 1; dow <= 7; dow++) {
    result.push({ dayOfWeek: dow, relativeStartTime: fromSec, relativeEndTime: toSec2 });
  }
  return result;
}

/**
 * Загружает реальные рекомендованные ставки из API прогноза.
 * Патчит s.recoBid на каждом экране из массива screens.
 * Кэшируется на 1 час в памяти.
 */
async function dspFetchForecastBids(screens, brief) {
  if (!window.DSP_AUTH_ENABLED || !getDspToken()) return;

  const token = getDspToken();
  const now = Date.now();

  // Применяем кэш, отбираем экраны которые нужно дозапросить
  const toFetch = [];
  for (const s of screens) {
    if (!Number.isFinite(s._dspId)) continue;
    const cached = _recoBidCache.get(s._dspId);
    if (cached && (now - cached.ts) < RECO_BID_CACHE_TTL) {
      s.recoBid = cached.recoBid;
    } else {
      toFetch.push(s);
    }
  }
  if (!toFetch.length) return;

  const timeSettings = scheduleToTimeSettings(brief.schedule);
  if (!timeSettings.length) return;

  // Используем последние 90 дней (исторические данные) — на будущих датах API возвращает MIN_BID
  const _today = new Date();
  const _d90 = new Date(_today); _d90.setDate(_today.getDate() - 90);
  const _fmtDate = d => d.toISOString().slice(0, 10);
  const dateStart = _fmtDate(_d90) + "T00:00:00";
  const dateEnd   = _fmtDate(new Date(_today.getTime() - 86400000)) + "T23:59:59";

  const markup = getDspAgencyMarkup();
  const additionalCharge = markup.additionalCharge ?? 0;

  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < toFetch.length; i += BATCH) batches.push(toFetch.slice(i, i + BATCH));

  const results = await Promise.allSettled(batches.map(async batch => {
    const body = {
      inventoryList: batch.map(s => ({ inventory: s._dspId, timeSettings })),
      statisticPeriod: { start: dateStart, end: dateEnd },
      additionalCharge,
    };
    const r = await fetch(`${DSP_API}/api/v1.0/clients/analytics/forecast-price-by-inventory`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`forecast-price HTTP ${r.status}`);
    return r.json();
  }));

  // Записываем в кэш и на экраны
  const idToScreen = new Map(toFetch.map(s => [s._dspId, s]));
  for (const res of results) {
    if (res.status !== "fulfilled" || !res.value?.elements) continue;
    for (const [idStr, elem] of Object.entries(res.value.elements)) {
      const dspId = Number(idStr);
      let price = elem?.statistic?.averagePrice;
      if (!Number.isFinite(price) || price <= 0) continue;
      // MIN_BID — нет реальных аукционов, это просто minBid → применяем коэффициент
      // INVENTORY и FORMAT_CITY — реальные/статистические данные, берём как есть
      const method = elem?.referenceData?.method;
      if (method === "MIN_BID") price = price * BID_MULTIPLIER;
      _recoBidCache.set(dspId, { recoBid: price, ts: now });
      const s = idToScreen.get(dspId);
      if (s) s.recoBid = price;
    }
  }
}

/**
 * Средняя эффективная ставка для набора экранов:
 * - bidMode "min"  → avg(minBid)
 * - bidMode "recommended" → avg(recoBid) если есть, иначе avg(minBid) × BID_MULTIPLIER
 */
function avgEffectiveBid(screens, bidMode, fallback) {
  if (bidMode === "min") {
    return avgNumber(screens.map(s => s.minBid)) ?? fallback;
  }
  const recos = screens.map(s => s.recoBid).filter(v => Number.isFinite(v) && v > 0);
  if (recos.length > 0) return recos.reduce((a, b) => a + b, 0) / recos.length;
  const mins = screens.map(s => s.minBid).filter(v => Number.isFinite(v) && v > 0);
  return mins.length > 0 ? (mins.reduce((a, b) => a + b, 0) / mins.length) * BID_MULTIPLIER : fallback;
}

// ===== DSP API AUTH + INVENTORY =====
// Включается через: window.DSP_AUTH_ENABLED = true; в HTML Tilda перед виджетом

const DSP_API = "https://proddsp.omniboard360.io";
const DSP_PAGE_SIZE = 200; // reduced from 500 to avoid ERR_INCOMPLETE_CHUNKED_ENCODING
const DSP_PAGE_BATCH = 2; // параллельных запросов за раз (меньше = меньше 500-ок от сервера)
const DSP_BATCH_DELAY_MS = 300; // пауза между батчами

function getDspToken() { return sessionStorage.getItem("dsp_token") || ""; }
function setDspToken(t) { t ? sessionStorage.setItem("dsp_token", t) : sessionStorage.removeItem("dsp_token"); }
function getDspUserEmail() { return sessionStorage.getItem("dsp_user_email") || ""; }
function setDspUserEmail(e) { e ? sessionStorage.setItem("dsp_user_email", e) : sessionStorage.removeItem("dsp_user_email"); }
function getDspAgencyId() { return sessionStorage.getItem("dsp_agency_id") || ""; }
function setDspAgencyId(id) { id ? sessionStorage.setItem("dsp_agency_id", String(id)) : sessionStorage.removeItem("dsp_agency_id"); }
// additionalCharge — множитель надбавки агентства (напр. 0.15 = +15%), platformFee — фиксированная надбавка платформы (в той же валюте что и ставка)
function getDspAgencyMarkup() {
  try { return JSON.parse(sessionStorage.getItem("dsp_agency_markup") || "null") || {}; } catch { return {}; }
}
function setDspAgencyMarkup(obj) {
  if (obj) sessionStorage.setItem("dsp_agency_markup", JSON.stringify(obj));
  else sessionStorage.removeItem("dsp_agency_markup");
}

function renderDspUserBar() {
  const bar = document.getElementById("dsp-user-bar");
  if (!bar || !window.DSP_AUTH_ENABLED || !getDspToken()) return;
  const email = getDspUserEmail();
  bar.style.display = "block";
  const emailHtml = email
    ? `<span style="color:#555;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(email)}</span>`
    : `<span style="color:#888;">DSP</span>`;
  bar.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;background:#f0f2f5;border-radius:20px;padding:4px 6px 4px 8px;font-size:12px;line-height:1;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      ${emailHtml}
      <a href="#" id="dsp-logout-btn" style="display:inline-flex;align-items:center;gap:3px;margin-left:2px;padding:2px 8px;background:#fff;border:1px solid #ddd;border-radius:12px;color:#666;text-decoration:none;font-size:11px;white-space:nowrap;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Выйти
      </a>
    </span>`;
  document.getElementById("dsp-logout-btn")?.addEventListener("click", e => {
    e.preventDefault();
    dspLogout();
  });
}

function dspLogout() {
  setDspToken("");
  setDspUserEmail("");
  setDspAgencyId("");
  setDspAgencyMarkup(null);
  localStorage.removeItem(getDspCacheKey());
  // Очищаем старые ключи предыдущих версий кэша
  localStorage.removeItem("dsp_inv_v2");
  window.location.reload();
}

async function dspLogin(email, password) {
  const res = await fetch(`${DSP_API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    throw new Error(res.status < 500 ? "Неверный email или пароль" : `Ошибка сервера ${res.status}`);
  }
  const json = await res.json();
  const token = json.accessToken;
  if (!token) throw new Error("Токен не получен от сервера");
  setDspToken(token);
  const user = json.user || {};
  setDspUserEmail(user.email || user.login || user.username || "");
  const agencyId = user.agency?.id || user.agencyId || "";
  setDspAgencyId(agencyId);
  if (agencyId) {
    // Фоново подгружаем надбавки агентства; не блокируем интерфейс
    dspFetchAgencyMarkup(agencyId).catch(() => {});
  }
  return user;
}

// Подгружает agencyId через список агентств (/api/v1.0/clients/agencies)
async function dspFetchCurrentUserAgency() {
  const token = getDspToken();
  if (!token) return;
  try {
    const r = await fetch(`${DSP_API}/api/v1.0/clients/agencies`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!r.ok) return;
    const j = await r.json();
    const agency = (j.content || j)[0];
    if (agency?.id) {
      setDspAgencyId(agency.id);
      console.log("[DSP] agency loaded:", agency.id, agency.name);
    }
  } catch (e) {
    console.warn("[DSP] agency fetch failed:", e.message);
  }
}

async function dspFetchAgencyMarkup(agencyId) {
  const token = getDspToken();
  if (!token || !agencyId) return;
  try {
    const r = await fetch(`${DSP_API}/api/v1.0/clients/agencies/${agencyId}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!r.ok) return;
    const agency = await r.json();
    const markup = {
      additionalCharge: agency.additionalCharge ?? 0,  // доп. надбавка агентства (доля, напр. 0.15)
      platformFee:      agency.platformFee      ?? 0,  // фиксированная надбавка платформы
    };
    setDspAgencyMarkup(markup);
    console.log("[DSP] agency markup loaded:", markup);
  } catch (e) {
    console.warn("[DSP] agency markup fetch failed:", e.message);
  }
}

function showLoginOverlay() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "dsp-login-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(11,18,32,.75);" +
      "display:flex;align-items:center;justify-content:center;font-family:inherit;";

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:40px 36px;width:340px;max-width:90vw;
                  box-shadow:0 24px 64px rgba(0,0,0,.22);">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px;color:#0b1220;">Вход</div>
        <div style="font-size:13px;color:#667085;margin-bottom:24px;">
          Введите данные вашего аккаунта DSP
        </div>
        <input id="dsp-email" type="email" placeholder="Email"
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:10px;outline:none;">
        <input id="dsp-password" type="password" placeholder="Пароль"
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:16px;outline:none;">
        <div id="dsp-err" style="color:#e53e3e;font-size:13px;min-height:18px;margin-bottom:10px;"></div>
        <button id="dsp-login-btn"
                style="width:100%;padding:13px;background:#5b3ef5;color:#fff;border:none;
                       border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
          Войти
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const emailEl = overlay.querySelector("#dsp-email");
    const passEl  = overlay.querySelector("#dsp-password");
    const errEl   = overlay.querySelector("#dsp-err");
    const btnEl   = overlay.querySelector("#dsp-login-btn");

    async function doLogin() {
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      if (!email || !pass) { errEl.textContent = "Заполните все поля"; return; }
      btnEl.disabled = true;
      btnEl.textContent = "Вхожу…";
      errEl.textContent = "";
      try {
        const user = await dspLogin(email, pass);
        overlay.remove();
        resolve(user);
      } catch (e) {
        errEl.textContent = e.message || "Ошибка входа";
        btnEl.disabled = false;
        btnEl.textContent = "Войти";
      }
    }

    btnEl.addEventListener("click", doLogin);
    [emailEl, passEl].forEach(inp =>
      inp.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); })
    );
    setTimeout(() => emailEl.focus(), 50);
  });
}

async function dspFetchInventoriesPage(page, size = DSP_PAGE_SIZE) {
  const token = getDspToken();
  if (!token) throw new Error("SESSION_EXPIRED");
  const headers = { "Authorization": "Bearer " + token };
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(
        `${DSP_API}/api/v1.0/clients/inventories?page=${page}&size=${size}&enabled=true`,
        { headers, signal: ctrl.signal }
      );
      clearTimeout(tId);
      if (r.status === 401) { setDspToken(""); throw new Error("SESSION_EXPIRED"); }
      if (!r.ok) {
        throw new Error(`HTTP_${r.status}`);
      }
      const j = await r.json();
      return {
        items: j.content || [],
        totalElements: j.totalElements || 0,
        totalPages: j.totalPages || 0
      };
    } catch (e) {
      if (e.message === "SESSION_EXPIRED") throw e;
      lastErr = e;
      console.warn(`[DSP] page ${page} attempt ${attempt + 1} failed:`, e.message);
      if (attempt < 2) await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`PAGE_FETCH_FAILED:${page}:${lastErr?.message || "unknown"}`);
}

// Субгородские административные единицы, которые не нужны как отдельные «города»
function dspBuildCityCache(raw, baseCache = null) {
  const cityCache = baseCache || {};
  for (const inv of raw || []) {
    const s = mapDspInventory(inv);
    const cityKey = String(s.city || "").trim() || "Не назначено";
    if (!cityCache[cityKey]) cityCache[cityKey] = [];
    cityCache[cityKey].push({ ...s, city: cityKey });
  }
  return cityCache;
}

function dspHydrateCityState(cityCache) {
  state.dspInventoryCache = cityCache;

  const allScreens = Object.values(cityCache || {}).flatMap(arr => Array.isArray(arr) ? arr : []);
  state.screensAll = allScreens.map(s => ({
    ...s,
    minBid: Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN,
    ots:    Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN,
    grp:    Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN,
    lat:    Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN,
    lon:    Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN,
    region: getRegionForDspCity(s.city),
  }));

  const cityNames = Object.keys(cityCache).sort((a, b) => a.localeCompare(b, "ru"));
  console.log(`[DSP] unique cities: ${cityNames.length}`, cityNames.slice(0, 5));

  state.dspCities = cityNames;
  state.citiesAll = cityNames;
  state.regionsByCity = {};
  state.dspRegionToCities = {};
  for (const c of cityNames) {
    const region = getRegionForDspCity(c);
    state.regionsByCity[c] = region;
    if (!state.dspRegionToCities[region]) state.dspRegionToCities[region] = [];
    state.dspRegionToCities[region].push(c);
  }

  state.regionsAll = [...new Set(Object.values(state.regionsByCity).filter(r => r && r !== "Не назначено"))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screensAll.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  state.ownersAll = [...new Set(
    state.screensAll
      .map(s => String(s.owner ?? s.Owner ?? "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "ru"));

  setRegionsUIReady(true);
  renderFormats();
  renderOwners();
  renderSelectedRegions();
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screensAll.length } }));
}

async function dspWarmupInventoryInBackground(cityCacheSeed, totalLoadedSoFar, totalElements, totalPages) {
  const cityCache = cityCacheSeed || {};
  let hadFailures = false;

  for (let start = 1; start < totalPages; start += DSP_PAGE_BATCH) {
    const pages = [];
    for (let p = start; p < Math.min(start + DSP_PAGE_BATCH, totalPages); p++) pages.push(p);

    const results = await Promise.allSettled(
      pages.map(async p => ({ page: p, payload: await dspFetchInventoriesPage(p) }))
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalLoadedSoFar += (r.value.payload.items || []).length;
        dspBuildCityCache(r.value.payload.items || [], cityCache);
      }
      if (r.status === "rejected" && r.reason?.message === "SESSION_EXPIRED") throw r.reason;
      if (r.status === "rejected") {
        hadFailures = true;
        console.warn("[DSP] warmup page failed:", r.reason?.message || r.reason);
      }
    }

    dspHydrateCityState(cityCache);
    setStatus(`Загружаю экраны… ${totalLoadedSoFar} из ${totalElements || "?"}`);
    await new Promise(res => setTimeout(res, DSP_BATCH_DELAY_MS));
  }

  if (hadFailures) throw new Error("PARTIAL_INVENTORY_WARMUP");
  dspSaveInventoryToStorage(cityCache);
  state.dspInventoryWarmupDone = true;
  return cityCache;
}

// Загрузка всех доступных городов из DSP
// Показывает интерфейс после первой страницы и догружает хвост в фоне
async function dspFetchAllInventories() {
  const first = await dspFetchInventoriesPage(0);
  const totalElements = first.totalElements || 0;
  const totalPages = first.totalPages || Math.ceil(totalElements / DSP_PAGE_SIZE) || 1;
  state.dspInventoryTotal = totalElements;
  const cityCache = dspBuildCityCache(first.items || [], {});

  setStatus(`Загружаю экраны… ${first.items?.length || 0} из ${totalElements || "?"}`);
  dspHydrateCityState(cityCache);

  if (totalPages <= 1) {
    dspSaveInventoryToStorage(cityCache);
    state.dspInventoryWarmupDone = true;
    return cityCache;
  }

  state.dspInventoryWarmupDone = false;
  state.dspInventoryWarmupPromise = dspWarmupInventoryInBackground(
    cityCache,
    (first.items || []).length,
    totalElements,
    totalPages
  ).then(finalCache => {
    state.dspInventoryCache = finalCache;
    state.dspInventoryWarmupPromise = null;
    setStatus("");
    return finalCache;
  }).catch(err => {
    state.dspInventoryWarmupDone = false;
    state.dspInventoryWarmupPromise = null;
    console.warn("[DSP] background warmup failed:", err);
    setStatus("");
    return state.dspInventoryCache || cityCache;
  });

  return cityCache;
}

// Принудительная полная загрузка всего инвентаря (blocking),
// используется как fallback, если после обычной загрузки регион/город пуст.
async function dspForceReloadAllInventoriesBlocking() {
  const first = await dspFetchInventoriesPage(0);
  const totalElements = first.totalElements || 0;
  const totalPages = first.totalPages || Math.ceil(totalElements / DSP_PAGE_SIZE) || 1;
  const cityCache = dspBuildCityCache(first.items || [], {});
  let loaded = (first.items || []).length;

  setStatus(`Перезагружаю инвентарь… ${loaded} из ${totalElements || "?"}`);
  for (let p = 1; p < totalPages; p++) {
    const pageData = await dspFetchInventoriesPage(p);
    loaded += (pageData.items || []).length;
    dspBuildCityCache(pageData.items || [], cityCache);
    if (p % 5 === 0 || p === totalPages - 1) {
      setStatus(`Перезагружаю инвентарь… ${loaded} из ${totalElements || "?"}`);
    }
  }

  dspHydrateCityState(cityCache);
  await dspSaveInventoryToStorage(cityCache);
  state.dspInventoryWarmupDone = true;
  state.dspInventoryWarmupPromise = null;
  setStatus("");
  return cityCache;
}

// Загрузка инвентаря по конкретным cityId (ленивая, по запросу)
async function dspFetchInventoriesByCityId(cityId) {
  const token = getDspToken();
  if (!token) throw new Error("SESSION_EXPIRED");
  const headers = { "Authorization": "Bearer " + token };
  let page = 0, size = DSP_PAGE_SIZE, all = [];

  while (true) {
    const url = `${DSP_API}/api/v1.0/clients/inventories?page=${page}&size=${size}&enabled=true&cityId=${cityId}`;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      console.warn(`[DSP] fetch failed for cityId=${cityId} page=${page}:`, e.message);
      break;
    }
    if (res.status === 401) { setDspToken(""); throw new Error("SESSION_EXPIRED"); }
    if (!res.ok) { console.warn(`[DSP] ${res.status} for cityId=${cityId} page=${page}, stopping`); break; }

    const json = await res.json();
    const items = json.content || [];
    all.push(...items);
    if (items.length < size || page >= (json.totalPages || 1) - 1) break;
    page++;
  }
  return all;
}

function mapDspInventory(inv) {
  const loc    = inv.location   || {};
  const meta   = inv.metadata   || {};
  const mbInfo = inv.minBidInfo || {};

  // GCD helper for aspect ratio
  const _gcd = (a, b) => b === 0 ? a : _gcd(b, a % b);

  // Resolution from screenResolutionPx → physicalResolutionPx → mediaParams.resolution
  const resPx = inv.screenResolutionPx
    || inv.physicalResolutionPx
    || inv.mediaParams?.resolution
    || meta.mediaParams?.[0]?.resolution
    || {};
  const resW = resPx.width  || 0;
  const resH = resPx.height || 0;
  const resolution = (resW && resH) ? `${resW}×${resH}` : "";

  // Aspect ratio = width / height (ширина/высота)
  let aspectRatio = "";
  if (resW && resH) {
    const g = _gcd(resW, resH);
    aspectRatio = `${resW / g}:${resH / g}`;
  } else {
    // fallback: from surfaceDimensionMM ratios
    const ar = inv.surfaceDimensionMM;
    if (ar?.awRation && ar?.ahRation) aspectRatio = `${ar.awRation}:${ar.ahRation}`;
  }

  // Physical size from surfaceDimensionMM (mm → metres, e.g. "3×6")
  const dim = inv.surfaceDimensionMM || {};
  const dimW = dim.width  || 0;
  const dimH = dim.height || 0;
  const size_wh = (dimW && dimH)
    ? `${(dimW / 1000).toFixed(1)}×${(dimH / 1000).toFixed(1)}`
    : "";

  // Side
  const side = meta.side || "";

  // OTS per play: minBidInfo.ots is the canonical per-play OTS used in bidding
  const ots = mbInfo.ots
    ?? meta.otsInfo?.otsValue
    ?? meta.otsInfo?.estimatedOts
    ?? NaN;

  return {
    screen_id:   inv.gid || String(inv.id),
    city:        inv.inventoryTypeAndCity?.cityName
               || inv.city?.name
               || (typeof loc.city === "string" ? loc.city : loc.city?.name)
               || "",
    format:      meta.format || inv.type || "",
    address:     loc.address  || inv.name || "",
    lat:         loc.latitude  ?? NaN,
    lon:         loc.longitude ?? NaN,
    minBid:      mbInfo.minBidCharged ?? mbInfo.minBid ?? NaN,
    recoBid:     NaN,   // not provided by this API
    ots,
    grp:         meta.grp ?? NaN,
    owner:       inv.displayOwner?.name || "",
    image_url:   inv.images?.[0]?.url   || "",
    resolution,
    aspectRatio,
    size_wh,
    side,
    _dspId:      inv.id,
  };
}

// Нормализует массив сырых инвентарей в state.screens
function dspApplyInventories(raw) {
  state.screens = raw.map(inv => {
    const s = mapDspInventory(inv);
    s.minBid = Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN;
    s.ots    = Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN;
    s.grp    = Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN;
    s.lat    = Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN;
    s.lon    = Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN;
    return s;
  });

  // OTS interpolation по формату
  const otsByFormat = {};
  for (const s of state.screens) {
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format]) {
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
    }
  }

  // OTS cap (те же пороги, что и для CSV-инвентаря)
  const OTS_CAPS_DSP = { BILLBOARD: 150, SUPERSITE: 200, OTHER: 100, MEDIAFACADE: 2000 };
  for (const s of state.screens) {
    const cap = OTS_CAPS_DSP[s.format];
    if (cap && Number.isFinite(s.ots) && s.ots > cap) s.ots = cap;
  }

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  for (const s of state.screens) {
    s.region = s.city || "Не назначено";
  }

  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
  renderFormats();
  renderSelectedRegions();
  renderOwners();
}

// ---- IndexedDB-кэш инвентаря (нет лимита размера, переживает Shift+R) ----
const DSP_CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 часа
const DSP_IDB_NAME   = "dsp_planner";
const DSP_IDB_STORE  = "inventory";
const DSP_IDB_VER    = 1;

function getDspCacheKey() {
  const agencyId = getDspAgencyId() || "default";
  const emailKey = normalizeKey(getDspUserEmail() || "").replace(/[^a-z0-9._@-]/gi, "_");
  if (agencyId && agencyId !== "default") return `dsp_inv_v5_agency_${agencyId}`;
  if (emailKey) return `dsp_inv_v5_email_${emailKey}`;
  return null;
}

function _openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DSP_IDB_NAME, DSP_IDB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DSP_IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dspSaveInventoryToStorage(cityCache) {
  try {
    const key = getDspCacheKey();
    if (!key) { console.log("[DSP] skip cache save: no cache key"); return; }
    const total = Object.values(cityCache || {}).reduce((s, a) => s + a.length, 0);
    if (total === 0) { console.log("[DSP] skipping cache save: 0 screens"); return; }
    const db  = await _openIdb();
    await new Promise((res, rej) => {
      const tx  = db.transaction(DSP_IDB_STORE, "readwrite");
      tx.objectStore(DSP_IDB_STORE).put({ ts: Date.now(), d: cityCache }, key);
      tx.oncomplete = res; tx.onerror = rej;
    });
    db.close();
    console.log(`[DSP] inventory saved to IndexedDB (${total} screens), ttl=24h`);
    // Также чистим старые localStorage-кэши
    ["dsp_inv_v2", "dsp_inv_v3_" + (getDspAgencyId() || "default")].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch (e) {
    console.warn("[DSP] IDB save failed:", e.message);
  }
}

async function dspLoadInventoryFromStorage() {
  try {
    const key = getDspCacheKey();
    if (!key) return null;
    const db  = await _openIdb();
    const rec = await new Promise((res, rej) => {
      const tx  = db.transaction(DSP_IDB_STORE, "readonly");
      const req = tx.objectStore(DSP_IDB_STORE).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    if (!rec) return null;
    if (Date.now() - rec.ts > DSP_CACHE_TTL) {
      // Просрочен — удаляем
      const db2 = await _openIdb();
      const tx2 = db2.transaction(DSP_IDB_STORE, "readwrite");
      tx2.objectStore(DSP_IDB_STORE).delete(key);
      db2.close();
      return null;
    }
    const total  = Object.values(rec.d).reduce((s, a) => s + a.length, 0);
    const ageMin = Math.round((Date.now() - rec.ts) / 60000);
    console.log(`[DSP] IDB cache hit: ${total} screens, age=${ageMin}min`);
    if (total === 0) return null;
    return rec.d;
  } catch (e) {
    console.warn("[DSP] IDB load failed:", e.message);
    return null;
  }
}

// Owners whose OTS data is known-bad → always zero
const _ZERO_OTS_OWNERS = ["sunlight indoor", "maer indoor", "spectr"];
function _isZeroOtsOwner(s) {
  const o = String(s.owner ?? "").toLowerCase();
  return _ZERO_OTS_OWNERS.some(k => o.includes(k));
}

const _OTS_CAPS_DSP = { BILLBOARD: 150, SUPERSITE: 200, MEDIAFACADE: 2000 };
const _OTS_CAP_DEFAULT = 200; // for all other formats

// Применяет уже смапленные экраны (из кэша или после расчёта) в state.screens
function dspApplyMappedScreens(screens) {
  state.screens = screens.map(s => ({
    ...s,
    minBid: Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN,
    ots:    Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN,
    grp:    Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN,
    lat:    Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN,
    lon:    Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN,
    region: state.regionsByCity?.[s.city] || getRegionForDspCity(s.city),
  }));
  // IMPORTANT:
  // do not overwrite screensAll here.
  // screensAll is the full loaded DSP inventory and is used as a master pool;
  // this function applies only current selection into state.screens.

  // Zero out known-bad OTS owners before computing format averages
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) s.ots = 0;
  }

  const otsByFormat = {};
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) continue;
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      const cap = _OTS_CAPS_DSP[s.format] ?? _OTS_CAP_DEFAULT;
      if (s.ots > cap) continue; // exclude outliers from average
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) continue;
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format])
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
  }

  // Apply OTS caps (same logic as CSV path)
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) { s.ots = 0; continue; }
    const cap = _OTS_CAPS_DSP[s.format] ?? _OTS_CAP_DEFAULT;
    if (Number.isFinite(s.ots) && s.ots > cap) s.ots = cap;
  }

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
  renderFormats();
  renderSelectedRegions();
  renderOwners();
}

// Загружает весь инвентарь, строит список городов и кэш по городу (cityName → [mapped screens])
async function loadScreensFromDSP() {
  setStatus("Загружаю инвентарь…");

  let cityCache = await dspLoadInventoryFromStorage();
  if (cityCache) {
    const total = Object.values(cityCache).reduce((s, a) => s + a.length, 0);
    console.log(`[DSP] loaded from IndexedDB: ${total} screens, ${Object.keys(cityCache).length} cities`);
    state.dspInventoryTotal = total;
    state.dspInventoryWarmupPromise = null;
    state.dspInventoryWarmupDone = true;
  } else {
    cityCache = await dspFetchAllInventories();
  }

  dspHydrateCityState(cityCache);
  state.screens = [];
  if (state.dspInventoryWarmupDone) setStatus("");
}

// Применяет кэшированный инвентарь для выбранных регионов (вызывается из onCalcClick)
async function dspEnsureInventoryForRegions(regions) {
  if (!window.DSP_AUTH_ENABLED || !state.dspInventoryCache) return;

  // Важно: без ожидания warmup часть городов может отсутствовать в region->cities,
  // и расчёт проходит на неполном пуле.
  if (!state.dspInventoryWarmupDone && state.dspInventoryWarmupPromise) {
    setStatus(`Догружаю инвентарь перед расчётом…`);
    await state.dspInventoryWarmupPromise;
  }

  const regionToCities = state.dspRegionToCities || {};
  const regionCities = (regions || []).flatMap(r => regionToCities[r] || []);
  const missing = regionCities.filter(city => !state.dspInventoryCache[city]);
  if (missing.length && state.dspInventoryWarmupPromise) {
    setStatus(`Догружаю инвентарь для: ${regions.join(", ")}…`);
    await state.dspInventoryWarmupPromise;
  }
  const byCityName = (cityName) => {
    const cache = state.dspInventoryCache || {};
    if (cache[cityName]) return cache[cityName];
    const target = normalizeGeoName(cityName);
    if (!target) return [];
    for (const [k, arr] of Object.entries(cache)) {
      if (normalizeGeoName(k) === target) return arr || [];
    }
    // Fuzzy fallback: handles variants like "Набережные Челны" vs
    // "г. Набережные Челны"/"Набережные Челны городской округ".
    for (const [k, arr] of Object.entries(cache)) {
      const nk = normalizeGeoName(k);
      if (!nk) continue;
      if (nk.includes(target) || target.includes(nk)) return arr || [];
    }
    return [];
  };

  let screens = regionCities.flatMap(city => byCityName(city));

  // Fallback: если регионы в UI являются фактически названиями городов.
  if (!screens.length) {
    screens = (regions || []).flatMap(r => byCityName(r));
  }

  if (!screens.length) {
    const cacheKeys = Object.keys(state.dspInventoryCache || {});
    const wanted = (regions || []).map(r => normalizeGeoName(r)).filter(Boolean);
    const hints = cacheKeys
      .filter(k => {
        const nk = normalizeGeoName(k);
        return wanted.some(w => nk.includes(w) || w.includes(nk));
      })
      .slice(0, 20);
    console.warn("[DSP] no screens after region/city match", {
      requested: regions,
      requestedNorm: wanted,
      regionCities: regionCities.slice(0, 20),
      cacheCitiesTotal: cacheKeys.length,
      possibleCityMatches: hints
    });

    // Final fallback: if selected region/city is empty, force full reload
    // from API and retry matching once. This mitigates partial warmup/cache.
    try {
      setStatus("Не нашла экраны по выбору — делаю полную перезагрузку из API…");
      await dspForceReloadAllInventoriesBlocking();

      const regionToCities2 = state.dspRegionToCities || {};
      const regionCities2 = (regions || []).flatMap(r => regionToCities2[r] || []);
      screens = regionCities2.flatMap(city => byCityName(city));
      if (!screens.length) {
        screens = (regions || []).flatMap(r => byCityName(r));
      }

      console.warn("[DSP] retry after full reload", {
        requested: regions,
        regionCities: regionCities2.slice(0, 20),
        screens: screens.length
      });
    } catch (e) {
      console.warn("[DSP] full reload fallback failed:", e?.message || e);
      setStatus("");
    }
  }

  dspApplyMappedScreens(screens);
  console.log(`[DSP] inventory applied: ${screens.length} screens for regions:`, regions);
  setStatus("");
}

// ===== START =====
async function startPlanner() {
  bindPlannerUI();
  window.PLANNER.ui.photosAllowed = false;

  await loadTiers();
  await loadCityRegions();

  if (window.DSP_AUTH_ENABLED) {
    // DSP API mode: логин + загрузка инвентаря через API
    if (!getDspToken()) await showLoginOverlay();
    renderDspUserBar();
    // Если agencyId не сохранён (например, токен из предыдущей сессии),
    // подтягиваем профиль ДО чтения кэша, чтобы не попадать в default-cache.
    if (!getDspAgencyId()) {
      await dspFetchCurrentUserAgency().catch(() => {});
    } else if (!getDspAgencyMarkup().additionalCharge) {
      dspFetchAgencyMarkup(getDspAgencyId()).catch(() => {});
    }
    try {
      await loadScreensFromDSP();
    } catch (e) {
      if (e.message === "SESSION_EXPIRED") {
        // Токен протух — показываем логин снова
        await showLoginOverlay();
        renderDspUserBar();
        await loadScreensFromDSP();
      } else {
        throw e;
      }
    }
  } else {
    // Fallback: CSV
    await loadScreens();
  }
}

function bootPlanner() {
  startPlanner().catch(e => {
    console.error("Planner init failed:", e);
    setStatus("Ошибка инициализации. Открой консоль — там причина (Planner init failed).");
  });
}

// Автозапуск намеренно отключён: bootPlanner() вызывается внешним kick() из HTML-страницы.
// Это предотвращает двойной вызов (и двойной запрос логина).

// Auto-load affinity data from CDN
(function autoLoadAffinity() {
  function tryLoad() {
    if (PLANNER_CDN_BASE) {
      loadAffinityJSON().catch(err => console.warn("Affinity auto-load failed:", err));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoad);
  } else {
    setTimeout(tryLoad, 0);
  }
})();

// ===== EXPORTS =====
Object.assign(window.PLANNER, {
  state,
  loadScreens,
  startPlanner,
  loadCityRegions,
  bootPlanner,
  fetchPOIsOverpassInRegion,
  pickScreensNearPOIs,
  downloadXLSX,
  geocodeAddressNominatim,
  pickScreensNearPoint,
  _fetchOverpass,
  _runOverpassWithFailover,
  computeScheduleHoursForPeriod,
  getScreensFilteredByOwner,
  renderOwners,
  pointInPolygon,
  countScreensInPolygon,
  replaceScreen,
  removeScreen,
});
