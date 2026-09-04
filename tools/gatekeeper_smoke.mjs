// Оффлайн smoke-тест api/gatekeeper-chat.js: fetch подменён, ключ фиктивный.
// Запуск: node tools/gatekeeper_smoke.mjs
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import handler, { systemPrompt, TOOLS, STATUSES } from '../api/gatekeeper-chat.js'

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

let sent = null
globalThis.fetch = async (_url, opts) => {
  sent = JSON.parse(opts.body)
  return { status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }
}

// 1. без ключа — 500
delete process.env.ANTHROPIC_API_KEY
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

console.log('gatekeeper smoke OK')
