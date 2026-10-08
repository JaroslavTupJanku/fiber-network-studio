import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { traceOpticalPath, tracePortToPremise, tracePremisePath } from '../frontend/src/features/map/traceOpticalPath.ts'
import { scenarioFromOpticalPath } from '../frontend/src/features/map/pathScenario.ts'
import { indoorCableError, indoorRunFromCatalog, newIndoorCableRun } from '../frontend/src/features/map/indoorCable.ts'
import { calculate } from '../frontend/src/features/optical-budget/model.ts'
import { countCzech, portLocation } from '../frontend/src/features/map/equipmentPresentation.ts'

test('port choices identify their rack, shelf, card and position', () => {
  const document = { racks: [{ id: 'r1', name: 'Stojan A' }, { id: 'r2', name: 'Stojan B' }],
    shelves: [{ id: 's1', rackId: 'r1', kind: 'odf', name: 'Police 1' },
      { id: 's2', rackId: 'r2', kind: 'olt', name: 'Police 1' }],
    cards: [{ id: 'c2', shelfId: 's2', name: 'Karta 1' }] }
  assert.equal(portLocation(document, { parentId: 's1', position: 1, label: 'Port 1' }),
    'Stojan A / ODF Police 1 / Port 1 (pozice 1)')
  assert.equal(portLocation(document, { parentId: 'c2', position: 1, label: 'Port 1' }),
    'Stojan B / OLT Police 1 / Karta 1 / Port 1 (pozice 1)')
  assert.equal(countCzech(1, 'stojan', 'stojany', 'stojanů'), '1 stojan')
  assert.equal(countCzech(3, 'port', 'porty', 'portů'), '3 porty')
})

test('indoor catalog selection copies known rates and preserves unknown wavelengths', () => {
  const cable = { id: 'cable-a', name: 'Vnitřní kabel', attenuation1310DbPerKm: 0.4,
    attenuation1550DbPerKm: 0.25, sourceUrl: 'https://example.test/specification' }
  const run = indoorRunFromCatalog(newIndoorCableRun(), cable)
  assert.equal(run.catalogCableId, 'cable-a')
  assert.equal(run.attenuationDbPerKm.loss1310, 0.4)
  assert.equal(run.attenuationDbPerKm.loss1550, 0.25)
  assert.equal(run.attenuationDbPerKm.loss1490, null)
  assert.equal(run.source, cable.sourceUrl)
  cable.attenuation1310DbPerKm = 0.6
  assert.equal(run.attenuationDbPerKm.loss1310, 0.4)
  assert.equal(indoorCableError({ ...run, spliceCount: null,
    spliceLossDb: { ...run.spliceLossDb, loss1310: 0.1 } }) !== null, true)
})

test('trace follows ports, cable segments and splice without inventing optical losses', () => {
  const a = 'a', b = 'b', c = 'c'
  const routes = [{ id: 'r1', name: 'A–B', startPointId: a, endPointId: b },
    { id: 'r2', name: 'B–C', startPointId: b, endPointId: c }]
  const cable = { name: 'Kabel 12F', attenuation1310DbPerKm: 0.35,
    attenuation1550DbPerKm: 0.22, tubes: [{ name: 'Tuba 1', fibers: [{ name: 'Vlákno 1' }] }] }
  const items = [{ id: 'i1', routeId: 'r1', runId: 'run1', label: 'Kabel A', cable, actualLengthMeters: 125.5 },
    { id: 'i2', routeId: 'r2', runId: 'run2', label: 'Kabel C', cable }]
  const installations = [{ routeId: 'r1', items: [items[0]] }, { routeId: 'r2', items: [items[1]] }]
  const end = itemId => ({ itemId, tubeIndex: 0, fiberIndex: 0 })
  const equipment = [
    { pointId: a, shelves: [{ id: 'sa', kind: 'odf' }, { id: 'so', kind: 'olt' }],
      cards: [{ id: 'carda', shelfId: 'so' }], ports: [
      { id: 'odfa', parentId: 'sa', label: 'ODF A', fiber: end('i1'), patchPortId: 'olta' },
      { id: 'olta', parentId: 'carda', label: 'OLT A', fiber: null, patchPortId: 'odfa' }] },
    { pointId: c, shelves: [{ id: 'sc', kind: 'odf' }], ports: [
      { id: 'odfc', parentId: 'sc', label: 'ODF C', fiber: end('i2'), patchPortId: null }] },
  ]
  const splices = [{ pointId: b, name: 'Spojka B', connections: [
    { id: 'splice', left: end('i1'), right: end('i2'), kind: 'fusion' }] }]
  const path = traceOpticalPath('olta', equipment, routes, installations, splices)
  assert.equal(path.status, 'connected')
  assert.equal(path.endPortId, 'odfc')
  assert.deepEqual(path.routeIds, ['r1', 'r2'])
  assert.equal(path.steps.filter(step => step.kind === 'splice').length, 1)
  assert.equal(path.steps.find(step => step.kind === 'patch')?.label, 'Propojka OLT A ↔ ODF A')
  assert.deepEqual(traceOpticalPath('odfa', equipment, routes, installations, splices).routeIds, ['r1', 'r2'])
  const scenario = scenarioFromOpticalPath(path, installations)
  assert.equal(scenario.sections.length, 2)
  assert.equal(scenario.sections[0].lengthM, '125.5')
  assert.equal(scenario.sections[1].lengthM, '')
  assert.equal(scenario.sections[0].loss1310, '0.35')
  assert.ok(scenario.elements.every(element => element.loss1310 === ''))
  assert.equal(traceOpticalPath('olta', equipment, routes, installations, []).status, 'open')
})

test('splitter trace chooses one output and transfers only known losses', () => {
  const routes = [
    { id: 'r1', name: 'A-B', startPointId: 'a', endPointId: 'b' },
    { id: 'r2', name: 'B-C', startPointId: 'b', endPointId: 'c' },
    { id: 'r3', name: 'B-D', startPointId: 'b', endPointId: 'd' },
  ]
  const cable = { name: 'Kabel', attenuation1310DbPerKm: 0.35,
    attenuation1550DbPerKm: 0.22, tubes: [{ name: 'Tuba', fibers: [{ name: 'Vlákno' }] }] }
  const installations = routes.map((route, index) => ({ routeId: route.id, items: [{
    id: `i${index + 1}`, routeId: route.id, runId: `run${index + 1}`,
    label: `Kabel ${index + 1}`, cable,
  }] }))
  const end = itemId => ({ itemId, tubeIndex: 0, fiberIndex: 0 })
  const equipment = [
    { pointId: 'a', shelves: [{ id: 'sa', kind: 'odf' }], ports: [
      { id: 'odfa', parentId: 'sa', label: 'ODF A', fiber: end('i1'), patchPortId: 'olta' },
      { id: 'olta', parentId: 'carda', label: 'OLT A', fiber: null, patchPortId: 'odfa' }] },
    { pointId: 'c', shelves: [{ id: 'sc', kind: 'odf' }], ports: [
      { id: 'odfc', parentId: 'sc', label: 'ODF C', fiber: end('i2'), patchPortId: null }] },
    { pointId: 'd', shelves: [{ id: 'sd', kind: 'odf' }], ports: [
      { id: 'odfd', parentId: 'sd', label: 'ODF D', fiber: end('i3'), patchPortId: null }] },
  ]
  const losses = { loss1270Db: null, loss1310Db: 10.5, loss1490Db: null,
    loss1550Db: null, loss1577Db: null }
  const splice = { pointId: 'b', name: 'Spojka B', connections: [], splitters: [{
    id: 's1', name: 'Splitter B', outputCount: 2, input: end('i1'), lossSource: 'Datasheet X',
    outputs: [{ position: 1, fiber: end('i2'), ...losses },
      { position: 2, fiber: end('i3'), ...losses, loss1310Db: 11.2 }],
  }] }
  const args = [equipment, routes, installations, [splice]]
  const undecided = traceOpticalPath('olta', ...args)
  assert.equal(undecided.status, 'ambiguous')
  assert.deepEqual(undecided.branchChoices.map(choice => choice.position), [1, 2])
  const first = traceOpticalPath('olta', ...args, { s1: 1 })
  assert.equal(first.status, 'connected')
  assert.equal(first.endPortId, 'odfc')
  assert.deepEqual(first.routeIds, ['r1', 'r2'])
  assert.deepEqual(first.branchChoices.map(choice => choice.position), [1, 2])
  assert.equal(first.steps.filter(step => step.kind === 'splitter').length, 1)
  const scenario = scenarioFromOpticalPath(first, installations)
  const splitter = scenario.elements.find(element => element.kind === 'splitter')
  assert.equal(splitter.loss1310, '10.5')
  assert.equal(splitter.loss1550, '')
  assert.equal(splitter.source, 'Datasheet X')
  assert.equal(traceOpticalPath('olta', ...args, { s1: 2 }).endPortId, 'odfd')
  const reverse = traceOpticalPath('odfc', ...args)
  assert.equal(reverse.status, 'connected')
  assert.equal(reverse.endPortId, 'olta')
  assert.equal(reverse.steps.filter(step => step.kind === 'splitter').length, 1)
})

test('a connected premise traces back through the selected splitter output to its OLT', () => {
  const routes = [
    { id: 'r1', name: 'OLT-spojka', startPointId: 'a', endPointId: 'b' },
    { id: 'r2', name: 'Spojka-dům C', startPointId: 'b', endPointId: 'c' },
    { id: 'r3', name: 'Spojka-dům D', startPointId: 'b', endPointId: 'd' },
  ]
  const cable = { name: 'Kabel', attenuation1310DbPerKm: 0.35,
    tubes: [{ name: 'Tuba', fibers: [{ name: 'Vlákno' }] }] }
  const installations = routes.map((route, index) => ({ routeId: route.id, items: [{
    id: `i${index + 1}`, routeId: route.id, runId: `run${index + 1}`,
    label: `Kabel ${index + 1}`, cable, actualLengthMeters: 120,
  }] }))
  const end = itemId => ({ itemId, tubeIndex: 0, fiberIndex: 0 })
  const equipment = [{ pointId: 'a', shelves: [{ id: 'odf', kind: 'odf' }, { id: 'olt', kind: 'olt' }],
    cards: [{ id: 'card', shelfId: 'olt' }], ports: [
      { id: 'odfa', parentId: 'odf', label: 'ODF', fiber: end('i1'), patchPortId: 'olta' },
      { id: 'olta', parentId: 'card', label: 'OLT', fiber: null, patchPortId: 'odfa' },
    ] }]
  const losses = { loss1270Db: null, loss1310Db: 10.5, loss1490Db: null,
    loss1550Db: null, loss1577Db: null }
  const splices = [{ pointId: 'b', name: 'Spojka', connections: [], splitters: [{
    id: 'split', name: 'Splitter 1:2', outputCount: 2, input: end('i1'), lossSource: 'Technický list',
    outputs: [{ position: 1, fiber: end('i2'), ...losses },
      { position: 2, fiber: end('i3'), ...losses, loss1310Db: 11.2 }],
  }] }]
  const distributions = ['c', 'd'].map((pointId, index) => ({ pointId,
    premises: [{ id: `hp${index + 1}`, boxId: `box${index + 1}`,
      label: `HP ${index + 1}`, status: 'connected', fiber: end(`i${index + 2}`) }] }))
  const reverse = tracePremisePath('hp2', equipment, routes, installations, splices, distributions)
  assert.equal(reverse.status, 'connected')
  assert.equal(reverse.endPortId, 'olta')
  assert.deepEqual(reverse.routeIds, ['r3', 'r1'])
  assert.equal(reverse.steps.find(step => step.kind === 'splitter').outputPosition, 2)
  assert.equal(traceOpticalPath('olta', equipment, routes, installations, splices, {}, distributions).status, 'ambiguous')
  const manuallySelected = traceOpticalPath('olta', equipment, routes, installations, splices,
    { split: 2 }, distributions)
  assert.equal(manuallySelected.endPremiseId, 'hp2')
  const forward = tracePortToPremise('olta', 'hp2', equipment, routes, installations, splices, distributions)
  assert.equal(forward.status, 'connected')
  assert.deepEqual(forward.routeIds, ['r1', 'r3'])
  assert.equal(forward.steps.at(-1).kind, 'premise')
  assert.equal(tracePortToPremise('other', 'hp2', equipment, routes, installations, splices, distributions).status, 'open')
  const scenario = scenarioFromOpticalPath(forward, installations)
  assert.equal(scenario.sections.length, 3)
  assert.equal(scenario.elements.find(element => element.kind === 'splitter').loss1310, '11.2')
  assert.equal(scenario.sections.at(-1).lengthM, '')
  assert.match(scenario.sections.at(-1).name, /Domovní přívod/)
  assert.equal(calculate(scenario).rows.find(row => row.name.includes('Domovní přívod')).loss, null)
  assert.equal(calculate(scenario).total, null)
  assert.equal(tracePremisePath('hp2', equipment, routes, installations, [], distributions).status, 'open')
  assert.equal(tracePremisePath('hp2', equipment, routes, installations, splices,
    distributions.map(document => ({ ...document, premises: document.premises.map(premise =>
      premise.id === 'hp2' ? { ...premise, status: 'planned', fiber: null } : premise) }))).status, 'open')
})

test('a direct cable can lead from an OLT port to a premise without a splitter', () => {
  const routes = [{ id: 'route', name: 'Přívod', startPointId: 'olt-building', endPointId: 'home' }]
  const fiber = { itemId: 'cable', tubeIndex: 0, fiberIndex: 0 }
  const installations = [{ routeId: 'route', items: [{ id: 'cable', routeId: 'route', runId: 'run',
    label: 'Přívodní kabel', cable: { name: 'Kabel', tubes: [{ name: 'Tuba', fibers: [{ name: '1' }] }] } }] }]
  const equipment = [{ pointId: 'olt-building', shelves: [{ id: 'odf', kind: 'odf' }, { id: 'olt', kind: 'olt' }],
    cards: [{ id: 'card', shelfId: 'olt' }], ports: [
      { id: 'odf-port', parentId: 'odf', label: 'ODF', fiber, patchPortId: 'olt-port' },
      { id: 'olt-port', parentId: 'card', label: 'OLT', fiber: null, patchPortId: 'odf-port' },
    ] }]
  const losses = (loss1310, loss1550) => ({ loss1270: null, loss1310, loss1490: null, loss1550, loss1577: null })
  const indoorCable = { cableName: 'Vnitřní kabel', catalogCableId: null, lengthMeters: 18,
    attenuationDbPerKm: losses(0.4, 0.25), spliceCount: 1, spliceLossDb: losses(0.1, 0.1),
    connectorPairCount: 1, connectorLossDb: losses(0.3, 0.3), source: 'Měření' }
  const distributions = [{ pointId: 'home', premises: [{ id: 'hp', status: 'connected', fiber, indoorCable }] }]
  const path = tracePortToPremise('olt-port', 'hp', equipment, routes, installations, [], distributions)
  assert.equal(path.status, 'connected')
  assert.deepEqual(path.routeIds, ['route'])
  assert.equal(path.steps.filter(step => step.kind === 'splitter').length, 0)
  assert.equal(path.steps.find(step => step.kind === 'indoor-cable').lengthMeters, 18)
  const scenario = scenarioFromOpticalPath(path, installations)
  assert.equal(scenario.sections.at(-1).lengthM, '18')
  assert.equal(scenario.sections.at(-1).loss1310, '0.4')
  assert.equal(scenario.sections.at(-1).loss1550, '0.25')
  assert.equal(scenario.sections.at(-1).source, 'Měření')
  assert.equal(scenario.elements.find(element => element.name === 'Domovní svary').loss1310, '0.1')
  assert.equal(scenario.elements.find(element => element.name === 'Domovní konektorové spoje').loss1550, '0.3')
  assert.equal(calculate(scenario).rows.find(row => row.name.includes('Domovní kabel')).loss, 0.0072)
})

test('equipment API checks physical hierarchy, fiber termination and concurrency', { timeout: 50000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-equipment-test-'))
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(done => socket.close(done))
  const url = `http://127.0.0.1:${port}`
  let server
  let logs = ''
  const request = (path, method = 'GET', body) => fetch(`${url}/api${path}`, {
    method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  try {
    server = spawn('dotnet', [process.env.FNS_API_DLL
      ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], {
      windowsHide: true,
      env: { ...process.env, ASPNETCORE_URLS: url,
        NetworkPoints__Path: join(directory, 'points.json'), UndergroundRoutes__Path: join(directory, 'routes.json'),
        RouteInstallations__Path: join(directory, 'installed.json'), OpticalSplices__Path: join(directory, 'splices.json'),
        BuildingEquipment__Path: join(directory, 'equipment.json'),
        CableCatalog__Path: join(directory, 'cables.json'), DuctCatalog__Path: join(directory, 'ducts.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout.on('data', chunk => { logs += chunk })
    server.stderr.on('data', chunk => { logs += chunk })
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${url}/api/health`)).ok) break } catch { /* starting */ }
      if (server.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    const a = await (await request('/network-points', 'POST',
      { kind: 'building', name: 'Ústředna', latitude: 50, longitude: 14 })).json()
    const b = await (await request('/network-points', 'POST',
      { kind: 'chamber', name: 'Šachta', latitude: 50, longitude: 14.001 })).json()
    const route = await (await request('/underground-routes', 'POST',
      { name: 'Ústředna–šachta', startPointId: a.id, endPointId: b.id, waypoints: [] })).json()
    const duct = (await (await request('/duct-catalog')).json()).find(item => item.kind === 'microduct')
    const cable = (await (await request('/cable-catalog')).json())[0]
    let installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: duct.id, parentId: null, slotIndex: null, version: 0 })).json()
    installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: cable.id, parentId: installed.items[0].id, slotIndex: null, version: installed.version })).json()
    const item = installed.items.at(-1)
    const lengthEndpoint = `/route-installations/${route.id}/items/${item.id}/length`
    assert.equal((await request(lengthEndpoint, 'PUT', { actualLengthMeters: 0, version: installed.version })).status, 400)
    installed = await (await request(lengthEndpoint, 'PUT',
      { actualLengthMeters: 125.5, version: installed.version })).json()
    assert.equal(installed.items.at(-1).actualLengthMeters, 125.5)
    assert.equal((await request(lengthEndpoint, 'PUT', { actualLengthMeters: 2, version: 0 })).status, 409)
    installed = await (await request(lengthEndpoint, 'PUT',
      { actualLengthMeters: null, version: installed.version })).json()
    assert.equal(installed.items.at(-1).actualLengthMeters, null)
    const rackId = crypto.randomUUID(), shelfId = crypto.randomUUID(), cardId = crypto.randomUUID()
    const odfId = crypto.randomUUID(), oltId = crypto.randomUUID()
    const document = { version: 0, racks: [{ id: rackId, name: 'Stojan 1' }],
      shelves: [{ id: shelfId, rackId, kind: 'odf', name: 'ODF 1' },
        { id: crypto.randomUUID(), rackId, kind: 'olt', name: 'OLT 1' }], cards: [], ports: [] }
    document.cards = [{ id: cardId, shelfId: document.shelves[1].id, name: 'Karta 1' }]
    document.ports = [
      { id: odfId, parentId: shelfId, position: 1, label: 'ODF 1/1',
        fiber: { itemId: item.id, tubeIndex: 0, fiberIndex: 0 }, patchPortId: oltId },
      { id: oltId, parentId: cardId, position: 1, label: 'OLT 1/1', fiber: null, patchPortId: odfId },
    ]
    const endpoint = `/building-equipment/${a.id}`
    assert.equal((await request(`/building-equipment/${b.id}`)).status, 200)
    assert.equal((await request(endpoint, 'PUT', { ...document,
      ports: document.ports.map(item => ({ ...item, fiber: { itemId: crypto.randomUUID(), tubeIndex: 0, fiberIndex: 0 } })) })).status, 400)
    const savedResponse = await request(endpoint, 'PUT', document)
    assert.equal(savedResponse.status, 200)
    const saved = await savedResponse.json()
    assert.equal(saved.version, 1)
    assert.equal((await request(endpoint, 'PUT', document)).status, 409)
    assert.equal((await request(`/route-installations/${route.id}/items/${item.id}?version=${installed.version}`, 'DELETE')).status, 409)
    assert.equal((await request(`/network-points/${a.id}`, 'DELETE')).status, 409)
    assert.equal((await request(endpoint, 'PUT', { ...saved, ports: [{ ...saved.ports[0], patchPortId: null }, saved.ports[1] ] })).status, 400)
    assert.equal((await request(endpoint, 'PUT', { ...saved, racks: [], shelves: [], cards: [], ports: [] })).status, 200)
    assert.equal((await (await request(endpoint)).json()).version, 0)
  } finally {
    server?.kill()
    if (server) await once(server, 'exit').catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})
