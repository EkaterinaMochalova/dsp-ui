// Оффлайн smoke-тест api/gatekeeper-chat.js: fetch подменён, ключ фиктивный.
// Запуск: node tools/gatekeeper_smoke.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import handler, { systemPrompt, TOOLS, STATUSES, toOpenAIMessages, fromOpenAI, composeTask } from '../api/gatekeeper-chat.js'

function mockReq(method, body) {
  const req = new EventEmitter(); req.method = method
  queueMicrotask(() => { if (body) req.emit('data', Buffer.from(JSON.stringify(body))); req.emit('end') })
  return req
}
function mockRes() {
  const res = { code: 0, body: null, headers: {} }
  res.setHeader = (k, v) => { res.headers[k] = v }
  res.status = (c) => { res.code = c; return res }
  res.json = (o) => { res.body = o; return res }
  res.end = () => res
  return res
}

let sent = null, sentUrl = ''
globalThis.fetch = async (url, opts) => {
  sentUrl = url; sent = JSON.parse(opts.body)
  return { status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }
}

// 1. без ключей — 500
delete process.env.ANTHROPIC_API_KEY
delete process.env.OPENAI_API_KEY
let res = mockRes(); await handler(mockReq('POST', { messages: [{ role: 'user', content: 'x' }] }), res)
assert.equal(res.code, 500)

// 2. пустые messages — 400
process.env.ANTHROPIC_API_KEY = 'test'
res = mockRes(); await handler(mockReq('POST', { messages: [] }), res)
assert.equal(res.code, 400)

// 3. нормальный ход: промпт содержит знания, автора и существующие запросы; инструмент передан
res = mockRes()
await handler(mockReq('POST', {
  messages: [{ role: 'user', content: 'Нужен экспорт в PowerPoint' }],
  requester: 'kate',
  existingRequests: [{ id: 'R1', title: 'PDF-отчёт', problem: 'клиенты не могут отправить отчёт', status: 'NEEDS_EVIDENCE' }],
}), res)
assert.equal(res.code, 200)
assert.equal(sent.messages.length, 1)
assert.ok(sent.system.includes('Omni 360 DSP'))
assert.ok(sent.system.includes('kate'))
assert.ok(sent.system.includes('[R1] PDF-отчёт'))
assert.equal(sent.tools[0].name, 'finalize_assessment')
assert.deepEqual(sent.tools[0].input_schema.properties.status.enum, STATUSES)
assert.deepEqual(Object.keys(sent.tools[0].input_schema.properties).sort(), [...sent.tools[0].input_schema.required].sort(), 'strict: все поля обязательны')

// 4. без existingRequests — плейсхолдер, не падает
assert.ok(systemPrompt().includes('(пока нет)'))
assert.equal(TOOLS.length, 1)

// 5. OpenAI-ветка: конвертация истории с tool_use/tool_result туда и ответа обратно
const hist = [
  { role: 'user', content: 'Нужен экспорт' },
  { role: 'assistant', content: [{ type: 'text', text: 'Зачем?' }, { type: 'tool_use', id: 'c1', name: 'finalize_assessment', input: { title: 'x' } }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: '{"saved":true}' }] },
]
const oa = toOpenAIMessages('SYS', hist)
assert.deepEqual(oa.map(m => m.role), ['system', 'user', 'assistant', 'tool'])
assert.equal(oa[2].tool_calls[0].function.arguments, '{"title":"x"}')
assert.equal(oa[3].tool_call_id, 'c1')
const back = fromOpenAI({ choices: [{ message: { content: null, tool_calls: [{ id: 'c2', function: { name: 'finalize_assessment', arguments: '{"status":"DECLINE"}' } }] } }] })
assert.equal(back.stop_reason, 'tool_use')
assert.deepEqual(back.content[0], { type: 'tool_use', id: 'c2', name: 'finalize_assessment', input: { status: 'DECLINE' } })
assert.equal(fromOpenAI({ choices: [{ message: { content: 'ok' } }] }).stop_reason, 'end_turn')

const img = toOpenAIMessages('S', [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAA' } }, { type: 'text', text: 'Скриншот' }] }])
assert.equal(img.length, 2)
assert.deepEqual(img[1].content.map(p => p.type), ['image_url', 'text'])
assert.ok(img[1].content[0].image_url.url.startsWith('data:image/jpeg;base64,AAA'))

process.env.OPENAI_API_KEY = 'oa'
globalThis.fetch = async (url, opts) => {
  sentUrl = url; sent = JSON.parse(opts.body)
  return { status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
}
res = mockRes(); await handler(mockReq('POST', { messages: [{ role: 'user', content: 'x' }] }), res)
assert.ok(sentUrl.includes('openai.com'))
assert.equal(sent.messages[0].role, 'system')
assert.equal(sent.tools[0].function.name, 'finalize_assessment')
assert.equal(sent.tools[0].function.strict, true)
assert.deepEqual(res.body, { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })

// 6. composeTask: форсированный write_task, ответ разобран; диалог попал в промпт
globalThis.fetch = async (url, opts) => {
  sentUrl = url; sent = JSON.parse(opts.body)
  return { status: 200, json: async () => ({ choices: [{ message: { content: null, tool_calls: [{ id: 't1', function: { name: 'write_task', arguments: '{"summary":"Графики в цвет темы","description":"## Контекст\\n…"}' } }] } }] }) }
}
const task = await composeTask({ id: 'R1', requester: 'kate', status: 'READY_FOR_PRODUCT_REVIEW', override: null, brief: { title: 'x', problem: 'p' } }, [{ role: 'user', text: 'хочу графики' }])
assert.equal(task.summary, 'Графики в цвет темы')
assert.equal(sent.tool_choice.function.name, 'write_task')
assert.equal(sent.tools.length, 1)
assert.ok(sent.messages[1].content.includes('Автор: хочу графики'))

console.log('gatekeeper smoke OK')
