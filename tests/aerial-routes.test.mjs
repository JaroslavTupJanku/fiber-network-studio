import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { aerialSplitPreview, routeCoordinates, routeLengthMeters, routeKind,
  waypointsAfterPointMove } from '../frontend/src/features/map/undergroundRoutes.ts'
import { crossingBuildingFootprints } from '../frontend/src/features/map/buildingFootprints.ts'
import { canPlaceItem } from '../frontend/src/features/map/routeInstallations.ts'
import { traceOpticalPath } from '../frontend/src/features/map/traceOpticalPath.ts'
import { routeCollection } from '../frontend/src/features/map/mapLayers.ts'
import { routeExportRows } from '../frontend/src/features/map/networkExports.ts'

test('aerial geometry plans poles along bends, separates route types and skips excavation checks', () => {
  const points = [{ id: 'a', kind: 'building', latitude: 50, longitude: 14 },
    { id: 'b', kind: 'pole', latitude: 50.001, longitude: 14.001 }]
  const route = { id: 'r', kind: 'aerial', name: 'Nadzemní', startPointId: 'a', endPointId: 'b',
    waypoints: [{ latitude: 50, longitude: 14.001 }] }
  const length = routeLengthMeters(routeCoordinates(route, points))
  const preview = aerialSplitPreview(route, points, { poleCount: 3 })
  assert.equal(preview.positions.length, 3)
  assert.equal(preview.spanMeters, length / 4)
  assert.ok(preview.positions[0].longitude > 14 && preview.positions[0].longitude < 14.001)
  assert.equal(preview.positions[0].latitude, 50)
  assert.ok(preview.positions[2].latitude > 50)
  assert.equal(aerialSplitPreview(route, points, { maxSpanMeters: 50 }).positions.length, 3)
  for (const poleCount of [0, 1.5, 101, NaN]) assert.equal(aerialSplitPreview(route, points, { poleCount }), null)
  for (const maxSpanMeters of [0, -1, NaN, Infinity, length * 2])
    assert.equal(aerialSplitPreview(route, points, { maxSpanMeters }), null)
  const footprint = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[
    [14.0004, 49.9999], [14.0006, 49.9999], [14.0006, 50.0001], [14.0004, 50.0001], [14.0004, 49.9999],
  ]] } }
  assert.deepEqual(crossingBuildingFootprints(route, points, [footprint]), [])
  assert.equal(crossingBuildingFootprints({ ...route, kind: 'underground' }, points, [footprint]).length, 1)
  assert.equal(routeKind({}), 'underground')
  assert.equal(routeCollection([route], points, []).features[0].properties.kind, 'aerial')
  assert.equal(routeExportRows(route, points, [])[0]['Typ trasy'], 'Nadzemní trasa')
  assert.equal(canPlaceItem(null, [], { duct: null, cable: {} }, null, true), true)
  assert.equal(canPlaceItem(null, [], { duct: null, cable: {} }, null), false)
  assert.equal(canPlaceItem(null, [], { duct: {}, cable: null }, null, true), false)
})

test('mixed network keeps cable continuity through poles, batch splits and far-end termination',
  { timeout: 50000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fiber-aerial-test-'))
    const socket = createServer()
    socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
    const port = socket.address().port
    await new Promise(done => socket.close(done))
    const url = `http://127.0.0.1:${port}`
    let server; let logs = ''
    const env = { ...process.env, ASPNETCORE_URLS: url }
    for (const key of ['NetworkPoints', 'UndergroundRoutes', 'RouteInstallations', 'OpticalSplices',
      'BuildingEquipment', 'BuildingDistribution', 'FiberAllocations', 'Customers', 'CableCatalog', 'DuctCatalog'])
      env[`${key}__Path`] = join(directory, `${key}.json`)
    const start = async () => {
      server = spawn('dotnet', [process.env.FNS_API_DLL ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
      server.stdout.on('data', data => { logs += data }); server.stderr.on('data', data => { logs += data })
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(`${url}/api/health`)).ok) return } catch { /* starting */ }
        if (server.exitCode !== null) throw new Error(logs)
        await delay(100)
      }
      throw new Error(logs)
    }
    const stop = async () => {
      if (server?.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
    }
    const request = (path, method = 'GET', data) => fetch(`${url}/api${path}`, { method,
      ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) })
    const ok = async response => {
      const text = await response.text(); assert.ok(response.ok, `${response.status}: ${text}`)
      return text ? JSON.parse(text) : null
    }
    try {
      await start()
      const point = (kind, name, longitude) => request('/network-points', 'POST', { kind, name, latitude: 50, longitude }).then(ok)
      const a = await point('building', 'OLT', 14)
      const pole = await point('pole', 'P-01', 14.001)
      const b = await point('building', 'Cíl', 14.004)
      const chamber = await point('chamber', 'Šachta', 14.005)
      const input = { name: 'Nadzemní', kind: 'aerial', startPointId: pole.id, endPointId: b.id,
        waypoints: [{ latitude: 50.0001, longitude: 14.002 }] }
      assert.equal((await request('/underground-routes', 'POST', { ...input, endPointId: chamber.id })).status, 400)
      assert.equal((await request('/underground-routes', 'POST', { ...input, kind: 'invalid' })).status, 400)
      const aerial = await ok(await request('/underground-routes', 'POST', input))
      const underground = await ok(await request('/underground-routes', 'POST',
        { name: 'Podzemní přívod', startPointId: a.id, endPointId: pole.id, waypoints: [] }))
      assert.equal(underground.kind, 'underground')
      const cableType = (await ok(await request('/cable-catalog')))[0]
      const conduit = (await ok(await request('/duct-catalog'))).filter(duct => duct.kind === 'conduit')
        .sort((a, b) => (b.innerDiameterMm ?? 0) - (a.innerDiameterMm ?? 0))[0]
      const add = (route, catalogId, parentId, version, continueFromItemId = null) => request(
        `/route-installations/${route.id}/items`, 'POST', { catalogId, parentId, slotIndex: null, version, continueFromItemId })
      assert.equal((await add(aerial, conduit.id, null, 0)).status, 409)
      assert.equal((await add(underground, cableType.id, null, 0)).status, 409)
      let ground = await ok(await add(underground, conduit.id, null, 0))
      ground = await ok(await add(underground, cableType.id, ground.items[0].id, ground.version))
      const groundCable = ground.items.find(item => item.cable)
      let air = await ok(await add(aerial, null, null, 0, groundCable.id))
      const airCable = air.items[0]
      assert.equal(airCable.runId, groundCable.runId)
      air = await ok(await request(`/route-installations/${aerial.id}/items/${airCable.id}/length`, 'PUT',
        { version: air.version, actualLengthMeters: 290 }))
      assert.equal((await request(`/underground-routes/${aerial.id}`, 'PUT', { ...input, kind: 'underground' })).status, 409)
      assert.equal((await request(`/network-points/${pole.id}`, 'DELETE')).status, 409)
      // A splice housing on the pole may record reserves without inventing a splice in a through cable.
      await ok(await request(`/optical-splices/${pole.id}`, 'PUT', { version: 0, name: 'Spojka na sloupu',
        connections: [], splitters: [], reserves: [{ itemId: airCable.id, lengthMeters: 5 }] }))
      const moved = { ...pole, latitude: 50.0002 }
      await ok(await request(`/network-points/${pole.id}`, 'PUT', moved))
      const changed = { ...aerial, waypoints: waypointsAfterPointMove(aerial, [a, pole, b, chamber], pole.id, moved) }
      const saved = await ok(await request(`/underground-routes/${aerial.id}`, 'PUT', changed))
      const fiber = item => ({ itemId: item.id, tubeIndex: 0, fiberIndex: 0 })
      const terminate = async (pointId, item, olt = false) => {
        const rackId = crypto.randomUUID(); const shelfId = crypto.randomUUID(); const portId = crypto.randomUUID()
        const oltShelfId = crypto.randomUUID(); const oltPortId = crypto.randomUUID(); const cardId = crypto.randomUUID()
        await ok(await request(`/building-equipment/${pointId}`, 'PUT', { version: 0,
          racks: [{ id: rackId, name: 'R1' }],
          shelves: [{ id: shelfId, rackId, kind: 'odf', name: 'ODF' },
            ...(olt ? [{ id: oltShelfId, rackId, kind: 'olt', name: 'OLT' }] : [])],
          cards: olt ? [{ id: cardId, shelfId: oltShelfId, name: 'Karta' }] : [],
          ports: [{ id: portId, parentId: shelfId, position: 1, label: 'P1', fiber: fiber(item), patchPortId: olt ? oltPortId : null },
            ...(olt ? [{ id: oltPortId, parentId: cardId, position: 1, label: 'OLT P1', fiber: null, patchPortId: portId }] : [])] }))
        return olt ? oltPortId : portId
      }
      const startPortId = await terminate(a.id, groundCable, true)
      const endPortId = await terminate(b.id, airCable)
      const riserId = crypto.randomUUID(); const boxId = crypto.randomUUID(); const hpId = crypto.randomUUID()
      await ok(await request(`/building-distribution/${b.id}`, 'PUT', { version: 0,
        risers: [{ id: riserId, name: 'Vchod', cableItemId: airCable.id }],
        boxes: [{ id: boxId, riserId, name: 'Podlaží', floor: 1 }],
        premises: [{ id: hpId, boxId, label: 'Byt', status: 'connected', fiber: { ...fiber(airCable), fiberIndex: 1 } }] }))
      const splitRequest = { expectedRoute: saved, installationVersion: air.version, chamberName: 'P', poleCount: 2 }
      const beforeCount = (await ok(await request('/network-points'))).length
      assert.equal((await request(`/underground-routes/${aerial.id}/split`, 'POST', { ...splitRequest, poleCount: 101 })).status, 400)
      assert.equal((await request(`/underground-routes/${aerial.id}/split`, 'POST', { ...splitRequest, installationVersion: 0 })).status, 409)
      assert.equal((await ok(await request('/network-points'))).length, beforeCount)
      const split = await ok(await request(`/underground-routes/${aerial.id}/split`, 'POST', splitRequest))
      assert.equal(split.addedPoints.length, 2)
      assert.ok(split.addedPoints.every(point => point.kind === 'pole'))
      assert.equal(split.routes.length, 3)
      assert.ok(split.routes.every(route => route.kind === 'aerial'))
      assert.equal(split.routes[0].id, aerial.id)
      const docs = await ok(await request('/route-installations'))
      const cables = split.routes.map(route => docs.find(doc => doc.routeId === route.id).items[0])
      assert.ok(cables.every(item => item.runId === groundCable.runId && item.actualLengthMeters === null))
      assert.equal(cables[0].lengthBeforeSplitMeters, 290)
      const allRoutes = await ok(await request('/underground-routes'))
      const allPoints = await ok(await request('/network-points'))
      const originalLength = routeLengthMeters(routeCoordinates(saved, allPoints))
      assert.ok(Math.abs(split.routes.reduce((sum, route) => sum + routeLengthMeters(routeCoordinates(route, allPoints)), 0) - originalLength) < 0.01)
      const equipment = await ok(await request('/building-equipment'))
      assert.equal(equipment.find(doc => doc.pointId === b.id).ports[0].fiber.itemId, cables.at(-1).id)
      const distribution = await ok(await request('/building-distribution'))
      assert.equal(distribution[0].risers[0].cableItemId, cables.at(-1).id)
      assert.equal(distribution[0].premises[0].fiber.itemId, cables.at(-1).id)
      const path = traceOpticalPath(startPortId, equipment, allRoutes, docs, await ok(await request('/optical-splices')))
      assert.equal(path.status, 'connected')
      assert.equal(path.endPortId, endPortId)
      assert.deepEqual(new Set(path.routeIds), new Set([underground.id, ...split.routes.map(route => route.id)]))
      assert.equal(path.steps.filter(step => step.kind === 'splice').length, 0)
      // Distance mode is one atomic split and preserves the same physical cable run.
      const lastRoute = split.routes.at(-1)
      const lastDocument = docs.find(doc => doc.routeId === lastRoute.id)
      const lastLength = routeLengthMeters(routeCoordinates(lastRoute, allPoints))
      const distanceSplit = await ok(await request(`/underground-routes/${lastRoute.id}/split`, 'POST',
        { expectedRoute: lastRoute, installationVersion: lastDocument.version, chamberName: 'D', maxSpanMeters: lastLength / 2.5 }))
      assert.equal(distanceSplit.addedPoints.length, 2)
      await stop(); await start()
      assert.equal((await ok(await request('/underground-routes'))).length, 6)
      assert.ok((await ok(await request('/network-points'))).some(point => point.id === distanceSplit.addedPoints[0].id))
      // Cutting the run at a pole creates a real pair of fiber ends; a saved fusion restores the path.
      const latestDocs = await ok(await request('/route-installations'))
      const firstAirDoc = latestDocs.find(doc => doc.routeId === aerial.id)
      const cutDocs = await ok(await request(`/optical-splices/${pole.id}/split-cable`, 'POST',
        { itemId: airCable.id, version: firstAirDoc.version }))
      const cutGround = cutDocs.find(doc => doc.routeId === underground.id).items.find(item => item.cable)
      const cutAir = cutDocs.find(doc => doc.routeId === aerial.id).items.find(item => item.cable)
      assert.notEqual(cutGround.runId, cutAir.runId)
      await ok(await request(`/optical-splices/${pole.id}`, 'PUT', { version: 1, name: 'Spojka na sloupu',
        connections: [{ id: crypto.randomUUID(), kind: 'fusion', left: fiber(cutGround), right: fiber(cutAir) }],
        reserves: [{ itemId: cutAir.id, lengthMeters: 5 }], splitters: [] }))
      const reconnected = traceOpticalPath(startPortId, await ok(await request('/building-equipment')),
        await ok(await request('/underground-routes')), cutDocs, await ok(await request('/optical-splices')))
      assert.equal(reconnected.status, 'connected')
      assert.equal(reconnected.endPortId, endPortId)
      assert.equal(reconnected.steps.filter(step => step.kind === 'splice').length, 1)

    } finally { await stop(); await rm(directory, { recursive: true, force: true }) }
  })
