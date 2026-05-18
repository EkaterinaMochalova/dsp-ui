export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatMoney(amount) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export const STATE_LABEL = {
  NEW: 'Новая',
  ON_MODERATION: 'На модерации',
  ON_TARGETING_CREATION: 'Создание таргетинга',
  SENDING_ERROR: 'Ошибка отправки',
  ON_REVISION: 'На доработке',
  RESERVED: 'Зарезервирована',
  BOOKED: 'Забронирована',
  ACTIVE: 'Активная',
  ON_TARGETING_UPDATE: 'Обновление таргетинга',
  CONFIRMATION_ERROR: 'Ошибка подтверждения',
  ACTIVATED: 'Активирована',
  ACTIVATED_CANCELLING: 'Отмена активации',
  ACTIVATED_CANCELLATION_ERROR: 'Ошибка отмены',
  PAUSED: 'На паузе',
  STOPPED: 'Остановлена',
  CANCEL: 'Отмена',
  CANCELLED: 'Отменена',
  REJECTED: 'Отклонена',
  COMPLETED: 'Завершена',
  BUDGET_EXHAUSTED: 'Бюджет исчерпан',
  OTS_EXHAUSTED: 'OTS исчерпан',
  WITHOUT_INVENTORY: 'Без инвентаря',
  DELETED: 'Удалена',
}

export const STATE_COLOR = {
  NEW: 'blue',
  ON_MODERATION: 'yellow',
  ON_TARGETING_CREATION: 'yellow',
  SENDING_ERROR: 'red',
  ON_REVISION: 'yellow',
  RESERVED: 'purple',
  BOOKED: 'purple',
  ACTIVE: 'green',
  ON_TARGETING_UPDATE: 'yellow',
  CONFIRMATION_ERROR: 'red',
  ACTIVATED: 'green',
  ACTIVATED_CANCELLING: 'yellow',
  ACTIVATED_CANCELLATION_ERROR: 'red',
  PAUSED: 'orange',
  STOPPED: 'orange',
  CANCEL: 'gray',
  CANCELLED: 'gray',
  REJECTED: 'red',
  COMPLETED: 'gray',
  BUDGET_EXHAUSTED: 'orange',
  OTS_EXHAUSTED: 'orange',
  WITHOUT_INVENTORY: 'orange',
  DELETED: 'gray',
}

export const TYPE_LABEL = {
  RTB: 'RTB',
  GUARANTEED: 'Гарантированный',
  FLEX_GUARANTEED: 'Flex',
  OPEN_RTB: 'Open RTB',
}

// ── Screen/inventory mapping ──────────────────────────────────────────────────
// Shared between StepScreens and the api cache layer so both use identical
// mapped objects and the same cache version.
export const SCREENS_CACHE_VER = 'v4'

export function formatScreenSize(inv, fmt) {
  if (fmt === 'PVZ_SCREEN') return '0,54×0,95м'
  const d = inv.surfaceDimensionMM
  if (d?.width && d?.height) {
    const w = d.width  < 3000 ? 6 : d.width  / 1000
    const h = d.height < 3000 ? 3 : d.height / 1000
    const f = v => v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
    return `${f(w)}×${f(h)}м`
  }
  return ''
}

export function mapInventory(inv) {
  const loc = inv.location ?? {}
  const itc = inv.inventoryTypeAndCity ?? {}
  const fmt = inv.type || itc.type || ''
  return {
    id:               inv.id,
    gid:              inv.gid || inv.name || '',
    city:             inv.city?.name || itc.cityName || '',
    cityId:           inv.city?.id ?? itc.cityId ?? null,
    format:           fmt,
    side:             inv.side || '',
    size:             formatScreenSize(inv, fmt),
    address:          inv.address || loc.address || inv.name || '',
    lat:              inv.latitude ?? loc.latitude ?? NaN,
    lon:              inv.longitude ?? loc.longitude ?? NaN,
    minBid:           inv.minBidInfo?.minBidCharged ?? inv.minBidInfo?.minBid ?? null,
    ots:              inv.minBidInfo?.ots ?? inv.metadata?.ots ?? null,
    owner:            inv.displayOwner?.name || '',
    ownerId:          inv.displayOwner?.id ?? null,
    photo:            inv.images?.[0]?.preview ?? null,
    active:           inv.enabled !== false,
    hasCamera:        inv.photoReportOption != null && inv.photoReportOption !== 'NO',
    duration:         inv.duration ?? null,
    grp:              inv.metadata?.grp ?? null,
    requestHourlyAvg: inv.requestHourlyAvg ?? null,
    resolution:       inv.screenResolutionPx?.width
      ? `${inv.screenResolutionPx.width}×${inv.screenResolutionPx.height}`
      : '',
    photoReport:      inv.photoReportOption ?? '',
    description:      inv.description ?? '',
    lastShot:         inv.lastShotTime ?? null,
  }
}
