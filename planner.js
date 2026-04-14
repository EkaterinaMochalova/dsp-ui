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
  dspRegionToCities: {}
};

window.PLANNER.state = state;

function getReachModeFromUI() {
  return document.querySelector('input[name="reach_mode"]:checked')?.value || "balanced";
}

function targetPlaysPerHourPerScreen(mode) {
  if (mode === "max_reach") return 10;
  if (mode === "max_freq") return 60;
  return 30; // balanced
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
      <div id="addr-list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;"></div>

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

    function bulkAddAddresses(lines) {
      const clean = lines.map(l => String(l || "").trim()).filter(Boolean);
      if (!clean.length) return 0;
      // Clear empty rows first
      document.querySelectorAll(".planner-addr-input").forEach(i => {
        if (!i.value.trim()) i.closest("div")?.remove();
      });
      clean.forEach(addr => addAddressRow(addr));
      return clean.length;
    }

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

    // Загрузка файла
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
          lines = text.split(/\r?\n/);
        } else if (name.endsWith(".csv")) {
          const text = await file.text();
          const result = window.Papa?.parse(text, { skipEmptyLines: true });
          lines = (result?.data || []).map(row => row[0] || "");
        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await file.arrayBuffer();
          const wb  = window.XLSX?.read(buf, { type: "array" });
          const ws  = wb?.Sheets?.[wb.SheetNames[0]];
          const rows = window.XLSX?.utils?.sheet_to_json(ws, { header: 1 }) || [];
          lines = rows.map(row => String(row[0] || "").trim());
        }
        const textarea = el("addr-paste-area");
        if (textarea) textarea.value = lines.filter(Boolean).join("\n");
        if (status) status.textContent = `Загружено ${lines.filter(Boolean).length} строк`;
      } catch(err) {
        if (status) status.textContent = "Ошибка чтения файла";
        console.error("[addr-import]", err);
      }
      e.target.value = "";
    });

    // Применить импорт
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

function getRegionForCity(city) {
  const key = normalizeKey(city);
  const r = window.PLANNER?.cityRegions?.[key];
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
function renderSelectedRegions() {
  const wrap = el("region-selected");
  if (!wrap) return;

  const clearBtn = el("regions-clear");

  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  wrap.innerHTML = "";

  if (clearBtn) clearBtn.style.display = regions.length ? "inline-block" : "none";

  regions.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "8px";
    chip.style.padding = "6px 10px";
    chip.style.border = "1px solid #ddd";
    chip.style.borderRadius = "999px";
    chip.style.background = "#fff";

    const label = document.createElement("span");
    label.textContent = r;

    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", `Удалить ${r}`);
    x.style.border = "0";
    x.style.background = "transparent";
    x.style.cursor = "pointer";
    x.style.fontSize = "18px";
    x.style.lineHeight = "1";
    x.style.padding = "0 2px";

    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      state.selectedRegions = (state.selectedRegions || []).filter(xx => String(xx).trim() !== r);
      state.selectedRegion = (state.selectedRegions[0] || null);

      renderSelectedRegions();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });

    chip.appendChild(label);
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}

function renderRegionSuggestions(q) {
  const sug = el("city-suggestions");
  if (!sug) return;
  sug.innerHTML = "";
  if (!q) return;

  if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];

  const qq = q.toLowerCase();
  const matches = state.regionsAll
    .filter(r => r.toLowerCase().includes(qq))
    .slice(0, 12);

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
      currency: "RUB"
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

function pickScreensByMinBid(screens, n) {
  const sorted = [...screens].sort((a, b) => {
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
    cell.sort((a, b) => (a.minBid ?? 1e18) - (b.minBid ?? 1e18));
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
    budgetRows.push(["Бюджет без комиссии", fmtR(netBudget), `Комиссия ${commRate}%`, fmtR(commAmount)]);
    budgetRows.push(["Итого (с комиссией)", fmtR(grossBudget), "", ""]);
  } else {
    budgetRows.push(["Бюджет", fmtR(meta.totalBudget), "", ""]);
  }
  if (vatOn && vatRate > 0) {
    budgetRows.push([`НДС ${vatRate}%`, fmtR(vatAmount), "Итого с НДС", fmtR(netBudget + vatAmount)]);
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
    hdr(ws1, r, 1, k1, { bg: LIGHT, border: true });
    val(ws1, r, 2, v1, { border: true });
    if (k2) { hdr(ws1, r, 3, k2, { bg: LIGHT, border: true }); }
    if (v2) { val(ws1, r, 4, v2, { border: true }); }
    ws1.getRow(r).height = 20;
    r++;
  }

  // ── Лист 2: По регионам ────────────────────────────────────────
  const ws2 = wb.addWorksheet("По регионам");
  ws2.columns = [
    { width: 28 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 18 }
  ];
  ["Регион", "Экраны", "Выходов/день", "Бюджет, ₽", "OTS всего"].forEach((h, i) => {
    hdr(ws2, 1, i + 1, h, { bg: PURPLE, light: true, center: true, border: true });
  });
  ws2.getRow(1).height = 22;

  perReg.forEach((row, i) => {
    const fill = i % 2 === 0 ? WHITE : GREY;
    const playsPerDay = Number.isFinite(row.plays) && meta.days > 0
      ? Math.round(row.plays / meta.days) : null;
    [
      row.region || "—",
      row.screens ?? "—",
      playsPerDay != null ? fmt(playsPerDay) : "—",
      Number.isFinite(row.budget) ? Math.round(row.budget).toLocaleString("ru-RU") : "—",
      Number.isFinite(row.ots)    ? fmt(row.ots) : "—",
    ].forEach((c, ci) => val(ws2, i + 2, ci + 1, c, { fill, border: true, right: ci >= 1 }));
    ws2.getRow(i + 2).height = 18;
  });

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

  // ── Лист 4: По форматам ───────────────────────────────────────
  const ws4 = wb.addWorksheet("По форматам");
  ws4.columns = [
    { width: 24 }, { width: 14 }, { width: 20 }, { width: 24 }, { width: 22 }
  ];
  ["Формат", "Экранов", "OTS/выход (ср.)", "Стоимость выхода, ₽", "Ср. ставка, ₽"].forEach((h, i) => {
    hdr(ws4, 1, i + 1, h, { bg: PURPLE, light: true, center: true, border: true });
  });
  ws4.getRow(1).height = 22;

  Object.entries(fs).sort((a, b) => b[1].screens - a[1].screens)
    .forEach(([fmtName, fdata], i) => {
      const fill       = i % 2 === 0 ? WHITE : GREY;
      const otsPerPlay = fdata.otsPerPlay  != null ? fdata.otsPerPlay  : null;
      const costPerPl  = fdata.costPerPlay != null ? fdata.costPerPlay : null;
      const avgBid     = fdata.bidCnt > 0  ? +(fdata.bidSum / fdata.bidCnt).toFixed(2) : null;
      [
        fmtName,
        fdata.screens,
        otsPerPlay != null ? otsPerPlay.toLocaleString("ru-RU") : "—",
        costPerPl  != null ? costPerPl.toLocaleString("ru-RU")  : "—",
        avgBid     != null ? avgBid.toLocaleString("ru-RU")     : "—",
      ].forEach((c, ci) => val(ws4, i + 2, ci + 1, c, { fill, border: true, right: ci >= 1 }));
      ws4.getRow(i + 2).height = 18;
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

  // Fallback: Yandex если ключ задан
  if (window.YANDEX_MAPS_KEY) {
    return geocodeAddressYandex(query, regionHint);
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

  const isPOI = (brief.selection?.mode === "poi");
  const isNearAddress = (brief.selection?.mode === "near_address");

  if (isPOI && !window.GeoUtils?.haversineMeters) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  // =========================
  // 1) PREPARE POOLS PER REGION
  // =========================
  const prepared = [];

  for (const region of regions) {
    const tier = getTierForGeo(region);

    let pool = state.screens.filter(s => String(s.region || "").trim() === region);

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
      const addresses = (brief.selection.addresses && brief.selection.addresses.length)
        ? brief.selection.addresses
        : (brief.selection.address ? [brief.selection.address] : []);
      const screenRadius = Number(brief.selection.radius_m || 500);

      if (!addresses.length) {
        alert("Введите хотя бы один адрес.");
        setStatus(""); return;
      }
      if (!window.GeoUtils?.haversineMeters) {
        alert("GeoUtils не найден. Проверь подключение geo.js");
        setStatus(""); return;
      }

      // Геокодируем все адреса
      const points = [];
      for (const addr of addresses) {
        setStatus(`Геокодирую: «${addr}»…`);
        try {
          const pt = await geocodeAddressNominatim(addr);
          if (pt) points.push(pt);
          else console.warn("[geo] not found:", addr);
        } catch (e) {
          console.error("[geo] nominatim error:", e);
        }
      }

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

    // Prefer screens with valid minBid: exclude no-bid screens if any bid screens exist
    const hasBidScreens = pool.some(s => Number.isFinite(s.minBid) && s.minBid > 0);
    if (hasBidScreens) {
      pool = pool.filter(s => Number.isFinite(s.minBid) && s.minBid > 0);
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
    for (const r of prepared) {
      const BASE_MONTHLY_BY_TIER = { M: 2000000, SP: 1500000, A: 1000000, B: 500000, C: 300000, D: 100000 };
      const baseMonthly = BASE_MONTHLY_BY_TIER[r.tier] ?? BASE_MONTHLY_BY_TIER.C;
      const baseBudgetForPeriod = Math.floor(baseMonthly * (days / 30));

      const maxPlays = Math.floor(SC_MAX * RECO_HOURS_PER_DAY * r.pool.length * days);
      const maxBudget = maxPlays * r.bidPlus20;

      budgets[r.region] = Math.floor(Math.min(baseBudgetForPeriod, maxBudget));
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
      effectiveChosenBid = brief.bidMode === "min" ? avgChosenBid : avgChosenBid * BID_MULTIPLIER;

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

    // Если задан pph — он полностью определяет частоту (выходов/час на экран, 1–60)
    const ppmOverride = (constructionsTarget !== null && (brief.constructions?.playsPerHour ?? 0) > 0)
      ? brief.constructions.playsPerHour   // уже выходов/час
      : null;
    const effectivePPH = ppmOverride !== null ? ppmOverride : SC_MAX;

    // Реальный расход = фактические выходы × ставка ВЫБРАННЫХ экранов (не среднее по пулу)
    // Пересчитываем теоретический максимум выходов по фактическим ставкам выбранных экранов.
    // В режиме goal_ots цель уже зафиксирована через playsPlanned — не поднимаем теорию вверх,
    // иначе появится ложное предупреждение «не хватает ёмкости».
    if (brief.budget.mode !== "goal_ots" && Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0) {
      const totalPlaysTheoryByChosen = Math.floor(budget / effectiveChosenBid);
      totalPlaysTheory = Math.max(totalPlaysTheory, totalPlaysTheoryByChosen);
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

    // Если выбранные экраны упёрлись в SC_MAX и бюджет не освоен — добираем экраны из пула.
    // Работает для всех режимов: max_freq начинает с минимума экранов, но если бюджет всё равно
    // не освоен при SC_MAX — тоже нужно добирать.
    if (constructionsTarget === null && ppmOverride === null && chosen.length < pool.length) {
      const pickedSet = new Set(chosen);
      const extraPool = pool.filter(s => !pickedSet.has(s));
      let guardCount = 0;
      while (totalPlaysEffective < totalPlaysTheory && extraPool.length > 0 && guardCount++ < 20) {
        const shortfall = totalPlaysTheory - totalPlaysEffective;
        // Используем pphTarget, а не SC_MAX — это сохраняет порядок:
        // max_reach (pphTarget=10) добирает больше экранов, max_freq (pphTarget=60) — меньше
        const playsPerExtraScreen = Math.max(1, Math.floor(pphTarget * days * hpd));
        const extraNeeded = Math.ceil(shortfall / playsPerExtraScreen);
        const toAdd = extraPool.splice(0, Math.min(extraNeeded, extraPool.length));
        chosen = [...chosen, ...toAdd];

        avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
        effectiveChosenBid = brief.bidMode === "min" ? avgChosenBid : avgChosenBid * BID_MULTIPLIER;

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
    const bidForStat = Number.isFinite(s.minBid) && s.minBid > 0 ? s.minBid : null;
    if (bidForStat != null) { formatStats[fmt].bidSum += bidForStat; formatStats[fmt].bidCnt++; }
  }

  // otsPerPlay = avg(s.ots) — s.ots уже OTS за один выход
  for (const fd of Object.values(formatStats)) {
    fd.otsPerPlay = fd.otsCnt > 0
      ? Math.round(fd.otsSum / fd.otsCnt)
      : null;
    fd.costPerPlay = (fd.playsEst > 0 && totalBudgetFinal > 0)
      ? Math.round(totalBudgetFinal / totalPlaysEffectiveAll)  // тот же budget/plays что в сводке
      : null;
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
— Конструкций (лимит): ${brief.constructions?.enabled && brief.constructions.count > 0 ? brief.constructions.count : "—"}

Итог (по всем регионам):
— Выходов всего: ${nf(totalPlaysEffectiveAll)}
— Выходов/день: ${nf(playsPerDayAll)}
— Выходов/час (в сумме): ${nf(playsPerHourAll)}
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

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion: perRegionRows, warnings, inputBudget: brief.budget.amount,
              formatStats, meta: window.PLANNER.lastCalc.meta }
  }));

  setStatus("");
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

  const formatsMode = brief?.formats?.mode || "auto";
  const selected = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];
  const step4 = (formatsMode === "auto") || (selected.length > 0);

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
  if (!state.screens || !state.screens.length) return null;
  const brief = buildBrief();
  const regions = Array.isArray(brief?.geo?.regions) ? brief.geo.regions : [];
  if (!regions.length) return null;

  // 1. По регионам
  let pool = state.screens.filter(s => regions.includes(s.region));

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

  const countFinal = countAfterOwners !== null
    ? countAfterOwners
    : (countAfterGrp !== null ? countAfterGrp : countBase);

  return { countBase, countAfterGrp, countAfterOwners, countFinal,
           hasGrpFilter: !!brief.grp?.enabled, hasOwnerFilter: selectedOwners.length > 0 };
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
  function applyConstructionsState(checked) {
    const wrap = el("constructions-count-wrap");
    if (wrap) wrap.style.display = checked ? "block" : "none";
    document.querySelectorAll('input[name="reach_mode"]').forEach(r => {
      r.disabled = checked;
    });
    const reachBlock = document.querySelector(".reach-mode-block");
    if (reachBlock) reachBlock.style.opacity = checked ? "0.4" : "";
  }
  if (constructionsEnabled) {
    constructionsEnabled.addEventListener("change", (e) => {
      applyConstructionsState(e.target.checked);
    });
    // apply initial state on load
    applyConstructionsState(constructionsEnabled.checked);
  }

  document.querySelectorAll('input[name="bid_mode"]').forEach(r => {
    r.addEventListener("change", renderProgress);
  });

  // ppm range slider label sync
  const ppmRange = el("constructions-ppm");
  if (ppmRange) {
    ppmRange.addEventListener("input", (e) => {
      const lbl = el("constructions-ppm-val");
      if (lbl) lbl.textContent = e.target.value;
    });
  }

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

  // ===== Downloads =====
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadXLSX(state.lastChosen));

  const planBtn = el("download-plan-xlsx");
  if (planBtn) {
    planBtn.disabled = true;
    planBtn.addEventListener("click", () => downloadMediaPlan());
  }

  // ===== Calc =====
  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());

  // Initial
  renderProgress();
  renderBudgetHints();
  renderSelectionExtra();
}

// ===== DSP API AUTH + INVENTORY =====
// Включается через: window.DSP_AUTH_ENABLED = true; в HTML Tilda перед виджетом

const DSP_API = "https://proddsp.omniboard360.io";
const DSP_PAGE_SIZE = 500;
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

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(
        `${DSP_API}/api/v1.0/clients/inventories?page=${page}&size=${size}&enabled=true`,
        { headers }
      );
      if (r.status === 401) { setDspToken(""); throw new Error("SESSION_EXPIRED"); }
      if (!r.ok) {
        console.warn(`[DSP] ${r.status} on page ${page}`);
        return { items: [], totalElements: 0, totalPages: 0 };
      }
      const j = await r.json();
      return {
        items: j.content || [],
        totalElements: j.totalElements || 0,
        totalPages: j.totalPages || 0
      };
    } catch (e) {
      if (e.message === "SESSION_EXPIRED") throw e;
      console.warn(`[DSP] page ${page} attempt ${attempt + 1} failed:`, e.message);
      if (attempt < 2) await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
    }
  }

  return { items: [], totalElements: 0, totalPages: 0 };
}

// Субгородские административные единицы, которые не нужны как отдельные «города»
const DSP_CITY_SKIP_WORDS = ["поселен", "сельское", "сельсовет", "волость"];

function dspBuildCityCache(raw, baseCache = null) {
  const cityCache = baseCache || {};
  for (const inv of raw || []) {
    const s = mapDspInventory(inv);
    if (!s.city) continue;
    const cl = s.city.toLowerCase();
    if (DSP_CITY_SKIP_WORDS.some(w => cl.includes(w))) continue;
    if (!cityCache[s.city]) cityCache[s.city] = [];
    cityCache[s.city].push(s);
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

  for (let start = 1; start < totalPages; start += DSP_PAGE_BATCH) {
    const pages = [];
    for (let p = start; p < Math.min(start + DSP_PAGE_BATCH, totalPages); p++) pages.push(p);

    const results = await Promise.allSettled(pages.map(p => dspFetchInventoriesPage(p)));

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalLoadedSoFar += (r.value.items || []).length;
        dspBuildCityCache(r.value.items || [], cityCache);
      }
      if (r.status === "rejected" && r.reason?.message === "SESSION_EXPIRED") throw r.reason;
    }

    dspHydrateCityState(cityCache);
    setStatus(`Загружаю экраны… ${totalLoadedSoFar} из ${totalElements || "?"}`);
    await new Promise(res => setTimeout(res, DSP_BATCH_DELAY_MS));
  }

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

// ---- localStorage-кэш инвентаря ----
const DSP_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 часа (1 раз в день)

/** Ключ кэша привязан к агентству, чтобы разные пользователи не делили данные */
function getDspCacheKey() {
  const agencyId = getDspAgencyId() || "default";
  return `dsp_inv_v3_${agencyId}`;
}

function dspSaveInventoryToStorage(cityCache) {
  try {
    const total = Object.values(cityCache || {}).reduce((s, a) => s + a.length, 0);
    if (total === 0) { console.log("[DSP] skipping cache save: 0 screens"); return; }
    const payload = JSON.stringify({ ts: Date.now(), d: cityCache });
    // localStorage обычно ограничен ~5MB — пробуем только если данных немного
    if (payload.length > 4_000_000) { console.log("[DSP] cache too large for localStorage, skipping"); return; }
    localStorage.setItem(getDspCacheKey(), payload);
    console.log("[DSP] inventory saved to localStorage, ttl=24h");
  } catch (e) {
    console.log("[DSP] cache save skipped:", e.message);
  }
}

function dspLoadInventoryFromStorage() {
  try {
    const key = getDspCacheKey();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, d } = JSON.parse(raw);
    if (Date.now() - ts > DSP_CACHE_TTL) { localStorage.removeItem(key); return null; }
    const total = Object.values(d).reduce((s, a) => s + a.length, 0);
    const ageMin = Math.round((Date.now() - ts) / 60000);
    console.log(`[DSP] cache hit: ${total} screens, age=${ageMin}min, ttl=24h`);
    if (total === 0) {
      console.log("[DSP] cache has 0 screens — ignoring, will reload from API");
      localStorage.removeItem(key);
      return null;
    }
    return d;
  } catch { return null; }
}

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
  state.screensAll = [...state.screens];

  const otsByFormat = {};
  for (const s of state.screens) {
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format])
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
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

  let cityCache = dspLoadInventoryFromStorage();
  if (cityCache) {
    const total = Object.values(cityCache).reduce((s, a) => s + a.length, 0);
    console.log(`[DSP] loaded from localStorage: ${total} screens, ${Object.keys(cityCache).length} cities`);
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
  const regionToCities = state.dspRegionToCities || {};
  const regionCities = (regions || []).flatMap(r => regionToCities[r] || []);
  const missing = regionCities.filter(city => !state.dspInventoryCache[city]);
  if (missing.length && state.dspInventoryWarmupPromise) {
    setStatus(`Догружаю инвентарь для: ${regions.join(", ")}…`);
    await state.dspInventoryWarmupPromise;
  }
  const screens = regionCities.flatMap(city => state.dspInventoryCache[city] || []);
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
    // Если agencyId не сохранён (например, токен из предыдущей сессии) — подтягиваем профиль фоново
    if (!getDspAgencyId()) {
      dspFetchCurrentUserAgency().catch(() => {});
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
});
