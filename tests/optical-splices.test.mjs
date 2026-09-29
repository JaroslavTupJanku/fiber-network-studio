import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { spliceCableEnds } from '../frontend/src/features/map/opticalSplices.ts'

test('only terminal cable runs can be spliced at a chamber', () => {
  const routes = [
    { id: 'r1', startPointId: 'a', endPointId: 'b' },
    { id: 'r2', startPointId: 'b', endPointId: 'c' },
  ]
  const cable = { tubes: [{ fibers: [{}] }] }
  const documents = [
    { routeId: 'r1', items: [{ id: 'i1', runId: 'continuous', cable }, { id: 'i3', runId: 'terminal', cable }] },
    { routeId: 'r2', items: [{ id: 'i2', runId: 'continuous', cable }] },
  ]
  assert.deepEqual(spliceCableEnds('b', routes, documents).map(item => item.id), ['i3'])
})

test('splice API validates individual fiber ends, reservations, concurrency and deletion dependencies',
  { timeout: 50000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fiber-splices-test-'))
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
    const json = response => response.json()
    try {
      server = spawn('dotnet', [process.env.FNS_API_DLL
        ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], {
        windowsHide: true,
        env: { ...process.env, ASPNETCORE_URLS: url,
          NetworkPoints__Path: join(directory, 'points.json'), UndergroundRoutes__Path: join(directory, 'routes.json'),
          RouteInstallations__Path: join(directory, 'installed.json'), OpticalSplices__Path: join(directory, 'splices.json'),
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
      const point = async (name, longitude) => json(await request('/network-points', 'POST',
        { kind: 'chamber', name, latitude: 50, longitude }))
      const [a, b, c] = await Promise.all([point('A', 14), point('B', 14.001), point('C', 14.002)])
      const route = async (name, startPointId, endPointId) => json(await request('/underground-routes', 'POST',
        { name, startPointId, endPointId, waypoints: [] }))
      const [r1, r2] = await Promise.all([route('A-B', a.id, b.id), route('B-C', b.id, c.id)])
      const ducts = await json(await request('/duct-catalog'))
      const cables = await json(await request('/cable-catalog'))
      const microduct = ducts.find(item => item.kind === 'microduct' && item.innerDiameterMm === 3.5)
      const cable = cables[0]
      assert.ok(microduct && cable?.tubes[0]?.fibers[1])
      const install = async routeId => {
        let result = await json(await request(`/route-installations/${routeId}/items`, 'POST',
          { catalogId: microduct.id, parentId: null, slotIndex: null, version: 0 }))
        result = await json(await request(`/route-installations/${routeId}/items`, 'POST',
          { catalogId: cable.id, parentId: result.items[0].id, slotIndex: null, version: result.version }))
        return result
      }
      const [d1, d2] = await Promise.all([install(r1.id), install(r2.id)])
      const i1 = d1.items.at(-1)
      const i2 = d2.items.at(-1)
      const left = { itemId: i1.id, tubeIndex: 0, fiberIndex: 0 }
      const right = { itemId: i2.id, tubeIndex: 0, fiberIndex: 0 }
      const splicePath = `/optical-splices/${b.id}`
      assert.deepEqual(await json(await request('/optical-splices')), [])
      assert.equal((await json(await request(splicePath))).version, 0)
      const connection = { id: crypto.randomUUID(), left, right, kind: 'fusion' }
      let response = await request(splicePath, 'PUT', { version: 0, name: 'Spojka B',
        connections: [connection], reserves: [{ itemId: i1.id, lengthMeters: 12.5 }] })
      assert.equal(response.status, 200)
      const saved = await json(response)
      assert.equal(saved.version, 1)
      assert.deepEqual((await json(await request('/optical-splices'))).map(item => item.pointId), [b.id])
      assert.deepEqual(saved.connections[0].left, left)
      assert.equal((await request(splicePath, 'PUT', { ...saved, version: 0 })).status, 409)
      assert.equal((await request(splicePath, 'PUT', { ...saved, connections: [connection,
        { id: crypto.randomUUID(), left, right: { ...right, fiberIndex: 1 }, kind: 'fusion' }] })).status, 409)
      assert.equal((await request(splicePath, 'PUT', { ...saved, connections: [
        { ...connection, left: { ...left, tubeIndex: 99 } }] })).status, 400)
      const extraDuct = await json(await request(`/route-installations/${r2.id}/items`, 'POST',
        { catalogId: microduct.id, parentId: null, slotIndex: null, version: d2.version }))
      assert.equal((await request(`/route-installations/${r2.id}/items`, 'POST',
        { continueFromItemId: i1.id, parentId: extraDuct.items.at(-1).id,
          slotIndex: null, version: extraDuct.version })).status, 409)
      assert.equal((await request(`/route-installations/${r1.id}/items/${i1.id}?version=${d1.version}`, 'DELETE')).status, 409)
      assert.equal((await request(`/network-points/${b.id}`, 'DELETE')).status, 409)
      assert.equal((await request(splicePath, 'DELETE')).status, 204)
      assert.deepEqual(await json(await request('/optical-splices')), [])
      assert.equal((await request(`/route-installations/${r1.id}/items/${i1.id}?version=${d1.version}`, 'DELETE')).status, 200)
    } finally {
      if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
      await rm(directory, { recursive: true, force: true })
    }
  })
