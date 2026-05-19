<script>
  import { onMount } from 'svelte'
  import { api } from '../lib/api.js'
  import { logout, page as pageStore } from '../lib/stores.js'
  import RightBar from '../components/RightBar.svelte'
  import StatusBadge from '../components/StatusBadge.svelte'
  import StepStart        from './steps/StepStart.svelte'
  import StepBasicParams  from './steps/StepBasicParams.svelte'
  import StepBudget       from './steps/StepBudget.svelte'
  import StepScreens      from './steps/StepScreens.svelte'
  import StepBids         from './steps/StepBids.svelte'
  import StepSchedule     from './steps/StepSchedule.svelte'
  import StepShowSettings from './steps/StepShowSettings.svelte'
  import StepCreatives    from './steps/StepCreatives.svelte'
  import StepPhotos       from './steps/StepPhotos.svelte'
  import StepAnalytics    from './steps/StepAnalytics.svelte'
  import StepSummary      from './steps/StepSummary.svelte'
  import StepStats        from './steps/StepStats.svelte'

  export let campaignType = 'RTB'
  export let campaignId = null
  export let initialStep = 'start'

  // Raw API response for the existing campaign — used as the base for PUT (read-modify-write)
  let rawCamp = null

  // Campaign draft state
  let draft = {
    // Seed id/state from props immediately so child steps (e.g. StepStats) can start
    // loading before onMount's async API call completes — avoids the "Сохраните кампанию"
    // flash and the brief "Черновик" badge when opening an existing campaign.
    id:    campaignId ?? null,
    type:  campaignType,
    name: '',
    state: null,
    customerId: null,
    brandId: null,
    bidType: 'BID', // BID | OTS
    startDate: null,
    endDate: null,
    optimalStrategy: false,
    limitType: 'COUNT',
    limitCampaign: '',
    limitDay: '',
    limitHour: '',
    limitMinute: '',
    otsLimitCampaign: '',
    otsLimitDay: '',
    otsLimitHour: '',
    otsLimitMinute: '',
    interval: '',
    intervalUnit: 'SEC',
    buyerMarkup: '',
    customBudgetTotal: '',
    cities: [],
    cityIds: [],
    screenIds: [],
    creativeIds: [],
    creativeTargeting: {},
    photoReports: {
      saveAll: false,
      selectByCountry: false,
      period: 'campaign',
      days: 5,
      showSummary: false,
      showSchedule: false,
    },
    analytics: {
      counters: [],
      offlineBlocks: [],
    },
  }

  // Save state
  let saving = false
  let saveError = ''

  function toApiDate(d) {
    if (!d) return null
    // API expects "2026-05-12T00:00:00", draft stores "2026-05-12"
    return d.includes('T') ? d : d + 'T00:00:00'
  }

  const DEFAULT_PHOTO_SETTINGS = {
    saveAll: false, countPerDisplay: 5, saveMode: 'BY_CAMPAIGN', explicitlySetPhoto: false,
  }

  function buildSegments() {
    // The PUT endpoint uses approval record IDs in segments[].mediaSegments[].id — NOT the
    // creative's own requestMedia ID. The approval record ties a creative to a specific vendor
    // (displayOwner). Data shape from GET segments[].medias[]:
    //   { id: <approvalRecordId>, adLayout: { id: <creativeId> }, state: "APPROVED", ... }
    // Data shape from GET /clients/request-media-segments?displayOwnerIds={vid}:
    //   { id: <approvalRecordId>, adLayout: { id: <creativeId> }, displayOwner: { id: vid }, ... }
    //
    // draft.vendorApprovedIds = { [vendorId]: Map<creativeId → approvalRecordId> }
    // loaded in reloadCampaign via request-media-segments per vendor.
    function buildMediaSegments(rawSegMedias = [], displayOwnerId = null) {
      // creativeId → approvalRecordId for this vendor (from request-media-segments)
      const vendorMap = draft.vendorApprovedIds?.[displayOwnerId] ?? new Map()

      // Existing approved medias: use their approval record IDs (m.id) directly in PUT
      const existing = (rawSegMedias ?? [])
        .filter(m => m.state === 'APPROVED')
        .map(m => ({
          id:                        m.id,   // approval record ID — correct for PUT
          default:                   m.default ?? false,
          externalConditionParamsId: m.externalConditionParamsId ?? null,
          weatherParams:             m.weatherParams ?? null,
          jamParams:                 m.jamParams     ?? null,
          fixedTimeShow:             m.fixedTimeShow ?? null,
        }))

      // Track which creatives are already represented (by creative ID = adLayout.id)
      const existingCreativeIds = new Set(
        (rawSegMedias ?? []).filter(m => m.state === 'APPROVED').map(m => m.adLayout?.id).filter(Boolean)
      )

      // Newly selected creatives: look up their approval record ID for this vendor
      // The vendor map is built from request-media-segments so vendor approval is guaranteed.
      const toAdd = (draft.creativeIds ?? [])
        .filter(creativeId => !existingCreativeIds.has(creativeId) && vendorMap.has(creativeId))
        .map(creativeId => ({
          id:                        vendorMap.get(creativeId),  // approval record ID for PUT
          default:                   false,
          externalConditionParamsId: null,
          weatherParams:             null,
          jamParams:                 null,
          fixedTimeShow:             null,
        }))

      if (toAdd.length) console.log(`[buildMediaSegments] vendor=${displayOwnerId} adding ${toAdd.length} creative(s):`, toAdd.map(m => m.id))
      return [...existing, ...toAdd]
    }

    // If rawCamp already has segments, preserve them (edit flow)
    if (rawCamp?.segments?.length > 0) {
      return rawCamp.segments.map(seg => ({
        displayOwnerId: seg.displayOwner?.id ?? null,
        inventories: (seg.inventories ?? []).map(inv => ({
          id:           inv.id,
          timeSettings: inv.timeSettings ?? [],
          priority:     inv.priority     ?? 1,
          bid:          Number(draft.screenBids?.[inv.id]) || (inv.bid ?? 0),
        })),
        mediaSegments: buildMediaSegments(seg.medias, seg.displayOwner?.id ?? null),
        photoReportSettings: seg.photoReportSettings ?? rawCamp?.photoReportSettings ?? DEFAULT_PHOTO_SETTINGS,
      }))
    }

    // New campaign — build segments from draft.screenIds
    if (!draft.screenIds?.length) return []

    const cacheKey = (draft.cities ?? []).length > 0
      ? [...draft.cities].sort().join('|')
      : '__all__'
    const cached = window._dspScreensCache?.[cacheKey] ?? []
    const screenMap = new Map(cached.map(s => [s.id, s]))

    const byOwner = new Map()
    for (const id of draft.screenIds) {
      const s = screenMap.get(id)
      const ownerId = s?.ownerId ?? null
      if (!byOwner.has(ownerId)) byOwner.set(ownerId, [])
      byOwner.get(ownerId).push(id)
    }

    return [...byOwner.entries()].map(([ownerId, ids]) => ({
      displayOwnerId: ownerId,
      inventories: ids.map(id => ({
        id,
        timeSettings: [],
        priority: 1,
        bid: Number(draft.screenBids?.[id]) || 0,
      })),
      mediaSegments: buildMediaSegments([], ownerId),
      photoReportSettings: rawCamp?.photoReportSettings ?? DEFAULT_PHOTO_SETTINGS,
    }))
  }

  function buildPayload() {
    const budgetBuyer = Number(draft.customBudgetTotal) || 0
    const markup = draft.buyerMarkup !== '' ? Number(draft.buyerMarkup) : null
    const additionalChargePct = markup ?? rawCamp?.additionalCharge ?? 0
    // budget = client-facing price (buyer price + markup); budgetBuyer = base buyer price
    const budget = Math.round(budgetBuyer * (1 + additionalChargePct / 100) * 100) / 100

    const segments = buildSegments()
    console.log('[buildSegments] rawCamp.segments:', rawCamp?.segments?.length, '| draft.screenIds:', draft.screenIds?.length, '| result:', segments.length)

    return {
      name:        draft.name,
      description: rawCamp?.description ?? '',
      brandId:     Number(draft.brandId)    || rawCamp?.brand?.id    || null,
      customerId:  Number(draft.customerId) || rawCamp?.customer?.id || null,
      type:        draft.type,
      bidType:     draft.bidType,
      startDate:   toApiDate(draft.startDate),
      endDate:     toApiDate(draft.endDate),
      budget,
      budgetBuyer,
      dailyBudget:       rawCamp?.dailyBudget       ?? null,
      dailyBudgetBuyer:  rawCamp?.dailyBudgetBuyer  ?? null,
      hourlyBudget:      rawCamp?.hourlyBudget       ?? null,
      hourlyBudgetBuyer: rawCamp?.hourlyBudgetBuyer  ?? null,
      additionalCharge:  additionalChargePct,
      maxImpressionsCount:       Number(draft.limitCampaign) || 0,
      maxDailyImpressionsCount:  Number(draft.limitDay)      || 0,
      maxHourlyImpressionsCount: Number(draft.limitHour)     || 0,
      ...(draft.limitMinute ? { maxMinuteImpressionsCount: Number(draft.limitMinute) } : {}),
      ots:                 rawCamp?.ots                 ?? null,
      dailyOts:            rawCamp?.dailyOts            ?? null,
      hourlyOts:           rawCamp?.hourlyOts           ?? null,
      impressionIntervalInMinutes: rawCamp?.impressionIntervalInMinutes ?? null,
      impressionInterval:  rawCamp?.impressionInterval  ?? null,
      poi:                 rawCamp?.poi                 ?? null,
      targetAudience:      rawCamp?.targetAudience      ?? null,
      photoReportSettings: rawCamp?.photoReportSettings ?? null,
      strategy:            rawCamp?.strategy            ?? 'STANDARD',
      strategyLimitType:   rawCamp?.strategyLimitType   ?? (draft.bidType === 'OTS' ? 'BY_OTS' : 'BY_PLAYS'),
      segments,
    }
  }

  // Extract inventory IDs that the backend reported as "not found" from a 400 error
  function extractInvalidInventoryIds(err) {
    const fields = err?.data?.errors?.field ?? []
    return new Set(
      fields
        .filter(f => f.message?.includes('не был найден'))
        .map(f => f.rejectedValue)
    )
  }

  // Strip known-invalid inventory IDs from a payload's segments
  function stripInvalidInventories(payload, invalidIds) {
    return {
      ...payload,
      segments: payload.segments
        .map(s => ({
          ...s,
          inventories: s.inventories.filter(inv => !invalidIds.has(inv.id ?? inv)),
        }))
        .filter(s => s.inventories.length > 0),
    }
  }

  // Core save — returns the saved campaign id (number), throws on failure
  async function doSave() {
    // Per-vendor filtering in buildSegments() ensures that only creatives APPROVED by
    // each segment's vendor appear in that segment's mediaSegments. This prevents the
    // backend 400 "media file must be approved for the segment" error.
    let payload = buildPayload()
    const existingId = draft.id != null && draft.id !== '' ? Number(draft.id) : null

    let result
    if (existingId) {
      try {
        result = await api.campaigns.update(existingId, payload)
      } catch (e) {
        if (e?.status === 400) {
          const invalidIds = extractInvalidInventoryIds(e)
          if (invalidIds.size > 0) {
            console.warn(`[save] Removing ${invalidIds.size} deleted inventories`)
            payload = stripInvalidInventories(payload, invalidIds)
            result = await api.campaigns.update(existingId, payload)
          } else {
            throw e
          }
        } else {
          throw e
        }
      }
    } else {
      result = await api.campaigns.create(payload)
      if (result?.id) draft = { ...draft, id: result.id }
    }

    // Derive a clean numeric ID — throw immediately if we can't
    const rawId = draft.id ?? result?.id
    const savedId = rawId != null && rawId !== '' ? Number(rawId) : null
    console.log('[doSave] savedId:', savedId, '| rawId:', rawId)
    if (!savedId) throw new Error('Не удалось получить ID кампании после сохранения')

    return savedId
  }

  // Reload rawCamp + draft.creativeIds + draft.vendorApprovedIds from the API after a save.
  // Called in-place so we don't depend on hash-router remounting the component.
  // Pass preloadedCamp to reuse an already-fetched campaign response (avoids double GET).
  async function reloadCampaign(id, preloadedCamp = null) {
    const camp = preloadedCamp ?? await api.campaigns.get(id)
    rawCamp = camp
    if (!preloadedCamp) {
      draft = { ...draft, id: camp.id ?? id, state: camp.state ?? draft.state }
    }

    // Unique displayOwner IDs across all segments — needed for per-vendor creative filtering
    const displayOwnerIds = [...new Set(
      (camp.segments ?? []).map(s => s.displayOwner?.id ?? s.displayOwner).filter(Boolean)
    )]

    const [creativeNames, creativeLib, ...vendorResults] = await Promise.allSettled([
      api.creatives.listForCampaign(id),
      api.creatives.list(camp.customer?.id ? { customerId: camp.customer.id } : {}),
      // Load vendor-approved creative IDs per displayOwner for per-segment filtering in buildSegments
      ...displayOwnerIds.map(vid => api.creatives.listForVendor(vid)),
    ])

    // Build vendorApprovedIds: { [vendorId]: Map<creativeId → approvalRecordId> }
    // Each request-media-segments item: { id: <approvalRecordId>, adLayout: { id: <creativeId> }, ... }
    const vendorApprovedIds = {}
    displayOwnerIds.forEach((vid, i) => {
      const res = vendorResults[i]
      const items = res?.status === 'fulfilled' ? (res.value?.content ?? res.value ?? []) : []
      const map = new Map()
      for (const item of items) {
        const creativeId = item.adLayout?.id
        if (creativeId != null && item.id != null) map.set(creativeId, item.id)
      }
      vendorApprovedIds[vid] = map
    })

    // Creatives currently in the campaign.
    // seg.medias[] items: { id: <approvalRecordId>, adLayout: { id: <creativeId> }, state, ... }
    // We need creative IDs (adLayout.id) for draft.creativeIds, not approval record IDs.
    // NOTE: the backend may omit non-APPROVED medias from the GET response (SENT/PENDING drop
    // adLayout or the whole item), so fall back to multiple field names.
    const nameIds = (creativeNames.status === 'fulfilled' ? creativeNames.value : [])?.map?.(c => c.id) ?? []
    const mediasIds = [...new Set(
      (camp.segments ?? []).flatMap(s =>
        (s.medias ?? []).map(m =>
          m.adLayout?.id ?? m.adLayoutId ?? m.requestMediaId ?? m.requestMedia?.id ?? m.mediaId
        )
      ).filter(Boolean)
    )]
    console.log('[reload] creative-names:', nameIds, '| segments[].medias IDs:', mediasIds,
      '| vendorApproved:', Object.fromEntries(Object.entries(vendorApprovedIds).map(([k,v]) => [k, v.size])))
    const allIds = nameIds.length ? nameIds : mediasIds

    const libItems = creativeLib.status === 'fulfilled'
      ? (creativeLib.value?.content ?? creativeLib.value ?? [])
      : []
    const statusMap = {}
    for (const c of libItems) {
      const raw = c?.state ?? c?.status ?? ''
      if (raw === 'ACTIVE') statusMap[c.id] = 'APPROVED'
      else if (raw === 'MODERATION' || raw === 'PREMODERATION') statusMap[c.id] = 'PENDING'
      else if (raw === 'DECLINED' || raw === 'REJECTED') statusMap[c.id] = 'REJECTED'
      else if (raw) statusMap[c.id] = raw
    }
    const ARCHIVED = new Set(['ARCHIVED', 'ARCHIVE'])
    const ids = allIds.filter(id => !ARCHIVED.has(statusMap[id]))

    // If the API returned no IDs (backend omits non-approved mediaSegments), preserve
    // whatever creativeIds are already in the draft.  This prevents a reload after save
    // from wiping creatives that the backend hasn't yet moved to APPROVED state.
    const finalCreativeIds = ids.length > 0 ? ids : (draft.creativeIds ?? [])

    draft = { ...draft, creativeIds: finalCreativeIds, creativeStatuses: statusMap, vendorApprovedIds }
  }

  // Extract the most human-readable error message from an API error.
  // Prefers field-level messages, then global messages, then top-level message.
  function extractApiError(e, fallback) {
    if (!e) return fallback
    if (e?.status === 403) return null  // caller handles 403 separately

    const fieldMsgs  = (e?.data?.errors?.field  ?? []).map(f => f.message).filter(Boolean)
    const globalMsgs = (e?.data?.errors?.global ?? []).map(g => g.message).filter(Boolean)
    const allMsgs    = [...fieldMsgs, ...globalMsgs]

    return allMsgs.length > 0
      ? allMsgs.join(' ')
      : e?.data?.message ?? e?.data?.error ?? (typeof e?.data === 'string' ? e.data : null) ?? e?.message ?? fallback
  }

  async function saveCampaign() {
    if (saving) return
    if (!draft.name?.trim()) { saveError = 'Укажите название кампании'; return }
    saving = true
    saveError = ''
    try {
      const savedId = await doSave()
      // Reload in-place BEFORE changing the URL so this component stays mounted throughout.
      await reloadCampaign(savedId)
      goToStep('summary')
      // Update the URL silently (history.replaceState does NOT fire hashchange, so App.svelte
      // won't destroy+remount this component mid-save showing a blank "Черновик" flash).
      const newHash = `#/campaigns/${savedId}`
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash)
        pageStore.set(`campaigns/${savedId}`)
      }
    } catch (e) {
      console.warn('[save] error:', JSON.stringify(e))
      saveError = e?.status === 403
        ? 'Нет прав для сохранения кампании (403). Проверьте права доступа.'
        : extractApiError(e, 'Не удалось сохранить кампанию')
    } finally {
      saving = false
    }
  }

  let launching = false
  let pausing   = false

  async function pauseCampaign() {
    if (pausing || saving) return
    pausing = true
    saveError = ''
    try {
      const id = draft.id != null ? Number(draft.id) : null
      if (!id) { saveError = 'Сохраните кампанию перед паузой'; return }
      await api.campaigns.setState(id, 'STOPPED')
      draft = { ...draft, state: 'STOPPED' }
    } catch (e) {
      console.warn('[pause] error:', JSON.stringify(e))
      saveError = e?.status === 403
        ? 'Нет прав для паузы кампании (403).'
        : extractApiError(e, 'Не удалось приостановить кампанию')
    } finally {
      pausing = false
    }
  }

  async function launchCampaign() {
    if (saving || launching) return
    if (!draft.name?.trim()) { saveError = 'Укажите название кампании'; return }

    // Pre-validate creatives before hitting the API
    const creativeIds = draft.creativeIds ?? []
    if (creativeIds.length === 0) {
      saveError = 'Добавьте хотя бы один рекламный материал перед запуском.'
      return
    }
    const statuses = draft.creativeStatuses ?? {}

    // Immediately block only if every creative is rejected
    const allRejected = creativeIds.every(id => statuses[id] === 'REJECTED')
    if (allRejected) {
      saveError = 'Все рекламные материалы отклонены. Загрузите новые перед запуском.'
      return
    }

    // A campaign can launch if at least one vendor has approved any creative.
    // Check vendorApprovedIds first (already loaded for existing campaigns).
    // For new campaigns where it isn't populated yet, fetch segments on-demand.
    const vendorMaps = Object.values(draft.vendorApprovedIds ?? {})
    let hasVendorApproval = vendorMaps.some(m => creativeIds.some(id => m.has(id)))

    if (!hasVendorApproval) {
      // Either no vendor data (new campaign) or truly none approved — fetch segments to confirm
      try {
        const segResults = await Promise.allSettled(creativeIds.map(id => api.creatives.segments(id)))
        hasVendorApproval = segResults.some(r =>
          r.status === 'fulfilled' &&
          (r.value?.content ?? []).some(s => s.state === 'APPROVED')
        )
      } catch { /* non-fatal — let the API decide */ }
    }

    const hasActive = creativeIds.some(id => statuses[id] === 'APPROVED') || hasVendorApproval
    if (!hasActive) {
      saveError = 'Рекламные материалы ещё на модерации. Дождитесь согласования хотя бы одним площадочником и попробуйте снова.'
      return
    }

    launching = true
    saveError = ''
    try {
      const id = await doSave()
      await api.campaigns.setState(id, 'ACTIVE')
      await reloadCampaign(id)
      goToStep('summary')
      // Silent URL update — same as in saveCampaign (no hashchange, no remount)
      const newHash = `#/campaigns/${id}`
      if (window.location.hash !== newHash) {
        history.replaceState(null, '', newHash)
        pageStore.set(`campaigns/${id}`)
      }
    } catch (e) {
      console.warn('[launch] error:', JSON.stringify(e))
      saveError = e?.status === 403
        ? 'Нет прав для запуска кампании (403).'
        : extractApiError(e, 'Не удалось запустить кампанию')
    } finally {
      launching = false
    }
  }

  // Forecast metrics (updated when screens/dates change)
  let metrics = { impressions: 0, ots: 0, budget: null }
  let hasScreensAndDates = false
  let forecastLoading = false
  let forecastTimer = null

  // Reactive trigger — debounced so rapid changes don't flood the API
  $: {
    const { screenIds, startDate, endDate, bidType } = draft
    hasScreensAndDates = screenIds.length > 0 && !!startDate && !!endDate
    if (hasScreensAndDates) scheduleForecast()
    else metrics = { impressions: 0, ots: 0, budget: null }
  }

  function scheduleForecast() {
    clearTimeout(forecastTimer)
    forecastTimer = setTimeout(loadForecast, 600)
  }

  async function loadForecast() {
    if (!draft.screenIds.length || !draft.startDate || !draft.endDate) return
    forecastLoading = true
    try {
      // Use date string directly — avoids UTC shift for Russian timezone
      // Use clients/analytics/campaign-forecast — the real forecast endpoint.
      // Payload mirrors the Angular app: forecastPeriod + limits + bidType + inventoryList.
      const customBudget = Number(draft.customBudgetTotal) || 0
      const budgetTotal  = customBudget > 0 ? customBudget : 10_000_000
      const payload = {
        forecastPeriod: {
          start: draft.startDate + 'T00:00:00',
          end:   draft.endDate   + 'T23:59:59',
        },
        limits: {
          budgetLimit: { total: budgetTotal },
        },
        bidType:       draft.bidType,
        inventoryList: draft.screenIds.map(id => ({ inventory: { id } })),
      }
      const res = await api.campaigns.forecastCampaign(payload)
      // Response: { summary: { statistic: { totalCount, totalOts, totalPrice } }, groupByTypeAndCity: [...] }
      const stat = res?.summary?.statistic ?? {}
      metrics = {
        impressions: stat.totalCount ?? 0,
        ots:         stat.totalOts   ?? 0,
        budget:      stat.totalPrice  > 0 ? stat.totalPrice : null,
      }
    } catch (e) {
      console.warn('Forecast error:', e?.data ?? e)
    } finally {
      forecastLoading = false
    }
  }

  // Steps definition — order matches Figma
  const STEPS = [
    { id: 'basic',     label: 'Основные параметры',              subs: [] },
    { id: 'budget',    label: 'Бюджет',                          subs: [] },
    { id: 'screens',   label: 'Экраны',                          subs: ['Выбор экранов', 'Ставки', 'График показов'] },
    { id: 'settings',  label: 'Ограничения показов',             subs: [] },
    { id: 'creatives', label: 'Рекламные материалы и таргетинг', subs: [] },
    { id: 'photos',    label: 'Фотоотчёты',                      subs: [] },
    { id: 'analytics', label: 'Аналитика',                       subs: [] },
    { id: 'summary',   label: 'Сводка',                          subs: [] },
    { id: 'stats',     label: 'Статистика',                      subs: [] },
  ]

  let currentStep = initialStep
  let completedSteps = {}   // plain object — spread creates new ref, guaranteed reactive
  let screensView = 'selection'  // 'selection' | 'bids' | 'schedule'
  // True while the existing campaign is being fetched — hides step content to avoid flash
  let campLoading = !!campaignId

  onMount(async () => {

    if (campaignId) {
      try {
        const camp = await api.campaigns.get(campaignId)
        rawCamp = camp

        // ── Budget ─────────────────────────────────────────────────────
        // Real API field is camp.totalBudget (buyer side: camp.budgetBuyer)
        const resolvedBudget = camp.totalBudget ?? camp.budgetBuyer ?? 0

        // ── Limit type ─────────────────────────────────────────────────
        const resolvedLimitType =
          camp.limitType
          ?? (camp.otsLimitCampaign || camp.maxOtsCount ? 'OTS' : null)
          ?? draft.limitType

        // ── Screens ────────────────────────────────────────────────────
        // Screens live at camp.segments[].inventories[].id, NOT camp.inventories[]
        const resolvedScreenIds = (camp.segments ?? [])
          .flatMap(s => (s.inventories ?? []).map(i => i.id ?? i.inventory?.id))
          .filter(Boolean)

        // ── Cities ─────────────────────────────────────────────────────
        // camp.cities may be empty; fall back to extracting from segments.inventories.city
        const resolvedCities = camp.cities?.length
          ? camp.cities.map(c => c.name)
          : [...new Set(
              (camp.segments ?? [])
                .flatMap(s => (s.inventories ?? []).map(i => i.city?.name))
                .filter(Boolean)
            )]
        const resolvedCityIds = camp.cities?.length
          ? camp.cities.map(c => c.id)
          : [...new Set(
              (camp.segments ?? [])
                .flatMap(s => (s.inventories ?? []).map(i => i.city?.id))
                .filter(Boolean)
            )]

        // ── Buyer markup ───────────────────────────────────────────────
        // Real API field is camp.additionalCharge (e.g. 50 = 50%)
        const resolvedMarkup = camp.additionalCharge != null
          ? String(camp.additionalCharge)
          : (camp.buyerMarkup ?? camp.markup ?? '')

        draft = {
          ...draft,
          id:               camp.id ?? campaignId,
          state:            camp.state ?? draft.state,
          name:             camp.name ?? draft.name,
          type:             camp.type ?? draft.type,
          customerId:       camp.customer?.id   ?? camp.customerId  ?? draft.customerId,
          customerName:     camp.customer?.name ?? draft.customerName,
          brandId:          camp.brand?.id      ?? camp.brandId     ?? draft.brandId,
          brandName:        camp.brand?.name    ?? draft.brandName,
          agencyName:       camp.agency?.name   ?? draft.agencyName,
          startDate:        camp.startDate?.slice(0, 10) ?? draft.startDate,
          endDate:          camp.endDate?.slice(0, 10)   ?? draft.endDate,
          bidType:          camp.bidType ?? draft.bidType,
          limitType:        resolvedLimitType,
          // Impression limits: flat fields maxImpressionsCount / maxDailyImpressionsCount / maxHourlyImpressionsCount
          limitCampaign:    String(camp.maxImpressionsCount      || camp.limitCampaign      || ''),
          limitDay:         String(camp.maxDailyImpressionsCount || camp.limitDay           || ''),
          limitHour:        String(camp.maxHourlyImpressionsCount || camp.limitHour         || ''),
          limitMinute:      String(camp.limitMinute ?? ''),
          otsLimitCampaign: String(camp.maxOtsCount      || camp.otsLimitCampaign || ''),
          otsLimitDay:      String(camp.maxDailyOtsCount || camp.otsLimitDay      || ''),
          otsLimitHour:     String(camp.maxHourlyOtsCount || camp.otsLimitHour   || ''),
          buyerMarkup:      resolvedMarkup,
          customBudgetTotal: resolvedBudget > 0 ? String(resolvedBudget) : '',
          screenIds:        resolvedScreenIds.length ? resolvedScreenIds : draft.screenIds,
          cities:           resolvedCities,
          cityIds:          resolvedCityIds,
        }

        const isTerminal = ['COMPLETED','FINISHED','CANCELLED','REJECTED','ARCHIVED'].includes(camp.state)

        // ── Creatives ──────────────────────────────────────────────────
        // Skip for terminal campaigns — they open on Stats and never need creative data.
        // reloadCampaign fires 2+ extra requests (creative lib, per-vendor approvals)
        // which is the main source of the ~1 min load time on completed campaigns.
        if (!isTerminal) {
          try { await reloadCampaign(campaignId, camp) } catch { /* non-fatal */ }
        }

        // Mark all steps done → left sidebar shows checkmarks
        for (const s of STEPS) completedSteps = { ...completedSteps, [s.id]: true }

        // Terminal campaigns open directly on the Stats step
        if (isTerminal) goToStep('stats')
      } catch (e) {
        console.warn('Failed to load campaign', e)
      } finally {
        campLoading = false
      }
    } else {
      campLoading = false
    }
  })

  const TERMINAL_STATES = ['COMPLETED','FINISHED','CANCELLED','REJECTED','ARCHIVED']
  $: isReadonly = TERMINAL_STATES.includes(draft.state)

  function goToStep(id) { currentStep = id; if (id !== 'screens') screensView = 'selection' }

  function completeStep(id) {
    completedSteps = { ...completedSteps, [id]: true }  // new object → Svelte sees the change
    const idx = STEPS.findIndex(s => s.id === id)
    if (idx < STEPS.length - 1) currentStep = STEPS[idx + 1].id
  }

  function prevStep(id) {
    const idx = STEPS.findIndex(s => s.id === id)
    currentStep = idx > 0 ? STEPS[idx - 1].id : 'start'
  }

  // Both completedSteps and currentStep are direct deps — always recomputes correctly
  $: stepRows = STEPS.map(s => ({
    ...s,
    status: completedSteps[s.id] ? 'done' : currentStep === s.id ? 'active' : 'pending',
  }))

  function formatDateRange() {
    if (!draft.startDate || !draft.endDate) return null
    const fmt = d => new Date(d).toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'2-digit' }).replace(/\./g, '.')
    return `${fmt(draft.startDate)}–${fmt(draft.endDate)}`
  }

  $: dateLabel = formatDateRange()
  $: campaignName = draft.name || `Рекламная кампания от ${new Date().toLocaleDateString('ru-RU', { day:'numeric', month:'numeric', year:'numeric' })}`

  const TYPE_BADGE = {
    RTB: 'Аукционная', OPEN_RTB: 'Open RTB',
    GUARANTEED: 'Гарантированная', FLEX_GUARANTEED: 'Flex',
    MEDIA_PLAN: 'Медиаплан', STATIC: 'Статик',
  }
  $: typeBadgeLabel = TYPE_BADGE[campaignType] ?? campaignType
</script>

<div class="layout" style="height:100%">

  <!-- Icon sidebar -->
  <aside class="sidebar-icon">
    <div class="logo-box" style="width:32px;height:32px;font-size:7px;border-radius:7px;margin-bottom:8px">
      <div style="line-height:1.1;text-align:center">Omni<br/>360</div>
    </div>
    <button class="icon-nav-btn" title="Обзор" on:click={() => { window.location.hash='#/overview' }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
    </button>
    <button class="icon-nav-btn active" title="Кампании" on:click={() => { window.location.hash='#/campaigns' }}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/></svg>
    </button>
    <button class="icon-nav-btn" title="Рекламные материалы">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd"/></svg>
    </button>
    <button class="icon-nav-btn" title="Аналитика">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
    </button>
    <button class="icon-nav-btn" title="Сотрудники">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg>
    </button>
    <div class="sidebar-icon-spacer"></div>
    <button class="icon-nav-btn" title="Выйти" on:click={logout}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h7a1 1 0 000-2H4V5h6a1 1 0 000-2H3zm11.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L15.586 11H9a1 1 0 010-2h6.586l-1.293-1.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
    </button>
    <button class="sidebar-expand-btn">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </aside>

  <!-- Wizard left panel -->
  <div class="wizard-panel">
    <div class="wizard-badges">
      {#if draft.state}
        <StatusBadge state={draft.state} />
      {:else}
        <span class="wizard-draft-badge">Черновик</span>
      {/if}
      <span class="wizard-type-badge">{typeBadgeLabel}</span>
    </div>

    <!-- Forecast metrics — above steps -->
    <div class="wizard-metrics" class:loading={forecastLoading}>
      {#if !hasScreensAndDates}
        <div class="wizard-hint">
          <svg class="wizard-hint-icon" width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
          </svg>
          <div class="wizard-hint-text">Выберите даты и хотя бы один экран для расчёта прогноза</div>
        </div>
      {/if}

      <div class="wizard-metric-row">
        <span>Количество выходов</span>
        <span class="wizard-metric-val">{metrics.impressions.toLocaleString('ru-RU')}</span>
      </div>
      <div class="wizard-metric-row">
        <span>Количество OTS</span>
        <span class="wizard-metric-val">{metrics.ots.toLocaleString('ru-RU')}</span>
      </div>
      {#if metrics.budget !== null}
        <div class="wizard-metric-row highlight">
          <span>Бюджет, ₽</span>
          <span class="wizard-metric-val">{metrics.budget.toLocaleString('ru-RU')}</span>
        </div>
      {:else}
        <div class="wizard-metric-row">
          <span>Бюджет, ₽</span>
          <span class="wizard-metric-val">0</span>
        </div>
      {/if}
    </div>

    <!-- Steps list -->
    <div class="wizard-steps">
      {#each stepRows as step (step.id)}
        <div class="wizard-step">
          <button class="wizard-step-header"
            class:readonly-step={isReadonly && step.id !== 'stats'}
            on:click={() => { if (!isReadonly || step.id === 'stats') goToStep(step.id) }}>
            {#if step.status === 'done'}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="9" fill="#112853"/>
                <path d="M5.5 9l2.5 2.5 4.5-4.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else if step.status === 'active'}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="8" stroke="#2563EB" stroke-width="2"/>
                <circle cx="9" cy="9" r="4" fill="#2563EB"/>
              </svg>
            {:else}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style="flex-shrink:0;margin-top:1px">
                <circle cx="9" cy="9" r="8" stroke="#C8D0DA" stroke-width="1.5"/>
              </svg>
            {/if}
            <span class="wizard-step-label"
              class:active={step.status === 'active'}
              class:done={step.status === 'done'}>
              {step.label}
            </span>
          </button>
          {#if step.subs.length && (step.status === 'active' || step.status === 'done')}
            <div class="wizard-substeps">
              {#each step.subs as sub, i}
                <button
                  class="wizard-substep"
                  class:wizard-substep-active={
                    step.id === 'screens' && (
                      (i === 0 && screensView === 'selection') ||
                      (i === 1 && screensView === 'bids') ||
                      (i === 2 && screensView === 'schedule')
                    )
                  }
                  on:click={() => {
                    if (step.id === 'screens') {
                      goToStep('screens')
                      screensView = i === 0 ? 'selection' : i === 1 ? 'bids' : 'schedule'
                    }
                  }}
                >{sub}</button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Save / Launch -->
    {#if saveError}
      <div class="save-error">{saveError}</div>
    {/if}
    <div class="wizard-actions">
      {#if !['COMPLETED','FINISHED','CANCELLED','REJECTED','ARCHIVED'].includes(draft.state)}
        <button class="btn-save" on:click={saveCampaign} disabled={saving || pausing}>
          {#if saving}Сохранение…{:else}Сохранить{/if}
        </button>
      {/if}
      {#if ['ACTIVE','ACTIVATED','ON_TARGETING_CREATION','ON_TARGETING_UPDATE','RESERVED','BOOKED'].includes(draft.state)}
        <button class="btn-pause" on:click={pauseCampaign} disabled={pausing || saving}>
          {#if pausing}Пауза…{:else}Пауза{/if}
        </button>
      {:else if !['COMPLETED','FINISHED','CANCELLED','REJECTED','ARCHIVED'].includes(draft.state)}
        <button class="btn-launch" class:ready={Object.keys(completedSteps).length >= STEPS.length - 1} on:click={launchCampaign} disabled={saving || launching || pausing}>
          {#if launching}Запуск…{:else}Запустить{/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="main-content">
    <!-- Topbar -->
    <div class="creation-topbar">
      <button class="creation-close-btn" on:click={() => { window.location.hash='#/campaigns' }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
      <input
        class="creation-title-input"
        type="text"
        placeholder="Название кампании"
        bind:value={draft.name}
      />
      {#if campaignId && draft.state}
        <StatusBadge state={draft.state} />
      {/if}
    </div>

    <!-- Step content -->
    {#if campLoading}
      <div class="camp-loading">
        <div class="spinner"></div>
        <span>Загрузка кампании…</span>
      </div>
    {:else if currentStep === 'start'}
      <StepStart on:start={() => goToStep('basic')} on:explore={() => goToStep('screens')} />
    {:else if currentStep === 'basic'}
      <StepBasicParams bind:draft on:next={() => completeStep('basic')} on:back={() => goToStep('start')} />
    {:else if currentStep === 'budget'}
      <StepBudget bind:draft {metrics} on:next={() => completeStep('budget')} on:back={() => prevStep('budget')} />
    {:else if currentStep === 'screens'}
      {#if screensView === 'bids'}
        <StepBids
          bind:draft
          on:back={() => screensView = 'selection'}
          on:next={() => screensView = 'schedule'}
          on:save={() => {}}
        />
      {:else if screensView === 'schedule'}
        <StepSchedule
          bind:draft
          on:back={() => screensView = 'bids'}
          on:next={() => { screensView = 'selection'; completeStep('screens') }}
          on:save={() => {}}
        />
      {:else}
        <StepScreens
          bind:draft
          on:bids={() => screensView = 'bids'}
          on:schedule={() => screensView = 'schedule'}
          on:next={() => completeStep('screens')}
          on:back={() => { screensView = 'selection'; prevStep('screens') }}
        />
      {/if}
    {:else if currentStep === 'settings'}
      <StepShowSettings bind:draft {metrics} on:next={() => completeStep('settings')} on:back={() => prevStep('settings')} />
    {:else if currentStep === 'creatives'}
      {@const creativeOwnerIds = new Set((rawCamp?.segments ?? []).map(s => s.displayOwner?.id).filter(Boolean))}
      <StepCreatives bind:draft {metrics} campaignOwnerIds={creativeOwnerIds} on:next={() => completeStep('creatives')} on:back={() => prevStep('creatives')} />
    {:else if currentStep === 'photos'}
      <StepPhotos bind:draft on:next={() => completeStep('photos')} on:back={() => prevStep('photos')} />
    {:else if currentStep === 'analytics'}
      <StepAnalytics bind:draft on:next={() => completeStep('analytics')} on:back={() => prevStep('analytics')} />
    {:else if currentStep === 'summary'}
      <StepSummary bind:draft {metrics}
        on:back={() => prevStep('summary')}
        on:launch={launchCampaign}
        on:goto={e => goToStep(e.detail)}
        on:save={saveCampaign}
      />
    {:else if currentStep === 'stats'}
      <StepStats bind:draft on:back={() => prevStep('stats')} />
    {/if}
  </div>

  <RightBar />
</div>
