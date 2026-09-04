// AI-гейткипер продуктовых запросов: единичный ход диалога.
// Принимает { messages, requester?, existingRequests? } от фронтенда;
// модель, системный промпт и схема инструмента зафиксированы на сервере.
// Хранение запросов — на клиенте (V1), сюда приходит только сводка для поиска дубликатов.

import { KNOWLEDGE } from './gatekeeper-knowledge.js'

export const config = { maxDuration: 120 }

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-opus-5'
const MAX_TOKENS = 4000

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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })

  const body = await readJson(req)
  if (!body?.messages?.length) return res.status(400).json({ error: 'messages required' })

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt({ requester: body.requester, existingRequests: body.existingRequests }),
      tools: TOOLS,
      messages: body.messages,
    }),
  })

  res.status(upstream.status).json(await upstream.json())
}
