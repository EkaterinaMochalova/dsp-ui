// DSP auth enabled by default (set false before loading this script to disable)
if (window.DSP_AUTH_ENABLED === undefined) window.DSP_AUTH_ENABLED = true;

(async function() {
  const root = document.getElementById("planner-root");
  if (!root) { console.error("[widget-init] #planner-root not found"); return; }

  function loadCSS(href) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function runScript(code) {
    const s = document.createElement("script");
    s.textContent = code;
    document.body.appendChild(s);
  }

  // 1. Inject external CSS
  loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
  loadCSS("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css");

  // 2. Inject all inline CSS from widget.html
  const style = document.createElement("style");
  style.textContent = `

#planner-widget .chart-card{
  background:#fff;
  border:1px solid #eee;
  border-radius:16px;
  padding:14px;
  margin-top:12px;
  box-shadow: 0 10px 30px rgba(15,23,42,.06);
}

#planner-widget .chart-title{
  font-weight:800;
  font-size:14px;
  color:#111827;
}

#planner-widget .bar-row{
  display:grid;
  grid-template-columns: 84px 1fr 110px;
  gap:10px;
  align-items:center;
  margin-top:10px;
}

#planner-widget .bar-lbl{
  font-size:12px;
  color:#667085;
  font-weight:700;
  white-space:nowrap;
}

#planner-widget .bar{
  height:10px;
  background:#eef2f6;
  border-radius:999px;
  overflow:hidden;
}

#planner-widget .bar > i{
  display:block;
  height:100%;
  width:0%;
  background:#2563eb;
  border-radius:999px;
}

#planner-widget .bar-val{
  font-size:12px;
  color:#111827;
  text-align:right;
  white-space:nowrap;
}


  #planner-widget.planner-root{ max-width:980px; margin:0 auto; font-family: Inter, Arial, sans-serif; }
  #planner-widget .planner-title{ margin:0 0 12px 0; }
  #planner-widget .planner-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width: 920px){ #planner-widget .planner-grid{ grid-template-columns:1fr; } }

  #planner-widget .planner-kicker{ font-weight:700; margin-bottom:6px; }
  #planner-widget .planner-sub{ font-size:13px; color:rgba(11,18,32,.62); margin-bottom:12px; }
  #planner-widget .planner-block{ margin-bottom:12px; }
  #planner-widget .planner-label{ font-weight:600; margin-bottom:8px; }
  #planner-widget .planner-note{ font-size:12px; color:rgba(11,18,32,.62); margin-top:8px; }

  /* Разделитель "Дополнительные ограничения" */
  #planner-widget .additional-filters-divider{
    display:flex; align-items:center; gap:8px;
    margin:18px 0 10px;
    font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
    color:rgba(11,18,32,.4);
  }
  #planner-widget .additional-filters-divider::before,
  #planner-widget .additional-filters-divider::after{
    content:''; flex:1; height:1px; background:rgba(11,18,32,.1);
  }

  /* Превью пула */
  #planner-widget .pool-preview-block{ background:#f8f9fb; border-radius:12px; padding:12px 14px; }
  #planner-widget .pool-preview-row{
    display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:13px;
  }
  #planner-widget .pool-preview-base{ font-weight:600; color:#0b1220; }
  #planner-widget .pool-preview-arrow{ color:rgba(11,18,32,.35); font-size:11px; }
  #planner-widget .pool-preview-filter{ color:#667085; }
  #planner-widget .pool-preview-filter b{ color:#0b1220; }
  #planner-widget .pool-preview-pct{ font-size:11px; color:#e04444; margin-left:2px; }

  #planner-widget .ux-input{ width:100%; box-sizing:border-box; }
  #planner-widget .row-2{ display:flex; gap:10px; }
  #planner-widget .row-2 > *{ flex:1; min-width:0; }

  #planner-widget .radio-row{ display:block; margin-bottom:6px; }
  #planner-widget .radio-inline{ display:flex; gap:14px; flex-wrap:wrap; }
  #planner-widget .check-row{ display:flex; gap:8px; align-items:center; margin:0; }
  #planner-widget .hint{ font-size:12px; color:rgba(11,18,32,.58); margin-top:6px; }

  #planner-widget .city-suggestions{ margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
  #planner-widget .city-selected{ margin-top:10px; }

  #planner-widget .summary-pre{
    white-space: pre-wrap;
    background: rgba(255,255,255,.55);
    border: 1px solid rgba(15,23,42,.10);
    padding: 12px;
    border-radius: 12px;
    min-height: 180px;
    margin: 0;
  }

  #planner-widget .download-row{ margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; }
  #planner-widget .planner-status{ margin-top:10px; font-size:13px; color:rgba(11,18,32,.62); }
  #planner-map.planner-map{ height:420px; width:100%; border-radius:14px; overflow:hidden; border:1px solid rgba(15,23,42,.10); }

  #planner-widget .wiz-step{ display:none; }
  #planner-widget .wiz-step.active{ display:block; }

  /* Pretty summary */
  #planner-widget .ps-wrap{ display:flex; flex-direction:column; gap:12px; }
  #planner-widget .ps-card{
    background: rgba(255,255,255,.62);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
  }
  #planner-widget .ps-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  #planner-widget .ps-title{ font-weight:800; font-size:16px; margin:0; }
  #planner-widget .ps-sub{ font-size:12px; color: rgba(11,18,32,.62); margin-top:4px; }

  #planner-widget .ps-badges{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  #planner-widget .ps-badge{
    display:inline-flex; align-items:center; gap:8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
    white-space: nowrap;
  }

  #planner-widget .ps-grid{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top:12px; }
  @media (max-width: 920px){ #planner-widget .ps-grid{ grid-template-columns:1fr; } }

  #planner-widget .ps-metric{
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.50);
    border-radius: 14px;
    padding: 12px;
  }
  #planner-widget .ps-metric .k{ font-size:12px; color: rgba(11,18,32,.62); }
  #planner-widget .ps-metric .v{ margin-top:6px; font-weight:800; font-size:16px; }

  #planner-widget .ps-region{
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.50);
    border-radius: 16px;
    padding: 12px;
  }
  #planner-widget .ps-region-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  #planner-widget .ps-region-name{ font-weight:900; font-size:15px; }
  #planner-widget .ps-region-chip{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
    white-space: nowrap;
  }
  #planner-widget .ps-formats{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  #planner-widget .ps-fmt{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
  }

  #planner-widget .ps-warn{
    margin-top:10px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(245,158,11,.25);
    background: rgba(245,158,11,.08);
    font-size: 12px;
    color: rgba(11,18,32,.72);
  }

  #planner-widget .ps-details{
    margin-top:10px;
    background: rgba(255,255,255,.45);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 16px;
    padding: 10px 12px;
  }
  #planner-widget .ps-details summary{ cursor:pointer; font-weight:700; list-style:none; }
  #planner-widget .ps-details summary::-webkit-details-marker{ display:none; }
  #planner-widget .ps-details .hint{ font-size:12px; color: rgba(11,18,32,.58); margin-top:6px; }


  .ps-wrap{display:grid;gap:12px;}
  .ps-card{
    background:#fff;border:1px solid #eee;border-radius:16px;
    padding:14px; box-shadow:0 10px 30px rgba(15,23,42,.06);
  }
  .ps-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;}
  .ps-title{font-weight:800;font-size:16px;line-height:1.2;}
  .ps-sub{color:#667085;font-size:12px;margin-top:4px;}
  .ps-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .ps-badge{font-size:12px;padding:6px 10px;border-radius:999px;background:#F2F4F7;color:#111827;}
  .ps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;}
  @media (max-width: 980px){ .ps-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
  .ps-metric{border:1px solid #eef2f6;border-radius:14px;padding:10px 12px;background:#fcfcfd;}
  .ps-metric .k{font-size:12px;color:#667085;}
  .ps-metric .v{font-size:16px;font-weight:800;margin-top:6px;color:#111827;}
  .ps-regions{display:grid;gap:10px;margin-top:12px;}
  .ps-region-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
  .ps-region-name{font-weight:800;font-size:14px;}
  .ps-chip{font-size:12px;padding:6px 10px;border-radius:999px;background:#EEF4FF;color:#1D4ED8;}
  .ps-mini{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
  .ps-mini span{font-size:12px;padding:6px 10px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF2F6;color:#111827;}
  .ps-warn{border:1px solid #FDE68A;background:#FFFBEB;color:#92400E;border-radius:14px;padding:10px 12px;font-size:12px;line-height:1.35;}
  .ps-warn b{font-weight:800;}

  /* --- Region input UI --- */
.region-field{
  position: relative;
}

#region-field #city-search{
  width: 100%;
  padding-right: 38px;
}

.region-spinner{
  position: absolute;
  right: 12px;
  top: 50%;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 50%;
  border: 2px solid rgba(17, 24, 39, 0.18);
  border-top-color: rgba(17, 24, 39, 0.65);
  animation: regionSpin .8s linear infinite;
  display: none;
  pointer-events: none;
}

.region-overlay{
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: rgba(243, 244, 246, 0.72);
  backdrop-filter: blur(2px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.region-overlay-inner{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #374151;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(229,231,235,0.9);
  padding: 10px 12px;
  border-radius: 999px;
}

.region-overlay-spinner{
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(17, 24, 39, 0.18);
  border-top-color: rgba(17, 24, 39, 0.65);
  animation: regionSpin .8s linear infinite;
}

@keyframes regionSpin{
  from{ transform: rotate(0deg); }
  to{ transform: rotate(360deg); }
}
@keyframes spin{
  from{ transform: rotate(0deg); }
  to{ transform: rotate(360deg); }
}


  #planner-widget .fmt-toggle{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 90%;
    margin: 12px 12px 12px 12px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(17, 23, 42, .14);
    background: rgba(255, 255, 255, .92);
    font-weight: 600;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 6px 18px rgba(17, 23, 42, .06);
    transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease;
  }

  #planner-widget .fmt-toggle:hover{
    background: rgba(255, 255, 255, 1);
    box-shadow: 0 10px 26px rgba(17, 23, 42, .10);
    transform: translateY(-1px);
  }

  #planner-widget .fmt-toggle:active{
    transform: translateY(0px);
    box-shadow: 0 6px 18px rgba(17, 23, 42, .06);
  }

  #planner-widget .fmt-toggle:focus{ outline: none; }
  #planner-widget .fmt-toggle:focus-visible{
    outline: 3px solid rgba(47, 98, 255, .25);
    outline-offset: 2px;
  }

  #planner-widget .fmt-tip::before,
  #planner-widget .fmt-tip::after { display: none !important; content: none !important; }

  #fmt-tooltip-portal {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  #planner-widget .owner-collapse { margin-top: 6px; }

  #planner-widget .owner-wrap.owner-collapsed{
    max-height: 128px;
    overflow: hidden;
    position: relative;
    border-radius: 16px;
  }

  #planner-widget .owner-wrap.owner-collapsed:after{
    content:"";
    position:absolute;
    left:0; right:0; bottom:0;
    height:44px;
    pointer-events:none;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
  }

  #planner-widget #owner-wrap{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 560px){
    #planner-widget #owner-wrap{ grid-template-columns: 1fr; }
  }

  .weekday-row{ display:flex; gap:8px; flex-wrap:wrap; }
  .ux-chip{ display:inline-flex; gap:8px; align-items:center; padding:8px 10px; border:1px solid rgba(15,23,42,.12); border-radius:999px; background:#fff; font-size:12px; cursor:pointer; }
  .ux-chip input{ margin:0; }

  #planner-widget .weekly-days{ display: grid; gap: 10px; margin-top: 10px; }

  #planner-widget .wd-card{
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 12px;
  }

  #planner-widget .wd-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  #planner-widget .wd-left{ display:flex; align-items:center; gap:10px; min-width: 0; }
  #planner-widget .wd-title{ font-weight: 800; font-size: 14px; white-space: nowrap; }
  #planner-widget .wd-sub{ font-size: 12px; color: rgba(11,18,32,.62); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 360px; }
  #planner-widget .wd-actions{ display:flex; gap:8px; align-items:center; }
  #planner-widget .wd-btn{ padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(17, 23, 42, .14); background: rgba(255,255,255,.92); cursor: pointer; font-weight: 600; font-size: 12px; }
  #planner-widget .wd-btn:disabled{ opacity: .5; cursor: not-allowed; }
  #planner-widget .wd-rows{ display: grid; gap: 8px; }
  #planner-widget .wd-row{ display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
  #planner-widget .wd-row .ux-input{ width: 160px; max-width: 42vw; }
  #planner-widget .wd-remove{ padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(239,68,68,.25); background: rgba(239,68,68,.06); cursor: pointer; font-weight: 700; font-size: 12px; }
  #planner-widget .wd-bars{ margin-top: 10px; display:flex; flex-direction: column; gap: 6px; }
  #planner-widget .wd-barline{ height: 10px; border-radius: 999px; background: rgba(15,23,42,.06); position: relative; overflow: hidden; }
  #planner-widget .wd-seg{ position:absolute; top:0; bottom:0; border-radius: 999px; background: rgba(47,98,255,.35); }
  #planner-widget .wd-barhint{ font-size: 12px; color: rgba(11,18,32,.62); }

  #planner-widget #owner-wrap{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
  @media (max-width: 560px){ #planner-widget #owner-wrap{ grid-template-columns: 1fr; } }

  #planner-widget .own-card{
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding: 14px 14px; border-radius: 18px;
    border: 1px solid rgba(15,23,42,.10); background: rgba(255,255,255,.70);
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
    cursor:pointer; user-select:none;
    transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease;
  }
  #planner-widget .own-card:hover{ transform: translateY(-1px); box-shadow: 0 14px 36px rgba(15,23,42,.10); background: rgba(255,255,255,.92); }
  #planner-widget .own-card:active{ transform: translateY(0px); box-shadow: 0 10px 30px rgba(15,23,42,.06); }
  #planner-widget .own-left{ min-width:0; }
  #planner-widget .own-title{ font-weight: 800; font-size: 15px; color:#111827; line-height: 1.2; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; max-width: 100%; }
  #planner-widget .own-countline{ margin-top: 6px; font-size: 13px; color:#667085; font-weight: 600; }
  #planner-widget .own-tip{ flex: 0 0 auto; width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(15,23,42,.12); background: rgba(255,255,255,.85); color: rgba(11,18,32,.72); font-weight: 800; cursor: pointer; display:flex; align-items:center; justify-content:center; box-shadow: 0 6px 18px rgba(15,23,42,.06); }
  #planner-widget .own-card.is-selected{ border-color: rgba(37,99,235,.55); box-shadow: 0 14px 40px rgba(37,99,235,.12); background: rgba(37,99,235,.06); }
  #planner-widget .own-card.is-selected .own-title{ color:#1D4ED8; }

  #planner-widget .owner-wrap.owner-collapsed{ max-height: 220px; overflow: hidden; position: relative; border-radius: 16px; }
  #planner-widget .owner-wrap.owner-collapsed:after{ content:""; position:absolute; left:0; right:0; bottom:0; height:60px; pointer-events:none; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1)); }

  #planner-widget .ps-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:nowrap; }
  #planner-widget .ps-badges{ margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; max-width: 60%; }
  #planner-widget .ps-badge{ white-space:nowrap; }

  @media (max-width: 820px){
    #planner-widget .ps-head{ flex-direction:column; flex-wrap:nowrap; }
    #planner-widget .ps-badges{ max-width:100%; justify-content:flex-start; margin-left:0; }
  }

  #planner-widget .date-error{ margin-top:8px; font-size:13px; font-weight:600; color:#DC2626; display:none; }
  #planner-widget .ux-input.is-invalid{ border-color:#DC2626 !important; box-shadow:0 0 0 3px rgba(220,38,38,.12); }

  /* ===== PANELS ===== */
  #planner-widget .ux-panel{
    background: rgba(255,255,255,.72);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
    min-width: 0;
  }

  /* ===== WIZARD CHIPS (step tabs) ===== */
  #planner-widget .wiz-steps{
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  #planner-widget .wiz-chip{
    padding: 6px 14px;
    border: 1px solid rgba(15,23,42,.14);
    border-radius: 999px;
    background: rgba(255,255,255,.85);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: rgba(11,18,32,.70);
    transition: background .12s ease, border-color .12s ease, color .12s ease;
  }
  #planner-widget .wiz-chip:hover{
    background: #fff;
    border-color: rgba(15,23,42,.22);
  }
  #planner-widget .wiz-chip.active{
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  /* ===== PROGRESS BAR ROW ===== */
  #planner-widget .wiz-progress{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  #planner-widget .wiz-progress .bar{ flex: 1; }
  #planner-widget .wiz-progress .meta{
    font-size: 12px;
    color: rgba(11,18,32,.55);
    white-space: nowrap;
    min-width: 32px;
    text-align: right;
  }

  /* ===== LIVE SUMMARY STRIP ===== */
  #planner-widget .wiz-summary{
    background: rgba(255,255,255,.55);
    border: 1px solid rgba(15,23,42,.09);
    border-radius: 12px;
    padding: 10px 14px;
    font-size: 13px;
    color: rgba(11,18,32,.58);
    margin-bottom: 16px;
    min-height: 36px;
  }

  /* ===== NAV ROW ===== */
  #planner-widget .wiz-nav{
    display: flex;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  /* ===== BUTTONS ===== */
  #planner-widget .wiz-btn{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 22px;
    border-radius: 12px;
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .14s ease, box-shadow .14s ease, transform .12s ease;
    white-space: nowrap;
    user-select: none;
  }
  #planner-widget .wiz-btn:hover{
    background: #1d4ed8;
    border-color: #1d4ed8;
    box-shadow: 0 6px 18px rgba(37,99,235,.25);
  }
  #planner-widget .wiz-btn:active{ transform: translateY(1px); }
  #planner-widget .wiz-btn.ghost{
    background: rgba(255,255,255,.92);
    border-color: rgba(15,23,42,.14);
    color: rgba(11,18,32,.80);
  }
  #planner-widget .wiz-btn.ghost:hover{
    background: #fff;
    border-color: rgba(15,23,42,.28);
    box-shadow: 0 4px 12px rgba(15,23,42,.08);
  }
  #planner-widget .wiz-btn:disabled{
    opacity: .45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* ===== RADIO LABELS ===== */
  #planner-widget .ux-radio{
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 6px;
    font-size: 14px;
  }
  #planner-widget .ux-radio input[type="radio"]{ flex-shrink: 0; }

  /* ===== BUDGET EXTRAS (НДС / commission) ===== */
  #planner-widget .budget-extra-row{
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  #planner-widget .budget-extra-row label{
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  #planner-widget .budget-extra-rate{
    display: none;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }
  #planner-widget .budget-extra-rate input{
    width: 64px;
    padding: 4px 8px;
    border: 1px solid rgba(15,23,42,.14);
    border-radius: 8px;
    font-size: 13px;
    box-sizing: border-box;
  }
  #planner-widget .budget-extra-hint{
    display: none;
    margin-top: 4px;
    font-size: 12px;
    color: #667085;
    padding: 6px 10px;
    background: rgba(37,99,235,.05);
    border: 1px solid rgba(37,99,235,.12);
    border-radius: 8px;
  }

  /* ===== FLOATING RECALC BUTTON ===== */
  #planner-recalc-float {
    position: fixed;
    right: 28px;
    z-index: 99999;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: #5B3EF5;
    color: #fff;
    border: none;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(91,62,245,.45);
    transition: top .15s, opacity .2s;
    white-space: nowrap;
  }
  #planner-recalc-float:hover { background: #4730d4; }
  #planner-recalc-float .rf-icon { font-size: 16px; line-height: 1; }
`;
  document.head.appendChild(style);

  // 3. Load external scripts sequentially
  await loadScript("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js");
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  await loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
  await loadScript("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js");
  await loadScript("https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@a9914fa/geo.js");
  await loadScript("https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@423bfde/planner.js");

  // 4. Inject HTML markup into planner-root
  root.innerHTML = `<!-- ===================== PLANNER WIDGET (CLEAN, SINGLE-SOURCE, NO DUPLICATES) ===================== -->
<div id="planner-widget" class="planner-root">
<button id="planner-recalc-float" style="display:none;" title="Пересчитать">
  <span class="rf-icon">↻</span> Пересчитать
</button>
<br><br><br><br>  <h2 class="planner-title">Расчёт размещения</h2>
  <div id="dsp-user-bar" style="display:none; font-size:12px; color:#888; margin:-8px 0 10px;"></div>
  <div class="wiz-progress" id="wiz-progress">
    <div class="bar"><i id="wiz-bar"></i></div>
    <div class="meta" id="wiz-meta">0/4</div>
  </div>
  <div class="wiz-summary" id="wiz-live-summary">Заполните шаги — тут будет краткая сводка.</div>
  <div class="planner-grid">
  <!-- Left -->
  <div class="ux-panel planner-left">
    <div class="planner-kicker">План размещения</div>
    <div class="planner-sub">Ответь на несколько вопросов — и мы соберём программу.</div>
    <div class="wiz-steps" id="wiz-steps">
      <button type="button" class="wiz-chip active" data-step="1">1. География</button>
      <button type="button" class="wiz-chip" data-step="2">2. Период</button>
      <button type="button" class="wiz-chip" data-step="3">3. Цели</button>
      <button type="button" class="wiz-chip" data-step="4">4. Настройки</button>
    </div>
    <!-- STEP 1 -->
    <div class="wiz-step active" id="wiz-step-1">
      <div class="planner-block">
        <div class="planner-label">Регион</div>
        <div class="region-field" id="region-field">
          <input id="city-search" type="text" placeholder="Загружаю список регионов…" class="ux-input" disabled autocomplete="off" />
          <span class="region-spinner" id="region-spinner" aria-hidden="true"></span>
          <div class="region-overlay" id="region-overlay">
            <div class="region-overlay-inner">
              <span class="region-overlay-spinner" aria-hidden="true"></span>
              <span>Загружаю регионы…</span>
            </div>
          </div>
        </div>
        <div id="city-suggestions" class="city-suggestions"></div>
        <div id="city-selected" class="city-selected"></div>
        <!-- City import from file -->
        <div style="margin-top:8px;">
          <label style="display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
                 border:1.5px dashed #c4b5fd; border-radius:10px; background:#faf8ff;
                 color:#5B3EF5; font-size:13px; cursor:pointer; font-weight:500;">
            ↓ Импорт городов из файла
            <input type="file" id="region-file-input" accept=".xlsx,.csv,.txt" style="display:none;">
          </label>
          <div id="region-import-status" style="margin-top:6px; font-size:12px; color:#667085; display:none;"></div>
        </div>
        <div class="planner-note">
          Под "регион" у нас попадают: крупные города (как отдельные), МО/ЛО (областью) и т.д.
        </div>
      </div>
      <div id="region-selected" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;"></div>
      <button id="regions-clear" type="button"
        style="margin-top:10px; display:none; padding:8px 12px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer;">
        Очистить регионы
      </button>
      <!-- DSP loading progress (shown only while inventory loads) -->
      <div id="dsp-load-progress" style="display:none; align-items:center; gap:10px; margin-top:12px;
           padding:10px 14px; background:#F4F1FF; border-radius:10px; font-size:13px; color:#5B3EF5;">
        <div style="width:16px; height:16px; border:2px solid #5B3EF5; border-top-color:transparent;
             border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0;"></div>
        <span id="dsp-load-status-text">Загружаю инвентарь…</span>
      </div>
      <div class="wiz-nav">
        <button type="button" class="wiz-btn" id="wiz-next-1">Дальше</button>
      </div>
    </div>
     <!-- STEP 2 -->
<div class="wiz-step" id="wiz-step-2">
  <div class="planner-block">
    <div class="planner-label">Даты</div>
    <div class="row-2">
      <input id="date-start" type="date" class="ux-input" />
      <input id="date-end" type="date" class="ux-input" />
    </div>
  </div>
  <div class="planner-block">
    <div class="planner-label">Расписание</div>
    <label class="radio-row">
      <input type="radio" name="schedule" value="all_day" checked />
      Весь день (07:00–22:00)
    </label>
    <label class="radio-row">
      <input type="radio" name="schedule" value="peak" />
      Часы пик (07:00–10:00 / 17:00–21:00)
    </label>
    <label class="radio-row">
      <input type="radio" name="schedule" value="weekly" />
      Свой график
    </label>
    <!-- Раскрывается при выборе "Свой график" -->
    <div id="weekly-wrap" style="display:none; margin-top:12px;">
      <div id="weekly-days" class="weekly-days"></div>
    </div>
  </div>
  <div class="wiz-nav">
    <button type="button" class="wiz-btn ghost" id="wiz-back-2">Назад</button>
    <button type="button" class="wiz-btn" id="wiz-next-2">Дальше</button>
  </div>
</div>
      <!-- STEP 3 -->
      <div class="wiz-step" id="wiz-step-3">
        <div class="planner-block">
          <div class="planner-label">Бюджет</div>
<div class="budget-modes">
  <label class="ux-radio">
    <input type="radio" name="budget_mode" value="fixed" checked>
    <span>Есть бюджет</span>
  </label>
<br>
  <label class="ux-radio">
    <input type="radio" name="budget_mode" value="recommendation">
    <span>Подскажите оптимальный бюджет</span>
  </label>
<br>
  <label class="ux-radio">
    <input type="radio" name="budget_mode" value="goal_ots">
    <span>Есть цель по OTS</span>
  </label>
</div>
<!-- fixed -->
<div id="budget-input-wrap" style="margin-top:10px;">
  <input id="budget-input" type="number" class="ux-input" placeholder="Введите бюджет, ₽" min="0" step="1000">
  <div class="planner-note" style="margin-top:6px;">
    Распределим сумму по выбранным регионам.
  </div>
</div>
<!-- goal_ots -->
<div id="goal-ots-wrap" style="margin-top:10px; display:none;">
  <input id="goal-ots" type="number" class="ux-input" placeholder="Введите целевой OTS" min="0" step="1000">
  <div class="planner-note" style="margin-top:6px;">
    Подберём экраны и бюджет так, чтобы получить нужный охват (если физически возможно).
  </div>
</div>
<!-- goal_reco -->
<div id="budget-reco-hint" style="margin-top:6px; color:#667085;">
  Планировщик соберёт адреску для адекватного охвата региона.
</div>

<!-- НДС + Комиссия -->
<div id="budget-extras-wrap" style="margin-top:14px;">
  <div class="budget-extra-row">
    <label>
      <input type="checkbox" id="vat-enabled">
      С НДС
    </label>
    <div class="budget-extra-rate" id="vat-rate-wrap">
      <input type="number" id="vat-rate" value="22" min="0" max="100" step="0.1">
      <span>%</span>
    </div>
  </div>
  <div class="budget-extra-hint" id="vat-display"></div>

  <div class="budget-extra-row">
    <label>
      <input type="checkbox" id="commission-enabled">
      Включая комиссию системы
    </label>
    <div class="budget-extra-rate" id="commission-rate-wrap">
      <input type="number" id="commission-rate" min="0" max="100" step="0.1" placeholder="0">
      <span>%</span>
    </div>
  </div>
  <div class="budget-extra-hint" id="commission-display"></div>
</div>

        </div>
        <div class="wiz-nav">
          <button type="button" class="wiz-btn ghost" id="wiz-back-3">Назад</button>
          <button type="button" class="wiz-btn" id="wiz-next-3">Дальше</button>
        </div>
      </div>
      <!-- STEP 4 -->
<div class="wiz-step" id="wiz-step-4">
  <!-- Форматы -->
  <div class="planner-block">
    <div class="planner-label">Форматы</div>
    <div class="fmt-toolbar" id="formats-presets">
      <button type="button" class="fmt-pill" data-preset="all">Все</button>
      <button type="button" class="fmt-pill" data-preset="max_reach">Макс. охват</button>
      <button type="button" class="fmt-pill" data-preset="street">Улицы</button>
      <button type="button" class="fmt-pill" data-preset="indoor">Indoor</button>
      <button type="button" class="fmt-pill" data-preset="clear">Очистить</button>
    </div>
    <div class="fmt-grid" id="formats-wrap"></div>
    <div style="margin-top:10px;">
      <button type="button" id="formats-toggle" class="fmt-toggle" style="display:none;">
        Показать все форматы
      </button>
    </div>
  </div>
  <!-- Стратегия подбора -->
  <div class="planner-block reach-mode-block">
    <div class="planner-label">Стратегия подбора</div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label class="ux-radio" style="align-items:flex-start;">
        <input type="radio" name="reach_mode" value="max_reach" checked style="margin-top:2px;">
        <div>
          <span>Макс. охват</span>
          <div class="planner-note" style="margin-top:2px;">Берём максимум экранов — широкий охват аудитории</div>
        </div>
      </label>
      <label class="ux-radio" style="align-items:flex-start;">
        <input type="radio" name="reach_mode" value="balanced" style="margin-top:2px;">
        <div>
          <span>Баланс</span>
          <div class="planner-note" style="margin-top:2px;">Оптимальное сочетание охвата и частоты показа</div>
        </div>
      </label>
      <label class="ux-radio" style="align-items:flex-start;">
        <input type="radio" name="reach_mode" value="max_freq" style="margin-top:2px;">
        <div>
          <span>Макс. частота</span>
          <div class="planner-note" style="margin-top:2px;">Концентрируем бюджет на меньшем числе экранов для большей частоты</div>
        </div>
      </label>
    </div>
  </div>
  <!-- Режим ставки -->
  <div class="planner-block">
    <div class="planner-label">Режим ставки</div>
    <div class="radio-row" style="gap:14px;">
      <label class="ux-radio"><input type="radio" name="bid_mode" id="bid-mode-recommended" value="recommended" checked><span>Рекомендованная</span></label>
      <label class="ux-radio"><input type="radio" name="bid_mode" id="bid-mode-min" value="min"><span>Минимальная</span></label>
    </div>
    <div class="planner-note" style="margin-top:8px;" id="bid-mode-hint-recommended">Оптимальная ставка для стабильного открута — предсказуемый результат.</div>
    <div class="planner-note" style="margin-top:8px; display:none;" id="bid-mode-hint-min">Минимальная цена из инвентаря. Больше выходов, но без гарантии полного открута.</div>
  </div>
  <!-- Кол-во конструкций -->
  <div class="planner-block" style="margin-top:4px;">
    <label class="check-row"><input type="checkbox" id="constructions-enabled"> Задать кол-во конструкций</label>
    <div id="constructions-count-wrap" style="display:none; margin-top:8px;">
      <input type="number" id="constructions-count" min="1" step="1" placeholder="Количество конструкций" class="ux-input">
      <div style="margin-top:12px;">
        <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:#0b1220;">
          Выходов в час на экран: <span id="constructions-ppm-val" style="color:#5b3ef5;">10</span>
        </div>
        <input type="range" id="constructions-ppm" min="1" max="60" value="10" style="width:100%; accent-color:#5b3ef5;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
          <span>1 / час</span><span>60 / час</span>
        </div>
      </div>
    </div>
  </div>
  <!-- Зона на карте (перед "Как собираем") -->
  <div class="planner-block">
    <div class="planner-label">Зона на карте</div>
    <div id="poly-badge" style="display:none; align-items:center; gap:8px; margin-bottom:8px;
         padding:8px 12px; background:#EDE9FD; border-radius:8px; font-size:13px; color:#3a2bb5;">
      <span>📍</span>
      <span id="poly-badge-text"></span>
      <button id="poly-clear-btn" type="button" style="margin-left:auto; background:none; border:none;
              color:#5B3EF5; cursor:pointer; font-size:12px; text-decoration:underline; padding:0;">
        Очистить зону
      </button>
    </div>
    <button id="poly-draw-btn" type="button" class="wiz-btn ghost">🗺 Нарисовать зону</button>
    <div class="planner-note" style="margin-top:6px;">
      Нарисуйте полигон — в расчёт попадут только экраны внутри зоны.
    </div>
  </div>
  <!-- Как собираем программу -->
  <div class="planner-block">
    <div class="planner-label">Как собираем программу</div>
    <select id="selection-mode" class="ux-input">
      <option value="city_even">Равномерно по региону</option>
      <option value="poi">Рядом с POI</option>
      <option value="near_address">Рядом с адресом</option>
      <option value="route">Вдоль маршрута</option>
    </select>
    <div id="selection-extra" style="margin-top:10px;"></div>
  </div>
  <!-- ===== ПРЕВЬЮ ПУЛА ===== -->
  <div class="planner-block pool-preview-block" id="pool-preview-block">
    <div class="planner-label">Доступный инвентарь</div>
    <div id="pool-preview-content" class="planner-note" style="color:#667085;">
      Укажите регионы, чтобы увидеть объём доступного инвентаря.
    </div>
  </div>
  <!-- Разделитель -->
  <div class="additional-filters-divider">
    <span>Дополнительные ограничения</span>
  </div>
  <!-- Операторы -->
  <div class="planner-block">
    <div class="planner-label">Операторы</div>
    <input type="text" id="owner-search" placeholder="Поиск оператора…" class="ux-input"
           style="margin-bottom:10px; width:100%;">
    <div style="display:flex; gap:14px; align-items:center; margin-bottom:10px;">
      <button type="button" id="owner-all" class="wiz-btn ghost">Все</button>
      <button type="button" id="owner-clear" class="wiz-btn ghost">Очистить</button>
      <div style="margin-left:auto; font-size:12px; color:#667085;">Выбрано: <span id="owners-count">—</span></div>
    </div>
    <div id="owner-wrap" class="owner-wrap owner-collapsed"></div>
    <button type="button" id="owner-toggle" class="fmt-toggle">Показать всех операторов</button>
    <div class="planner-note" style="margin-top:6px;">Можно выбрать конкретных операторов или оставить всех доступных.</div>
  </div>
  <!-- GRP -->
  <div class="planner-block">
    <div class="planner-label">GRP</div>
    <label class="check-row"><input id="grp-enabled" type="checkbox" /> Фильтровать по GRP (0–9.98)</label>
    <div id="grp-wrap" style="display:none; margin-top:10px;">
      <div class="row-2">
        <input id="grp-min" type="number" step="0.01" min="0" max="9.98" value="0" class="ux-input" />
        <input id="grp-max" type="number" step="0.01" min="0" max="9.98" value="9.98" class="ux-input" />
      </div>
      <div class="planner-note" style="margin-top:6px;">⚠️ Не все экраны передают GRP. При включении фильтра будут предложены только экраны с заполненным GRP.</div>
    </div>
  </div>
  <button id="calc-btn" class="ux-primary" disabled>Рассчитать</button>
  <div id="calc-blocked-hint" style="display:none; margin-top:8px; font-size:12px; color:#e84444; padding:6px 10px; background:#fff5f5; border-radius:8px;"></div>
  <div id="status" class="planner-status"></div>
  <div class="wiz-nav" style="margin-top:12px;">
    <button type="button" class="wiz-btn ghost" id="wiz-back-4">Назад</button>
  </div>
</div>
  </div>
    <!-- Right -->
    <div class="ux-panel planner-right">
      <div class="planner-kicker" style="margin-bottom:10px;">Сводка</div>
      <!-- raw summary from planner.js (оставляем как источник истины) -->
<pre id="summary" class="summary-pre"></pre>
<!-- КРАСИВАЯ СВОДКА (карточки) -->
<div id="pretty-summary" style="margin-top:12px;"></div>
<!-- CHARTS -->
<div id="charts" style="margin-top:12px;"></div>
<div class="download-row">
  <button id="download-csv" class="wiz-btn">Скачать GIDы</button>
  <button id="download-plan-xlsx" class="wiz-btn ghost" disabled>Скачать план</button>
  <button id="download-poi-csv" class="wiz-btn ghost" disabled>Скачать POI (CSV)</button>
  <button id="download-poi-xlsx" class="wiz-btn ghost" disabled>Скачать POI (XLSX)</button>
</div>
<div id="poi-results" style="margin-top:12px;"></div>
<!-- это твоя таблица "первые 10 экранов" — оставляем -->
<div id="results" style="margin-top:14px;"></div>
<div id="img-carousel" style="margin-top:16px;"></div>
<div id="planner-map" class="planner-map" style="display:none; margin-top:14px;"></div>
    </div>
  </div>
    </div>
<!-- ===================== POLYGON DRAW MODAL ===================== -->
<div id="poly-modal" style="
  display:none; position:fixed; inset:0; z-index:10000;
  background:rgba(11,18,32,0.72); backdrop-filter:blur(4px);
  align-items:center; justify-content:center; padding:16px;">
  <div style="
    background:#fff; border-radius:20px; overflow:hidden;
    width:100%; max-width:960px; height:90vh;
    display:flex; flex-direction:column;
    box-shadow:0 24px 80px rgba(11,18,32,0.35);">
    <!-- Header -->
    <div style="
      padding:16px 20px; border-bottom:1px solid #eee;
      display:flex; align-items:center; gap:12px; flex-shrink:0;">
      <div style="font-weight:700; font-size:16px; color:#0B1220;">🗺 Нарисовать зону</div>
      <div id="poly-modal-count" style="
        font-size:13px; color:#5B3EF5; font-weight:600;
        background:#EDE9FD; padding:3px 10px; border-radius:20px; display:none;">
      </div>
      <div style="margin-left:auto; display:flex; gap:8px;">
        <button id="poly-modal-reset" type="button" class="wiz-btn ghost" style="display:none;">
          Перерисовать
        </button>
        <button id="poly-modal-cancel" type="button" class="wiz-btn ghost">Отмена</button>
        <button id="poly-modal-confirm" type="button" class="ux-primary" disabled>Применить</button>
      </div>
    </div>
    <!-- Hint bar -->
    <div id="poly-hint" style="
      padding:8px 20px; font-size:12px; color:#667085;
      background:#F9FAFB; border-bottom:1px solid #f0f0f0; flex-shrink:0;">
      Кликайте на карту, чтобы добавлять точки полигона. Замкните его — кликните на первую точку или нажмите «Завершить».
    </div>
    <!-- Map -->
    <div style="flex:1; position:relative; min-height:0;">
      <div id="poly-map" style="height:100%; width:100%;"></div>
      <!-- Finish button (floating) -->
      <button id="poly-finish-btn" type="button" style="
        display:none; position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
        background:#5B3EF5; color:#fff; border:none; border-radius:999px;
        padding:10px 24px; font-size:14px; font-weight:600; cursor:pointer;
        box-shadow:0 4px 20px rgba(91,62,245,0.4); z-index:500;">
        ✓ Завершить полигон
      </button>
    </div>
  </div>
</div>
<!-- ===================== LIBS ===================== -->
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin=""
/>
<link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css"/>
<!-- ===================== STRUCTURE CSS ===================== -->
<!-- ===================== BOOT (PLANNER) ===================== -->
<!-- ===================== HELPERS (REGIONS) ===================== -->
<!-- ===================== WIZARD NAV ===================== -->
<!-- ===================== LIVE SUMMARY + PROGRESS (FIXED STEP ORDER) ===================== -->
<!-- ===================== POLYGON ZONE ===================== -->
<!-- ===================== OWNERS ===================== -->
<!-- ===================== PRETTY SUMMARY (SINGLE IMPLEMENTATION, NO BROKEN PARSERS) ===================== -->
<!-- ===================== BID MODE HINT TOGGLE ===================== -->
<!-- ===================== POOL PREVIEW ===================== -->`;

  // 5. Run all inline script blocks in order
  // Script block 1
  runScript(`
(function(){
  function kick(){
    if (!window.PLANNER) { console.warn("[kick] PLANNER missing"); return; }

    if (typeof window.PLANNER.bootPlanner === "function") {
      console.log("[kick] bootPlanner()");
      window.PLANNER.bootPlanner();
      return;
    }
    if (typeof window.PLANNER.startPlanner === "function") {
      console.log("[kick] startPlanner()");
      window.PLANNER.startPlanner();
      return;
    }
    console.warn("[kick] no bootPlanner/startPlanner in PLANNER", window.PLANNER);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(kick, 0));
  } else {
    setTimeout(kick, 0);
  }
})();
`);

  // Script block 2
  runScript(`
  console.log("after include:", "GeoUtils?", !!window.GeoUtils, "Papa?", !!window.Papa, "XLSX?", !!window.XLSX);
`);

  // Script block 3
  runScript(`
(function(){
  window.PLANNER_UI = window.PLANNER_UI || {};

  window.PLANNER_UI.getSelectedRegionsArr = function(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    if(Array.isArray(st.selectedRegions) && st.selectedRegions.length) return st.selectedRegions;
    if(st.selectedRegion) return [st.selectedRegion];
    return [];
  };

  window.PLANNER_UI.getSelectedRegionsLabel = function(){
    const a = window.PLANNER_UI.getSelectedRegionsArr();
    return a.length ? a.join(", ") : null;
  };
})();
`);

  // Script block 4
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function setStep(step){
    document.querySelectorAll("#planner-widget .wiz-step").forEach(s => s.classList.remove("active"));
    el("wiz-step-" + step)?.classList.add("active");

    document.querySelectorAll("#planner-widget .wiz-chip").forEach(c => c.classList.remove("active"));
    document.querySelector('#planner-widget .wiz-chip[data-step="'+ step +'"]')?.classList.add("active");

    el("planner-widget")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function hasDates(){
    const s = el("date-start")?.value;
    const e = el("date-end")?.value;
    return !!(s && e);
  }

  document.querySelectorAll("#planner-widget .wiz-chip").forEach(chip => {
    chip.addEventListener("click", () => setStep(Number(chip.dataset.step || 1)));
  });

  function updateNext1Btn(){
    const btn = el("wiz-next-1");
    if(!btn) return;
    const loading = window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone;
    btn.textContent = loading ? "Загружаю экраны…" : "Дальше";
    btn.style.opacity = loading ? "0.6" : "";
    btn.style.cursor  = loading ? "default" : "";
  }
  window.addEventListener("planner:screens-ready", updateNext1Btn);
  setInterval(updateNext1Btn, 1000);

  el("wiz-next-1")?.addEventListener("click", () => {
    const regions = window.PLANNER_UI.getSelectedRegionsArr();
    if(!regions.length) return alert("Выберите регион, чтобы продолжить.");
    if(window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone){
      return alert("Инвентарь ещё загружается, подождите немного.");
    }
    setStep(2);
  });

  el("wiz-next-2")?.addEventListener("click", () => {
  if(!hasDates()) return alert("Выберите даты начала и окончания.");

  // weekly validation
  if(window.PLANNER_UI?.validateStep2Schedule && !window.PLANNER_UI.validateStep2Schedule()){
    return alert("Проверьте рваный график: включите хотя бы один день и задайте корректные интервалы времени.");
  }

  setStep(3);
});

  el("wiz-next-3")?.addEventListener("click", () => setStep(4));

  el("wiz-back-2")?.addEventListener("click", () => setStep(1));
  el("wiz-back-3")?.addEventListener("click", () => setStep(2));
  el("wiz-back-4")?.addEventListener("click", () => setStep(3));

  setStep(1);
})();
`);

  // Script block 5
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function getBudgetMode(){
    return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
  }
  function getScheduleType(){
  // если включен рваный график — считаем это главным режимом расписания
  const weeklyOn = !!document.getElementById("weekdays-enabled")?.checked;
  if(weeklyOn) return "weekly";
  return document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
}
  function getDates(){
    return { start: el("date-start")?.value || null, end: el("date-end")?.value || null };
  }

  function getFormatsSummary(){
    const auto = !!el("formats-auto")?.checked;
    if(auto) return "рекомендация";
    const set = window.PLANNER?.state?.selectedFormats;
    const arr = set ? Array.from(set) : [];
    return arr.length ? arr.join(", ") : "не выбраны";
  }

  function getScheduleSummary(){
    const t = getScheduleType();
    if(t === "all_day") return "Весь день (07:00–22:00)";
    if(t === "peak") return "Часы пик (07:00–10:00 / 17:00–21:00)";
    if(t === "weekly") return "Рваный график (по дням недели)";
    if(t === "custom"){
      const f = el("time-from")?.value || "07:00";
      const to = el("time-to")?.value || "22:00";
      return \`Своё время (\${f}–\${to})\`;
    }
    return "—";
  }

  function getBudgetSummary(){
    const mode = getBudgetMode();

    if(mode === "recommendation") return "нужна рекомендация";

    if(mode === "goal_ots"){
      const g = Number(el("goal-ots")?.value || 0);
      return g > 0 ? (Math.floor(g).toLocaleString("ru-RU") + " OTS") : "не задан";
    }

    // fixed
    const v = Number(el("budget-input")?.value || 0);
    return v > 0 ? (Math.floor(v).toLocaleString("ru-RU") + " ₽") : "не задан";
  }

  function getSelectionSummary(){
    const m = el("selection-mode")?.value || "city_even";
    const map = {
      city_even: "Равномерно по региону",
      near_address: "Рядом с адресом",
      poi: "Рядом с POI",
      route: "Вдоль маршрута"
    };
    return map[m] || m;
  }

  function calcCompletion(){
    const regionsLabel = window.PLANNER_UI?.getSelectedRegionsLabel?.() || null;
    const dates = getDates();

    const formatsAuto = !!el("formats-auto")?.checked;
    const formatsSet = window.PLANNER?.state?.selectedFormats;
    const formatsOk = formatsAuto || (formatsSet && formatsSet.size > 0);

    const budgetMode = getBudgetMode();
    const budgetVal = Number(el("budget-input")?.value || 0);
    const goalVal   = Number(el("goal-ots")?.value || 0);

    const budgetOk =
      (budgetMode === "recommendation") ||
      (budgetMode === "fixed"    && budgetVal > 0) ||
      (budgetMode === "goal_ots" && goalVal > 0);

    const step1 = !!regionsLabel;
    const step2 = !!(dates.start && dates.end);
    const step3 = !!budgetOk;
    const step4 = !!formatsOk;

    const done = [step1, step2, step3, step4].filter(Boolean).length;
    return { done, regionsLabel, dates };
  }

  function syncCustomTime(){
    const t = getScheduleType();
    const w = el("weekly-wrap");
    if(w){
      const show = (t === "weekly");
      w.style.display = show ? "block" : "none";
      if(show && typeof window.PLANNER_UI?.renderWeeklyUI === "function"){
        window.PLANNER_UI.renderWeeklyUI();
      }
    }
  }

  function syncGrp(){
    const wrap = el("grp-wrap");
    const on = !!el("grp-enabled")?.checked;
    if(wrap) wrap.style.display = on ? "block" : "none";
  }

  function renderProgress(){
    const p = calcCompletion();
    const pct = Math.round((p.done / 4) * 100);

    const bar = el("wiz-bar");
    const meta = el("wiz-meta");
    if(bar) bar.style.width = pct + "%";
    if(meta) meta.textContent = \`\${p.done}/4\`;

    const box = el("wiz-live-summary");
    if(box){
      const formats = getFormatsSummary();
      const schedule = getScheduleSummary();
      const budget = getBudgetSummary();
      const selection = getSelectionSummary();

      box.innerHTML = \`
        <div class="wiz-inline-row">
          <div><b>Регион:</b> \${p.regionsLabel || "—"}</div>
          <div><b>Даты:</b> \${(p.dates.start && p.dates.end) ? \`\${p.dates.start} → \${p.dates.end}\` : "—"}</div>
        </div>
        <div class="wiz-inline-row" style="margin-top:6px;">
          <div><b>Бюджет:</b> \${budget}</div>
          <div><b>Расписание:</b> \${schedule}</div>
        </div>
        <div class="wiz-inline-row" style="margin-top:6px;">
          <div><b>Форматы:</b> \${formats}</div>
          <div><b>Подбор:</b> \${selection}</div>
        </div>
        <div class="wiz-hint">
          \${p.done === 4 ? "Можно нажимать «Рассчитать»." : "Заполните оставшиеся шаги — и кнопка «Рассчитать» станет активной."}
        </div>
      \`;
    }

    const calcBtn = el("calc-btn");
    const hint    = el("calc-blocked-hint");
    if(calcBtn){
      const blocked = (p.done !== 4);
      calcBtn.disabled = blocked;
      calcBtn.style.opacity = blocked ? ".55" : "1";

      if(hint){
        if(blocked){
          const reasons = [];
          const st = window.PLANNER?.state;
          const regions = Array.isArray(st?.selectedRegions) ? st.selectedRegions : [];
          if(!regions.length) reasons.push("не выбран регион");
          if(!p.dates.start || !p.dates.end) reasons.push("не указаны даты");
          const mode = getBudgetMode();
          const bval = mode === "goal_ots" ? el("goal-ots")?.value : el("budget-input")?.value;
          if(!bval || Number(bval) <= 0) reasons.push("не задан бюджет");
          if(window.DSP_AUTH_ENABLED && !st?.dspInventoryWarmupDone)
            reasons.push("инвентарь ещё загружается");
          hint.textContent = reasons.length ? "Что блокирует: " + reasons.join(", ") : "";
          hint.style.display = reasons.length ? "block" : "none";
        } else {
          hint.style.display = "none";
        }
      }
    }
  }

  // делаем доступным другим скриптам (formats/и т.п.)
  window.renderProgress = renderProgress;

  function bindLive(){
    ["date-start","date-end","budget-input","goal-ots","formats-auto","selection-mode","time-from","time-to","grp-enabled","grp-min","grp-max"]
      .forEach(id => {
        el(id)?.addEventListener("input", renderProgress);
        el(id)?.addEventListener("change", renderProgress);
      });

    document.querySelectorAll('input[name="budget_mode"]').forEach(r => r.addEventListener("change", renderProgress));
    document.querySelectorAll('input[name="schedule"]').forEach(r => r.addEventListener("change", () => {
      syncCustomTime();
      renderProgress();
    }));
    el("grp-enabled")?.addEventListener("change", () => { syncGrp(); renderProgress(); });

    // poll planner state changes (regions/formats)
    let lastSig = "";
    setInterval(() => {
      const st = window.PLANNER?.state;
      const regions = (Array.isArray(st?.selectedRegions) ? st.selectedRegions : (st?.selectedRegion ? [st.selectedRegion] : []));
      const set = st?.selectedFormats;
      const fmt = set ? Array.from(set).sort().join("|") : "";

      const mode = getBudgetMode();
      const bval = (mode === "goal_ots")
        ? (el("goal-ots")?.value || "")
        : (el("budget-input")?.value || "");

      const sig = regions.slice().sort().join("||") + "##" + fmt + "##" + mode + "##" + bval + "##" + getScheduleType();
      if(sig !== lastSig){
        lastSig = sig;
        renderProgress();
      }
    }, 500);

    syncCustomTime();
    syncGrp();
    renderProgress();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindLive);
  else bindLive();
})();
`);

  // Script block 6
  runScript(`
/* Loading progress indicator in Step 1 */
(function(){
  function el(id){ return document.getElementById(id); }

  function updateLoadingProgress(){
    const bar  = el("dsp-load-progress");
    if(!bar) return;
    const done = window.PLANNER?.state?.dspInventoryWarmupDone;
    const statusText = el("dsp-load-status-text");
    if(done){
      bar.style.display = "none";
    } else if(window.DSP_AUTH_ENABLED){
      bar.style.display = "flex";
      const total   = window.PLANNER?.state?.screensAll?.length || 0;
      if(statusText) statusText.textContent = total > 0
        ? \`Загружаю инвентарь… \${total.toLocaleString("ru-RU")} экранов\`
        : "Загружаю инвентарь…";
    } else {
      bar.style.display = "none";
    }
  }

  window.addEventListener("planner:screens-ready", updateLoadingProgress);
  setInterval(updateLoadingProgress, 800);

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateLoadingProgress);
  else updateLoadingProgress();
})();
`);

  // Script block 7
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function presetFormats(preset, allFormats){
    const A = new Set(allFormats);
    const STREET = new Set(["BILLBOARD","CITY_BOARD","CITY_FORMAT","MEDIAFACADE","SUPERSITE"]);
    const INDOOR = new Set(["OTHER","PVZ_SCREEN","METRO_LIGHTBOX","SKY_DIGITAL","CITY_FORMAT_RC","CITY_FORMAT_RD","CITY_FORMAT_WD"]);

    if(preset === "all") return A;
    if(preset === "clear") return new Set();
    if(preset === "street") return new Set([...A].filter(x => STREET.has(x)));
    if(preset === "indoor") return new Set([...A].filter(x => INDOOR.has(x)));
    if(preset === "max_reach"){
      const BIG = new Set(["SUPERSITE","MEDIAFACADE","BILLBOARD","CITY_BOARD","CITY_FORMAT"]);
      return new Set([...A].filter(x => BIG.has(x) || STREET.has(x)));
    }
    return new Set();
  }

  function ensureState(){
    const st = window.PLANNER?.state;
    if(!st) return null;
    if(!st.selectedFormats) st.selectedFormats = new Set();
    if(!Array.isArray(st.formatsAll)) st.formatsAll = [];
    window.PLANNER.ui = window.PLANNER.ui || {};
    if(typeof window.PLANNER.ui.formatsExpanded !== "boolean") window.PLANNER.ui.formatsExpanded = false;
    return st;
  }

  function getSelectedRegionsNow(){
    const st = window.PLANNER?.state;
    const arr = Array.isArray(st?.selectedRegions) ? st.selectedRegions : (st?.selectedRegion ? [st.selectedRegion] : []);
    return (arr || []).map(x => String(x || "").trim()).filter(Boolean);
  }

  function renderFormatsCards(){
    const st = ensureState();
    if(!st) return;

    const wrap = el("formats-wrap");
    if(!wrap) return;

    const toggleBtn = el("formats-toggle");
    const isAuto = !!el("formats-auto")?.checked;

    const regions = getSelectedRegionsNow();

    const allScreens = Array.isArray(st.screensAll) ? st.screensAll
                    : (Array.isArray(st.screens) ? st.screens : []);

    let pool = allScreens;
    if(regions.length){
      const rset = new Set(regions);
      pool = allScreens.filter(s => rset.has(String(s.region || "").trim()));
    }

    const counts = {};
    for(const s of pool){
      const f = String(s.format || "").trim();
      if(!f) continue;
      counts[f] = (counts[f] || 0) + 1;
    }

    const formatsAll = (Array.isArray(st.formatsAll) && st.formatsAll.length)
      ? st.formatsAll.map(x => String(x || "").trim()).filter(Boolean)
      : Object.keys(counts);

    const items = formatsAll.map(fmt => {
      const meta = window.FORMAT_LABELS?.[fmt] || window.PLANNER?.FORMAT_LABELS?.[fmt];
      return {
        fmt,
        count: counts[fmt] || 0,
        label: meta?.label || fmt,
        desc: meta?.desc || ""
      };
    }).sort((a,b)=>b.count-a.count);

    const COLLAPSE_LIMIT = 6;
    const expanded = !!window.PLANNER.ui.formatsExpanded;
    const visible = expanded ? items : items.slice(0, COLLAPSE_LIMIT);

    wrap.innerHTML = "";
    visible.forEach(({ fmt, count, label, desc }) => {
      const card = document.createElement("div");
      card.className = "fmt-card";

      card.innerHTML = \`
        <div class="fmt-left">
          <div class="fmt-title">\${escapeHtml(label)}</div>
          <div class="fmt-countline">\${count.toLocaleString("ru-RU")} экранов</div>
        </div>
        <button type="button"
          class="fmt-tip"
          data-title="\${escapeHtml(label)}"
          data-code="\${escapeHtml(fmt)}"
          data-desc="\${escapeHtml(desc)}"
          aria-label="Описание формата"
        >i</button>
      \`;

      const selected = !isAuto && st.selectedFormats?.has?.(fmt);
      if(selected) card.classList.add("is-selected");

      card.addEventListener("click", (e) => {
        if(e.target.closest(".fmt-tip")) return;
        if(isAuto) return;

        if(st.selectedFormats.has(fmt)) st.selectedFormats.delete(fmt);
        else st.selectedFormats.add(fmt);

        renderFormatsCards();
        if(typeof window.renderProgress === "function") window.renderProgress();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });

      wrap.appendChild(card);
    });

    if(toggleBtn){
      const needToggle = items.length > COLLAPSE_LIMIT;
      toggleBtn.style.display = needToggle ? "inline-flex" : "none";
      toggleBtn.textContent = expanded ? "Свернуть форматы" : "Показать все форматы";
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        window.PLANNER.ui.formatsExpanded = !window.PLANNER.ui.formatsExpanded;
        renderFormatsCards();
      };
    }
  }

  window.renderFormatsCards = renderFormatsCards;

  function bindFormatPresets(){
    const st = ensureState();
    if(!st) return;

    const box = el("formats-presets");
    if(!box) return;

    box.querySelectorAll("button[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        if(!!el("formats-auto")?.checked) return;
        const preset = btn.dataset.preset;
        const next = presetFormats(preset, st.formatsAll || []);
        st.selectedFormats = new Set(next);
        renderFormatsCards();
        if(typeof window.renderProgress === "function") window.renderProgress();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
    });
  }

  function bindFormatsAuto(){
    const st = ensureState();
    if(!st) return;

    const auto = el("formats-auto");
    if(!auto) return;

    auto.addEventListener("change", () => {
      if(auto.checked) st.selectedFormats.clear();
      renderFormatsCards();
      if(typeof window.renderProgress === "function") window.renderProgress();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
    });
  }

  function init(){
    bindFormatPresets();
    bindFormatsAuto();

    window.addEventListener("planner:screens-ready", () => renderFormatsCards());
    setTimeout(() => renderFormatsCards(), 600);

    let lastRegionsSig = "";
    setInterval(() => {
      const sig = (window.PLANNER_UI?.getSelectedRegionsArr?.() || []).slice().sort().join("||");
      if(sig !== lastRegionsSig){
        lastRegionsSig = sig;
        renderFormatsCards();
      }
    }, 500);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 8
  runScript(`
(function(){
  const PAD = 12;
  let tt = null;
  let lastTip = null;

  function esc(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ensurePortal(){
    if(tt) return tt;
    tt = document.createElement("div");
    tt.id = "fmt-tooltip-portal";
    tt.style.cssText = \`
      position: fixed;
      top: -9999px;
      left: -9999px;
      z-index: 2147483647;
      max-width: 320px;
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(15,23,42,.12);
      background: rgba(255,255,255,.95);
      box-shadow: 0 16px 46px rgba(15,23,42,.18);
      font-size: 12px;
      color: rgba(11,18,32,.86);
      pointer-events: none;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity .12s ease, transform .12s ease;
    \`;
    document.body.appendChild(tt);
    return tt;
  }

  function setContent(tip){
    const title = tip.dataset.title || "";
    const code  = tip.dataset.code || "";
    const desc  = tip.dataset.desc || "";

    tt.innerHTML = \`
      <div style="font-weight:900; font-size:13px;">\${esc(title)}</div>
      \${desc ? \`<div style="margin-top:6px; color: rgba(11,18,32,.72); line-height:1.35;">\${esc(desc)}</div>\` : ""}
      \${code ? \`<div style="margin-top:8px; color: rgba(11,18,32,.55);">Код: <b>\${esc(code)}</b></div>\` : ""}
    \`;
  }

  function place(tip){
    const r = tip.getBoundingClientRect();
    tt.style.top = "-9999px";
    tt.style.left = "-9999px";
    tt.style.opacity = "0";
    tt.style.transform = "translateY(2px)";

    tt.style.opacity = "0";
    tt.style.pointerEvents = "none";
    tt.style.top = "0px";
    tt.style.left = "0px";

    const rect = tt.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const vw = window.innerWidth, vh = window.innerHeight;

    const candidates = [
      { left: r.right + 10, top: r.top + r.height/2 - h/2 },
      { left: r.left - w - 10, top: r.top + r.height/2 - h/2 },
      { left: r.left + r.width/2 - w/2, top: r.bottom + 10 },
      { left: r.left + r.width/2 - w/2, top: r.top - h - 10 },
    ];

    function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

    let c = candidates.find(c => (
      c.left >= PAD && c.top >= PAD && c.left + w <= vw - PAD && c.top + h <= vh - PAD
    )) || candidates[0];

    c.left = clamp(c.left, PAD, vw - w - PAD);
    c.top  = clamp(c.top,  PAD, vh - h - PAD);

    tt.style.left = c.left + "px";
    tt.style.top  = c.top  + "px";
    tt.style.opacity = "1";
    tt.style.transform = "translateY(0px)";
  }

  function show(tip){
    ensurePortal();
    setContent(tip);
    lastTip = tip;
    place(tip);
  }

  function hide(){
    if(!tt) return;
    tt.style.opacity = "0";
    tt.style.transform = "translateY(2px)";
    tt.style.top = "-9999px";
    tt.style.left = "-9999px";
    lastTip = null;
  }

  document.addEventListener("mouseover", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    const canHover = window.matchMedia && window.matchMedia("(hover:hover)").matches;
    if(!canHover) return;
    show(tip);
  });

  document.addEventListener("mouseout", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    const canHover = window.matchMedia && window.matchMedia("(hover:hover)").matches;
    if(!canHover) return;
    hide();
  });

  document.addEventListener("click", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    e.preventDefault();
    e.stopPropagation();
    if(lastTip === tip) hide();
    else show(tip);
  });

  document.addEventListener("keydown", (e) => { if(e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if(lastTip) place(lastTip); }, true);
  window.addEventListener("resize", () => { if(lastTip) place(lastTip); }, true);
})();
`);

  // Script block 9
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  let allowed = false;
  let lastItems = [];

  function getOwner(s){ return (s?.owner ?? s?.OWNER ?? s?.operator ?? s?.vendor ?? s?.network ?? "").toString().trim(); }
  function getAddr(s){ return (s?.address ?? s?.addr ?? s?.location ?? s?.place ?? "").toString().trim(); }
  function getGid(s){ return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim(); }
  function getImg(s){ return (s?.image_url ?? s?.img_url ?? s?.image ?? s?.photo ?? "").toString().trim(); }
  function getRegion(s){ return (s?.region ?? s?.Region ?? s?.city ?? s?.CITY ?? "").toString().trim(); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function openLightbox(items, startIdx){
    let idx = startIdx;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:20px;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(980px, 100%); background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.25);";

    function close(){
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }

    function onKey(e){
      if(e.key === "Escape") close();
      if(e.key === "ArrowLeft"){ idx = (idx - 1 + items.length) % items.length; render(); }
      if(e.key === "ArrowRight"){ idx = (idx + 1) % items.length; render(); }
    }

    function render(){
      const s = items[idx];
      const url = getImg(s);

      modal.innerHTML = \`
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border-bottom:1px solid #eee;">
          <div style="font-weight:800;">\${escapeHtml(getGid(s) || "Экран")}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" id="lb-prev" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">←</button>
            <button type="button" id="lb-next" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">→</button>
            <button type="button" id="lb-close" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">✕</button>
          </div>
        </div>
        <div style="background:#111; height:min(64vh, 520px); display:flex; align-items:center; justify-content:center;">
          <img src="\${escapeHtml(url)}" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">
        </div>
        <div style="padding:12px 14px;">
          <div style="font-size:13px;"><b>Оператор:</b> \${escapeHtml(getOwner(s) || "—")}</div>
          <div style="font-size:13px; margin-top:6px; color:#444;"><b>Адрес:</b> \${escapeHtml(getAddr(s) || "—")}</div>
          <div style="font-size:12px; margin-top:8px; color:#777;">\${idx+1}/\${items.length}</div>
        </div>
      \`;

      modal.querySelector("#lb-prev").onclick = () => { idx = (idx - 1 + items.length) % items.length; render(); };
      modal.querySelector("#lb-next").onclick = () => { idx = (idx + 1) % items.length; render(); };
      modal.querySelector("#lb-close").onclick = close;
    }

    overlay.addEventListener("click", (e) => { if(e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    render();
  }

  function groupByRegion(items){
    const map = new Map();
    for(const s of items){
      const r = getRegion(s) || "—";
      if(!map.has(r)) map.set(r, []);
      map.get(r).push(s);
    }
    return map;
  }

  function getSelectedRegionsFromState(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    if(Array.isArray(st.selectedRegions) && st.selectedRegions.length) return st.selectedRegions;
    if(st.selectedRegion) return [st.selectedRegion];
    return [];
  }

  function renderPerRegion(items){
    const box = el("img-carousel");
    if(!box) return;

    if(!allowed){
      box.innerHTML = "";
      box.style.display = "none";
      return;
    }

    const arrAll = (Array.isArray(items) ? items : []).filter(s => !!getImg(s));
    if(arrAll.length === 0){
      box.innerHTML = \`
        <div style="font-weight:700; margin-bottom:8px;">Фото экранов</div>
        <div style="font-size:13px; color:#666;">Нет изображений (image_url) у выбранных экранов.</div>
      \`;
      box.style.display = "block";
      return;
    }

    const byReg = groupByRegion(arrAll);

    const selectedOrder = getSelectedRegionsFromState();
    const regionsOrdered = [
      ...selectedOrder.filter(r => byReg.has(r)),
      ...Array.from(byReg.keys()).filter(r => !selectedOrder.includes(r))
    ];

    const sectionsHtml = regionsOrdered.map(regionName => {
      const regItems = (byReg.get(regionName) || []);

      const cards = regItems.map((s, idx) => {
        const url = escapeHtml(getImg(s));
        const gid = escapeHtml(getGid(s));
        const own = escapeHtml(getOwner(s));
        const addr = escapeHtml(getAddr(s));

        return \`
          <div class="img-card" data-region="\${escapeHtml(regionName)}" data-idx="\${idx}"
               style="min-width:220px; max-width:220px; border:1px solid rgba(15,23,42,.10); border-radius:14px; overflow:hidden; background:#fff; cursor:pointer;">
            <div style="height:140px; background:#f2f4f8; display:flex; align-items:center; justify-content:center;">
              <img src="\${url}" alt="\${gid}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="padding:10px;">
              <div style="font-weight:800; font-size:13px; line-height:1.2;">\${gid || "—"}</div>
              <div style="font-size:12px; color:#555; margin-top:4px;">\${own || "—"}</div>
              <div style="font-size:12px; color:#777; margin-top:4px; line-height:1.25; max-height:2.5em; overflow:hidden;">\${addr || ""}</div>
            </div>
          </div>
        \`;
      }).join("");

      return \`
        <div class="img-section" style="margin-top:14px;">
          <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:8px;">
            <div style="font-weight:800;">Фото экранов — \${escapeHtml(regionName)}</div>
            <div style="font-size:12px; color:#666;">Всего: \${regItems.length.toLocaleString("ru-RU")}</div>
          </div>
          <div class="img-row" data-region="\${escapeHtml(regionName)}"
               style="display:flex; gap:12px; overflow-x:auto; overflow-y:hidden; padding-bottom:6px; max-width:100%;">
            \${cards}
          </div>
          <div style="font-size:12px; color:#666; margin-top:6px;">
            Пролистайте вправо, чтобы увидеть больше. Нажмите на карточку, чтобы открыть просмотр.
          </div>
        </div>
      \`;
    }).join("");

    box.innerHTML = sectionsHtml;
    box.style.display = "block";

    box.querySelectorAll(".img-section").forEach(section => {
      const regionName = section.querySelector(".img-row")?.dataset?.region || "";
      const regItems = (byReg.get(regionName) || []);

      section.querySelectorAll(".img-card").forEach(card => {
        card.style.scrollSnapAlign = "start";
        card.addEventListener("click", () => {
          const idx = Number(card.dataset.idx || 0);
          const s = regItems[idx];

          if (window.PLANNER?.focusScreenOnMap) window.PLANNER.focusScreenOnMap(s);
          window.dispatchEvent(new CustomEvent("planner:focus-screen", { detail: { screen: s } }));

          openLightbox(regItems, idx);
        });
      });
    });
  }

  function init(){
    const box = el("img-carousel");
    if(box){ box.style.display = "none"; box.innerHTML = ""; }

    window.addEventListener("planner:calc-done", (e) => {
      allowed = true;
      lastItems = (e?.detail && Array.isArray(e.detail.chosen)) ? e.detail.chosen : [];
      renderPerRegion(lastItems);
    });

    window.addEventListener("planner:filters-changed", () => {
      if(!allowed) return;
      renderPerRegion(lastItems);
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 10
  runScript(`
(function(){
  let map = null;
  let layer = null;
  let markersByGid = {};

  function el(id){ return document.getElementById(id); }

  function getGid(s){ return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim(); }
  function getOwner(s){ return (s?.owner ?? s?.OWNER ?? s?.operator ?? "").toString().trim(); }
  function getAddr(s){ return (s?.address ?? s?.addr ?? "").toString().trim(); }

  function esc(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ensureMap(){
    const box = el("planner-map");
    if(!box) return null;

    box.style.display = "block";
    if(map) return map;

    if(!window.L){
      console.warn("[map] Leaflet not loaded");
      return null;
    }

    map = L.map(box, { scrollWheelZoom: false });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    layer = L.layerGroup().addTo(map);
    return map;
  }

  function renderChosenOnMap(chosen){
    const m = ensureMap();
    if(!m || !layer) return;

    layer.clearLayers();
    markersByGid = {};

    const pts = [];
    (chosen || []).forEach(s => {
      const lat = Number(s?.lat);
      const lon = Number(s?.lon);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      pts.push([lat, lon]);

      const html = \`
        <div style="font-size:13px;">
          <div style="font-weight:800;">\${esc(getGid(s) || "Экран")}</div>
          <div style="margin-top:4px;"><b>Оператор:</b> \${esc(getOwner(s) || "—")}</div>
          <div style="margin-top:4px;"><b>Адрес:</b> \${esc(getAddr(s) || "—")}</div>
        </div>
      \`;

      const gid = getGid(s) || \`\${lat},\${lon}\`;
      const marker = L.marker([lat, lon]).addTo(layer).bindPopup(html);
      markersByGid[gid] = marker;
    });

    setTimeout(() => {
      m.invalidateSize();

      if(pts.length === 1){
        m.setView(pts[0], 14);
      } else if(pts.length > 1){
        m.fitBounds(pts, { padding: [20, 20] });
      } else {
        m.setView([55.751244, 37.618423], 10);
      }
    }, 50);
  }

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.focusScreenOnMap = function(screen){
    try{
      const s = screen;
      if(!s) return;

      const m = ensureMap();
      if(!m) return;

      const lat = Number(s?.lat);
      const lon = Number(s?.lon);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      setTimeout(() => m.invalidateSize(), 0);
      m.setView([lat, lon], 15, { animate: true });

      const gid = getGid(s) || \`\${lat},\${lon}\`;
      const marker = markersByGid[gid];

      if(marker) marker.openPopup();
      else L.popup().setLatLng([lat, lon]).setContent(\`<b>\${esc(gid)}</b>\`).openOn(m);
    } catch(e){
      console.warn("[map] focus failed", e);
    }
  };

  function init(){
    window.addEventListener("planner:calc-done", (e) => {
      const chosen = e?.detail?.chosen || window.PLANNER?.state?.lastChosen || [];
      renderChosenOnMap(chosen);
    });

    window.addEventListener("planner:focus-screen", (e) => {
      const s = e?.detail?.screen;
      if(!s) return;
      window.PLANNER.focusScreenOnMap(s);
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 11
  runScript(`
(function(){
  const el = id => document.getElementById(id);

  let polyMap    = null;
  let drawLayer  = null;   // L.FeatureGroup — хранит нарисованный полигон
  let dotsLayer  = null;   // L.FeatureGroup — точки всех экранов
  let currentPoly = null;  // L.Polygon | null
  let drawControl = null;

  // ── helpers ─────────────────────────────────────────────────────────
  function getPoly()  { return window.PLANNER?.state?.polygonFilter || null; }
  function setPoly(p) {
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    window.PLANNER.state.polygonFilter = p;
  }
  function getScreensAll() { return window.PLANNER?.state?.screensAll || []; }
  function countInside(latLngs) {
    if (!latLngs || latLngs.length < 3) return 0;
    const poly = latLngs.map(ll => [ll.lat, ll.lng]);
    const fn = window.PLANNER?.pointInPolygon;
    if (!fn) return 0;
    return getScreensAll().filter(
      s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && fn(s.lat, s.lon, poly)
    ).length;
  }

  // ── badge in step 4 ─────────────────────────────────────────────────
  function updateBadge() {
    const poly = getPoly();
    const badge = el("poly-badge");
    const text  = el("poly-badge-text");
    const btn   = el("poly-draw-btn");
    if (!badge || !text) return;
    if (poly && poly.length >= 3) {
      const cnt = window.PLANNER?.countScreensInPolygon
        ? window.PLANNER.countScreensInPolygon(poly)
        : 0;
      text.textContent = \`Зона активна — \${cnt.toLocaleString("ru-RU")} экранов\`;
      badge.style.display = "flex";
      if (btn) btn.textContent = "✏️ Изменить зону";
    } else {
      badge.style.display = "none";
      if (btn) btn.textContent = "🗺 Нарисовать зону";
    }
  }

  // ── open modal ───────────────────────────────────────────────────────
  function openModal() {
    const modal = el("poly-modal");
    if (!modal) return;
    modal.style.display = "flex";
    setTimeout(initPolyMap, 50); // дать время показаться
  }

  function closeModal() {
    const modal = el("poly-modal");
    if (modal) modal.style.display = "none";
    // stop any active drawing
    if (drawControl && polyMap) {
      try { drawControl.disable?.(); } catch(_) {}
    }
  }

  // ── init drawing map ─────────────────────────────────────────────────
  function initPolyMap() {
    if (!window.L) { alert("Leaflet не загружен"); return; }
    const box = el("poly-map");
    if (!box) return;

    // Create map once
    if (!polyMap) {
      polyMap = L.map(box, { scrollWheelZoom: true, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap"
      }).addTo(polyMap);

      drawLayer = new L.FeatureGroup().addTo(polyMap);
      dotsLayer = new L.FeatureGroup().addTo(polyMap);
    }

    polyMap.invalidateSize();

    // Render existing polygon if any
    drawLayer.clearLayers();
    currentPoly = null;
    const existing = getPoly();
    if (existing && existing.length >= 3) {
      const lls = existing.map(([la, lo]) => [la, lo]);
      currentPoly = L.polygon(lls, { color: "#5B3EF5", fillOpacity: 0.15 }).addTo(drawLayer);
    }

    // Render all screens as tiny dots (canvas for performance)
    dotsLayer.clearLayers();
    const screens = getScreensAll();
    const renderer = L.canvas({ padding: 0.5 });
    const bounds = [];
    screens.forEach(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return;
      L.circleMarker([s.lat, s.lon], {
        radius: 3, color: "#5B3EF5", fillColor: "#5B3EF5",
        fillOpacity: 0.5, weight: 0, renderer
      }).addTo(dotsLayer);
      bounds.push([s.lat, s.lon]);
    });

    // Fit to existing poly or to all screens
    setTimeout(() => {
      polyMap.invalidateSize();
      if (currentPoly) {
        polyMap.fitBounds(currentPoly.getBounds(), { padding: [40, 40] });
      } else if (bounds.length) {
        polyMap.fitBounds(bounds, { padding: [20, 20] });
      }
    }, 80);

    setupDrawing();
    updateModalState();
  }

  // ── setup click-to-draw polygon ──────────────────────────────────────
  let vertices = [];
  let tempPolyline = null;
  let tempMarkers  = [];

  function setupDrawing() {
    if (!polyMap) return;
    // Remove old listeners safely
    polyMap.off("click", onMapClick);

    // If we already have a confirmed polygon, don't start drawing again
    if (currentPoly) return;

    vertices = [];
    tempPolyline = null;
    tempMarkers  = [];
    polyMap.on("click", onMapClick);
  }

  function onMapClick(e) {
    const latlng = e.latlng;
    vertices.push(latlng);

    // Draw vertex marker
    const isFirst = vertices.length === 1;
    const m = L.circleMarker(latlng, {
      radius: isFirst ? 7 : 5,
      color: isFirst ? "#e84444" : "#5B3EF5",
      fillColor: isFirst ? "#e84444" : "#5B3EF5",
      fillOpacity: 0.9, weight: 2
    }).addTo(drawLayer);
    if (isFirst) {
      m.bindTooltip("Кликните сюда, чтобы замкнуть", { permanent: false, direction: "top" });
      m.on("click", (ev) => { L.DomEvent.stopPropagation(ev); finishPolygon(); });
    }
    tempMarkers.push(m);

    // Update polyline preview
    if (tempPolyline) { drawLayer.removeLayer(tempPolyline); tempPolyline = null; }
    if (vertices.length >= 2) {
      tempPolyline = L.polyline(vertices, { color: "#5B3EF5", dashArray: "5,6", weight: 2 }).addTo(drawLayer);
    }

    // Show finish button after 3+ vertices
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = vertices.length >= 3 ? "block" : "none";

    updateModalState();
  }

  function finishPolygon() {
    if (vertices.length < 3) return;

    // Clear temp layers
    drawLayer.clearLayers();
    if (tempPolyline) tempPolyline = null;
    tempMarkers = [];
    polyMap.off("click", onMapClick);

    // Draw final polygon
    currentPoly = L.polygon(vertices, { color: "#5B3EF5", fillOpacity: 0.15, weight: 2 }).addTo(drawLayer);

    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = "none";

    vertices = [];
    updateModalState();
  }

  function resetDraw() {
    if (currentPoly) { drawLayer.removeLayer(currentPoly); currentPoly = null; }
    drawLayer.clearLayers();
    vertices = [];
    tempPolyline = null;
    tempMarkers = [];
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = "none";
    polyMap.on("click", onMapClick);
    updateModalState();
  }

  // ── update modal UI state ────────────────────────────────────────────
  function updateModalState() {
    const confirmBtn = el("poly-modal-confirm");
    const resetBtn   = el("poly-modal-reset");
    const countBadge = el("poly-modal-count");
    const hint       = el("poly-hint");

    const hasPoly = !!currentPoly;
    const hasVerts = vertices.length >= 3;

    if (confirmBtn) confirmBtn.disabled = !hasPoly;
    if (resetBtn)   resetBtn.style.display = (hasPoly || hasVerts) ? "block" : "none";

    if (hasPoly && countBadge) {
      const lls = currentPoly.getLatLngs()[0];
      const cnt = countInside(lls);
      countBadge.textContent = \`\${cnt.toLocaleString("ru-RU")} экранов\`;
      countBadge.style.display = "block";
      if (hint) hint.textContent = cnt > 0
        ? \`В зоне \${cnt.toLocaleString("ru-RU")} экранов. Нажмите «Применить» или «Перерисовать».\`
        : "В зоне нет экранов. Попробуйте нарисовать другой полигон.";
    } else {
      if (countBadge) countBadge.style.display = "none";
      if (hint) hint.textContent = hasVerts
        ? \`Добавлено \${vertices.length} точек. Кликните на первую точку или нажмите «Завершить».\`
        : "Кликайте на карту, чтобы добавлять точки полигона. Замкните его — кликните на первую точку или нажмите «Завершить».";
    }
  }

  // ── confirm: save polygon to state ──────────────────────────────────
  function confirmPolygon() {
    if (!currentPoly) return;
    const lls = currentPoly.getLatLngs()[0];
    setPoly(lls.map(ll => [ll.lat, ll.lng]));
    closeModal();
    updateBadge();
    // Trigger recalc hint
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  // ── clear polygon ────────────────────────────────────────────────────
  function clearPolygon() {
    setPoly(null);
    currentPoly = null;
    if (drawLayer) drawLayer.clearLayers();
    updateBadge();
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  // ── init event listeners ─────────────────────────────────────────────
  function init() {
    el("poly-draw-btn")?.addEventListener("click", openModal);
    el("poly-modal-cancel")?.addEventListener("click", closeModal);
    el("poly-modal-confirm")?.addEventListener("click", confirmPolygon);
    el("poly-modal-reset")?.addEventListener("click", resetDraw);
    el("poly-clear-btn")?.addEventListener("click", clearPolygon);
    el("poly-finish-btn")?.addEventListener("click", finishPolygon);

    // Close on backdrop click
    el("poly-modal")?.addEventListener("click", (e) => {
      if (e.target === el("poly-modal")) closeModal();
    });

    // Re-render badge when screens load
    window.addEventListener("planner:screens-ready", updateBadge);
    window.addEventListener("planner:filters-changed", updateBadge);

    updateBadge();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 12
  runScript(`
(function(){
  const IDS = {
    wrap: "owner-wrap",
    toggle: "owner-toggle",
    all: "owner-all",
    clear: "owner-clear",
    count: "owners-count"
  };

  const COLLAPSE_LIMIT = 6;

  function el(id){ return document.getElementById(id); }

  function ensureState(){
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    window.PLANNER.ui = window.PLANNER.ui || {};
    const st = window.PLANNER.state;
    if(!st.selectedOwners) st.selectedOwners = new Set();
    if(typeof window.PLANNER.ui.ownersExpanded !== "boolean") window.PLANNER.ui.ownersExpanded = false;
    return st;
  }

  function getSelectedRegions(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    const arr = Array.isArray(st.selectedRegions) ? st.selectedRegions
              : (st.selectedRegion ? [st.selectedRegion] : []);
    return (arr || []).map(x=>String(x||"").trim()).filter(Boolean);
  }

  function getScreensAll(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    return Array.isArray(st.screensAll) ? st.screensAll
         : Array.isArray(st.screens) ? st.screens
         : [];
  }

  function getOwnerName(s){
    return String(s?.owner ?? s?.OWNER ?? s?.operator ?? s?.vendor ?? s?.network ?? "").trim();
  }
  function getRegion(s){
    return String(s?.region ?? s?.Region ?? s?.city ?? s?.CITY ?? "").trim();
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function computeOwnersWithCounts(){
    const regions = getSelectedRegions();
    const screens = getScreensAll();
    const selectedFormats = window.PLANNER?.state?.selectedFormats;

    const pool = screens.filter(s => {
      if (regions.length && !regions.includes(getRegion(s))) return false;
      if (selectedFormats && selectedFormats.size > 0 && !selectedFormats.has(s.format)) return false;
      return true;
    });

    const map = new Map();
    for(const s of pool){
      const o = getOwnerName(s);
      if(!o) continue;
      map.set(o, (map.get(o) || 0) + 1);
    }

    return [...map.entries()]
      .map(([owner, count]) => ({ owner, count }))
      .sort((a,b)=> (b.count - a.count) || a.owner.localeCompare(b.owner,"ru"));
  }

  function updateChosenLabel(){
    const st = ensureState();
    const node = el(IDS.count);
    if(node) node.textContent = String(st.selectedOwners.size);
  }

  function showOwnerInfo(owner, count){
    alert(\`\${owner}\\nЭкраны в выбранных регионах: \${count.toLocaleString("ru-RU")}\`);
  }

  function renderOwners(){
    const st = ensureState();
    const wrap = el(IDS.wrap);
    if(!wrap) return;

    const list = computeOwnersWithCounts();
    const avail = new Set(list.map(x=>x.owner));

    for(const o of [...st.selectedOwners]){
      if(!avail.has(o)) st.selectedOwners.delete(o);
    }

    // Filter by search query
    const searchQ = (el("owner-search")?.value || "").trim().toLowerCase();
    const filtered = searchQ
      ? list.filter(x => x.owner.toLowerCase().includes(searchQ))
      : list;

    const expanded = !!window.PLANNER.ui.ownersExpanded || !!searchQ;
    const visible = expanded ? filtered : filtered.slice(0, COLLAPSE_LIMIT);

    wrap.innerHTML = "";

    visible.forEach(({ owner, count }) => {
      const card = document.createElement("div");
      card.className = "own-card";
      if(st.selectedOwners.has(owner)) card.classList.add("is-selected");

      card.innerHTML = \`
        <div class="own-left">
          <div class="own-title">\${escapeHtml(owner)}</div>
          <div class="own-countline">\${count.toLocaleString("ru-RU")} экранов</div>
        </div>
        <button type="button" class="own-tip" aria-label="Информация об операторе">i</button>
      \`;

      card.querySelector(".own-tip").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showOwnerInfo(owner, count);
      });

      card.addEventListener("click", () => {
        if(st.selectedOwners.has(owner)) st.selectedOwners.delete(owner);
        else st.selectedOwners.add(owner);

        renderOwners();
        updateChosenLabel();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        if(typeof window.renderProgress === "function") window.renderProgress();
      });

      wrap.appendChild(card);
    });

    const tgl = el(IDS.toggle);
    if(tgl){
      const need = !searchQ && filtered.length > COLLAPSE_LIMIT;
      tgl.style.display = need ? "inline-flex" : "none";
      tgl.textContent = expanded ? "Свернуть операторов" : "Показать всех операторов";
    }

    wrap.classList.toggle("owner-collapsed", !expanded);

    updateChosenLabel();
  }

  function bind(){
    const st = ensureState();

    // Owner search
    el("owner-search")?.addEventListener("input", () => renderOwners());

    el(IDS.all)?.addEventListener("click", () => {
      const list = computeOwnersWithCounts();
      st.selectedOwners = new Set(list.map(x=>x.owner));
      renderOwners();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      if(typeof window.renderProgress === "function") window.renderProgress();
    });

    el(IDS.clear)?.addEventListener("click", () => {
      st.selectedOwners.clear();
      renderOwners();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      if(typeof window.renderProgress === "function") window.renderProgress();
    });

    el(IDS.toggle)?.addEventListener("click", () => {
      window.PLANNER.ui.ownersExpanded = !window.PLANNER.ui.ownersExpanded;
      renderOwners();
    });

    window.addEventListener("planner:screens-ready", renderOwners);
    window.addEventListener("planner:filters-changed", renderOwners);

    let lastSig = "";
    setInterval(() => {
      const regionsSig = getSelectedRegions().slice().sort().join("||");
      const len = getScreensAll().length;
      const sig = regionsSig + "##" + len;
      if(sig !== lastSig){
        lastSig = sig;
        renderOwners();
      }
    }, 500);

    renderOwners();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
`);

  // Script block 13
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  const fmtInt = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x).toLocaleString("ru-RU") : "—";
  };
  const fmtMoney = (n) => {
    const x = Number(n);
    return (Number.isFinite(x) && x > 0) ? (Math.round(x).toLocaleString("ru-RU") + " ₽") : "—";
  };

  function hoursPerDayFromRaw(){
    const raw = el("summary")?.textContent || "";
    const m = raw.match(/часов\\/день:\\s*([0-9]+(\\.[0-9]+)?)/i);
    return m ? Number(m[1]) : null;
  }

  function daysFromRaw(){
    const raw = el("summary")?.textContent || "";
    const m = raw.match(/\\(дней:\\s*([0-9]+)\\)/i);
    return m ? Number(m[1]) : null;
  }

  function render(detail){
    const root = el("pretty-summary");
    if(!root) return;

    const perRegion = Array.isArray(detail?.perRegion) ? detail.perRegion : [];

    const totalBudget  = perRegion.reduce((a,r)=> a + (Number(r.budget)||0), 0);
    const totalPlays   = perRegion.reduce((a,r)=> a + (Number(r.plays)||0), 0);
    const totalScreens = perRegion.reduce((a,r)=> a + (Number(r.screens)||0), 0);

    const days = daysFromRaw();
    const hpd  = hoursPerDayFromRaw();
    const playsPerDay  = (days && totalPlays) ? (totalPlays/days) : null;
    const playsPerHour = (days && hpd && totalPlays) ? (totalPlays/days/hpd) : null;

    const otsValid = perRegion
      .map(r => Number(r.ots))
      .filter(v => Number.isFinite(v) && v > 0);
    const otsTotal = otsValid.length ? otsValid.reduce((a,b)=>a+b,0) : null;

    // raw — читаем summary text (теперь он уже записан ДО dispatchEvent)
    const raw = el("summary")?.textContent || "";
    // Warnings: prefer direct array from event detail, fallback to parsing raw text
    const warnArr = Array.isArray(detail?.warnings) && detail.warnings.length
      ? detail.warnings
      : raw.split("\\n").filter(l => l.trim().startsWith("⚠️")).map(l => l.replace(/^⚠️\\s*/, ""));

    const warnsHtml = warnArr.length
      ? \`<div class="ps-warn"><b>Предупреждения:</b><br>\${warnArr.map(x => x.replace(/^⚠️\\s*/, "")).join("<br>")}</div>\`
      : "";

    const regionCards = perRegion
      .slice()
      .sort((a,b)=> (Number(b.budget||0)-Number(a.budget||0)))
      .map(r => {
        const ots = (Number.isFinite(Number(r.ots)) && Number(r.ots)>0) ? fmtInt(r.ots) : "—";
        const note = String(r.note || "").trim();
        return \`
          <div class="ps-card">
            <div class="ps-region-top">
              <div>
                <div class="ps-region-name">\${String(r.region || "—")}</div>
                <div class="ps-sub">\${note || "Разбивка по региону"}</div>
              </div>
              <div class="ps-chip">\${fmtInt(r.screens)} экранов</div>
            </div>

            <div class="ps-mini">
              <span><b>Бюджет:</b> \${fmtMoney(r.budget)}</span>
              <span><b>Выходов:</b> \${fmtInt(r.plays)}</span>
              <span><b>OTS:</b> \${ots}</span>
            </div>
          </div>
        \`;
      }).join("");

    // Per-format breakdown
    const fs = detail?.formatStats || {};

    const formatRows = Object.entries(fs)
      .sort((a,b) => b[1].screens - a[1].screens)
      .map(([fmtName, fd]) => {
        const otsPerPlay  = fd.otsPerPlay  != null
          ? fmtInt(fd.otsPerPlay)  + "\u202fOTS" : "—";
        const costPerPlay = fd.costPerPlay != null
          ? fmtInt(fd.costPerPlay) + "\u202f₽"   : "—";
        const esc = s => String(s||"").replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
        return \`<div class="ps-metric">
          <div class="k">\${esc(fmtName)}</div>
          <div class="v" style="font-size:15px;">\${fmtInt(fd.screens)}\u202f<span style="font-size:12px;font-weight:500;color:#667085;">экр.</span></div>
          <div style="margin-top:6px;font-size:12px;color:#667085;line-height:1.5;">
            OTS/выход:&nbsp;<b style="color:#0b1220;">\${otsPerPlay}</b><br>
            Стоимость выхода:&nbsp;<b style="color:#0b1220;">\${costPerPlay}</b>
          </div>
        </div>\`;
      }).join("");

    root.innerHTML = \`
      <div class="ps-wrap">
        <div class="ps-card">
          <div class="ps-head">
            <div>
              <div class="ps-title">Сводка кампании</div>
              <div class="ps-sub">Итоги и разбивка по регионам</div>
            </div>
            <div class="ps-badges">
              <span class="ps-badge"><b>Экраны:</b> \${fmtInt(totalScreens)}</span>
              <span class="ps-badge"><b>Выходов:</b> \${fmtInt(totalPlays)}</span>
              <span class="ps-badge"><b>Бюджет:</b> \${fmtMoney(totalBudget)}</span>
            </div>
          </div>

          <div class="ps-grid">
            <div class="ps-metric"><div class="k">Выходов / день</div><div class="v">\${playsPerDay == null ? "—" : fmtInt(playsPerDay)}</div></div>
            <div class="ps-metric"><div class="k">Выходов / час</div><div class="v">\${playsPerHour == null ? "—" : fmtInt(playsPerHour)}</div></div>
            <div class="ps-metric"><div class="k">OTS всего</div><div class="v">\${otsTotal == null ? "—" : fmtInt(otsTotal)}</div></div>
            <div class="ps-metric"><div class="k">Стоимость выхода</div><div class="v">\${(totalBudget > 0 && totalPlays > 0) ? Math.round(totalBudget / totalPlays).toLocaleString("ru-RU") + "\u202f₽" : "—"}</div></div>
            <div class="ps-metric"><div class="k">CPM (стоимость 1\u202f000 OTS)</div><div class="v">\${(totalBudget > 0 && otsTotal > 0) ? Math.round(totalBudget / otsTotal * 1000).toLocaleString("ru-RU") + "\u202f₽" : "—"}</div></div>
          </div>

          \${warnsHtml}
        </div>

        \${formatRows ? \`
        <div class="ps-card">
          <div class="ps-title">По форматам</div>
          <div class="ps-sub">Экраны, OTS за выход и средняя ставка по каждому формату</div>
          <div class="ps-grid" style="margin-top:12px;">\${formatRows}</div>
        </div>\` : ""}

        <div class="ps-card">
          <div class="ps-title">По регионам</div>
          <div class="ps-sub">Бюджет / выходы / OTS по каждому выбранному региону</div>
          <div class="ps-regions">\${regionCards || \`<div class="ps-warn">Нет данных по регионам — нажмите «Рассчитать».</div>\`}</div>

          <details class="ps-details" style="margin-top:10px;">
            <summary>Техническая сводка (raw)</summary>
            <pre class="summary-pre" style="margin-top:10px;">\${raw.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</pre>
          </details>
        </div>
      </div>
    \`;

    const pre = el("summary");
    if(pre) pre.style.display = "none";
  }

  function init(){
    const root = el("pretty-summary");
    if(root) root.innerHTML = \`<div class="ps-warn">Нажмите «Рассчитать», чтобы увидеть карточки по регионам.</div>\`;

    window.addEventListener("planner:calc-done", (e) => {
      render(e?.detail || {});
      if(window.PLANNER?.state) window.PLANNER.state.lastChosen = e?.detail?.chosen || [];
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 14
  runScript(`
(function(){
  document.querySelectorAll('input[name="bid_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const isMin = document.getElementById("bid-mode-min")?.checked;
      const h1 = document.getElementById("bid-mode-hint-recommended");
      const h2 = document.getElementById("bid-mode-hint-min");
      if(h1) h1.style.display = isMin ? "none" : "block";
      if(h2) h2.style.display = isMin ? "block" : "none";
    });
  });
})();
`);

  // Script block 15
  runScript(`
(function(){
  function fmtN(n){ return Math.round(n).toLocaleString("ru-RU"); }

  function renderPoolPreview(){
    const box = document.getElementById("pool-preview-content");
    if(!box) return;
    const preview = window.PLANNER?.computePoolPreview?.();

    if(!preview){
      box.innerHTML = '<span style="color:#667085">Укажите регионы, чтобы увидеть объём доступного инвентаря.</span>';
      return;
    }

    const { countBase, countAfterGrp, countAfterOwners, countFinal, hasGrpFilter, hasOwnerFilter } = preview;

    let html = \`<div class="pool-preview-row">\`;
    html += \`<span class="pool-preview-base">Базовый пул: \${fmtN(countBase)} экр.</span>\`;

    if(hasGrpFilter && countAfterGrp !== null){
      const drop = countBase - countAfterGrp;
      const pct = countBase > 0 ? Math.round(countAfterGrp / countBase * 100) : 0;
      html += \`<span class="pool-preview-arrow">→</span>\`;
      html += \`<span class="pool-preview-filter">GRP: <b>\${fmtN(countAfterGrp)}</b><span class="pool-preview-pct"> −\${fmtN(drop)} (\${pct}%)</span></span>\`;
    }

    if(hasOwnerFilter && countAfterOwners !== null){
      const base2 = hasGrpFilter && countAfterGrp !== null ? countAfterGrp : countBase;
      const drop = base2 - countAfterOwners;
      const pct = base2 > 0 ? Math.round(countAfterOwners / base2 * 100) : 0;
      html += \`<span class="pool-preview-arrow">→</span>\`;
      html += \`<span class="pool-preview-filter">Операторы: <b>\${fmtN(countAfterOwners)}</b><span class="pool-preview-pct"> −\${fmtN(drop)} (\${pct}%)</span></span>\`;
    }

    if(hasGrpFilter || hasOwnerFilter){
      html += \`<span class="pool-preview-arrow">→</span>\`;
      html += \`<span class="pool-preview-base">Итого: \${fmtN(countFinal)} экр.</span>\`;
    }

    html += \`</div>\`;

    // Предупреждение: заданное кол-во конструкций больше доступного пула
    const constrEnabled = document.getElementById("constructions-enabled")?.checked;
    const constrCount = parseInt(document.getElementById("constructions-count")?.value || "0", 10);
    if(constrEnabled && constrCount > 0 && countFinal < constrCount){
      html += \`<div style="margin-top:8px;padding:7px 10px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;font-size:12px;color:#856404;">
        ⚠️ Доступно только <b>\${fmtN(countFinal)}</b> экранов с текущими фильтрами — лимит <b>\${fmtN(constrCount)}</b> будет снижен автоматически.
      </div>\`;
    }

    box.innerHTML = html;
  }

  // Обновлять при любом изменении фильтров
  window.addEventListener("planner:screens-ready", renderPoolPreview);
  window.addEventListener("planner:pool-updated", renderPoolPreview);

  // Делегируем на изменения фильтров через MutationObserver + события
  document.addEventListener("change", (e) => {
    const t = e.target;
    if(!t) return;
    const id = t.id || "";
    const name = t.name || "";
    // GRP, форматы, операторы, конструкции
    if(id === "grp-enabled" || id === "grp-min" || id === "grp-max" ||
       id === "constructions-enabled" || id === "constructions-count" ||
       name === "reach_mode" || name === "bid_mode" ||
       t.closest?.("#owner-wrap") || t.closest?.("#formats-wrap")){
      setTimeout(renderPoolPreview, 50);
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if(!t) return;
    // Кнопки операторов Все/Очистить, форматы-пресеты
    if(t.id === "owner-all" || t.id === "owner-clear" ||
       t.closest?.("#formats-presets") || t.closest?.("#owner-wrap")){
      setTimeout(renderPoolPreview, 100);
    }
  });

  // Первый рендер при готовности
  if(window.PLANNER?.ready) renderPoolPreview();
})();
`);

  // Script block 16
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);

  function getMode(){
    return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
  }

  function sync(){
    const mode = getMode();
    const budgetWrap = el("budget-input-wrap");
    const goalWrap = el("goal-ots-wrap");
    const recoHint = el("budget-reco-hint");

    if (budgetWrap) budgetWrap.style.display = (mode === "fixed") ? "block" : "none";
    if (goalWrap) goalWrap.style.display = (mode === "goal_ots") ? "block" : "none";
    if (recoHint) recoHint.style.display = (mode === "recommendation") ? "block" : "none";

    if (mode === "goal_ots") {
      const inp = el("goal-ots");
      if (inp) setTimeout(() => inp.focus(), 50);
    }
  }

  document.querySelectorAll('input[name="budget_mode"]').forEach(r => r.addEventListener("change", sync));
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
`);

  // Script block 17
  runScript(`
(function(){
  if (typeof window.tierWeight === "function") return;

  window.tierWeight = function(tier){
    const t = String(tier ?? "").trim().toUpperCase();

    const mapABC = { "A": 1.35, "B": 1.15, "C": 1.00, "D": 0.90, "E": 0.80 };
    const mapNum = { "1": 1.35, "2": 1.15, "3": 1.00, "4": 0.90, "5": 0.80 };

    if (mapABC[t] != null) return mapABC[t];
    if (mapNum[t] != null) return mapNum[t];

    const m = t.match(/([1-5])/);
    if (m && mapNum[m[1]] != null) return mapNum[m[1]];

    return 1.0;
  };

  console.log("[shim] tierWeight installed");
})();
`);

  // Script block 18
  runScript(`
(function(){
  const el = (id)=>document.getElementById(id);

  function fmtInt(n){
    const x = Number(n||0);
    return x.toLocaleString("ru-RU");
  }
  function fmtMoney(n){
    const x = Number(n||0);
    return x.toLocaleString("ru-RU") + " ₽";
  }

  function renderBars({ title, rows, valueKey, formatFn }){
    const max = Math.max(...rows.map(r => Number(r[valueKey]||0)), 1);

    const items = rows.map(r=>{
      const v = Number(r[valueKey]||0);
      const pct = Math.round((v / max) * 100);
      return \`
        <div class="bar-row">
          <div class="bar-lbl">\${r.label}</div>
          <div class="bar"><i style="width:\${pct}%"></i></div>
          <div class="bar-val">\${formatFn(v)}</div>
        </div>
      \`;
    }).join("");

    return \`
      <div class="chart-card">
        <div class="chart-title">\${title}</div>
        \${items}
      </div>
    \`;
  }

  function renderCharts(detail){
    const root = el("charts");
    if(!root) return;

    const byWeekday = Array.isArray(detail?.byWeekday) ? detail.byWeekday : [];
    const byDate    = Array.isArray(detail?.byDate) ? detail.byDate : [];

    if(!byWeekday.length && !byDate.length){
      root.innerHTML = "";
      return;
    }

    let html = "";

    if(byWeekday.length){
      html += renderBars({
        title: "По дням недели (бюджет)",
        rows: byWeekday,
        valueKey: "budget",
        formatFn: fmtMoney
      });
    }

    if(byDate.length){
      html += renderBars({
        title: "По датам (выходы)",
        rows: byDate.map(d => ({ label: d.label || d.date || "—", ...d })),
        valueKey: "plays",
        formatFn: fmtInt
      });
    }

    root.innerHTML = html;
  }

  window.addEventListener("planner:calc-done", (e)=>renderCharts(e?.detail || {}));
})();
`);

  // Script block 19
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);

  // Дни недели со строковыми ключами (совпадают с planner.js)
  const DAYS = [
    { key: "mon", label: "Пн" },
    { key: "tue", label: "Вт" },
    { key: "wed", label: "Ср" },
    { key: "thu", label: "Чт" },
    { key: "fri", label: "Пт" },
    { key: "sat", label: "Сб" },
    { key: "sun", label: "Вс" },
  ];

  const BAR_FROM = "00:00";
  const BAR_TO   = "23:59";

  function ensureState(){
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    const st = window.PLANNER.state;
    // Модель: блоки [{days:{mon,...}, times:[{from,to},...]}]
    if(!st.weeklyGroups){
      st.weeklyGroups = [
        { days:{mon:true,tue:true,wed:true,thu:true,fri:true,sat:false,sun:false},
          times:[{from:"07:00",to:"22:00"}] }
      ];
    }
    return st;
  }

  function timeToMin(t){
    const [h,m] = String(t||"00:00").split(":").map(Number);
    if(!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h*60 + m;
  }

  function minToTime(min){
    const h = Math.floor(min/60);
    const m = min%60;
    return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  }

  function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

  function normalizeIntervals(list){
    const arr = (Array.isArray(list) ? list : [])
      .map(x => ({ from: x.from, to: x.to }))
      .filter(x => x.from && x.to);

    const cleaned = arr
      .map(x => {
        let a = timeToMin(x.from);
        let b = timeToMin(x.to);
        if(b <= a) b = a + 15;
        return { from: minToTime(a), to: minToTime(b) };
      })
      .sort((x,y)=> timeToMin(x.from)-timeToMin(y.from));

    return cleaned;
  }

  function buildDaySubtitle(enabled, intervals){
    if(!enabled) return "выключено";
    const n = intervals.length;
    if(!n) return "нет интервалов";
    if(n === 1) return \`\${intervals[0].from}–\${intervals[0].to}\`;
    return \`\${n} интервала\`;
  }

  function renderBars(container, enabled, intervals){
    container.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "wd-barhint";
    hint.textContent = enabled ? \`Визуализация (шкала \${BAR_FROM}–\${BAR_TO})\` : "—";
    container.appendChild(hint);

    if(!enabled) return;

    const line = document.createElement("div");
    line.className = "wd-barline";
    container.appendChild(line);

    const baseA = timeToMin(BAR_FROM);
    const baseB = timeToMin(BAR_TO);
    const span = Math.max(1, baseB - baseA);

    intervals.forEach(intv => {
      const a = clamp(timeToMin(intv.from), baseA, baseB);
      const b = clamp(timeToMin(intv.to),   baseA, baseB);
      if(b <= a) return;

      const leftPct = ((a - baseA) / span) * 100;
      const widthPct = ((b - a) / span) * 100;

      const seg = document.createElement("div");
      seg.className = "wd-seg";
      seg.style.left = leftPct + "%";
      seg.style.width = widthPct + "%";
      line.appendChild(seg);
    });
  }

  function makeDayPills(grpIdx, grp, card){
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;";
    DAYS.forEach(d => {
      const lbl = document.createElement("label");
      const checked = !!grp.days[d.key];
      lbl.style.cssText = \`display:inline-flex;align-items:center;cursor:pointer;
        font-size:13px;padding:4px 10px;border-radius:8px;user-select:none;
        border:1.5px solid \${checked?"#5b3ef5":"#ddd"};
        background:\${checked?"#f4f1ff":"#fff"};\`;
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = checked; cb.style.display = "none";
      cb.addEventListener("change", () => {
        grp.days[d.key] = cb.checked;
        lbl.style.borderColor = cb.checked ? "#5b3ef5" : "#ddd";
        lbl.style.background   = cb.checked ? "#f4f1ff" : "#fff";
        refreshGroupBars(grpIdx, card);
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      lbl.addEventListener("click", () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(d.label));
      row.appendChild(lbl);
    });
    return row;
  }

  function makeTimeRow(grpIdx, grp, tIdx, card){
    const t = grp.times[tIdx];
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
    row.innerHTML = \`
      <input type="time" class="ux-input wd-from" value="\${t.from}" style="width:105px;">
      <span style="color:#aaa;">—</span>
      <input type="time" class="ux-input wd-to"   value="\${t.to}"   style="width:105px;">
      <button type="button" class="wd-remove" style="margin-left:auto;font-size:18px;line-height:1;padding:0 6px;" title="Удалить время">×</button>
    \`;
    row.querySelector(".wd-from").addEventListener("change", e => {
      grp.times[tIdx].from = e.target.value;
      refreshGroupBars(grpIdx, card);
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    row.querySelector(".wd-to").addEventListener("change", e => {
      grp.times[tIdx].to = e.target.value;
      refreshGroupBars(grpIdx, card);
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    row.querySelector(".wd-remove").addEventListener("click", () => {
      grp.times.splice(tIdx, 1);
      renderWeeklyUI();
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    return row;
  }

  function refreshGroupBars(grpIdx, card){
    const st = ensureState();
    const barsEl = card.querySelector(".wd-bars");
    if(barsEl) renderBars(barsEl, true, st.weeklyGroups[grpIdx].times);
  }

  function renderWeeklyUI(){
    const st = ensureState();
    const wrap = el("weekly-days");
    if(!wrap) return;
    wrap.innerHTML = "";

    st.weeklyGroups.forEach((grp, grpIdx) => {
      const card = document.createElement("div");
      card.className = "wd-card";
      card.style.marginBottom = "14px";

      // Header row: "Блок N" + удалить
      const hdr = document.createElement("div");
      hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
      hdr.innerHTML = \`
        <span style="font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:.5px;">
          Блок \${grpIdx + 1}
        </span>
        <button type="button" class="wd-remove" style="font-size:12px;padding:2px 8px;">Удалить блок</button>
      \`;
      hdr.querySelector(".wd-remove").addEventListener("click", () => {
        st.weeklyGroups.splice(grpIdx, 1);
        renderWeeklyUI();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      card.appendChild(hdr);

      // Day pills
      card.appendChild(makeDayPills(grpIdx, grp, card));

      // Time rows
      const timesWrap = document.createElement("div");
      timesWrap.className = "wd-times-wrap";
      grp.times.forEach((_, tIdx) => timesWrap.appendChild(makeTimeRow(grpIdx, grp, tIdx, card)));
      card.appendChild(timesWrap);

      // Add time button
      const addTime = document.createElement("button");
      addTime.type = "button"; addTime.className = "wd-btn";
      addTime.style.cssText = "font-size:12px;padding:4px 12px;margin-top:4px;";
      addTime.textContent = "+ Добавить время";
      addTime.addEventListener("click", () => {
        const last = grp.times[grp.times.length - 1];
        const start = last ? clamp(timeToMin(last.to), timeToMin(BAR_FROM), timeToMin(BAR_TO)-15) : 7*60;
        grp.times.push({ from: minToTime(start), to: minToTime(clamp(start+60,start+15,timeToMin(BAR_TO))) });
        renderWeeklyUI();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      card.appendChild(addTime);

      // Time bar
      const bars = document.createElement("div");
      bars.className = "wd-bars"; bars.style.marginTop = "8px";
      renderBars(bars, true, grp.times);
      card.appendChild(bars);

      wrap.appendChild(card);
    });

    // Add block button
    const addBlock = document.createElement("button");
    addBlock.type = "button"; addBlock.className = "wd-btn";
    addBlock.style.cssText = "width:100%;margin-top:4px;font-size:13px;padding:8px;";
    addBlock.textContent = "+ Добавить блок";
    addBlock.addEventListener("click", () => {
      st.weeklyGroups.push({
        days:{mon:false,tue:false,wed:false,thu:false,fri:false,sat:true,sun:true},
        times:[{from:"10:00",to:"20:00"}]
      });
      renderWeeklyUI();
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    wrap.appendChild(addBlock);
  }

  window.PLANNER_UI = window.PLANNER_UI || {};
  window.PLANNER_UI.renderWeeklyUI = renderWeeklyUI;

  window.PLANNER_UI.validateStep2Schedule = function(){
    const t = document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
    if(t !== "weekly") return true;
    const st = ensureState();
    const groups = st.weeklyGroups || [];
    if(!groups.length) return false;
    for(const grp of groups){
      if(!grp.times?.length) return false;
      if(!DAYS.some(d => grp.days?.[d.key])) return false;
      for(const t of grp.times){
        if(!t.from || !t.to) return false;
        if(timeToMin(t.to) <= timeToMin(t.from)) return false;
      }
    }
    return true;
  };

  function syncScheduleVisibility(){
    const t = document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
    const weekly = document.getElementById("weekly-wrap");
    if(weekly){
      const show = (t === "weekly");
      weekly.style.display = show ? "block" : "none";
      if(show) renderWeeklyUI();
    }
  }

  function bind(){
    document.querySelectorAll('input[name="schedule"]').forEach(r => {
      r.addEventListener("change", () => {
        syncScheduleVisibility();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
    });
    syncScheduleVisibility();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
`);

  // Script block 20
  runScript(`
(function(){
  const startEl = document.getElementById("date-start");
  const endEl   = document.getElementById("date-end");
  if(!startEl || !endEl) return;

  const errorNode = document.createElement("div");
  errorNode.className = "date-error";
  errorNode.textContent = "Дата окончания не может быть раньше даты начала.";
  endEl.closest(".planner-block")?.appendChild(errorNode);

  function clearError(){
    endEl.classList.remove("is-invalid");
    errorNode.style.display = "none";
  }

  function showError(){
    endEl.classList.add("is-invalid");
    errorNode.style.display = "block";
  }

  function syncMin(){
    const s = startEl.value;
    if(!s){
      endEl.min = "";
      clearError();
      return;
    }

    endEl.min = s;

    if(endEl.value && endEl.value < s){
      endEl.value = s;
      showError();
    } else {
      clearError();
    }

    if(typeof window.renderProgress === "function") window.renderProgress();
  }

  function validateEnd(){
    const s = startEl.value;
    const e = endEl.value;
    if(!s || !e){
      clearError();
      return;
    }

    if(e < s){
      endEl.value = s;
      showError();
    } else {
      clearError();
    }

    if(typeof window.renderProgress === "function") window.renderProgress();
  }

  startEl.addEventListener("change", syncMin);
  startEl.addEventListener("input", syncMin);

  endEl.addEventListener("change", validateEnd);
  endEl.addEventListener("input", syncMin);

  syncMin();
  window.addEventListener("pageshow", syncMin);
})();
`);

  // Script block 21 — НДС + комиссия
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function fmtMoney(v){
    return Math.round(v).toLocaleString("ru-RU") + "\u202f₽";
  }

  function getActiveBudget(){
    const mode = document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
    if(mode === "fixed")    return Number(el("budget-input")?.value  || 0);
    if(mode === "goal_ots") return Number(el("goal-ots")?.value      || 0);
    return 0;
  }

  function update(){
    const budget = getActiveBudget();

    // --- НДС ---
    const vatOn   = !!el("vat-enabled")?.checked;
    const vatWrap = el("vat-rate-wrap");
    const vatDisp = el("vat-display");
    if(vatWrap) vatWrap.style.display = vatOn ? "flex" : "none";
    if(vatDisp){
      if(vatOn && budget > 0){
        const rate   = Math.max(0, Number(el("vat-rate")?.value ?? 22));
        const withVat = budget * (1 + rate / 100);
        vatDisp.style.display = "block";
        vatDisp.textContent   = "С НДС " + rate + "%: " + fmtMoney(withVat);
      } else {
        vatDisp.style.display = "none";
      }
    }

    // --- Комиссия ---
    const commOn   = !!el("commission-enabled")?.checked;
    const commWrap = el("commission-rate-wrap");
    const commDisp = el("commission-display");
    if(commWrap) commWrap.style.display = commOn ? "flex" : "none";
    if(commDisp){
      if(commOn && budget > 0){
        const rate = Math.max(0, Number(el("commission-rate")?.value || 0));
        if(rate > 0){
          const placement  = budget / (1 + rate / 100);
          const commission = budget - placement;
          commDisp.style.display = "block";
          commDisp.innerHTML =
            "Стоимость размещения: <b>" + fmtMoney(placement) + "</b>" +
            " &nbsp;/&nbsp; Комиссия: <b>" + fmtMoney(commission) + "</b>";
        } else {
          commDisp.style.display = "none";
        }
      } else {
        commDisp.style.display = "none";
      }
    }
  }

  ["vat-enabled","vat-rate","commission-enabled","commission-rate"].forEach(id => {
    el(id)?.addEventListener("change", update);
    el(id)?.addEventListener("input",  update);
  });

  el("budget-input")?.addEventListener("input", update);
  el("goal-ots")?.addEventListener("input", update);

  document.querySelectorAll('input[name="budget_mode"]').forEach(r =>
    r.addEventListener("change", update)
  );
})();
`);

  // Script block 22 — Floating "Пересчитать" button
  runScript(`
(function(){
  const floatBtn = el("planner-recalc-float");
  const calcBtn  = el("calc-btn");
  if (!floatBtn || !calcBtn) return;

  let hideTimer = null;

  function showFloat(targetEl) {
    if (!window.PLANNER?.lastCalc) return; // только после первого расчёта
    clearTimeout(hideTimer);

    // Позиционируем по Y-центру изменённого элемента, прижимаем к правому краю
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      // Держим кнопку в видимой зоне экрана
      const clampedY = Math.max(60, Math.min(window.innerHeight - 60, y));
      floatBtn.style.top = clampedY + "px";
    }

    floatBtn.style.display = "flex";
    floatBtn.style.opacity = "1";
  }

  function hideFloat() {
    floatBtn.style.opacity = "0";
    hideTimer = setTimeout(() => { floatBtn.style.display = "none"; }, 200);
  }

  // Слушаем любые изменения внутри виджета
  const widget = document.getElementById("planner-widget");
  if (widget) {
    widget.addEventListener("input",  (e) => showFloat(e.target));
    widget.addEventListener("change", (e) => showFloat(e.target));
  }

  // Клик по плавающей кнопке — запускаем расчёт
  floatBtn.addEventListener("click", () => {
    hideFloat();
    calcBtn.click();
  });

  // После завершения расчёта — скрываем кнопку
  window.addEventListener("planner:calc-done", hideFloat);
})();
`);

})();
