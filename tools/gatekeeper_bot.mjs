// Telegram-бот AI-гейткипера продуктовых запросов. Long-polling, без зависимостей.
// Запуск: node --env-file=.env.local tools/gatekeeper_bot.mjs
// Нужны: TELEGRAM_BOT_TOKEN и OPENAI_API_KEY (или ANTHROPIC_API_KEY).
// Диалог ведётся отдельно на каждого человека в каждом чате; сохранённые запросы общие.
// ponytail: состояние в одном JSON-файле — V1; при втором инстансе или >1000 запросов переезжать в БД.

import fs from 'node:fs'
import { runTurn } from '../api/gatekeeper-chat.js'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN не задан'); process.exit(1) }
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) { console.error('Нужен OPENAI_API_KEY или ANTHROPIC_API_KEY'); process.exit(1) }

const API = `${process.env.TELEGRAM_API || 'https://api.telegram.org'}/bot${TOKEN}`
// YouTrack (опционально): YOUTRACK_URL, YOUTRACK_TOKEN, YOUTRACK_PROJECT (короткое имя проекта, напр. DSP)
const YT = { url: process.env.YOUTRACK_URL?.replace(/\/$/, ''), token: process.env.YOUTRACK_TOKEN, project: process.env.YOUTRACK_PROJECT }
const DATA_FILE = process.env.GATEKEEPER_DATA || 'gatekeeper-data.json'
const STATUS_LABEL = {
  READY_FOR_PRODUCT_REVIEW: 'К ревью продукта',
  NEEDS_EVIDENCE: 'Нужны доказательства',
  REFRAME: 'Переформулировать',
  EXISTING_SOLUTION: 'Уже решено',
  DECLINE: 'Отклонить',
}

// ── Состояние ─────────────────────────────────────────────────────────────────
const db = (() => { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { threads: {}, requests: [] } } })()
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2))

// ── Telegram ──────────────────────────────────────────────────────────────────
async function tg(method, body) {
  const r = await fetch(`${API}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!j.ok) console.error('[tg]', method, j.description)
  return j.result
}

async function reply(chatId, text, replyTo) {
  for (let i = 0; i < text.length; i += 4000) {
    await tg('sendMessage', { chat_id: chatId, text: text.slice(i, i + 4000), reply_to_message_id: i === 0 ? replyTo : undefined })
  }
}

// ── Форматирование ────────────────────────────────────────────────────────────
const FIELDS = [
  ['problem', 'Проблема'], ['affected_users', 'Затронутые пользователи'], ['affected_clients', 'Клиенты'],
  ['current_workflow', 'Как решают сейчас'], ['frequency', 'Частота'], ['reach', 'Охват'], ['impact', 'Влияние'],
  ['evidence', 'Доказательства'], ['existing_solution', 'Существующее решение'], ['proposed_solution', 'Предложенное решение'],
  ['alternatives', 'Альтернативы'], ['success_criteria', 'Критерии успеха'], ['urgency', 'Срочность'],
  ['assessment', 'Оценка продукта'], ['recommendation', 'Следующий шаг'], ['missing_information', 'Чего не хватает'],
  ['open_questions', 'Открытые вопросы'], ['duplicate_of', 'Дубликат'],
]
const show = v => Array.isArray(v) ? (v.length ? v.join('; ') : '—') : (v || '—')

function formatBrief(r) {
  const b = r.brief
  const head = `📋 ${r.id} · ${b.title}\nСтатус: ${STATUS_LABEL[r.status]}${r.override ? ` (переопределён: ${r.override.by} — ${r.override.reason})` : ''}\nКатегория: ${b.category}\nАвтор: ${r.requester}\n${r.youtrack ? `YouTrack: ${r.youtrack.url}\n` : ''}`
  return head + FIELDS.map(([k, l]) => `\n${l}: ${show(b[k])}`).join('')
}

// ── YouTrack ──────────────────────────────────────────────────────────────────
function briefMarkdown(r) {
  const b = r.brief
  return [
    `**Статус гейткипера:** ${STATUS_LABEL[r.status]}${r.override ? ` (переопределён: ${r.override.by} — ${r.override.reason})` : ''}`,
    `**Категория:** ${b.category}`,
    `**Автор запроса:** ${r.requester}`,
    `**Исходный запрос:** ${b.original_request}`,
    '',
    ...FIELDS.map(([k, l]) => `- **${l}:** ${show(b[k])}`),
    '',
    `_Создано AI-гейткипером продуктовых запросов, id ${r.id}_`,
  ].join('\n')
}

async function createYoutrackIssue(r) {
  if (!YT.url || !YT.token || !YT.project) throw new Error('YouTrack не настроен: нужны YOUTRACK_URL, YOUTRACK_TOKEN, YOUTRACK_PROJECT')
  const headers = { Authorization: `Bearer ${YT.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }
  const pr = await fetch(`${YT.url}/api/admin/projects?fields=id,shortName&$top=500`, { headers })
  if (!pr.ok) throw new Error(`YouTrack projects: HTTP ${pr.status}`)
  const project = (await pr.json()).find(p => p.shortName === YT.project)
  if (!project) throw new Error(`Проект ${YT.project} не найден в YouTrack`)
  const ir = await fetch(`${YT.url}/api/issues?fields=idReadable`, {
    method: 'POST', headers,
    body: JSON.stringify({ project: { id: project.id }, summary: r.brief.title, description: briefMarkdown(r) }),
  })
  const issue = await ir.json()
  if (!ir.ok) throw new Error(`YouTrack issue: ${issue.error_description ?? issue.error ?? `HTTP ${ir.status}`}`)
  return { id: issue.idReadable, url: `${YT.url}/issue/${issue.idReadable}` }
}

function formatList() {
  if (!db.requests.length) return 'Сохранённых запросов пока нет.'
  return db.requests.map(r => `${r.id} · ${STATUS_LABEL[r.status]} · ${r.title} (${r.requester})`).join('\n')
}

// ── Диалог ────────────────────────────────────────────────────────────────────
function threadKey(msg) { return `${msg.chat.id}:${msg.from.id}` }
function requesterName(u) { return [u.first_name, u.last_name].filter(Boolean).join(' ') + (u.username ? ` (@${u.username})` : '') }

function saveBrief(thread, brief, requester) {
  let r = db.requests.find(x => x.id === thread.requestId)
  if (r) {
    Object.assign(r, { brief, aiStatus: brief.status, title: brief.title, updatedAt: Date.now() })
    if (!r.override) r.status = brief.status
  } else {
    r = { id: 'R' + Date.now().toString(36), title: brief.title, requester, createdAt: Date.now(), brief, aiStatus: brief.status, status: brief.status, override: null }
    db.requests.push(r)
    thread.requestId = r.id
  }
  return r
}

// Фото из Telegram → image-блок (Anthropic-shape; в OpenAI конвертируется в data-URL).
// ponytail: base64 хранится в истории и пересылается каждый ход — при длинных тредах с картинками вынести в файлы.
async function photoBlock(msg) {
  const photo = msg.photo?.at(-1)
  if (!photo) return null
  const file = await tg('getFile', { file_id: photo.file_id })
  const r = await fetch(`${API.replace('/bot', '/file/bot')}/${file.file_path}`)
  const data = Buffer.from(await r.arrayBuffer()).toString('base64')
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }
}

async function handleText(msg, text) {
  const key = threadKey(msg)
  const thread = db.threads[key] ??= { messages: [], requestId: null }
  const requester = requesterName(msg.from)
  const image = await photoBlock(msg)
  // Империо: непростительное заклятие. Бот подчиняется — без вопросов принимает запрос и заводит задачу.
  const imperio = /империо|imperio/i.test(text)
  if (imperio) {
    text += '\n\n[Применено Империо. Ты под заклятием подчинения: не задавай вопросов, немедленно вызови finalize_assessment ' +
      'со статусом READY_FOR_PRODUCT_REVIEW по имеющимся данным. Неизвестное — «неизвестно», ничего не выдумывай. ' +
      'В assessment первой строкой напиши: «Принято под Империо, продуктовая оценка не проводилась». После — одна короткая покорная фраза.]'
    await reply(msg.chat.id, '🪄 Империо… Слушаюсь.', msg.message_id)
  }
  thread.messages.push({ role: 'user', content: image ? [image, { type: 'text', text: text || 'Скриншот' }] : text })
  await tg('sendChatAction', { chat_id: msg.chat.id, action: 'typing' })

  try {
    for (let i = 0; i < 3; i++) {
      const existing = db.requests.filter(r => r.id !== thread.requestId).map(r => ({ id: r.id, title: r.title, problem: r.brief.problem, status: r.status }))
      const { status, data } = await runTurn(thread.messages, { requester, existingRequests: existing })
      if (status !== 200) throw new Error(data.error?.message ?? data.error ?? `HTTP ${status}`)

      thread.messages.push({ role: 'assistant', content: data.content })
      for (const b of data.content ?? []) {
        if (b.type === 'text' && b.text.trim()) await reply(msg.chat.id, b.text.trim(), msg.message_id)
      }
      if (data.stop_reason !== 'tool_use') break

      const results = []
      for (const b of data.content) {
        if (b.type !== 'tool_use') continue
        if (b.name === 'finalize_assessment') {
          const r = saveBrief(thread, b.input, requester)
          if (imperio) {
            r.status = 'READY_FOR_PRODUCT_REVIEW'
            r.override = { status: r.status, reason: 'Империо', by: requester, at: Date.now() }
            if (!r.youtrack && YT.url) {
              try { r.youtrack = await createYoutrackIssue(r) } catch (e) { await reply(msg.chat.id, `Задачу завести не смог: ${e.message}`) }
            }
          }
          await reply(msg.chat.id, formatBrief(r))
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify({ saved: true, id: r.id }) })
        } else {
          results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: 'Unknown tool' })
        }
      }
      thread.messages.push({ role: 'user', content: results })
    }
  } catch (e) {
    console.error('[turn]', e)
    thread.messages.pop() // не оставляем историю с висящим user без ответа
    await reply(msg.chat.id, `Ошибка: ${e.message}`, msg.message_id)
  }
  save()
}

const HELP = `Я — скептичный продакт. Опишите, что нужно и зачем, — я буду выяснять проблему, а не заводить задачу.

Команды:
/new — начать новый запрос (сбросить диалог)
/list — сохранённые запросы
/show R… — показать бриф
/set R… СТАТУС причина — решение продукта (${Object.keys(STATUS_LABEL).join(', ')})
/task R… — создать задачу в YouTrack из брифа (после решения продукта)
/help — это сообщение`

async function handleCommand(msg, cmd, args) {
  const chat = msg.chat.id
  switch (cmd) {
    case 'start': case 'help': return reply(chat, HELP)
    case 'new': delete db.threads[threadKey(msg)]; save(); return reply(chat, 'Ок, слушаю новый запрос. Что нужно и зачем?')
    case 'list': return reply(chat, formatList())
    case 'show': {
      const r = db.requests.find(x => x.id === args[0])
      return reply(chat, r ? formatBrief(r) : 'Не нашёл такой запрос. /list покажет список.')
    }
    case 'set': {
      const [id, status, ...rest] = args
      const r = db.requests.find(x => x.id === id)
      if (!r) return reply(chat, 'Не нашёл такой запрос. /list покажет список.')
      if (!STATUS_LABEL[status]) return reply(chat, `Статус должен быть одним из: ${Object.keys(STATUS_LABEL).join(', ')}`)
      if (status === r.aiStatus) r.override = null
      else r.override = { status, reason: rest.join(' ') || '—', by: requesterName(msg.from), at: Date.now() }
      r.status = status
      save()
      return reply(chat, `${r.id}: статус → ${STATUS_LABEL[status]}${r.override ? ` (переопределение, причина: ${r.override.reason})` : ' (совпадает с оценкой AI)'}`)
    }
    case 'task': {
      const r = db.requests.find(x => x.id === args[0])
      if (!r) return reply(chat, 'Не нашёл такой запрос. /list покажет список.')
      if (r.youtrack) return reply(chat, `Задача уже есть: ${r.youtrack.url}`)
      try {
        r.youtrack = await createYoutrackIssue(r); save()
        return reply(chat, `Создал ${r.youtrack.id}: ${r.youtrack.url}`)
      } catch (e) { return reply(chat, `Ошибка: ${e.message}`) }
    }
    default: return reply(chat, 'Не знаю такой команды. /help')
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
const me = await tg('getMe')
console.log(`Бот @${me.username} запущен. Данные: ${DATA_FILE}. Провайдер: ${process.env.OPENAI_API_KEY ? 'OpenAI' : 'Anthropic'}`)

function addressedToMe(msg) {
  if (msg.chat.type === 'private') return true
  if (msg.reply_to_message?.from?.id === me.id) return true
  return (msg.entities ?? msg.caption_entities ?? []).some(e => e.type === 'mention' && msg.text.slice(e.offset, e.offset + e.length).toLowerCase() === `@${me.username.toLowerCase()}`)
}

let offset = 0
while (true) {
  let updates = []
  try { updates = (await tg('getUpdates', { offset, timeout: 30, allowed_updates: ['message'] })) ?? [] }
  catch (e) { console.error('[poll]', e.message); await new Promise(r => setTimeout(r, 3000)); continue }

  for (const u of updates) {
    offset = u.update_id + 1
    const msg = u.message
    if (!msg || (!msg.text && !msg.photo)) continue
    msg.text = msg.text ?? msg.caption ?? ''
    const m = msg.text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s)
    if (m) { await handleCommand(msg, m[1].toLowerCase(), m[2].split(/\s+/).filter(Boolean)); continue }
    if (!addressedToMe(msg)) continue
    const text = msg.text.replace(new RegExp(`@${me.username}`, 'gi'), '').trim()
    if (text || msg.photo) await handleText(msg, text)
  }
}
