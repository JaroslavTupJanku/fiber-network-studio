import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

test('building distribution keeps apartment identity and valid fiber assignments', { timeout: 50000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-distribution-test-'))
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
        BuildingEquipment__Path: join(directory, 'equipment.json'), BuildingDistribution__Path: join(directory, 'distribution.json'),
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
    const building = await (await request('/network-points', 'POST',
      { kind: 'building', buildingType: 'apartment', name: 'Dům 12', latitude: 50, longitude: 14 })).json()
    assert.equal(building.buildingType, 'apartment')
    const chamber = await (await request('/network-points', 'POST',
      { kind: 'chamber', name: 'Šachta', latitude: 50, longitude: 14.001 })).json()
    const route = await (await request('/underground-routes', 'POST',
      { name: 'Přívod', startPointId: building.id, endPointId: chamber.id, waypoints: [] })).json()
    const duct = (await (await request('/duct-catalog')).json()).find(item => item.kind === 'microduct')
    const cable = (await (await request('/cable-catalog')).json())[0]
    let installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: duct.id, parentId: null, slotIndex: null, version: 0 })).json()
    installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: cable.id, parentId: installed.items[0].id, slotIndex: null, version: installed.version })).json()
    const cableItem = installed.items.find(item => item.cable)
    const riser = { id: crypto.randomUUID(), name: 'Vchod A', cableItemId: cableItem.id }
    const box = { id: crypto.randomUUID(), riserId: riser.id, name: 'Box 1', floor: 2 }
    const fiber = { itemId: cableItem.id, tubeIndex: 0, fiberIndex: 0 }
    const home = { id: crypto.randomUUID(), boxId: box.id, label: 'Byt 201', status: 'connected', fiber }
    const path = `/building-distribution/${building.id}`
    assert.equal((await request(path, 'PUT', { version: 0, risers: [riser], boxes: [box],
      premises: [home, { ...home, id: crypto.randomUUID(), label: 'Byt 202' }] })).status, 400)
    assert.equal((await request(path, 'PUT', { version: 0, risers: [riser], boxes: [box],
      premises: [{ ...home, status: 'planned' }] })).status, 400)
    const missingFiber = await request(path, 'PUT', { version: 0, risers: [riser], boxes: [box],
      premises: [{ ...home, fiber: null }] })
    assert.equal(missingFiber.status, 400)
    assert.match((await missingFiber.json()).error, /vyberte konkrétní vlákno/i)
    let document = await (await request(path, 'PUT', { version: 0, risers: [riser], boxes: [box], premises: [home] })).json()
    assert.equal(document.version, 1)
    assert.equal(document.premises[0].label, 'Byt 201')
    assert.equal(document.premises[0].indoorCable, null)
    const losses = (loss1310, loss1550) => ({ loss1270: null, loss1310, loss1490: null, loss1550, loss1577: null })
    const indoorCable = { cableName: 'Kabel do bytu', catalogCableId: null, lengthMeters: 16,
      attenuationDbPerKm: losses(0.4, 0.25), spliceCount: 1, spliceLossDb: losses(0.1, 0.1),
      connectorPairCount: 0, connectorLossDb: losses(null, null), source: 'Technický list' }
    assert.equal((await request(path, 'PUT', { ...document,
      premises: [{ ...home, indoorCable: { ...indoorCable, lengthMeters: -1 } }] })).status, 400)
    assert.equal((await request(path, 'PUT', { ...document,
      premises: [{ ...home, indoorCable: { ...indoorCable, spliceCount: null } }] })).status, 400)
    document = await (await request(path, 'PUT', { ...document,
      premises: [{ ...home, indoorCable }] })).json()
    assert.equal(document.version, 2)
    assert.deepEqual(document.premises[0].indoorCable, indoorCable)
    assert.deepEqual((await (await request(path)).json()).premises[0].indoorCable, indoorCable)
    assert.equal((await request(path, 'PUT', { ...document, version: 0 })).status, 409)
    assert.equal((await request(`/network-points/${building.id}`, 'DELETE')).status, 409)
    assert.equal((await request(`/route-installations/${route.id}/items/${cableItem.id}?version=${installed.version}`, 'DELETE')).status, 409)
    const rackId = crypto.randomUUID(), shelfId = crypto.randomUUID()
    assert.equal((await request(`/building-equipment/${building.id}`, 'PUT', { version: 0,
      racks: [{ id: rackId, name: 'Stojan' }], shelves: [{ id: shelfId, rackId, kind: 'odf', name: 'ODF' }],
      cards: [], ports: [{ id: crypto.randomUUID(), parentId: shelfId, position: 1, label: 'Port 1',
        fiber, patchPortId: null }] })).status, 400)
    document = await (await request(path, 'PUT', { ...document, risers: [], boxes: [], premises: [] })).json()
    assert.equal(document.version, 0)
    const changed = await (await request(`/network-points/${building.id}`, 'PUT', {
      name: 'Dům 12', latitude: 50, longitude: 14, buildingType: 'standard',
    })).json()
    assert.equal(changed.buildingType, 'standard')
  } finally {
    server?.kill()
    await rm(directory, { recursive: true, force: true })
  }
})
