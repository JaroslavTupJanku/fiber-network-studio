import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { traceOpticalPath } from '../frontend/src/features/map/traceOpticalPath.ts'

test('splitting an installed route preserves runs and remaps the far-end fiber references',
  { timeout: 50000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fiber-route-split-'))
    const paths = Object.fromEntries(['points', 'routes', 'installed', 'splices', 'equipment', 'distribution']
      .map(name => [name, join(directory, `${name}.json`)]))
    const socket = createServer()
    socket.listen(0, '127.0.0.1'); await once(socket, 'listening')
    const port = socket.address().port
    await new Promise(done => socket.close(done))
    const url = `http://127.0.0.1:${port}`
    let server
    let logs = ''
    const stop = async () => {
      if (server?.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
    }
    const start = async () => {
      server = spawn('dotnet', [process.env.FNS_API_DLL
        ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], {
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ASPNETCORE_URLS: url,
          NetworkPoints__Path: paths.points, UndergroundRoutes__Path: paths.routes,
          RouteInstallations__Path: paths.installed, OpticalSplices__Path: paths.splices,
          BuildingEquipment__Path: paths.equipment, BuildingDistribution__Path: paths.distribution },
      })
      server.stdout.on('data', chunk => { logs += chunk })
      server.stderr.on('data', chunk => { logs += chunk })
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(`${url}/api/health`)).ok) return } catch { /* starting */ }
        if (server.exitCode !== null) throw new Error(logs)
        await delay(100)
      }
      throw new Error(`API did not start: ${logs}`)
    }
    const request = (path, method = 'GET', body) => fetch(`${url}/api${path}`, {
      method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    })
    const body = async response => response.json()
    try {
      await start()
      const a = await body(await request('/network-points', 'POST',
        { kind: 'chamber', name: 'Šachta A', latitude: 50, longitude: 14 }))
      const b = await body(await request('/network-points', 'POST',
        { kind: 'building', name: 'Dům B', latitude: 50, longitude: 14.002 }))
      const route = await body(await request('/underground-routes', 'POST', {
        name: 'Přívod', startPointId: a.id, endPointId: b.id,
        waypoints: [{ latitude: 50.0003, longitude: 14.001 }],
      }))
      const ducts = await body(await request('/duct-catalog'))
      const cables = await body(await request('/cable-catalog'))
      const cableType = cables[0]
      const conduitType = ducts.filter(item => item.kind === 'conduit')
        .sort((left, right) => (right.innerDiameterMm ?? 0) - (left.innerDiameterMm ?? 0))[0]
      assert.ok(conduitType && cableType)
      const add = async (catalogId, parentId, version) => body(await request(
        `/route-installations/${route.id}/items`, 'POST',
        { catalogId, parentId, slotIndex: null, label: '', version, continueFromItemId: null }))
      const withConduit = await add(conduitType.id, null, 0)
      const withCable = await add(cableType.id, withConduit.items[0].id, 1)
      assert.equal(withCable.items.length, 2)
      const oldCable = withCable.items.find(item => item.cable)
      const measured = await body(await request(`/route-installations/${route.id}/items/${oldCable.id}/length`,
        'PUT', { actualLengthMeters: 130, version: withCable.version }))
      assert.equal(measured.version, 3)
      const portId = crypto.randomUUID()
      const riserId = crypto.randomUUID()
      await stop()
      await writeFile(paths.equipment, JSON.stringify([{ pointId: b.id, version: 1,
        racks: [], shelves: [], cards: [], ports: [{ id: portId, parentId: crypto.randomUUID(),
          position: 1, label: 'P1', fiber: { itemId: oldCable.id, tubeIndex: 0, fiberIndex: 0 },
          patchPortId: null }] }]))
      await writeFile(paths.distribution, JSON.stringify([{ pointId: b.id, version: 1,
        risers: [{ id: riserId, name: 'Vchod', cableItemId: oldCable.id }], boxes: [],
        premises: [{ id: crypto.randomUUID(), boxId: crypto.randomUUID(), label: 'HP', status: 'connected',
          fiber: { itemId: oldCable.id, tubeIndex: 0, fiberIndex: 1 } }] }]))
      await start()
      const invalid = await request(`/underground-routes/${route.id}/split`, 'POST', {
        expectedRoute: route, installationVersion: 2, segmentIndex: 0, fraction: 0.5, chamberName: 'S-02',
      })
      assert.equal(invalid.status, 409)
      assert.equal((await body(await request('/network-points'))).length, 2)
      const split = await request(`/underground-routes/${route.id}/split`, 'POST', {
        expectedRoute: route, installationVersion: 3, segmentIndex: 0, fraction: 0.5, chamberName: 'S-02',
      })
      const splitText = await split.text()
      assert.equal(split.status, 200, splitText)
      const result = JSON.parse(splitText)
      assert.equal(result.firstRoute.id, route.id)
      assert.equal(result.firstRoute.endPointId, result.chamber.id)
      assert.deepEqual(result.firstRoute.waypoints, [])
      assert.equal(result.secondRoute.startPointId, result.chamber.id)
      assert.deepEqual(result.secondRoute.waypoints, route.waypoints)
      const installed = await body(await request('/route-installations'))
      const first = installed.find(item => item.routeId === route.id)
      const second = installed.find(item => item.routeId === result.secondRoute.id)
      const firstCable = first.items.find(item => item.cable)
      const secondCable = second.items.find(item => item.cable)
      const secondConduit = second.items.find(item => item.duct)
      assert.equal(firstCable.id, oldCable.id)
      assert.equal(firstCable.runId, secondCable.runId)
      assert.equal(secondCable.parentId, secondConduit.id)
      assert.equal(firstCable.actualLengthMeters, null)
      assert.equal(secondCable.actualLengthMeters, null)
      assert.equal(firstCable.lengthBeforeSplitMeters, 130)
      const equipment = await body(await request('/building-equipment'))
      const distribution = await body(await request('/building-distribution'))
      assert.equal(equipment[0].ports[0].fiber.itemId, secondCable.id)
      assert.equal(distribution[0].risers[0].cableItemId, secondCable.id)
      assert.equal(distribution[0].premises[0].fiber.itemId, secondCable.id)
      assert.equal(equipment[0].version, 2)
      assert.equal(distribution[0].version, 2)
      const path = traceOpticalPath(portId, equipment,
        await body(await request('/underground-routes')), installed, [])
      assert.deepEqual(new Set(path.routeIds), new Set([route.id, result.secondRoute.id]))

      // A chamber splice at the old end must move to the new half's item ID.
      await stop()
      await writeFile(paths.splices, JSON.stringify([{ pointId: result.chamber.id, version: 1,
        name: 'Spojka', connections: [], reserves: [{ itemId: firstCable.id, lengthMeters: 4 }],
        splitters: [] }]))
      await start()
      const splitAgain = await request(`/underground-routes/${route.id}/split`, 'POST', {
        expectedRoute: result.firstRoute, installationVersion: first.version,
        segmentIndex: 0, fraction: 0.5, chamberName: 'S-01',
      })
      const splitAgainText = await splitAgain.text()
      assert.equal(splitAgain.status, 200, splitAgainText)
      const secondSplit = JSON.parse(splitAgainText)
      const afterSecondSplit = await body(await request('/route-installations'))
      const middleCable = afterSecondSplit.find(item => item.routeId === secondSplit.secondRoute.id)
        .items.find(item => item.cable)
      const splices = await body(await request('/optical-splices'))
      assert.equal(splices[0].reserves[0].itemId, middleCable.id)
      assert.equal(splices[0].version, 2)

      // Replaying a journal after a simulated interruption restores a complete snapshot.
      await stop()
      const journal = await Promise.all(Object.values(paths).map(async path => ({ path,
        contentBase64: (await readFile(path)).toString('base64') })))
      await writeFile(paths.routes, '[]')
      await writeFile(paths.routes + '.split-journal.json', JSON.stringify(journal))
      await start()
      assert.equal((await body(await request('/underground-routes'))).length, 3)
      assert.equal((await body(await request('/network-points'))).length, 4)

      // A route without installed elements splits without inventing an installation document.
      const emptyRoute = await body(await request('/underground-routes', 'POST', {
        name: 'Rezervní koridor', startPointId: b.id, endPointId: a.id, waypoints: [],
      }))
      const emptySplit = await request(`/underground-routes/${emptyRoute.id}/split`, 'POST', {
        expectedRoute: emptyRoute, installationVersion: 0,
        segmentIndex: 0, fraction: 0.5, chamberName: 'Šachta v koridoru',
      })
      assert.equal(emptySplit.status, 200)
      const emptyResult = await body(emptySplit)
      const finalDocuments = await body(await request('/route-installations'))
      assert.ok(!finalDocuments.some(document => document.routeId === emptyRoute.id
        || document.routeId === emptyResult.secondRoute.id))
    } finally {
      await stop()
      await rm(directory, { recursive: true, force: true })
    }
  })
