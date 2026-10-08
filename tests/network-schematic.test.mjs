import assert from 'node:assert/strict'
import { test } from 'node:test'
import { physicalScheme, opticalScheme, schemeComponents, layoutScheme } from '../frontend/src/features/map/networkSchematic.ts'
import { traceFiberPath, traceOpticalPath } from '../frontend/src/features/map/traceOpticalPath.ts'

const points = ['a', 'b', 'c', 'isolated'].map(id => ({ id, name: id, kind: id === 'b' ? 'cabinet' : 'building' }))
const routes = [{ id: 'ab', name: 'A–B', startPointId: 'a', endPointId: 'b' }, { id: 'bc', name: 'B–C', startPointId: 'b', endPointId: 'c' }]
const cable = { name: '2F', tubes: [{ name: 'T1', fibers: [{ name: 'modré' }, { name: 'oranžové' }] }] }
const installations = routes.map(route => ({ routeId: route.id, items: [{ id: `i${route.id}`, routeId: route.id, runId: route.id, label: `Kabel ${route.name}`, cable }] }))
const fiber = itemId => ({ itemId, tubeIndex: 0, fiberIndex: 0 })
const equipment = ['a', 'c'].map(pointId => ({ pointId, racks: [], cards: [], shelves: [{ id: `s${pointId}`, kind: 'odf' }], ports: [{ id: `p${pointId}`, parentId: `s${pointId}`, label: `ODF ${pointId}`, fiber: fiber(pointId === 'a' ? 'iab' : 'ibc') }] }))
const splices = [{ pointId: 'b', name: 'Spojka', connections: [{ id: 's', left: fiber('iab'), right: fiber('ibc'), kind: 'fusion' }], splitters: [] }]

test('optical scheme never merges distinct fibers at a shared point or shared trench', () => {
  const physical = physicalScheme(points, routes, installations)
  assert.equal(schemeComponents(physical).length, 2)
  const disconnected = opticalScheme(points, routes, installations, equipment, [], [])
  assert.equal(schemeComponents(disconnected).length, 4)
  const connected = opticalScheme(points, routes, installations, equipment, splices, [])
  assert.equal(schemeComponents(connected).length, 3)
  const component = schemeComponents(connected).find(ids => ids.includes('port:pa'))
  assert.ok(component.includes('port:pc'))
  assert.ok(!component.includes('fiber:b:iab:0:1'))
  assert.equal(connected.edges.filter(edge => edge.label.includes('Svar')).length, 1)
})

test('layout includes isolated points and terminates for loops', () => {
  const scheme = physicalScheme(points, [...routes, { id: 'ca', name: 'C–A', startPointId: 'c', endPointId: 'a' }], installations)
  const layout = layoutScheme(scheme)
  assert.equal(layout.positions.size, 4)
  assert.equal(new Set([...layout.positions.values()].map(pos => `${pos.x}:${pos.y}`)).size, 4)
  assert.ok(layout.width > 0 && layout.height > 0)
})

test('fiber tracing follows the selected cable direction and matches port tracing', () => {
  const forward = traceFiberPath('a', 'iab', 0, 0, equipment, routes, installations, splices)
  const port = traceOpticalPath('pa', equipment, routes, installations, splices)
  assert.equal(forward.status, 'connected')
  assert.equal(forward.endPortId, 'pc')
  assert.deepEqual(forward.routeIds, port.routeIds)
  const reverse = traceFiberPath('b', 'iab', 0, 0, equipment, routes, installations, splices)
  assert.equal(reverse.endPortId, 'pa')
  assert.deepEqual(reverse.routeIds, ['ab'])
  const free = traceFiberPath('a', 'iab', 0, 1, equipment, routes, installations, splices)
  assert.equal(free.status, 'open')
  assert.equal(free.endPointId, 'b')
  assert.equal(free.steps.length, 1)
  assert.equal(traceFiberPath('a', 'iab', 0, 99, equipment, routes, installations, splices).steps.length, 0)
})

test('fiber tracing requires a splitter branch and detects cyclic optical paths', () => {
  const split = [{ pointId: 'b', name: 'S', connections: [], splitters: [{ id: 'split', name: '1:2', input: fiber('iab'), outputs: [{ position: 1, fiber: fiber('ibc') }, { position: 2, fiber: { itemId: 'ibc', tubeIndex: 0, fiberIndex: 1 } }] }] }]
  const ambiguous = traceFiberPath('a', 'iab', 0, 0, equipment, routes, installations, split)
  assert.equal(ambiguous.status, 'ambiguous')
  assert.equal(ambiguous.branchChoices.length, 2)
  assert.equal(traceFiberPath('a', 'iab', 0, 0, equipment, routes, installations, split, { split: 1 }).endPortId, 'pc')
  const loopRoutes = [...routes, { id: 'ca', name: 'C–A', startPointId: 'c', endPointId: 'a' }]
  const loopItems = [...installations, { routeId: 'ca', items: [{ id: 'ica', routeId: 'ca', runId: 'ca', label: 'C–A', cable }] }]
  const loopSplices = [...splices, { pointId: 'c', name: 'C', connections: [{ left: fiber('ibc'), right: fiber('ica'), kind: 'fusion' }], splitters: [] }, { pointId: 'a', name: 'A', connections: [{ left: fiber('ica'), right: fiber('iab'), kind: 'fusion' }], splitters: [] }]
  assert.equal(traceFiberPath('a', 'iab', 0, 0, [], loopRoutes, loopItems, loopSplices).status, 'ambiguous')
})
