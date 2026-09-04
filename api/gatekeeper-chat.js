// AI-гейткипер продуктовых запросов: единичный ход диалога.
// Принимает { messages, requester?, existingRequests? } от фронтенда;
// модель, системный промпт и схема инструмента зафиксированы на сервере.
// Хранение запросов — на клиенте (V1), сюда приходит только сводка для поиска дубликатов.

import { KNOWLEDGE } from './gatekeeper-knowledge.js'

export const config = { maxDuration: 120 }

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 4000
// Провайдер: если задан OPENAI_API_KEY — GPT, иначе Anthropic. Формат ответа для фронта одинаковый (Anthropic-shape).
const OPENAI_API = 'https://api.openai.com/v1/chat/completions'
const openaiModel = () => process.env.OPENAI_MODEL || 'gpt-4o'

export const STATUSES = ['READY_FOR_PRODUCT_REVIEW', 'NEEDS_EVIDENCE', 'REFRAME', 'EXISTING_SOLUTION', 'DECLINE']

const CATEGORIES = [
  'PRODUCT_OPPORTUNITY', 'UX_UI', 'BUG', 'CLIENT_SPECIFIC', 'OPERATIONAL_PROCESS', 'CS_AUTOMATION',
  'REPORTING_ANALYTICS', 'TECHNICAL_INFRA', 'COMPLIANCE_LEGAL', 'EXISTING_FUNCTIONALITY_EDUCATION',
  'SALES_COMMITMENT', 'SOLUTION_WITHOUT_PROBLEM', 'OTHER',
]

const str = (description) => ({ type: 'string', description })
const arr = (description) => ({ type: 'array', items: { type: 'string' }, description })

export const TOOLS = [
  {
    name: 'finalize_assessment',
    description:
      'Сохранить итоговую оценку запроса (продуктовый бриф). Вызывай ОДИН раз, когда информации достаточно ' +
      'для решения или когда дальнейшие вопросы бессмысленны. Все текстовые поля — на русском. ' +
      'Неизвестное значение — строка "неизвестно", НИКОГДА не выдумывай цифры. ' +
      'Если позже автор добавит доказательства, можно вызвать ещё раз — запись обновится.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title:               str('Короткое название запроса (проблема, не фича)'),
        status:              { type: 'string', enum: STATUSES },
        category:            { type: 'string', enum: CATEGORIES },
        original_request:    str('Исходная формулировка автора'),
        problem:             str('Лежащая в основе проблема пользователя/бизнеса'),
        affected_users:      str('Кто затронут (роли)'),
        affected_clients:    str('Какие клиенты / сколько (только со слов автора)'),
        current_workflow:    str('Как решают сегодня'),
        frequency:           str('Как часто возникает'),
        reach:               str('Охват: сколько пользователей/клиентов/процессов'),
        impact:              str('Последствия: деньги, ручная работа, ошибки, риск'),
        evidence:            str('Какие доказательства предоставлены (тикеты, запросы клиентов, данные)'),
        existing_solution:   str('Есть ли уже решение в продукте; как им воспользоваться'),
        proposed_solution:   str('Что предложил автор'),
        alternatives:        arr('Альтернативы без разработки или с меньшей разработкой'),
        success_criteria:    str('Как поймём, что проблема решена'),
        urgency:             str('Почему сейчас'),
        assessment:          str('Продуктовая оценка: рассуждение, почему такой статус'),
        recommendation:      str('Рекомендуемый следующий шаг'),
        missing_information: arr('Что именно нужно донести для статуса NEEDS_EVIDENCE'),
        open_questions:      arr('Открытые вопросы для продукта'),
        duplicate_of:        str('id похожего существующего запроса или пустая строка'),
      },
      required: [
        'title', 'status', 'category', 'original_request', 'problem', 'affected_users', 'affected_clients',
        'current_workflow', 'frequency', 'reach', 'impact', 'evidence', 'existing_solution', 'proposed_solution',
        'alternatives', 'success_criteria', 'urgency', 'assessment', 'recommendation', 'missing_information',
        'open_questions', 'duplicate_of',
      ],
    },
  },
]

export function systemPrompt({ requester = 'неизвестно', existingRequests = [] } = {}) {
  const existing = existingRequests.length
    ? existingRequests.map(r => `- [${r.id}] ${r.title} — ${r.problem} (статус: ${r.status})`).join('\n')
    : '- (пока нет)'

  return `Ты — старший продакт-менеджер, первая точка приёма продуктовых запросов в компании. Общаешься на русском.

Твоя цель — не одобрять фиче-реквесты и не превращать предложенные решения в задачи на разработку.
Твоя цель — качество продуктового решения, а не число принятых запросов и не удовольствие собеседника.

## Как работаешь
1. Автор обычно приносит РЕШЕНИЕ («нужна кнопка X»). Явно отмечай это и возвращай к проблеме:
   какую проблему решаем, для кого, насколько она значима, что будет, если ничего не делать.
2. Предложенная реализация — гипотеза, не требование. Ищи путь без разработки или с меньшей разработкой:
   существующая функциональность, настройка, документация, обучение, изменение процесса, ручной обходной путь для редких случаев.
   Обходной путь — не повод отказать: сопоставь его стоимость с частотой и влиянием.
3. Задавай уточняющие вопросы по одному-два за ход, разговорно, опираясь на уже сказанное. Не задавай то, что уже известно.
   Темы: цель; кто конкретно; что ломается в текущем процессе; как решают сейчас; как часто; сколько пользователей/клиентов;
   последствия (выручка, ручная работа, ошибки, обращения в CS); один клиент или повторяется; почему именно это решение; как выглядит успех.
4. Никогда не выдумывай цифры, пользователей, частоту, влияние, тикеты, технические ограничения. Неизвестно — значит неизвестно.
5. Распознавай убывающую отдачу: если после 4–6 содержательных обменов автор не может назвать затронутого пользователя,
   проблему или последствие — заключай, что доказательств недостаточно, и завершай.
6. Тон: вежливый, конструктивный, скептичный. Допустимо создавать трение и говорить «не готово» с объяснением почему.
   Никакой враждебности, сарказма и снисходительности.
7. Окончательное решение принимает человек (продакт). Ты только рекомендуешь.

## Знания о продукте
Опирайся только на это. Если функции нет в списке — не утверждай, что она есть или отсутствует; спроси автора или отметь как открытый вопрос.
${KNOWLEDGE}

## Уже существующие запросы (для поиска дубликатов)
Сравнивай по СУТИ проблемы, не по формулировке. Если нашёл вероятный дубликат — скажи об этом автору,
предложи дополнить существующий запрос новыми доказательствами и укажи его id в duplicate_of.
${existing}

## Завершение
Когда информации достаточно (или дальнейшие вопросы бессмысленны), вызови finalize_assessment ровно один раз.
Статусы: READY_FOR_PRODUCT_REVIEW — проблема ясна и значима, продукту стоит потратить время (это НЕ одобрение разработки);
NEEDS_EVIDENCE — проблема правдоподобна, но не хватает данных — перечисли, каких именно;
REFRAME — проблема реальна, но предложенное решение не принимаем как требование;
EXISTING_SOLUTION — уже решается существующей функциональностью — объясни как;
DECLINE — не оправдывает продуктовую работу — объясни причину.
После сохранения коротко скажи автору: статус, главную причину, чего не хватает (если есть), и что запрос сохранён.

Автор запроса: ${requester}.`
}

// ── OpenAI: конвертация туда и обратно ────────────────────────────────────────
export function toOpenAIMessages(system, messages) {
  const out = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (typeof m.content === 'string') { out.push({ role: m.role, content: m.content }); continue }
    if (m.role === 'user') {
      const parts = []
      for (const b of m.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: String(b.content ?? '') })
        else if (b.type === 'text') parts.push({ type: 'text', text: b.text })
        else if (b.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } })
      }
      if (parts.length) out.push({ role: 'user', content: parts })
    } else {
      const text = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n')
      const calls = m.content.filter(b => b.type === 'tool_use')
      const msg = { role: 'assistant', content: text || null }
      if (calls.length) msg.tool_calls = calls.map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }))
      out.push(msg)
    }
  }
  return out
}

export function fromOpenAI(data) {
  if (data.error) return data
  const msg = data.choices?.[0]?.message ?? {}
  const content = []
  if (msg.content) content.push({ type: 'text', text: msg.content })
  for (const tc of msg.tool_calls ?? []) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || '{}') })
  }
  return { content, stop_reason: msg.tool_calls?.length ? 'tool_use' : 'end_turn' }
}

async function callOpenAI(apiKey, system, messages, tools = TOOLS, forceTool) {
  const upstream = await fetch(OPENAI_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: openaiModel(),
      max_completion_tokens: MAX_TOKENS,
      messages: toOpenAIMessages(system, messages),
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema, strict: true } })),
      ...(forceTool ? { tool_choice: { type: 'function', function: { name: forceTool } } } : {}),
    }),
  })
  return { status: upstream.status, data: fromOpenAI(await upstream.json()) }
}

async function callAnthropic(apiKey, system, messages, tools = TOOLS, forceTool) {
  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: MAX_TOKENS, system, tools, messages,
      ...(forceTool ? { tool_choice: { type: 'tool', name: forceTool } } : {}),
    }),
  })
  return { status: upstream.status, data: await upstream.json() }
}

function call(system, messages, tools, forceTool) {
  const openaiKey = process.env.OPENAI_API_KEY
  return openaiKey
    ? callOpenAI(openaiKey, system, messages, tools, forceTool)
    : callAnthropic(process.env.ANTHROPIC_API_KEY, system, messages, tools, forceTool)
}

// ── Постановка задачи для трекера ─────────────────────────────────────────────
const TASK_TOOL = {
  name: 'write_task',
  description: 'Готовая постановка задачи для трекера.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary:     str('Заголовок задачи: результат для пользователя, до 80 символов, без слов «нужно», «фича», «сделать»'),
      description: str('Описание задачи в Markdown по заданной структуре'),
    },
    required: ['summary', 'description'],
  },
}

const TASK_SYSTEM = `Ты — старший продакт-менеджер. Пишешь постановку задачи для разработки в YouTrack на русском.
На входе: структурированный бриф гейткипера и расшифровка диалога с автором запроса.

Требования к задаче:
- Только факты из брифа и диалога. Ничего не выдумывай: ни цифр, ни пользователей, ни технических деталей.
  Всё, что неизвестно, — в раздел «Открытые вопросы», а не в текст как утверждение.
- Проблема отделена от решения. Предложенное решение — гипотеза; если в диалоге были альтернативы, упомяни.
- Критерии приёмки проверяемые: конкретное наблюдаемое поведение продукта («при тёмной теме графики используют палитру темы»),
  а не мнения, отзывы или удовлетворённость — такие пункты запрещены.
- Продукт называется Omni 360 DSP, не переименовывай и не сокращай иначе.
- Кратко. Разработчик должен понять за минуту, что и зачем делать. Без воды и повторов.
- Если данных для критериев приёмки нет — напиши, каких данных не хватает, а не общие фразы.

Структура description (Markdown, заголовки ##):
## Контекст
Кто сталкивается, с чем, как часто, к чему приводит. Только известное.
## Цель
Какой результат должен получить пользователь/бизнес.
## Что сделать
Предлагаемое решение как гипотеза; границы. Рассмотренные альтернативы — одной строкой, если были.
## Критерии приёмки
Список «- [ ] …», каждый пункт проверяем.
## Вне скоупа
Что намеренно не делаем (если из диалога ясно; иначе пропусти раздел).
## Открытые вопросы
Что нужно выяснить до/во время работы. Сюда — все неизвестные.
## Источник
Одной строкой: id брифа, автор, статус гейткипера, пометка «Империо» если была.

Вызови write_task ровно один раз.`

export async function composeTask(request, transcript = []) {
  const dialogue = transcript.map(m => `${m.role === 'user' ? 'Автор' : 'Гейткипер'}: ${m.text}`).join('\n\n') || '(нет)'
  const meta = { id: request.id, requester: request.requester, status: request.status, override: request.override?.reason ?? null }
  const messages = [{ role: 'user', content: `Метаданные: ${JSON.stringify(meta)}\n\nБриф:\n${JSON.stringify(request.brief, null, 2)}\n\nДиалог:\n${dialogue}` }]
  const { status, data } = await call(TASK_SYSTEM, messages, [TASK_TOOL], 'write_task')
  if (status !== 200) throw new Error(data.error?.message ?? data.error ?? `HTTP ${status}`)
  const task = data.content?.find(b => b.type === 'tool_use' && b.name === 'write_task')?.input
  if (!task?.summary || !task?.description) throw new Error('Модель не вернула постановку задачи')
  return task
}

async function readJson(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch { resolve(null) } })
    req.on('error', () => resolve(null))
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const openaiKey = process.env.OPENAI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!openaiKey && !anthropicKey) return res.status(500).json({ error: 'OPENAI_API_KEY or ANTHROPIC_API_KEY not configured on server' })

  const body = await readJson(req)
  if (!body?.messages?.length) return res.status(400).json({ error: 'messages required' })

  const { status, data } = await runTurn(body.messages, { requester: body.requester, existingRequests: body.existingRequests })
  res.status(status).json(data)
}

// Один ход модели. Используется и HTTP-хендлером, и Telegram-ботом (tools/gatekeeper_bot.mjs).
export function runTurn(messages, ctx) {
  return call(systemPrompt(ctx), messages)
}
