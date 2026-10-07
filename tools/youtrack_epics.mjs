// Заводит эпики из docs/youtrack-epics.json в YouTrack и дописывает их номера обратно в файл.
// Повторный запуск безопасен: у записей с id обновляется описание, задачи с тем же заголовком не дублируются.
// Запуск: node --env-file=.env.local tools/youtrack_epics.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const FILE = 'docs/youtrack-epics.json'
const url = process.env.YOUTRACK_URL?.replace(/\/$/, '')
const headers = { Authorization: `Bearer ${process.env.YOUTRACK_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }
const data = JSON.parse(readFileSync(FILE, 'utf8'))

async function yt(path, init) {
  const res = await fetch(`${url}/api/${path}`, { headers, ...init })
  const body = await res.json()
  if (!res.ok) throw new Error(`${path}: ${body.error_description ?? body.error ?? res.status}`)
  return body
}

const project = await yt(`admin/projects/${data.project}?fields=id`)
for (const e of data.issues) {
  if (e.id) {
    // уже заведён — только приводим описание к файлу
    await yt(`issues/${e.id}?fields=idReadable`, { method: 'POST', body: JSON.stringify({ description: e.description }) })
    console.log(`${e.id} (описание обновлено) · ${e.summary}`)
    continue
  }
  const q = encodeURIComponent(`project: ${data.project} summary: "${e.summary}"`)
  const found = (await yt(`issues?query=${q}&fields=idReadable,summary`)).find(i => i.summary === e.summary)
  e.id = found?.idReadable ?? (await yt('issues?fields=idReadable', {
    method: 'POST',
    body: JSON.stringify({
      project: { id: project.id }, summary: e.summary, description: e.description,
      customFields: [{ name: 'Type', $type: 'SingleEnumIssueCustomField', value: { name: 'Epic' } }],
    }),
  })).idReadable
  console.log(`${e.id}${found ? ' (уже был)' : ''} · ${e.summary}`)
  writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n')
}
console.log(`${url}/issues?q=${encodeURIComponent(`project: ${data.project} Type: Epic`)}`)
