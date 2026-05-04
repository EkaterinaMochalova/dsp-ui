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
