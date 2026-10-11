import assert from 'node:assert/strict'
import { test } from 'node:test'
import { opticalConnections, connectionExportRows } from '../frontend/src/features/map/opticalConnections.ts'
import { toCzechCsv } from '../frontend/src/features/map/networkExports.ts'
import { paginateScheme } from '../frontend/src/features/map/schemePrintLayout.ts'

const points = [{ id: 'a', name: 'Uzel A' }, { id: 'b', name: 'Uzel B' }, { id: 'c', name: 'Uzel C' }]
const routes = [{ id: 'ab', name: 'A-B', startPointId: 'a', endPointId: 'b' }, { id: 'bc', name: 'B-C', startPointId: 'b', endPointId: 'c' }]
const cable = { tubes: [{ fibers: [{ color: '#0000ff' }, { color: '#ff0000' }] }] }
const installations = [{ routeId: 'ab', items: [{ id: 'i1', routeId: 'ab', runId: 'run1', label: 'Kabel A', cable }] },
  { routeId: 'bc', items: [{ id: 'i2', routeId: 'bc', runId: 'run2', label: 'Kabel B', cable }] }]
const fiber = (itemId, fiberIndex = 0) => ({ itemId, tubeIndex: 0, fiberIndex })
const equipment = [{ pointId: 'a', racks: [{ id: 'rack', name: 'Stojan' }], shelves: [{ id: 'odf', rackId: 'rack', name: 'ODF' }], cards: [],
  ports: [{ id: 'p1', label: '1', parentId: 'odf', fiber: fiber('i1'), patchPortId: 'p2' },
    { id: 'p2', label: 'OLT 1', parentId: 'odf', fiber: null, patchPortId: 'p1' }] }]
const splices = [{ pointId: 'b', connections: [{ id: 's', kind: 'fusion', left: fiber('i1'), right: fiber('i2') }],
  splitters: [{ id: 'split', name: 'Splitter A', outputCount: 2, input: fiber('i1', 1), outputs: [{ position: 1, fiber: fiber('i2', 1) }] }] }]
const distributions = [{ pointId: 'c', risers: [], boxes: [], premises: [{ id: 'hp', label: 'Byt 1', status: 'connected', fiber: fiber('i2') },
  { id: 'planned', label: 'Byt 2', status: 'planned', fiber: null }] }]
const allocations = { allocations: [{ status: 'reserved', label: 'Zákazník A', fibers: [{ runId: 'run1', tubeIndex: 0, fiberIndex: 0 }] }] }

test('whole-network export covers all node connections and preserves unconnected splitter outputs', () => {
  const connections = opticalConnections(points, routes, installations, equipment, splices, distributions, allocations)
  assert.equal(connections.length, 8)
  assert.equal(connections.filter(c => c.kind === 'Propojka').length, 1, 'reciprocal patch must not duplicate')
  assert.equal(connections.filter(c => c.kind === 'Výstup splitteru').length, 2)
  assert.equal(connections.find(c => c.id === 'split:split:2').right, null)
  const rows = connectionExportRows(connections)
  assert.equal(rows.find(r => r['Do'] === 'Splitter A · výstup 2' || r['Od'] === 'Splitter A · výstup 2')['Stav'], 'Nezapojeno')
  const odf = rows.find(r => r['Typ'] === 'Ukončení ODF')
  assert.equal(odf['Tuba od'], 1)
  assert.equal(odf['Vlákno od'], 1)
  assert.equal(odf['Služba / rezervace od'], 'Rezervováno: Zákazník A')
  assert.match(odf['Do'], /Stojan \/ ODF \/ Port 1/)
  const csv = toCzechCsv(rows, Object.keys(rows[0]))
  assert.match(csv, /Uzel A/); assert.match(csv, /Uzel B/); assert.match(csv, /Uzel C/)
})

test('continuous cable exports individual fibers without inventing splices or reservations on other fibers', () => {
  const continued = structuredClone(installations); continued[1].items[0].runId = 'run1'
  const rows = opticalConnections(points, routes, continued, [], [], [], allocations)
  assert.equal(rows.length, 2)
  assert.ok(rows.every(r => r.kind === 'Průchozí kabel'))
  assert.equal(rows[0].left.allocation, 'Rezervováno: Zákazník A')
  assert.equal(rows[0].right.allocation, 'Rezervováno: Zákazník A')
  assert.equal(rows[1].left.allocation, undefined)
  assert.equal(rows[1].left.fiber, 2)
})

test('print pagination preserves every node and cross-page connection, including loops and isolated nodes', () => {
  const nodes = Array.from({ length: 40 }, (_, i) => ({ id: String(i), label: `Prvek ${i}`, detail: 'Detail' }))
  const edges = nodes.slice(0, 38).map((n, i) => ({ id: `e${i}`, from: n.id, to: String(i + 1), label: 'Kabel' }))
  edges.push({ id: 'loop', from: '30', to: '0', label: 'Smyčka' })
  const { pages, references } = paginateScheme({ nodes, edges })
  assert.ok(pages.length > 1)
  assert.equal(pages.flatMap(p => p.nodes).length, 40)
  assert.equal(references.size, 40)
  for (const page of pages) {
    assert.ok(page.nodes.length <= 6)
    for (const pos of page.positions.values()) assert.ok(pos.y >= 0 && pos.y + 130 < 350)
  }
  for (const e of edges) {
    assert.ok(references.has(e.from)); assert.ok(references.has(e.to))
    assert.ok(pages.some(p => p.positions.has(e.from) || p.positions.has(e.to)))
  }
})
