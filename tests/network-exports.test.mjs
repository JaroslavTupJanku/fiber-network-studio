import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeExportRows, toCzechCsv } from '../frontend/src/features/map/networkExports.ts'

test('route report keeps measured cable length separate from estimated map length', () => {
  const points = [
    { id: 'a', kind: 'chamber', name: 'Šachta A', latitude: 50, longitude: 14 },
    { id: 'b', kind: 'building', name: 'Dům B', latitude: 50.001, longitude: 14.001 },
  ]
  const route = { id: 'r', name: 'Úsek A–B', startPointId: 'a', endPointId: 'b', waypoints: [] }
  const items = [{ id: 'c', routeId: 'r', label: 'Kabel 12 vláken', cable: { name: 'Kabel 12 vláken' },
    duct: null, actualLengthMeters: null }]
  const rows = routeExportRows(route, points, [{ routeId: 'r', version: 1, items }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]['Skutečná délka kabelu (m)'], null)
  assert.ok(rows[0]['Délka z mapy (m, přibližně)'] > 0)
  items[0].actualLengthMeters = 172
  assert.equal(routeExportRows(route, points, [{ routeId: 'r', version: 1, items }])[0]['Skutečná délka kabelu (m)'], 172)
})

test('Czech CSV opens with UTF-8 BOM and protects Excel from formulas', () => {
  const csv = toCzechCsv([{ 'Název': '=HYPERLINK("bad")', 'Délka': null },
    { 'Název': 'Šachta; A', 'Délka': 0 }], ['Název', 'Délka'])
  assert.ok(csv.startsWith('\uFEFF"Název";"Délka"\r\n'))
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")";""'))
  assert.ok(csv.includes('"Šachta; A";"0"'))
})
