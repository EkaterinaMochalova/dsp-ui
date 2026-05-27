<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import { get } from 'svelte/store'
  import L from 'leaflet'
  import 'leaflet/dist/leaflet.css'
  import { api } from '../../lib/api.js'
  import { currentUser } from '../../lib/stores.js'
  import { formatMoney, mapInventory } from '../../lib/utils.js'
  import ScheduleModal from '../../components/ScheduleModal.svelte'

  // Cache version management is owned entirely by api.inventories.allMapped().
  // Do NOT reset window._dspScreensCache here — that would wipe __inflight__
  // and cause duplicate fetches even when a prefetch is already running.

  const dispatch = createEventDispatcher()
  export let draft

  if (!draft.screenIds) draft.screenIds = []
  if (!draft.schedule)  draft.schedule  = null   // bool[7][24], null = all hours

  // ── Schedule modal ────────────────────────────────────────────────────
  let scheduleOpen = false
  function onScheduleSave(e) {
    draft.schedule = e.detail
    scheduleOpen = false
  }

  // Map
  let mapEl
  let map
  let markersLayer
  let loading = true
  let loadingProgress = 0   // 0–100
  let error = ''
  let screens = []
  let totalLoaded = 0

  // Map overlays
  let otsOverlay = false
  let cameraOverlay = false
  let activeOnly = false   // hide screens with requestHourlyAvg ≤ 1

  // ── Pre-campaign scoring ──────────────────────────────────────────────
  let preCampaignOpen  = false
  let preCampaignLoading = false
  let preCampaignError = ''
  let scoreMap = {}        // inventoryId → score (0..1)
  let scoreSortActive = false   // when true, sort by score desc

  // Interests for pre-campaign — two-level tree scraped from prod app
  // filters/interests endpoint returns 404; tree is hardcoded as fallback
  // Hardcoded slug map — avoids transliteration guesswork.
  // Format: 'Display name': [parentSlug, childSlug] (or [slug] for top-level)
  const PC_SLUG_MAP = {
    // ── Автомобили ──────────────────────────────────────────────────────────
    'Автомобили':                    ['avtomobili'],
    'Премиум класс':                 ['avtomobili','avtomobili_priemium_klass'],
    'Средний класс':                 ['avtomobili','avtomobili_sriedniy_klass'],
    'Эконом класс':                  ['avtomobili','avtomobili_ekonom_klass'],
    'Автобарахолка':                 ['avtomobili','avtomobili_avtobarakholka'],
    'Автосервисы':                   ['avtomobili','avtomobili_avtosiervisy'],
    'Запчасти и сервис':             ['avtomobili','avtomobili_zapchasti_i_siervis'],
    'Покупка нового автомобиля':     ['avtomobili','avtomobili_pokupka_novogo_avtomobilya'],
    'Автовладельцы':                 ['avtomobili','avtomobili_avtovladieltsy'],
    'Мотоциклы':                     ['avtomobili','avtomobili_mototsikly'],
    // ── Досуг ────────────────────────────────────────────────────────────────
    'Досуг':                         ['dosug'],
    'Досуг и развлечения':           ['dosug','dosug_dosug_i_razvliechieniya'],
    'Знакомства':                    ['dosug','dosug_znakomstva'],
    'Фильмы и сериалы':              ['dosug','dosug_filmy_i_sierialy'],
    'Книги':                         ['dosug','dosug_knigi'],
    'Культурный отдых, афиша':       ['dosug','dosug_kulturnyy_otdykh_afisha'],
    'Рестораны, Кафе':               ['dosug','dosug_riestorany_kafie'],
    'Бары':                          ['dosug','dosug_bary'],
    'Онлайн кинотеатры':             ['dosug','dosug_onlayn_kinotieatry'],
    'Футбол':                        ['dosug','dosug_futbol'],
    'Юмор':                          ['dosug','dosug_yumor'],
    'Цветы':                         ['dosug','dosug_tsviety'],
    // ── Новости ──────────────────────────────────────────────────────────────
    'Новости':                       ['novosti'],
    'Культура':                      ['novosti','novosti_kultura'],
    'Наука и техника':               ['novosti','novosti_nauka_i_tiekhnika'],
    'Общество':                      ['novosti','novosti_obshchiestvo'],
    'Политика':                      ['novosti','novosti_politika'],
    'События':                       ['novosti','novosti_sobytiya'],
    'Спорт':                         ['novosti','novosti_sport'],
    'Экономика':                     ['novosti','novosti_ekonomika'],
    // ── Здоровье ─────────────────────────────────────────────────────────────
    'Здоровье':                      ['zdorovye'],
    'Аптеки':                        ['zdorovye','zdorovye_aptieki'],
    'Здоровое питание':              ['zdorovye','zdorovye_zdorovoye_pitaniye'],
    'Клиники':                       ['zdorovye','zdorovye_kliniki'],
    'Лекарственные препараты и БАДы':['zdorovye','zdorovye_liekarstviennyye_prepartay_i_bady'],
    // ── Техника / Электроника / etc ───────────────────────────────────────────
    'Техника':                       ['tiekhnika'],
    'Электроника':                   ['eliektronika'],
    'Мобильная связь':               ['mobilnaya_svyaz'],
    'Кулинария':                     ['kulinariya'],
    'Недвижимость':                  ['niedvizhimost'],
    'Обустройство и ремонт':         ['obustroystvo_i_riemont'],
    'Зоотовары':                     ['zootovary'],
    'Образование':                   ['obrazovanie'],
    'Одежда, обувь и аксессуары':    ['odiezhda_obuv_i_aksiessuary'],
    'Семья':                         ['siemya'],
    'Путешествия':                   ['putieshiestviya'],
    'Страхование':                   ['strakhovanie'],
    'Финансы':                       ['finansy'],
    'Детские товары':                ['dietskiye_tovary'],
    // ── Красота и уход за собой ───────────────────────────────────────────────
    'Красота и уход за собой':       ['krasota_i_ukhod_za_soboy'],
    'Средства по уходу':             ['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_sriedstva_po_ukhodu'],
    'Косметика и парфюмерия':        ['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_kosmietika_i_parfyumieriya'],
    'Техника для красоты и здоровья':['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_tiekhnika_dlya_krasoty_i_zdorovya'],
    'Лазерная эпиляция':             ['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_laziernaya_epilyatsiya'],
    'Салоны красоты':                ['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_salony_krasoty'],
    'Маникюр':                       ['krasota_i_ukhod_za_soboy','krasota_i_ukhod_za_soboy_manikyur'],
    // ── Доход ────────────────────────────────────────────────────────────────
    'Доход':                         ['dokhod'],
  }

  // Build the interest tree from slug map for the dropdown grouping
  const PC_INTEREST_TREE = (() => {
    const parents = Object.entries(PC_SLUG_MAP)
      .filter(([, s]) => s.length === 1)
      .map(([name]) => name)
    const tree = {}
    for (const p of parents) tree[p] = []
    for (const [name, slugs] of Object.entries(PC_SLUG_MAP)) {
      if (slugs.length === 2) {
        const parent = parents.find(p => slugs[0] === PC_SLUG_MAP[p]?.[0])
        if (parent && tree[parent]) tree[parent].push(name)
      }
    }
    return tree
  })()
  const PC_TOP_INTERESTS = Object.keys(PC_INTEREST_TREE)

  let pcDmpId = null           // selected DMP connection id
  let pcDmpConnections = []    // [{id, name}] — filtered to agency-configured DMPs
  let pcDmpLoaded = false      // guard: only fetch once per panel open cycle

  let pcSelectedSub = ''   // selected interest display name
  let pcAffinityMin = 0    // 0-100 minimum affinity threshold

  // Look up slugs directly from hardcoded map — no transliteration guesswork
  function pcInterestSlugs(name) {
    if (!name) return []
    return PC_SLUG_MAP[name] ?? []
  }

  async function loadPcDmpConnections() {
    if (pcDmpLoaded) return
    pcDmpLoaded = true

    // 1. If user already has DMP segments selected, grab the connection ID from there
    if (draft.dmpData?.length > 0 && pcDmpId == null) {
      pcDmpId = draft.dmpData[0].dmpId ?? null
    }

    // 2. Try to get agency-specific DMP IDs from the current user's agency profile
    let agencyDmpIds = null
    try {
      const me = get(currentUser)
      console.log('[PC] currentUser snippet:', JSON.stringify(me).substring(0, 400))

      // Check if DMP connections are embedded directly in the user/agency object
      const directDmps = me?.agency?.dmpConnections ?? me?.agency?.dmps
        ?? me?.agency?.dmpData ?? me?.dmpConnections ?? null
      if (Array.isArray(directDmps) && directDmps.length > 0) {
        agencyDmpIds = new Set(directDmps.map(d => d.id ?? d.dmpId).filter(Boolean))
        console.log('[PC] agency DMP IDs from user profile:', [...agencyDmpIds])
      }

      // Otherwise, fetch the agency profile explicitly
      if (!agencyDmpIds?.size) {
        const agencyId = me?.agency?.id ?? me?.agencyId
          ?? me?.accountDetails?.agencyId ?? null
        if (agencyId != null) {
          try {
            const agencyRes = await api.agencies.get(agencyId)
            console.log('[PC] agency profile snippet:', JSON.stringify(agencyRes).substring(0, 400))
            const dmps = agencyRes?.dmpConnections ?? agencyRes?.dmps
              ?? agencyRes?.dmpData ?? []
            if (dmps.length > 0) {
              agencyDmpIds = new Set(dmps.map(d => d.id ?? d.dmpId).filter(Boolean))
              console.log('[PC] agency DMP IDs from agency profile:', [...agencyDmpIds])
            }
          } catch (e) {
            console.warn('[PC] agency profile fetch failed:', e?.status)
          }
        }
      }
    } catch (e) {
      console.warn('[PC] failed to read currentUser:', e?.message)
    }

    // 3. GET /clients/dmp — list DMPs, filtered by agency config when available
    try {
      const res = await api.dmp.list()
      const all = Array.isArray(res) ? res : (res?.content ?? [])
      let list
      if (agencyDmpIds?.size > 0) {
        // Show only DMPs the agency has configured
        list = all.filter(d => agencyDmpIds.has(d.id))
        console.log('[PC] DMPs filtered by agency config:', JSON.stringify(list).substring(0, 300))
      } else {
        // Fallback: show explicitly active/connected DMPs
        list = all.filter(d => d.active === true || d.connected === true || d.status === 'CONNECTED')
        console.log('[PC] DMPs (active/connected fallback):', JSON.stringify(list).substring(0, 300))
      }
      if (list.length > 0) {
        pcDmpConnections = list
        if (pcDmpId == null) pcDmpId = list[0].id
      }
    } catch (e) {
      console.warn('[PC] /clients/dmp failed:', e?.status, JSON.stringify(e?.data ?? e?.message ?? '').substring(0, 200))
    }

    // 4. Fallback: possibleDmpSegments — inspect first segment for a connection/dmp id
    if (pcDmpId == null) {
      try {
        const payload = draft.id ? { campaignId: draft.id } : {}
        const res = await api.campaigns.possibleDmpSegments(payload)
        const segs = Array.isArray(res) ? res : (res?.content ?? res?.data ?? [])
        console.log('[PC] possibleDmpSegments first seg keys:', segs.length > 0 ? Object.keys(segs[0]) : 'empty', JSON.stringify(segs[0] ?? {}).substring(0, 300))
        if (segs.length > 0) {
          const connectionId = segs[0].connectionId ?? segs[0].dmpConnectionId ?? segs[0].dmpId ?? segs[0].id
          if (connectionId != null) {
            pcDmpId = connectionId
            pcDmpConnections = [{ id: connectionId, name: segs[0].dmpName ?? segs[0].provider ?? segs[0].name ?? String(connectionId) }]
          }
        }
      } catch (e) {
        console.warn('[PC] possibleDmpSegments failed:', e?.status)
      }
    }

    console.log('[PC] final pcDmpId:', pcDmpId, 'connections:', pcDmpConnections.length)
  }

  $: if (preCampaignOpen) loadPcDmpConnections()


  // Freehand draw tool
  let drawMode = false       // lasso active
  let drawPoints = []        // array of L.LatLng
  let drawPolyline = null    // live L.Polyline during drag
  let drawPolygon = null     // finished L.Polygon (shown briefly)
  let drawLayer = null       // L.LayerGroup for draw visuals

  function toggleDrawMode() {
    drawMode = !drawMode
    if (map) map.dragging[drawMode ? 'disable' : 'enable']()
    if (!drawMode) clearDraw()
  }

  function clearDraw() {
    if (drawLayer) drawLayer.clearLayers()
    drawPoints = []
    drawPolyline = null
    drawPolygon = null
  }

  // Ray-casting point-in-polygon for lat/lon points
  function pointInPolygon(lat, lon, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].lat, yi = poly[i].lng
      const xj = poly[j].lat, yj = poly[j].lng
      const intersect = ((yi > lon) !== (yj > lon)) &&
        (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  function onMapMouseDown(e) {
    if (!drawMode) return
    clearDraw()
    drawPoints = [e.latlng]
    drawPolyline = L.polyline([e.latlng], {
      color: '#2563EB', weight: 2, dashArray: '6 4', opacity: 0.85,
    }).addTo(drawLayer)
  }

  function onMapMouseMove(e) {
    if (!drawMode || !drawPolyline) return
    drawPoints.push(e.latlng)
    drawPolyline.setLatLngs(drawPoints)
  }

  function onMapMouseUp() {
    if (!drawMode || !drawPolyline || drawPoints.length < 3) {
      clearDraw()
      return
    }
    // Close the shape visually
    drawLayer.clearLayers()
    drawPolygon = L.polygon(drawPoints, {
      color: '#2563EB', weight: 2, fillColor: '#2563EB', fillOpacity: 0.08,
    }).addTo(drawLayer)

    // Select only from currently filtered screens (respects OTS/camera toggles)
    const hits = filtered.filter(s =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
      pointInPolygon(s.lat, s.lon, drawPoints)
    )
    if (hits.length) {
      draft.screenIds = [...new Set([...draft.screenIds, ...hits.map(s => s.id)])]
      renderMarkers(filtered)
    }

    // Clear the polygon after 1.5 s
    setTimeout(() => {
      clearDraw()
      drawMode = false
      if (map) map.dragging.enable()
    }, 1500)
  }

  // Panel state
  let panelHeight = 280   // px, draggable
  let dragging = false
  let dragStartY = 0
  let dragStartH = 0

  // Table state
  let activeTab = 'all'   // 'all' | 'selected'
  let tableSearch = ''

  // Column filters — keyed by column id
  // Dropdown filters store an array of selected values (multiselect); empty = no filter.
  let colFilters = {
    // dropdown (multiselect arrays)
    owner: [], city: [], side: [], format: [], photoReport: [],
    // range (stored as { min: '', max: '' })
    minBid: { min: '', max: '' },
    ots:    { min: '', max: '' },
    grp:    { min: '', max: '' },
    duration: { min: '', max: '' },
    requestHourlyAvg: { min: '', max: '' },
    lat: { min: '', max: '' },
    lon: { min: '', max: '' },
  }

  // Sort state
  let sortCol = ''   // 'gid'|'owner'|'city'|'side'|'format'|'size'|'minBid'|'ots'
  let sortDir = 1    // 1 = asc, -1 = desc

  // Open filter dropdown
  let openFilterCol = ''
  let dropdownSearch = ''   // search query inside searchable dropdowns

  function toggleSort(col) {
    if (sortCol === col) sortDir = -sortDir
    else { sortCol = col; sortDir = 1 }
  }

  function toggleFilter(col, e) {
    e.stopPropagation()
    const next = openFilterCol === col ? '' : col
    openFilterCol = next
    dropdownSearch = ''
  }

  function setColFilter(col, val) {
    colFilters = { ...colFilters, [col]: val }
    openFilterCol = ''
    dropdownSearch = ''
  }

  // Toggle one option in a multiselect dropdown filter.
  // Passing val='' clears the selection and closes the dropdown.
  function toggleColFilterOpt(col, val) {
    if (val === '') {
      colFilters = { ...colFilters, [col]: [] }
      openFilterCol = ''
      dropdownSearch = ''
      return
    }
    const current = colFilters[col] ?? []
    const already = current.includes(val)
    colFilters = { ...colFilters, [col]: already ? current.filter(v => v !== val) : [...current, val] }
    // keep dropdown open for multi-selection
  }

  // Columns whose dropdown should have a search box (when options > 6)
  const SEARCHABLE_COLS = new Set(['city', 'owner'])

  // Close filter dropdown / col picker / map search on outside click
  function onDocClick() { openFilterCol = ''; dropdownSearch = ''; colPickerOpen = false; closeMapSearch() }

  // Unique values per filterable column (from ALL screens, not filtered)
  $: colOptions = {
    owner:       [...new Set(screens.map(s => s.owner).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ru')),
    city:        [...new Set(screens.map(s => s.city).filter(Boolean))].sort((a,b) => a.localeCompare(b,'ru')),
    side:        [...new Set(screens.map(s => s.side).filter(Boolean))].sort(),
    format:      [...new Set(screens.map(s => s.format).filter(Boolean))].sort(),
    photoReport: [...new Set(screens.map(s => s.photoReport).filter(Boolean))].sort(),
  }

  // Range filter helper
  function inRange(val, f) {
    if (f.min !== '' && val != null && val < Number(f.min)) return false
    if (f.max !== '' && val != null && val > Number(f.max)) return false
    return true
  }

  // Derived — OTS/camera/active map toggles + column filters + text search
  $: filtered = screens.filter(s => {
    if (otsOverlay    && !(s.ots > 0))             return false
    if (cameraOverlay && !s.hasCamera)             return false
    if (activeOnly    && !(s.requestHourlyAvg > 1)) return false
    if (colFilters.owner.length       && !colFilters.owner.includes(s.owner))             return false
    if (colFilters.city.length        && !colFilters.city.includes(s.city))               return false
    if (colFilters.side.length        && !colFilters.side.includes(s.side))               return false
    if (colFilters.format.length      && !colFilters.format.includes(s.format))           return false
    if (colFilters.photoReport.length && !colFilters.photoReport.includes(s.photoReport)) return false
    if (!inRange(s.minBid, colFilters.minBid)) return false
    if (!inRange(s.ots,    colFilters.ots))    return false
    if (!inRange(s.grp,    colFilters.grp))    return false
    if (!inRange(s.duration, colFilters.duration)) return false
    if (!inRange(s.requestHourlyAvg, colFilters.requestHourlyAvg)) return false
    if (!inRange(s.lat, colFilters.lat)) return false
    if (!inRange(s.lon, colFilters.lon)) return false
    // Live affinity threshold filter — filter using normalised t (same scale as scoreColor)
    if (scoreSortActive) {
      const sc = scoreMap[s.id]
      if (sc == null) return false
      const t = Math.max(0, Math.min(1, (sc - scoreMin) / scoreRange))
      if (t < pcAffinityMin / 100) return false
    }
    if (!tableSearch) return true
    const q = tableSearch.toLowerCase()
    return s.address.toLowerCase().includes(q)
      || s.city.toLowerCase().includes(q)
      || s.owner.toLowerCase().includes(q)
      || s.gid.toLowerCase().includes(q)
  })

  // Sort comparator
  function cmpVal(s, col) {
    if (col === 'score') return scoreMap[s.id] ?? -Infinity
    const numCols = ['minBid','ots','grp','duration','requestHourlyAvg','score']
    if (numCols.includes(col)) return s[col] ?? -Infinity
    return (s[col] ?? '').toString().toLowerCase()
  }

  $: sortedFiltered = (() => {
    if (scoreSortActive && !sortCol) {
      // Sort by pre-campaign score descending (unscored screens go last)
      return [...filtered].sort((a, b) => (scoreMap[b.id] ?? -1) - (scoreMap[a.id] ?? -1))
    }
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const av = cmpVal(a, sortCol), bv = cmpVal(b, sortCol)
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir
    })
  })()

  $: tabRows = activeTab === 'selected'
    ? sortedFiltered.filter(s => draft.screenIds.includes(s.id))
    : sortedFiltered

  // Reactive score range — used in both filtered and renderMarkers
  $: scoreValues = Object.values(scoreMap)
  $: scoreMin    = scoreValues.length ? Math.min(...scoreValues) : 0
  $: scoreMax    = scoreValues.length ? Math.max(...scoreValues) : 1
  $: scoreRange  = (scoreMax - scoreMin) || 1

  $: if (map && markersLayer) { scoreMap; pcAffinityMin; renderMarkers(filtered) }

  function isSelected(id) { return draft.screenIds.includes(id) }

  function toggleScreen(id) {
    draft.screenIds = isSelected(id)
      ? draft.screenIds.filter(x => x !== id)
      : [...draft.screenIds, id]
  }

  function toggleAll() {
    const visibleIds = tabRows.map(s => s.id)
    const allSelected = visibleIds.every(id => draft.screenIds.includes(id))
    if (allSelected) {
      draft.screenIds = draft.screenIds.filter(id => !visibleIds.includes(id))
    } else {
      draft.screenIds = [...new Set([...draft.screenIds, ...visibleIds])]
    }
  }

  $: allVisible = tabRows.length > 0 && tabRows.every(s => draft.screenIds.includes(s.id))
  $: someVisible = tabRows.some(s => draft.screenIds.includes(s.id))

  // Keep draft.screenObjects in sync so StepSummary can display screen details
  $: if (screens.length > 0) {
    draft.screenObjects = screens.filter(s => draft.screenIds.includes(s.id))
  }

  async function runPreCampaign() {
    preCampaignLoading = true
    preCampaignError   = ''
    try {
      // Build payload — send both parent+child slugs as prod app does
      const slugs = pcInterestSlugs(pcSelectedSub)
      // Generate client-side UUID as required by PreCampaignApiRequest schema
      const clientRequestId = crypto.randomUUID()
      const payload = {
        requestId:    clientRequestId,
        cities:       (draft.cityIds ?? []).map(id => ({ id, zipCodes: [] })),
        inventories:  screens.map(s => s.id),
        segmentation: slugs,
      }
      if (pcDmpId != null) payload.dmpId = pcDmpId
      console.log('[PC] payload:', JSON.stringify({ ...payload, inventories: `[${payload.inventories.length} ids]` }))

      const res1 = await api.campaigns.preCampaignData(payload)
      console.log('[PC] res1 isArray:', Array.isArray(res1), 'type:', typeof res1,
        'keys:', (!Array.isArray(res1) && res1) ? Object.keys(res1) : '-',
        'length:', Array.isArray(res1) ? res1.length : '-')
      console.log('[PC] res1 first item:', JSON.stringify(Array.isArray(res1) ? res1[0] : res1))

      // Normalise to flat list of scored items.
      // Known shapes:
      //   flat array:                          [{inventory:{id},score},...]
      //   PreCampaignGroupedByCity wrapper:    {"data":[{city:{},inventories:[...]},...],"status":"READY"}
      //   other wrappers:                      {content:[...]} / {inventories:[...]}
      let raw = Array.isArray(res1) ? res1
        : Array.isArray(res1?.data)        ? res1.data
        : Array.isArray(res1?.content)     ? res1.content
        : Array.isArray(res1?.inventories) ? res1.inventories
        : []

      // Flatten city groups: [{city:{},inventories:[...]},...] → flat items
      let items = (raw.length > 0 && Array.isArray(raw[0]?.inventories))
        ? raw.flatMap(g => g.inventories ?? [])
        : raw

      console.log('[PC] items count:', items.length, 'first:', JSON.stringify(items[0]))

      const map  = {}
      for (const item of items) {
        const id = item.inventory?.id ?? item.inventoryId ?? item.id
        const sc = item.score ?? item.affinity ?? item.affinityScore
        if (id != null && sc != null) {
          if (map[id] == null || sc > map[id]) map[id] = sc
        }
      }
      scoreMap = map
      const cnt = Object.keys(map).length
      if (cnt === 0) {
        preCampaignError = 'Нет данных скоров для этой кампании'
      } else {
        scoreSortActive  = true
        preCampaignOpen  = false
        // Auto-show the Score column so users see affinity values
        const scoreCol = cols.find(c => c.id === 'score')
        if (scoreCol && !scoreCol.visible) {
          scoreCol.visible = true
          cols = cols
          saveColState()
        }
      }
    } catch (e) {
      if (e?.status === 400) {
        preCampaignError = 'Данная категория недоступна для выбранного DMP. Попробуйте другую.'
      } else {
        const apiMsg = e?.data?.message ?? e?.data?.error
          ?? (typeof e?.data === 'string' ? e.data : null)
          ?? e?.message
        preCampaignError = 'Ошибка ' + (e?.status ? e.status + ': ' : '') + (apiMsg ?? 'неизвестная ошибка')
      }
    } finally {
      preCampaignLoading = false
    }
  }

  function clearPreCampaign() {
    scoreMap = {}
    scoreSortActive = false
    preCampaignError = ''
    pcSelectedSub = ''
    pcAffinityMin = 0
    // Hide score column when scores are cleared
    const scoreCol = cols.find(c => c.id === 'score')
    if (scoreCol && scoreCol.visible) {
      scoreCol.visible = false
      cols = cols
      saveColState()
    }
  }

  onMount(() => {
    loadScreens()
  })

  // Init map on mount (loading is always false now — progress shown via badge)
  $: if (!map && mapEl) initMap()

  onDestroy(() => {
    if (map) { map.remove(); map = null }
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('mousemove', onColResizeMove)
    window.removeEventListener('mouseup',   onColResizeEnd)
  })

  // Progress state shown as a floating badge while screens stream in
  let fetchedPages = 0
  let totalPages = 0
  let screensLoading = false   // true from loadScreens() start until first page (or cache hit)

  async function loadScreens() {
    screensLoading = true
    loading = false   // show the map container immediately — progress shown via badge
    loadingProgress = 0; error = ''
    fetchedPages = 0; totalPages = 0

    const selectedCityIds = draft.cityIds ?? []
    const selectedCities  = draft.cities  ?? []
    const cacheKey = selectedCities.length > 0
      ? [...selectedCities].sort().join('|')
      : '__all__'

    // In-memory cache hit — instant (guard length > 0: empty [] is truthy but stale)
    if (window._dspScreensCache?.[cacheKey]?.length > 0) {
      screens = window._dspScreensCache[cacheKey]
      totalLoaded = screens.length
      screensLoading = false
      return
    }

    // Fast-path: __all__ cache already populated (e.g. by allMapped prefetch).
    // Filter it by city names instead of re-fetching everything from the server.
    if (selectedCities.length > 0 && window._dspScreensCache?.['__all__']?.length > 0) {
      const citySet = new Set(selectedCities.map(c => c.trim().toLowerCase()))
      const cityFiltered = window._dspScreensCache['__all__'].filter(s =>
        citySet.has((s.city ?? '').trim().toLowerCase())
      )
      if (cityFiltered.length > 0) {
        screens = cityFiltered
        totalLoaded = cityFiltered.length
        screensLoading = false
        if (!window._dspScreensCache) window._dspScreensCache = {}
        window._dspScreensCache[cacheKey] = cityFiltered
        return
      }
      // City not found in __all__ cache — fall through to server fetch
    }

    // Cache cold but campaign has saved screen objects — show selected screens
    // immediately while the full list loads in the background.
    if ((draft.screenObjects ?? []).length > 0) {
      screens = draft.screenObjects
      totalLoaded = draft.screenObjects.length
      screensLoading = false
      // Continue loading to get the full list (don't return)
    }

    const PAGE = 500

    // Helper: apply city-name filter as a secondary safety net.
    // Used after both server-side and client-side fetches to ensure the city
    // filter is always respected even if the backend ignores cityIds param.
    function applyCityFilter(items) {
      if (selectedCities.length === 0) return items
      const citySet = new Set(selectedCities.map(c => c.trim().toLowerCase()))
      const filtered = items.filter(s => citySet.has((s.city ?? '').trim().toLowerCase()))
      // Only apply if the filter actually narrows the results (> 0 and < total).
      // If 0 results the backend city-ID filter may be more accurate — keep raw items.
      return filtered.length > 0 ? filtered : items
    }

    try {
      if (selectedCityIds.length > 0) {
        // ── City-filtered: server-side filter, 1–few pages ──────────────
        const qs = selectedCityIds.map(id => `cityIds=${id}`).join('&')
        const first = await api.inventories.listRaw(`enabled=true&${qs}&page=0&size=${PAGE}`)
        totalPages = first.totalPages ?? 1; fetchedPages = 1
        screensLoading = false
        let items = [...(first.content ?? [])]

        for (let p = 1; p < totalPages; p++) {
          try {
            const r = await api.inventories.listRaw(`enabled=true&${qs}&page=${p}&size=${PAGE}`)
            items.push(...(r?.content ?? []))
          } catch {}
          fetchedPages = p + 1
        }

        let mapped = items.map(mapInventory).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
        // Secondary city-name filter — guards against server ignoring cityIds param
        mapped = applyCityFilter(mapped)
        screens = mapped; totalLoaded = mapped.length
        if (mapped.length > 0) {
          if (!window._dspScreensCache) window._dspScreensCache = {}
          window._dspScreensCache[cacheKey] = mapped
        }

      } else {
        // ── No filter: stream all pages, show each batch on map ─────────
        const first = await api.inventories.list({ page: 0, size: PAGE })
        totalPages = first.totalPages ?? 1; fetchedPages = 1
        screensLoading = false
        const partial = (first.content ?? []).map(mapInventory).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
        // Don't show intermediate total when a city filter is active — avoids confusing "381 экранов" flash
        screens = partial
        totalLoaded = selectedCities.length > 0 ? partial.length : (first.totalElements ?? partial.length)

        for (let p = 1; p < totalPages; p++) {
          try {
            const r = await api.inventories.list({ page: p, size: PAGE })
            const more = (r?.content ?? []).map(mapInventory).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
            screens = [...screens, ...more]
          } catch {}
          fetchedPages = p + 1
        }
        // Always cache the full unfiltered set under '__all__'
        if (screens.length > 0) {
          if (!window._dspScreensCache) window._dspScreensCache = {}
          window._dspScreensCache['__all__'] = screens
        }
        // If city names were selected but cityIds were unavailable, filter client-side
        if (selectedCities.length > 0) {
          const citySet = new Set(selectedCities.map(c => c.trim().toLowerCase()))
          const cityFiltered = screens.filter(s => citySet.has((s.city ?? '').trim().toLowerCase()))
          screens = cityFiltered.length > 0 ? cityFiltered : screens
          totalLoaded = screens.length
          if (cityFiltered.length > 0) {
            if (!window._dspScreensCache) window._dspScreensCache = {}
            window._dspScreensCache[cacheKey] = cityFiltered
          }
        } else {
          totalLoaded = screens.length
        }
      }
    } catch (e) {
      screensLoading = false
      if (screens.length === 0) error = 'Не удалось загрузить экраны'
      console.error('[loadScreens]', e)
    }
  }

  function initMap() {
    if (!mapEl || map) return
    map = L.map(mapEl, { center: [55.75, 37.62], zoom: 5, zoomControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    markersLayer = L.layerGroup().addTo(map)
    drawLayer   = L.layerGroup().addTo(map)
    renderMarkers(filtered)

    // Re-render on pan/zoom to keep only visible markers
    map.on('moveend zoomend', () => renderMarkers(filtered))

    // Freehand draw events
    map.on('mousedown', onMapMouseDown)
    map.on('mousemove', onMapMouseMove)
    map.on('mouseup',   onMapMouseUp)

    if (screens.length > 0) {
      const valid = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))
      if (valid.length) map.fitBounds(L.latLngBounds(valid.map(s => [s.lat, s.lon])), { padding: [40, 40], maxZoom: 7 })
    }
  }

  // Cap at 2000 visible markers for performance; always show selected ones
  const MAX_VISIBLE = 2000

  function renderMarkers(list) {
    if (!markersLayer || !map) return
    markersLayer.clearLayers()

    const bounds = map.getBounds().pad(0.1)
    const zoom = map.getZoom()

    // At low zoom, cluster by grid to avoid 22k dots
    let visible = list.filter(s =>
      Number.isFinite(s.lat) && Number.isFinite(s.lon) && bounds.contains([s.lat, s.lon])
    )

    // Selected always shown regardless of limit
    const selected = visible.filter(s => isSelected(s.id))
    const unselected = visible.filter(s => !isSelected(s.id))

    // At low zoom subsample unselected to MAX_VISIBLE
    const maxUnsel = Math.max(0, MAX_VISIBLE - selected.length)
    const toRender = zoom >= 10
      ? [...selected, ...unselected]
      : [...selected, ...unselected.slice(0, maxUnsel)]

    // scoreMin/Max/Range are reactive at module scope — use them directly here
    // Interpolate red→yellow→green given a 0..1 normalised t
    function scoreColor(sc) {
      const t = Math.max(0, Math.min(1, (sc - scoreMin) / scoreRange))
      if (t >= 0.67) return { fill: '#22c55e', stroke: '#15803d' }   // green
      if (t >= 0.40) return { fill: '#84cc16', stroke: '#4d7c0f' }   // lime
      if (t >= 0.20) return { fill: '#f59e0b', stroke: '#b45309' }   // amber
      return              { fill: '#ef4444', stroke: '#b91c1c' }      // red
    }

    const hasScores = scoreValues.length > 0

    for (const s of toRender) {
      const sel      = isSelected(s.id)
      const inactive = s.requestHourlyAvg != null && s.requestHourlyAvg <= 1
      let fill, stroke, opacity = 0.75
      if (sel) {
        fill = '#112853'; stroke = '#112853'; opacity = 0.95
      } else if (scoreMap[s.id] != null) {
        const c = scoreColor(scoreMap[s.id])
        fill = c.fill; stroke = c.stroke; opacity = 0.85
      } else if (hasScores) {
        // Unscored screen while score mode is active — dim grey
        fill = '#d1d5db'; stroke = '#9ca3af'; opacity = 0.45
      } else if (inactive) {
        fill = '#EF4444'; stroke = '#B91C1C'
      } else {
        fill = '#55C1FA'; stroke = '#2a8fb5'
      }
      const m = L.circleMarker([s.lat, s.lon], {
        radius: sel ? 8 : zoom >= 10 ? 6 : 4,
        fillColor: fill,
        color: stroke,
        weight: sel ? 2 : 1,
        fillOpacity: opacity,
      })
      m.bindTooltip(
        `<strong>${s.address || s.city}</strong><br/>${s.format || ''}${s.minBid ? `<br/>от ${formatMoney(s.minBid)}` : ''}`,
        { direction: 'top', offset: [0, -4] }
      )
      m.on('click', () => { toggleScreen(s.id); renderMarkers(filtered) })
      markersLayer.addLayer(m)
    }
  }

  function focusScreen(s) {
    if (map && Number.isFinite(s.lat) && Number.isFinite(s.lon))
      map.setView([s.lat, s.lon], 14)
  }

  // Drag to resize panel
  function onDragStart(e) {
    dragging = true
    dragStartY = e.clientY
    dragStartH = panelHeight
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    e.preventDefault()
  }

  function onDragMove(e) {
    if (!dragging) return
    const delta = dragStartY - e.clientY
    panelHeight = Math.max(120, Math.min(600, dragStartH + delta))
  }

  function onDragEnd() {
    dragging = false
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
  }

  // ── Column configuration ──────────────────────────────────────────────
  const COL_STATE_KEY = 'dsp_screens_cols_v2'

  let cols = [
    { id:'gid',              label:'GID',                                   visible: true,  width: 90  },
    { id:'owner',            label:'Оператор',        filterType:'dropdown', visible: true,  width: 130 },
    { id:'city',             label:'Город',           filterType:'dropdown', visible: true,  width: 100 },
    { id:'side',             label:'Сторона',         filterType:'dropdown', visible: true,  width: 80  },
    { id:'format',           label:'Формат',          filterType:'dropdown', visible: true,  width: 120 },
    { id:'size',             label:'Размер',                                 visible: true,  width: 100 },
    { id:'minBid',           label:'Мин. ставка',     filterType:'range',    visible: true,  width: 110 },
    { id:'ots',              label:'OTS',             filterType:'range',    visible: true,  width: 90  },
    { id:'grp',              label:'GRP',             filterType:'range',    visible: false, width: 80  },
    { id:'duration',         label:'Длительность, с', filterType:'range',    visible: false, width: 130 },
    { id:'requestHourlyAvg', label:'Запросы/час',     filterType:'range',    visible: true,  width: 110 },
    { id:'score',            label:'Score',           filterType:'range',    visible: false, width: 80  },
    { id:'resolution',       label:'Разрешение',                             visible: false, width: 110 },
    { id:'address',          label:'Адрес',                                  visible: true,  width: 200 },
    { id:'lat',              label:'Широта',          filterType:'range',    visible: false, width: 90  },
    { id:'lon',              label:'Долгота',         filterType:'range',    visible: false, width: 90  },
    { id:'photoReport',      label:'Фотоотчёт',       filterType:'dropdown', visible: false, width: 100 },
    { id:'description',      label:'Описание',                               visible: false, width: 160 },
  ];

  // Load persisted order/visibility/widths
  (function loadColState() {
    try {
      const saved = JSON.parse(localStorage.getItem(COL_STATE_KEY) || 'null')
      if (!saved || !Array.isArray(saved)) return
      const savedMap = Object.fromEntries(saved.map(c => [c.id, c]))
      const savedIds = saved.map(c => c.id).filter(id => cols.some(c => c.id === id))
      const reordered = savedIds.map(id => {
        const col = cols.find(c => c.id === id)
        const s   = savedMap[id]
        return { ...col, visible: s.visible ?? col.visible, width: s.width ?? col.width }
      })
      for (const col of cols) {
        if (!savedIds.includes(col.id)) reordered.push(col)
      }
      cols = reordered
    } catch {}
  })()

  function saveColState() {
    try {
      localStorage.setItem(COL_STATE_KEY, JSON.stringify(
        cols.map(c => ({ id: c.id, visible: c.visible, width: c.width }))
      ))
    } catch {}
  }

  $: visibleCols = cols.filter(c => c.visible)
  $: colSpan     = visibleCols.length + 3   // checkbox + thumb + N data + remove

  function cellClass(col) {
    if (col.id === 'gid')    return 'cell-gid'
    if (col.id === 'minBid') return 'cell-bid'
    return 'cell-muted'
  }

  function cellValue(s, col) {
    switch (col.id) {
      case 'gid':              return s.gid || s.id
      case 'owner':            return s.owner || '—'
      case 'city':             return s.city  || '—'
      case 'side':             return s.side  || '—'
      case 'format':           return s.format || '—'
      case 'size':             return s.size   || '—'
      case 'minBid':           return s.minBid != null ? s.minBid.toFixed(2) : '—'
      case 'ots':              return s.ots    != null ? s.ots.toLocaleString('ru-RU') : '—'
      case 'grp':              return s.grp    != null ? s.grp.toLocaleString('ru-RU') : '—'
      case 'duration':         return s.duration != null ? s.duration.toLocaleString('ru-RU') : '—'
      case 'requestHourlyAvg': return s.requestHourlyAvg != null ? s.requestHourlyAvg.toLocaleString('ru-RU') : '—'
      case 'score': {
        const sc = scoreMap[s.id]
        return sc != null ? (sc * 100).toFixed(1) + '%' : '—'
      }
      case 'resolution':       return s.resolution || '—'
      case 'address':          return s.address || '—'
      case 'lat':              return Number.isFinite(s.lat) ? s.lat.toFixed(5) : '—'
      case 'lon':              return Number.isFinite(s.lon) ? s.lon.toFixed(5) : '—'
      case 'photoReport':      return s.photoReport || '—'
      case 'description':      return s.description || '—'
      default:                 return '—'
    }
  }

  // Column picker
  let colPickerOpen = false

  // Drag-to-reorder columns
  let colDragId     = null
  let colDragOverId = null

  function onColDragStart(e, col) {
    colDragId = col.id
    e.dataTransfer.effectAllowed = 'move'
  }
  function onColDragOver(e, col) {
    if (!colDragId || colDragId === col.id) return
    e.preventDefault()
    colDragOverId = col.id
  }
  function onColDragLeave(col) {
    if (colDragOverId === col.id) colDragOverId = null
  }
  function onColDrop(e, col) {
    e.preventDefault()
    if (!colDragId || colDragId === col.id) { colDragId = colDragOverId = null; return }
    const from = cols.findIndex(c => c.id === colDragId)
    const to   = cols.findIndex(c => c.id === col.id)
    const arr  = [...cols]
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    cols = arr
    colDragId = colDragOverId = null
    saveColState()
  }
  function onColDragEnd() { colDragId = colDragOverId = null }

  // Column resize
  let resizingColId = null
  let resizeStartX  = 0
  let resizeStartW  = 0

  function onColResizeStart(e, col) {
    e.preventDefault(); e.stopPropagation()
    resizingColId = col.id
    resizeStartX  = e.clientX
    resizeStartW  = col.width || 100
    window.addEventListener('mousemove', onColResizeMove)
    window.addEventListener('mouseup',   onColResizeEnd)
  }
  function onColResizeMove(e) {
    if (!resizingColId) return
    const idx = cols.findIndex(c => c.id === resizingColId)
    if (idx < 0) return
    cols[idx] = { ...cols[idx], width: Math.max(50, resizeStartW + e.clientX - resizeStartX) }
    cols = cols
  }
  function onColResizeEnd() {
    if (resizingColId) saveColState()
    resizingColId = null
    window.removeEventListener('mousemove', onColResizeMove)
    window.removeEventListener('mouseup',   onColResizeEnd)
  }

  // ── Map geocode search ────────────────────────────────────────────────
  let mapSearchOpen    = false
  let mapSearchQuery   = ''
  let mapSearchResults = []
  let mapSearchLoading = false
  let mapSearchInput   // bound to <input>

  async function geocode() {
    const q = mapSearchQuery.trim()
    if (!q) { mapSearchResults = []; return }
    mapSearchLoading = true
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&accept-language=ru,en`
      const res  = await fetch(url, { headers: { 'Accept-Language': 'ru,en' } })
      const data = await res.json()
      mapSearchResults = data.map(d => ({
        label: d.display_name,
        lat:   parseFloat(d.lat),
        lon:   parseFloat(d.lon),
        type:  d.type,
      }))
    } catch { mapSearchResults = [] }
    finally  { mapSearchLoading = false }
  }

  function pickSearchResult(r) {
    map?.flyTo([r.lat, r.lon], 14, { animate: true, duration: 0.8 })
    mapSearchResults = []
    mapSearchQuery   = ''
    mapSearchOpen    = false
  }

  function openMapSearch() {
    mapSearchOpen = true
    setTimeout(() => mapSearchInput?.focus(), 40)
  }

  function closeMapSearch() {
    mapSearchOpen    = false
    mapSearchQuery   = ''
    mapSearchResults = []
  }

  let geocodeTimer
  function onMapSearchInput() {
    clearTimeout(geocodeTimer)
    if (mapSearchQuery.trim().length < 2) { mapSearchResults = []; return }
    geocodeTimer = setTimeout(geocode, 380)
  }

  // ── POI import ────────────────────────────────────────────────────────
  let poiItems   = []       // [{ name, lat, lon, pos, enabled }]
  let poiRadius  = 500      // metres
  let poiLoading = false
  let poiError   = ''
  let poiLayer   = null     // Leaflet LayerGroup
  let poiFileInput          // bound to hidden <input type="file">

  // Haversine distance in metres
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const toRad = d => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat/2)**2
            + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  function renderPoiLayer() {
    if (!map) return
    if (!poiLayer) {
      poiLayer = L.layerGroup().addTo(map)
    }
    poiLayer.clearLayers()
    for (const poi of poiItems) {
      if (!poi.enabled) continue
      // Filled circle radius
      L.circle([poi.lat, poi.lon], {
        radius: poiRadius,
        color:       '#16A34A',
        fillColor:   '#16A34A',
        weight:      2,
        fillOpacity: 0.12,
        dashArray:   '4 4',
      }).addTo(poiLayer)
      // Centre pin
      L.circleMarker([poi.lat, poi.lon], {
        radius:      7,
        fillColor:   '#16A34A',
        color:       '#166534',
        weight:      2,
        fillOpacity: 0.95,
      }).bindTooltip(`<strong>${poi.name}</strong><br/>Радиус: ${poiRadius} м`, {
        direction: 'top', offset: [0, -8],
      }).addTo(poiLayer)
    }
  }

  function selectScreensInPoi() {
    const hits = screens.filter(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return false
      return poiItems.some(poi =>
        poi.enabled && haversine(s.lat, s.lon, poi.lat, poi.lon) <= poiRadius
      )
    })
    draft.screenIds = [...new Set([...draft.screenIds, ...hits.map(s => s.id)])]
    renderMarkers(filtered)
  }

  async function onPoiFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    poiError = ''
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xls', 'xlsx'].includes(ext)) {
      poiError = 'Поддерживаются только файлы .xls и .xlsx'
      poiFileInput.value = ''
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      poiError = 'Файл слишком большой (максимум 100 МБ)'
      poiFileInput.value = ''
      return
    }
    poiLoading = true
    try {
      const res = await api.inventories.parsePoi(file)
      poiItems = (res.result ?? []).map(p => ({ ...p, enabled: true }))
      renderPoiLayer()
      selectScreensInPoi()
      // Fit map to POI bounds
      if (map && poiItems.length > 0) {
        const pts = poiItems.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        if (pts.length) map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [60, 60], maxZoom: 12 })
      }
    } catch (err) {
      poiError = 'Ошибка при загрузке POI'
      console.error(err)
    } finally {
      poiLoading = false
      poiFileInput.value = ''
    }
  }

  function clearPoi() {
    poiItems = []
    poiLayer?.clearLayers()
  }

  // Re-render circles whenever radius changes or items toggle
  $: if (map && poiItems.length > 0) renderPoiLayer()
</script>

<svelte:window on:click={onDocClick}/>

<div class="screens-shell">
  <!-- Map fills all remaining space -->
  <div class="map-area">
    <div bind:this={mapEl} class="screens-map" class:draw-cursor={drawMode}></div>

    <!-- Floating progress badge — shown while screens are streaming in -->
    {#if totalPages > 0 && fetchedPages < totalPages}
      <div class="fetch-progress-badge">
        <div class="fetch-spinner"></div>
        <span>Загружаю экраны {fetchedPages} / {totalPages}</span>
        <div class="fetch-bar-track">
          <div class="fetch-bar-fill" style="width:{Math.round(fetchedPages/totalPages*100)}%"></div>
        </div>
      </div>
    {/if}

    {#if error && screens.length === 0}
      <div class="map-overlay">
        <span style="color:#EF4444">{error}</span>
        <button class="retry-btn" on:click={loadScreens}>Повторить</button>
      </div>
    {/if}

    <!-- Floating: Pre-campaign targeting -->
    <div class="map-float-top-left">
      <button
        class="map-float-btn"
        class:map-float-btn--active={scoreSortActive}
        on:click={() => { preCampaignOpen = !preCampaignOpen }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
        Pre-campaign
        {#if scoreSortActive}
          <span class="pc-score-count">{Object.keys(scoreMap).length}</span>
        {/if}
        <svg class="chip-arrow" viewBox="0 0 10 6" fill="none" width="9" height="9">
          <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>

      {#if preCampaignOpen}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="pc-panel" on:click|stopPropagation>

        <!-- Header -->
        <div class="pc-panel-header">
          <span class="pc-panel-title">Pre-campaign таргетинг</span>
          <button class="pc-panel-close" on:click={() => preCampaignOpen = false}>
            <svg viewBox="0 0 10 6" fill="none" width="11" height="11">
              <path d="M9 5L5 1 1 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        {#if !draft.id && !(draft.cityIds?.length)}
          <div class="pc-panel-body">
            <div class="pc-warn">Выберите хотя бы один город в&nbsp;«Основных параметрах»</div>
          </div>
        {:else}

          <div class="pc-panel-body">
            <!-- DMP dropdown -->
            <div class="pc-section-label">DMP</div>
            <select class="pc-select" bind:value={pcDmpId}>
              <option value={null}>Выберите DMP</option>
              {#each pcDmpConnections as conn}
                <option value={conn.id}>{conn.name ?? conn.id}</option>
              {/each}
            </select>

            <!-- Subcategory dropdown -->
            <div class="pc-section-label">Подкатегория интереса</div>
            <select class="pc-select" bind:value={pcSelectedSub}>
              <option value="">Выберите категорию</option>
              {#each PC_TOP_INTERESTS as cat}
                {#if PC_INTEREST_TREE[cat].length > 0}
                  <optgroup label={cat}>
                    {#each PC_INTEREST_TREE[cat] as sub}
                      <option value={sub}>{sub}</option>
                    {/each}
                  </optgroup>
                {:else}
                  <option value={cat}>{cat}</option>
                {/if}
              {/each}
            </select>

            <!-- Affinity index slider -->
            <div class="pc-section-label">Индекс аффинитивности</div>
            <input
              type="range"
              class="pc-affinity-slider"
              min="0" max="100" step="1"
              bind:value={pcAffinityMin}
              style="background: linear-gradient(to right,
                #d1d5db 0%,
                #d1d5db {pcAffinityMin}%,
                #ef4444 {pcAffinityMin}%,
                #f59e0b {pcAffinityMin + (100 - pcAffinityMin) * 0.35}%,
                #84cc16 {pcAffinityMin + (100 - pcAffinityMin) * 0.65}%,
                #22c55e 100%)"
            >

            {#if preCampaignError}
              <div class="pc-error">{preCampaignError}</div>
            {/if}
          </div>

          <!-- Footer buttons -->
          <div class="pc-panel-footer">
            <button class="pc-footer-clear" on:click={clearPreCampaign}>Очистить</button>
            <button
              class="pc-footer-apply"
              on:click={runPreCampaign}
              disabled={preCampaignLoading}
            >
              {#if preCampaignLoading}
                <div class="mini-spinner" style="width:11px;height:11px;border-width:2px;border-color:#fff transparent #fff #fff"></div>
              {:else}
                Применить
              {/if}
            </button>
          </div>

        {/if}
      </div>
      {/if}

      {#if scoreSortActive}
        <div class="pc-result">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style="color:#16a34a;flex-shrink:0">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          {filtered.filter(s => scoreMap[s.id] != null).length} из {Object.keys(scoreMap).length} скринов
          <button class="pc-clear-btn" on:click={clearPreCampaign}>× Сбросить</button>
        </div>
      {/if}
    </div>

    <!-- Floating: Geocode search -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div class="map-search-wrap" on:click|stopPropagation>
      {#if mapSearchOpen}
        <div class="map-search-box">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
            <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            bind:this={mapSearchInput}
            class="map-search-input"
            type="text"
            placeholder="Адрес, город, место…"
            bind:value={mapSearchQuery}
            on:input={onMapSearchInput}
            on:keydown={(e) => {
              if (e.key === 'Enter') geocode()
              if (e.key === 'Escape') closeMapSearch()
            }}
          />
          {#if mapSearchLoading}
            <div class="mini-spinner" style="flex-shrink:0"></div>
          {:else if mapSearchQuery}
            <button class="map-search-clear" on:click={() => { mapSearchQuery=''; mapSearchResults=[]; mapSearchInput?.focus() }}>×</button>
          {/if}
          <button class="map-search-close" on:click={closeMapSearch} title="Закрыть">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
          </button>
        </div>
        {#if mapSearchResults.length > 0}
          <div class="map-search-results">
            {#each mapSearchResults as r}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <div class="map-search-result" on:click={() => pickSearchResult(r)}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style="color:#16A34A;flex-shrink:0;margin-top:1px">
                  <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                </svg>
                <span class="map-search-result-label">{r.label}</span>
              </div>
            {/each}
          </div>
        {:else if mapSearchQuery.trim().length >= 2 && !mapSearchLoading}
          <div class="map-search-results">
            <div class="map-search-empty">Ничего не найдено</div>
          </div>
        {/if}
      {:else}
        <button class="map-icon-btn" title="Поиск по карте" on:click={openMapSearch}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      {/if}
    </div>

    <!-- Floating: Map filter bar (bottom of map, above panel) -->
    <div class="map-float-bottom">
      <!-- Freehand lasso -->
      <button
        class="map-tool-btn"
        class:active={drawMode}
        title={drawMode ? 'Отменить выделение' : 'Выделить область'}
        on:click={toggleDrawMode}
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <path d="M3 14 C3 8, 7 3, 10 3 C14 3, 17 6, 17 10 C17 13, 15 15, 13 16 C10 17, 6 16, 3 14 Z"
            stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 14 L5 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="map-tools-divider"></div>

      <!-- Import POI -->
      <input
        bind:this={poiFileInput}
        type="file"
        accept=".xls,.xlsx"
        style="display:none"
        on:change={onPoiFileChange}
      />
      <button
        class="map-float-btn map-float-btn-sm"
        class:poi-loading={poiLoading}
        class:poi-active={poiItems.length > 0}
        disabled={poiLoading}
        on:click={() => poiFileInput.click()}
      >
        {#if poiLoading}
          <div class="mini-spinner"></div>
        {:else}
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
          </svg>
        {/if}
        {poiItems.length > 0 ? `POI: ${poiItems.filter(p=>p.enabled).length}/${poiItems.length}` : 'Импортировать POI'}
      </button>

      <div class="map-tools-divider"></div>

      <!-- OTS toggle -->
      <label class="map-toggle-label">
        OTS
        <button
          class="map-toggle" class:on={otsOverlay}
          on:click={() => otsOverlay = !otsOverlay}
          role="switch" aria-checked={otsOverlay}
        >
          <span class="map-toggle-thumb"></span>
        </button>
      </label>

      <!-- Camera toggle -->
      <label class="map-toggle-label">
        Камера
        <button
          class="map-toggle" class:on={cameraOverlay}
          on:click={() => cameraOverlay = !cameraOverlay}
          role="switch" aria-checked={cameraOverlay}
        >
          <span class="map-toggle-thumb"></span>
        </button>
      </label>

      <!-- Active-only toggle -->
      <label class="map-toggle-label">
        Только активные
        <button
          class="map-toggle" class:on={activeOnly}
          on:click={() => activeOnly = !activeOnly}
          role="switch" aria-checked={activeOnly}
        >
          <span class="map-toggle-thumb"></span>
        </button>
      </label>
    </div>

    <!-- POI error toast -->
    {#if poiError}
      <div class="poi-error-toast">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style="flex-shrink:0">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        {poiError}
        <button class="poi-error-close" on:click={() => poiError = ''}>×</button>
      </div>
    {/if}

    <!-- POI control panel (shown after import) -->
    {#if poiItems.length > 0}
      <div class="poi-panel">
        <div class="poi-panel-header">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style="color:#16A34A;flex-shrink:0">
            <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
          </svg>
          <span class="poi-panel-title">POI — {poiItems.length} точ.</span>
          <button class="poi-clear-btn" title="Удалить POI" on:click={clearPoi}>×</button>
        </div>

        <!-- Radius -->
        <div class="poi-radius-row">
          <label class="poi-radius-label">Радиус, м</label>
          <input
            class="poi-radius-input"
            type="number"
            min="50" max="50000" step="50"
            bind:value={poiRadius}
            on:change={() => { renderPoiLayer(); selectScreensInPoi() }}
          />
        </div>

        <!-- POI list -->
        <div class="poi-list">
          {#each poiItems as poi, i}
            <label class="poi-item" class:poi-disabled={!poi.enabled}>
              <input
                type="checkbox"
                bind:checked={poi.enabled}
                on:change={() => { poiItems = poiItems; renderPoiLayer(); selectScreensInPoi() }}
              />
              <span class="poi-item-name" title={poi.name}>{poi.name}</span>
              <span class="poi-item-coords">{poi.lat?.toFixed(3)}, {poi.lon?.toFixed(3)}</span>
            </label>
          {/each}
        </div>

        <!-- Re-select button -->
        <button class="poi-select-btn" on:click={selectScreensInPoi}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          Выбрать экраны в радиусе
        </button>
      </div>
    {/if}
  </div>

  <!-- Bottom screens panel -->
  <div class="screens-panel" style="height:{panelHeight}px">
    <!-- Drag handle -->
    <div class="panel-drag-handle" on:mousedown={onDragStart} role="separator" aria-label="Изменить размер">
      <div class="drag-knob"></div>
    </div>

    <!-- Panel top actions -->
    <div class="panel-top-actions">
      <div class="panel-filters">
        <div class="panel-search-box">
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style="color:var(--text-muted);flex-shrink:0">
            <path d="M9 17A8 8 0 109 1a8 8 0 000 16zM17 17l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <input
            class="panel-search-input"
            type="text"
            placeholder="Поиск по адресу, оператору…"
            bind:value={tableSearch}
          />
        </div>
      </div>
      <!-- Column picker -->
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="col-picker-wrap" on:click|stopPropagation>
        <button class="panel-expand-btn" class:col-picker-active={colPickerOpen} title="Настройка столбцов" on:click={() => colPickerOpen = !colPickerOpen}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z"/>
          </svg>
        </button>
        {#if colPickerOpen}
          <div class="col-picker-drop">
            <div class="col-picker-header">Столбцы</div>
            {#each cols as col}
              <label class="col-picker-item">
                <input type="checkbox" bind:checked={col.visible} on:change={() => { cols = cols; saveColState() }} />
                <span>{col.label}</span>
              </label>
            {/each}
          </div>
        {/if}
      </div>

      <button class="panel-expand-btn" title="Развернуть" on:click={() => panelHeight = panelHeight < 400 ? 500 : 280}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>

    <!-- Action bar: tabs + count -->
    <div class="panel-action-bar">
      <div class="panel-tabs">
        <button class="panel-tab" class:active={activeTab==='all'} on:click={() => activeTab='all'}>
          Все экраны
        </button>
        <button class="panel-tab" class:active={activeTab==='selected'} on:click={() => activeTab='selected'}>
          Выбранные
          {#if draft.screenIds.length > 0}
            <span class="panel-tab-count">{draft.screenIds.length}</span>
          {/if}
        </button>
      </div>
      <span class="panel-count">{totalLoaded > 0 ? `${totalLoaded.toLocaleString('ru-RU')} экранов` : ''}</span>
    </div>

    <!-- Table -->
    <div class="panel-table-wrap">
      <table class="panel-table">
        <thead>
          <tr>
            <th style="width:36px">
              <input type="checkbox" checked={allVisible} indeterminate={someVisible && !allVisible} on:change={toggleAll}/>
            </th>
            <th style="width:60px"></th>
            {#each visibleCols as col (col.id)}
              <th
                class="col-hd"
                class:col-drag-over={colDragOverId === col.id}
                style="width:{col.width}px;min-width:{col.width}px;position:relative;overflow:visible"
                draggable="true"
                on:click={() => toggleSort(col.id)}
                on:dragstart={(e) => onColDragStart(e, col)}
                on:dragover={(e) => onColDragOver(e, col)}
                on:dragleave={() => onColDragLeave(col)}
                on:drop={(e) => onColDrop(e, col)}
                on:dragend={onColDragEnd}
              >
                <span class="col-hd-inner">
                  <span class="col-hd-label"
                    class:col-active={sortCol===col.id
                      || (col.filterType==='range'
                          ? (colFilters[col.id]?.min !== '' || colFilters[col.id]?.max !== '')
                          : colFilters[col.id]?.length > 0)}>
                    {col.label}
                  </span>
                  <!-- Sort indicator -->
                  <span class="col-sort" class:visible={sortCol===col.id}>
                    {#if sortCol===col.id}
                      {sortDir===1 ? '↑' : '↓'}
                    {:else}
                      <span style="opacity:.3">⇅</span>
                    {/if}
                  </span>
                  <!-- Filter button (filterable columns only) -->
                  {#if col.filterType}
                    <button
                      class="col-filter-btn"
                      class:col-filter-active={col.filterType==='range'
                        ? (colFilters[col.id]?.min !== '' || colFilters[col.id]?.max !== '')
                        : colFilters[col.id]?.length > 0}
                      title="Фильтр"
                      on:click|stopPropagation={(e) => toggleFilter(col.id, e)}
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                    <!-- Filter panel -->
                    {#if openFilterCol === col.id}
                      {#if col.filterType === 'range'}
                        <div class="col-filter-drop range-drop" on:click|stopPropagation>
                          <label class="range-label">От
                            <input class="range-input" type="number" placeholder="—"
                              bind:value={colFilters[col.id].min} />
                          </label>
                          <label class="range-label">До
                            <input class="range-input" type="number" placeholder="—"
                              bind:value={colFilters[col.id].max} />
                          </label>
                          <button class="range-clear" on:click={() => { colFilters[col.id] = {min:'',max:''}; openFilterCol='' }}>Сброс</button>
                        </div>
                      {:else}
                        <div class="col-filter-drop" on:click|stopPropagation>
                          {#if SEARCHABLE_COLS.has(col.id) && (colOptions[col.id]?.length ?? 0) > 6}
                            <div class="col-filter-search-wrap">
                              <input
                                class="col-filter-search"
                                type="text"
                                placeholder="Поиск…"
                                bind:value={dropdownSearch}
                                on:click|stopPropagation
                              />
                            </div>
                          {/if}
                          <button class="col-filter-opt" class:sel={!colFilters[col.id]?.length} on:click={() => toggleColFilterOpt(col.id, '')}>
                            <span class="col-filter-check">{!colFilters[col.id]?.length ? '✓' : ''}</span>
                            Все
                          </button>
                          {#each (colOptions[col.id] ?? []).filter(o => !dropdownSearch || o.toLowerCase().includes(dropdownSearch.toLowerCase())) as opt}
                            <button class="col-filter-opt" class:sel={colFilters[col.id]?.includes(opt)} on:click={() => toggleColFilterOpt(col.id, opt)}>
                              <span class="col-filter-check">{colFilters[col.id]?.includes(opt) ? '✓' : ''}</span>
                              {opt || '—'}
                            </button>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  {/if}
                </span>
                <!-- Resize handle -->
                <!-- svelte-ignore a11y-click-events-have-key-events -->
                <div class="col-resize-handle" on:mousedown={(e) => onColResizeStart(e, col)}></div>
              </th>
            {/each}
            <th style="width:32px"></th>
          </tr>
        </thead>
        <tbody>
          {#if screensLoading && tabRows.length === 0}
            <tr><td colspan={colSpan} class="table-state-cell">
              <div class="spinner"></div> Загрузка экранов…
            </td></tr>
          {:else if totalPages > 0 && fetchedPages < totalPages && tabRows.length === 0}
            <tr><td colspan={colSpan} class="table-state-cell">
              <div class="spinner"></div> Загрузка страницы {fetchedPages} из {totalPages}…
            </td></tr>
          {:else if error}
            <tr><td colspan={colSpan} class="table-state-cell">
              <span style="color:#EF4444">{error}</span>
              {#if activeTab === 'selected' && draft.screenIds?.length > 0}
                <span style="color:#64748B;margin-left:8px">({draft.screenIds.length} экранов выбрано)</span>
              {/if}
              <button class="retry-btn-inline" on:click={loadScreens}>Повторить</button>
            </td></tr>
          {:else if tabRows.length === 0}
            <tr><td colspan={colSpan} class="table-state-cell">
              {activeTab === 'selected' ? 'Нет выбранных экранов' : 'Экраны не найдены'}
            </td></tr>
          {:else}
            {#each tabRows as s (s.id)}
              <tr class="screen-row" class:sel={isSelected(s.id)} on:click={() => { focusScreen(s); toggleScreen(s.id); renderMarkers(filtered) }}>
                <td on:click|stopPropagation>
                  <input type="checkbox" checked={isSelected(s.id)} on:change={() => { toggleScreen(s.id); renderMarkers(filtered) }} />
                </td>
                <td class="cell-thumb">
                  {#if s.photo}
                    <img src={s.photo} alt="" class="screen-thumb" loading="lazy" />
                  {:else}
                    <div class="screen-thumb-placeholder">
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:var(--border)">
                        <path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/>
                      </svg>
                    </div>
                  {/if}
                </td>
                {#each visibleCols as col (col.id)}
                  <td class={cellClass(col)} style="width:{col.width}px;min-width:{col.width}px;max-width:{col.width}px;overflow:hidden;text-overflow:ellipsis">
                    {cellValue(s, col)}
                  </td>
                {/each}
                <td class="cell-remove" on:click|stopPropagation>
                  {#if isSelected(s.id)}
                    <button class="remove-btn" title="Убрать" on:click={() => { toggleScreen(s.id); renderMarkers(filtered) }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                      </svg>
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Nav bar -->
  <div class="screens-nav">
    <button class="btn-text-nav" on:click={() => dispatch('back')}>Назад</button>
    <div class="nav-actions">

      <!-- Сохранить экраны — muted grey pill -->
      <button class="nav-pill nav-pill-grey">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
        </svg>
        Сохранить экраны
      </button>

      <!-- Ставка — blue pill -->
      <button class="nav-pill nav-pill-blue" on:click={() => dispatch('bids')}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/>
        </svg>
        Ставка
      </button>

      <!-- График вещания — blue pill (active when schedule set) -->
      <button class="nav-pill nav-pill-blue" class:nav-pill-blue-on={draft.schedule != null}
          on:click={() => dispatch('schedule')}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
        </svg>
        График вещания
      </button>

    </div>
    <button class="btn-next" on:click={() => dispatch('bids')}>Дальше</button>
  </div>
</div>

<!-- ── Schedule modal ── -->
{#if scheduleOpen}
  <ScheduleModal
    schedule={draft.schedule}
    on:save={onScheduleSave}
    on:cancel={() => scheduleOpen = false}
  />
{/if}

<style>
  .screens-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  /* ── Map ── */
  .map-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .screens-map {
    width: 100%;
    height: 100%;
  }
  .screens-map.draw-cursor { cursor: crosshair; }
  :global(.screens-map.draw-cursor .leaflet-interactive) { cursor: crosshair !important; }

  /* Floating progress badge — non-blocking, shows while pages stream */
  .fetch-progress-badge {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(17,40,83,.88);
    color: #fff;
    border-radius: 20px;
    padding: 6px 14px 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 500;
    z-index: 600;
    white-space: nowrap;
    pointer-events: none;
  }

  .fetch-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    flex-shrink: 0;
  }

  .fetch-bar-track {
    width: 80px; height: 3px;
    background: rgba(255,255,255,.25);
    border-radius: 2px;
    overflow: hidden;
  }

  .fetch-bar-fill {
    height: 100%;
    background: #55C1FA;
    border-radius: 2px;
    transition: width .3s ease;
  }

  .map-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(255,255,255,.88);
    z-index: 500;
    font-size: 14px;
    color: var(--text-muted);
  }
  .retry-btn {
    margin-top: 4px;
    padding: 6px 18px;
    border: 1.5px solid var(--navy, #112853);
    border-radius: 8px;
    background: white;
    color: var(--navy, #112853);
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s;
  }
  .retry-btn:hover { background: #EFF6FF; }
  .retry-btn-inline {
    margin-left: 12px;
    padding: 3px 12px;
    border: 1.5px solid var(--navy, #112853);
    border-radius: 6px;
    background: white;
    color: var(--navy, #112853);
    font-size: 12px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background .12s;
  }
  .retry-btn-inline:hover { background: #EFF6FF; }

  .load-bar-track {
    width: 200px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .load-bar-fill {
    height: 100%;
    background: var(--navy);
    border-radius: 2px;
    transition: width .3s ease;
  }

  /* Floating map elements */
  .map-float-top-left {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 400;
  }

  .map-float-top-right {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 400;
  }

  .map-float-bottom {
    position: absolute;
    bottom: 12px;
    left: 12px;
    z-index: 400;
    display: flex;
    align-items: center;
    gap: 6px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
    box-shadow: 0 2px 12px rgba(0,0,0,.12);
  }

  .map-float-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    cursor: pointer;
    box-shadow: 0 1px 6px rgba(0,0,0,.1);
    white-space: nowrap;
  }
  .map-float-btn:hover { background: var(--bg); }
  .map-float-btn-sm { height: 28px; font-size: 12px; }

  .map-icon-btn {
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    box-shadow: 0 1px 6px rgba(0,0,0,.1);
  }
  .map-icon-btn:hover { color: var(--text); background: var(--bg); }

  .map-tools-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .map-tool-btn {
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
  }
  .map-tool-btn:hover { background: var(--chip-bg); color: var(--text); }
  .map-tool-btn.active { background: #EFF6FF; color: #2563EB; border: 1.5px solid #2563EB; }

  .map-tools-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .map-toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
  }

  .map-toggle {
    position: relative;
    width: 32px;
    height: 18px;
    background: var(--border);
    border: none;
    border-radius: 9px;
    cursor: pointer;
    padding: 0;
    transition: background .15s;
  }
  .map-toggle.on { background: var(--navy); }

  .map-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    transition: transform .15s;
    pointer-events: none;
  }
  .map-toggle.on .map-toggle-thumb { transform: translateX(14px); }

  /* ── Bottom panel ── */
  .screens-panel {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: white;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 120px;
  }

  .panel-drag-handle {
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    flex-shrink: 0;
    background: white;
  }
  .panel-drag-handle:hover .drag-knob { background: var(--text-muted); }

  .drag-knob {
    width: 36px;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    transition: background .12s;
  }

  .panel-top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px 8px;
    flex-shrink: 0;
  }

  .panel-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .panel-search-box {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 10px;
    flex: 1;
    min-width: 0;
    background: #fff;
  }
  .panel-search-box:focus-within { border-color: var(--navy); }

  .panel-search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    background: transparent;
    min-width: 0;
  }
  .panel-search-input::placeholder { color: var(--text-muted); }

  .panel-select {
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-muted);
    background: #fff;
    padding: 0 8px;
    cursor: pointer;
    outline: none;
    flex-shrink: 0;
  }
  .panel-select:focus { border-color: var(--navy); color: var(--text); }

  /* ── Column header sort + filter ── */
  .col-hd {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .col-hd:hover .col-hd-label { color: var(--navy); }
  .col-hd:hover .col-sort { opacity: 1; }

  .col-hd-inner {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }

  .col-hd-label { transition: color .1s; }
  .col-hd-label.col-active { color: var(--navy); }

  .col-sort {
    font-size: 10px;
    opacity: 0;
    transition: opacity .1s;
    line-height: 1;
  }
  .col-sort.visible { opacity: 1; }

  .col-filter-btn {
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .col-filter-btn:hover { color: var(--navy); background: var(--chip-bg); }
  .col-filter-btn.col-filter-active { color: var(--navy); }

  .col-filter-drop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 200;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,.14);
    min-width: 160px;
    max-height: 240px;
    overflow-y: auto;
    padding: 4px;
  }

  .col-filter-opt {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 6px 10px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    background: none;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .col-filter-opt:hover { background: var(--bg); }
  .col-filter-opt.sel { background: #EFF6FF; color: var(--navy); font-weight: 600; }
  .col-filter-check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border: 1.5px solid #ccc;
    border-radius: 3px;
    font-size: 10px;
    flex-shrink: 0;
    color: var(--navy);
    background: #fff;
  }
  .col-filter-opt.sel .col-filter-check {
    background: var(--navy);
    border-color: var(--navy);
    color: #fff;
  }

  .col-filter-search-wrap {
    padding: 4px 4px 2px;
    position: sticky;
    top: -4px;
    background: white;
    z-index: 1;
  }
  .col-filter-search {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    font-size: 12px;
    font-family: inherit;
    border: 1px solid var(--border);
    border-radius: 5px;
    outline: none;
    color: var(--text);
  }
  .col-filter-search:focus { border-color: var(--navy); }

  .panel-expand-btn {
    width: 30px;
    height: 30px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .panel-expand-btn:hover { background: var(--bg); color: var(--text); }

  .panel-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px 4px;
    flex-shrink: 0;
  }

  .panel-tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border);
  }

  .panel-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-muted);
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    cursor: pointer;
    font-weight: 500;
    transition: color .12s;
  }
  .panel-tab:hover { color: var(--text); }
  .panel-tab.active { color: var(--navy); border-bottom-color: var(--navy); font-weight: 700; }

  .panel-tab-count {
    background: var(--navy);
    color: white;
    border-radius: 10px;
    padding: 1px 6px;
    font-size: 10.5px;
    font-weight: 700;
  }

  .panel-count {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* ── Table ── */
  .panel-table-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
  }

  .panel-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  .panel-table thead {
    position: sticky;
    top: 0;
    background: var(--bg);
    z-index: 1;
  }

  .panel-table th {
    padding: 6px 10px;
    text-align: left;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .05em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .panel-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .screen-row { cursor: pointer; }
  .screen-row:hover td { background: var(--navy-light); }
  .screen-row.sel td { background: rgba(17,40,83,.05); }

  .cell-thumb { padding: 4px 8px; }

  .screen-thumb {
    width: 56px;
    height: 36px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }

  .screen-thumb-placeholder {
    width: 56px;
    height: 36px;
    border-radius: 4px;
    background: var(--bg);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cell-gid {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    font-size: 11.5px;
    font-family: monospace;
  }

  .cell-bid {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .cell-remove { padding: 4px 6px; }

  .remove-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity .12s, background .12s;
  }
  .screen-row:hover .remove-btn { opacity: 1; }
  .remove-btn:hover { background: #FEE2E2; color: #EF4444; opacity: 1; }

  .cell-addr {
    font-weight: 600;
    color: var(--text);
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cell-muted { color: var(--text-muted); white-space: nowrap; }

  .table-state-cell {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
  }

  /* ── Nav ── */
  .screens-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 24px;
    border-top: 1px solid var(--border);
    background: white;
    flex-shrink: 0;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Plain text nav links */
  .btn-text-nav {
    background: none; border: none;
    font-size: 13px; font-family: inherit; font-weight: 500;
    color: var(--text); cursor: pointer; padding: 4px 2px;
    transition: color .12s;
  }
  .btn-text-nav:hover { color: var(--navy); }
  .btn-text-nav-next { font-weight: 600; }

  /* Pill buttons */
  .nav-pill {
    display: flex; align-items: center; gap: 6px;
    height: 34px; padding: 0 16px;
    border: none; border-radius: 20px;
    font-size: 13px; font-family: inherit; font-weight: 500;
    cursor: pointer; white-space: nowrap;
    transition: background .13s, color .13s;
  }

  /* Grey muted pill */
  .nav-pill-grey {
    background: #E2E8F0; color: #64748B;
  }
  .nav-pill-grey:hover { background: #CBD5E1; color: #475569; }

  /* Blue pill */
  .nav-pill-blue {
    background: #DBEAFE; color: #2563EB;
  }
  .nav-pill-blue:hover { background: #BFDBFE; }
  .nav-pill-blue-on {
    background: #BFDBFE; color: #1D4ED8; font-weight: 600;
  }
  .nav-pill-blue-on:hover { background: #93C5FD; }

  /* ── Range filter ── */
  .range-drop {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 180px;
  }
  .range-label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .range-input {
    height: 28px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    outline: none;
    width: 100%;
  }
  .range-input:focus { border-color: var(--navy); }
  .range-clear {
    height: 26px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--bg);
    font-size: 12px;
    font-family: inherit;
    color: var(--text-muted);
    cursor: pointer;
    margin-top: 2px;
  }
  .range-clear:hover { color: #EF4444; border-color: #EF4444; background: #FEF2F2; }

  /* ── Map geocode search ── */
  .map-search-wrap {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 400;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  .map-search-box {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    background: white;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    padding: 0 8px 0 10px;
    box-shadow: 0 2px 12px rgba(0,0,0,.12);
    width: 300px;
  }
  .map-search-box:focus-within { border-color: var(--navy); }

  .map-search-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    color: var(--text);
    background: transparent;
    min-width: 0;
  }
  .map-search-input::placeholder { color: var(--text-muted); }

  .map-search-clear,
  .map-search-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-radius: 4px;
    flex-shrink: 0;
    font-size: 16px;
    line-height: 1;
  }
  .map-search-clear:hover,
  .map-search-close:hover { color: var(--text); background: var(--bg); }
  .map-search-close { border-left: 1px solid var(--border); margin-left: 2px; padding-left: 6px; }

  .map-search-results {
    width: 300px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,.14);
    overflow: hidden;
    max-height: 280px;
    overflow-y: auto;
  }

  .map-search-result {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 9px 12px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background .1s;
    line-height: 1.4;
  }
  .map-search-result:last-child { border-bottom: none; }
  .map-search-result:hover { background: var(--navy-light); color: var(--navy); }

  .map-search-result-label {
    flex: 1;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .map-search-empty {
    padding: 12px;
    font-size: 12.5px;
    color: var(--text-muted);
    text-align: center;
  }

  /* ── POI ── */
  .poi-active {
    background: #DCFCE7 !important;
    border-color: #16A34A !important;
    color: #166534 !important;
  }
  .poi-loading { opacity: .7; cursor: default; }

  .mini-spinner {
    width: 13px; height: 13px;
    border: 2px solid var(--border);
    border-top-color: var(--navy);
    border-radius: 50%;
    animation: spin .6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .poi-error-toast {
    position: absolute;
    bottom: 56px;
    left: 12px;
    z-index: 410;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #FEF2F2;
    border: 1px solid #FCA5A5;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12.5px;
    color: #991B1B;
    box-shadow: 0 2px 10px rgba(0,0,0,.1);
    max-width: 340px;
  }
  .poi-error-close {
    background: none; border: none; cursor: pointer;
    color: #991B1B; font-size: 16px; line-height: 1;
    padding: 0 0 0 4px; margin-left: auto;
  }

  .poi-panel {
    position: absolute;
    top: 56px;
    right: 12px;
    z-index: 410;
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,.14);
    width: 240px;
    overflow: hidden;
  }

  .poi-panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--border);
  }
  .poi-panel-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--text);
    flex: 1;
  }
  .poi-clear-btn {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); font-size: 18px; line-height: 1;
    padding: 0;
  }
  .poi-clear-btn:hover { color: #EF4444; }

  .poi-radius-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .poi-radius-label {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .poi-radius-input {
    flex: 1;
    height: 28px;
    border: 1.5px solid var(--border);
    border-radius: 6px;
    padding: 0 8px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text);
    outline: none;
    min-width: 0;
  }
  .poi-radius-input:focus { border-color: #16A34A; }

  .poi-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .poi-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background .1s;
  }
  .poi-item:hover { background: #F0FDF4; }
  .poi-item input[type="checkbox"] {
    flex-shrink: 0;
    accent-color: #16A34A;
    cursor: pointer;
  }
  .poi-item-name {
    flex: 1;
    font-size: 12.5px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .poi-item-coords {
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .poi-disabled .poi-item-name { color: var(--text-muted); text-decoration: line-through; }

  .poi-select-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    background: #F0FDF4;
    border: none;
    border-top: 1px solid #BBF7D0;
    color: #166534;
    font-size: 12.5px;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background .1s;
  }
  .poi-select-btn:hover { background: #DCFCE7; }

  /* ── Column picker ── */
  .col-picker-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .col-picker-active {
    background: var(--navy-light) !important;
    border-color: var(--navy) !important;
    color: var(--navy) !important;
  }

  .col-picker-drop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 300;
    background: white;
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0,0,0,.14);
    min-width: 200px;
    max-height: 340px;
    overflow-y: auto;
    padding: 6px;
  }

  .col-picker-header {
    padding: 4px 10px 6px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }

  .col-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text);
    user-select: none;
    transition: background .1s;
  }
  .col-picker-item:hover { background: var(--navy-light); }
  .col-picker-item input[type="checkbox"] {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    accent-color: var(--navy);
    cursor: pointer;
  }

  /* ── Column resize handle ── */
  .col-resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;
  }
  .col-resize-handle::after {
    content: '';
    position: absolute;
    right: 2px;
    top: 20%;
    height: 60%;
    width: 2px;
    background: var(--border);
    border-radius: 1px;
    transition: background .12s;
  }
  .col-resize-handle:hover::after,
  .col-resize-handle:active::after {
    background: var(--navy);
  }

  /* ── Column drag-to-reorder ── */
  .col-hd[draggable] { cursor: grab; }
  .col-hd[draggable]:active { cursor: grabbing; }
  .col-drag-over {
    background: #EFF6FF !important;
    box-shadow: inset 3px 0 0 var(--navy);
  }

  /* ── Pre-campaign panel ─────────────────────────────────────────────── */
  .map-float-btn--active {
    background: #eff6ff !important;
    border-color: #3b82f6 !important;
    color: #1d4ed8 !important;
  }
  .pc-score-count {
    background: #3b82f6;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    border-radius: 99px;
    padding: 1px 5px;
    line-height: 1.4;
  }
  /* ── Pre-campaign panel ─────────────────────────────────── */
  .pc-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 280px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0,0,0,.16);
    overflow: hidden;
    z-index: 900;
    display: flex;
    flex-direction: column;
  }
  .pc-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 14px 12px;
    background: linear-gradient(135deg, #f7fee7 0%, #ecfdf5 50%, #ffffff 100%);
    border-bottom: 1px solid #e5e7eb;
  }
  .pc-panel-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #111827;
  }
  .pc-panel-close {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: #6b7280;
    display: flex;
    align-items: center;
  }
  .pc-panel-close:hover { color: #111827; }
  .pc-panel-body {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pc-panel-footer {
    display: flex;
    gap: 8px;
    padding: 10px 14px 14px;
    border-top: 1px solid #f3f4f6;
  }
  /* Section label */
  .pc-section-label {
    font-size: 11.5px;
    font-weight: 600;
    color: #374151;
    margin: 8px 0 4px;
  }
  .pc-section-label:first-of-type { margin-top: 0; }
  /* Select dropdown */
  .pc-select {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
    font-size: 13px;
    font-family: inherit;
    color: #374151;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding-right: 28px;
  }
  .pc-select:focus { outline: none; border-color: #3b82f6; background-color: #fff; }
  .pc-select:disabled { opacity: 0.5; cursor: default; }
  /* Affinity gradient slider */
  .pc-affinity-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 3px;
    /* background driven by inline style — grey left of thumb, gradient right */
    outline: none;
    cursor: pointer;
    margin: 4px 0 2px;
  }
  .pc-affinity-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #9ca3af;
    box-shadow: 0 1px 4px rgba(0,0,0,.2);
    cursor: pointer;
  }
  .pc-affinity-slider::-moz-range-thumb {
    width: 18px; height: 18px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #9ca3af;
    box-shadow: 0 1px 4px rgba(0,0,0,.2);
    cursor: pointer;
  }
  .pc-affinity-slider:disabled { opacity: 0.5; cursor: default; }
  /* Footer buttons */
  .pc-footer-clear {
    flex: 1;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    font-family: inherit;
    color: #374151;
    cursor: pointer;
    transition: background .15s;
  }
  .pc-footer-clear:hover { background: #f9fafb; }
  .pc-footer-apply {
    flex: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #9ca3af;
    border: none;
    border-radius: 8px;
    padding: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    color: #fff;
    cursor: pointer;
    transition: background .15s;
  }
  .pc-footer-apply:not(:disabled) { background: #112853; cursor: pointer; }
  .pc-footer-apply:not(:disabled):hover { background: #1a3a6e; }
  .pc-footer-apply:disabled { opacity: 0.7; cursor: default; }
  /* Misc */
  .pc-warn {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    padding: 8px 0;
  }
  .pc-error {
    font-size: 12px;
    color: #ef4444;
    margin-top: 4px;
  }
  .pc-result {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: #374151;
    flex-wrap: wrap;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    padding: 5px 8px;
    margin-top: 4px;
  }
  .pc-clear-btn {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 11px;
    color: #9ca3af;
    cursor: pointer;
    padding: 0 2px;
    font-family: inherit;
  }
  .pc-clear-btn:hover { color: #ef4444; }
</style>
