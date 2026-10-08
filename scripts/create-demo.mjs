// Developer tool: regenerates the committed fictional fixture using this API's catalog presets.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const directory = await mkdtemp(join(tmpdir(), 'fns-demo-generator-'))
const socket = createServer().listen(0, '127.0.0.1')
await once(socket, 'listening')
const port = socket.address().port
await new Promise(done => socket.close(done))
const url = `http://127.0.0.1:${port}`
const stores = { NetworkPoints: 'network-points', UndergroundRoutes: 'underground-routes',
  RouteInstallations: 'route-installations', OpticalSplices: 'optical-splices',
  BuildingEquipment: 'building-equipment', BuildingDistribution: 'building-distribution',
  Customers: 'customers', FiberAllocations: 'fiber-allocations', CableCatalog: 'cable-catalog', DuctCatalog: 'duct-catalog' }
const env = { ...process.env, ASPNETCORE_URLS: url }
for (const [key, name] of Object.entries(stores)) env[`${key}__Path`] = join(directory, `${name}.json`)
const server = spawn('dotnet', [resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')],
  { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''
server.stdout.on('data', data => { logs += data }); server.stderr.on('data', data => { logs += data })
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(`${url}/api/health`)).ok; if (ready) break } catch { /* startup */ }
    if (server.exitCode !== null) throw new Error(logs)
    await delay(100)
  }
  if (!ready) throw new Error(`API startup failed: ${logs}`)
  const catalog = async name => {
    const response = await fetch(`${url}/api/${name}`)
    if (!response.ok) throw new Error(`Catalog ${name}: ${response.status}`)
    return response.json()
  }
  const cable = (await catalog('cable-catalog'))[0]
  const duct = (await catalog('duct-catalog')).find(item => item.kind === 'microduct')
  const id = n => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const fiber = (n, fiberIndex = 0) => ({ itemId: id(n), tubeIndex: 0, fiberIndex })
  const point = (n, kind, name, latitude, longitude, buildingType = null) => ({ id: id(n), kind, name, latitude, longitude, buildingType })
  const points = [point(1, 'building', 'Ukázka · uzel OLT', 50.088, 14.421, 'standard'),
    point(2, 'pole', 'Ukázka · sloup P1', 50.088, 14.423),
    point(3, 'building', 'Ukázka · rodinný dům', 50.089, 14.424, 'standard'),
    point(4, 'building', 'Ukázka · bytový dům', 50.087, 14.424, 'apartment'),
    point(5, 'building', 'Ukázka · dům k připojení', 50.089, 14.422, 'standard')]
  const route = (n, kind, name, start, end) => ({ id: id(n), kind, name, startPointId: id(start), endPointId: id(end), waypoints: [] })
  const routes = [route(10, 'underground', 'Ukázka · podzemní přívod', 1, 2),
    route(11, 'aerial', 'Ukázka · přípojka po sloupu', 2, 3),
    route(12, 'underground', 'Ukázka · přípojka bytového domu', 2, 4)]
  const item = (n, r, run, parent, type, label, length = null) => ({ id: id(n), routeId: id(r),
    runId: id(run), parentId: parent ? id(parent) : null, slotIndex: null, label, catalogId: type.id,
    duct: type === duct ? type : null, cable: type === cable ? type : null,
    actualLengthMeters: length, lengthBeforeSplitMeters: null })
  const installed = [{ routeId: id(10), version: 1, items: [item(20, 10, 90, null, duct, 'Ukázková mikrotrubička'),
    item(21, 10, 91, 20, cable, 'Ukázkový přívodní kabel', 150)] },
    { routeId: id(11), version: 1, items: [item(22, 11, 94, null, cable, 'Ukázkový kabel rodinného domu', 140)] },
    { routeId: id(12), version: 1, items: [item(23, 12, 92, null, duct, 'Ukázková mikrotrubička'),
      item(24, 12, 93, 23, cable, 'Ukázkový kabel bytového domu', null)] }]
  const ports = [0, 1].flatMap(i => [{ id: id(35 + i), parentId: id(31), position: i + 1, label: `ODF ${i + 1}`, fiber: fiber(21, i), patchPortId: id(37 + i) },
    { id: id(37 + i), parentId: id(33), position: i + 1, label: `OLT ${i + 1}`, fiber: null, patchPortId: id(35 + i) }])
  const equipment = [{ pointId: id(1), version: 1, racks: [{ id: id(30), name: 'Ukázkový stojan' }],
    shelves: [{ id: id(31), rackId: id(30), kind: 'odf', name: 'Ukázkový ODF' }, { id: id(32), rackId: id(30), kind: 'olt', name: 'Ukázkový OLT' }],
    cards: [{ id: id(33), shelfId: id(32), name: 'Ukázková karta' }], ports }]
  const premise = (n, box, label, status, end) => ({ id: id(n), boxId: box ? id(box) : null, label, status, fiber: end, indoorCable: null })
  const distribution = [{ pointId: id(3), version: 1, risers: [], boxes: [],
    premises: [premise(40, null, 'Přípojka domu', 'connected', fiber(22))] },
    { pointId: id(4), version: 1, risers: [{ id: id(41), name: 'Vchod A', cableItemId: id(24) }],
      boxes: [{ id: id(42), riserId: id(41), name: 'Box 1', floor: 1 }],
      premises: [premise(43, 42, 'Byt 101', 'connected', fiber(24)), premise(44, 42, 'Byt 102', 'planned', null)] }]
  const customer = (n, b, hp, name, status) => ({ id: id(n), version: 1, buildingPointId: id(b), premiseId: id(hp), name, status,
    note: 'Smyšlený záznam pro vyzkoušení prototypu.', contacts: [], messages: [] })
  const data = { 'network-points': points, 'underground-routes': routes, 'route-installations': installed,
    'optical-splices': [{ pointId: id(2), version: 1, name: 'Ukázka · spojka na sloupu',
      connections: [{ id: id(50), kind: 'fusion', left: fiber(21), right: fiber(22) },
        { id: id(51), kind: 'fusion', left: fiber(21, 1), right: fiber(24) }], reserves: [], splitters: [] }],
    'building-equipment': equipment, 'building-distribution': distribution,
    customers: [customer(60, 3, 40, 'Ukázka · připojený dům', 'active'), customer(61, 4, 44, 'Ukázka · plánovaný byt', 'lead')],
    'fiber-allocations': { version: 0, allocations: [] }, 'cable-catalog': [], 'duct-catalog': [] }
  const target = resolve('demo/data')
  await mkdir(target, { recursive: true })
  for (const [name, value] of Object.entries(data)) await writeFile(join(target, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
  console.log('Fictional demo fixture generated with stable IDs in demo/data.')
} finally {
  if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
  await rm(directory, { recursive: true, force: true })
}
