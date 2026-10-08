import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID as id } from 'node:crypto'

test('cabinet and chamber ODF retain fiber ownership and prevent deleting equipped points', { timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fns-cabinet-'))
  const socket = createServer().listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const url = `http://127.0.0.1:${socket.address().port}`
  await new Promise(done => socket.close(done))
  const env = { ...process.env, ASPNETCORE_URLS: url }
  for (const key of ['NetworkPoints', 'UndergroundRoutes', 'RouteInstallations', 'OpticalSplices', 'BuildingEquipment', 'BuildingDistribution', 'Customers', 'FiberAllocations', 'CableCatalog', 'DuctCatalog']) env[`${key}__Path`] = join(directory, `${key}.json`)
  const server = spawn('dotnet', [process.env.FNS_API_DLL ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], { env, windowsHide: true, stdio: 'ignore' })
  const request = (path, method = 'GET', body) => fetch(`${url}/api${path}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  try {
    for (let i = 0; i < 100; i++) { try { if ((await request('/health')).ok) break } catch {} await delay(100) }
    const create = async (path, body) => { const response = await request(path, 'POST', body); assert.ok(response.status === 200 || response.status === 201); return response.json() }
    const a = await create('/network-points', { kind: 'cabinet', name: 'Skříň A', latitude: 50, longitude: 14 })
    const b = await create('/network-points', { kind: 'chamber', name: 'Komora B', latitude: 50, longitude: 14.001 })
    const pole = await create('/network-points', { kind: 'pole', name: 'P1', latitude: 50.001, longitude: 14 })
    assert.equal((await request('/underground-routes', 'POST', { name: 'Vzduchem', kind: 'aerial', startPointId: a.id, endPointId: pole.id, waypoints: [] })).status, 201)
    assert.equal((await request(`/building-equipment/${pole.id}`)).status, 404)
    const route = await create('/underground-routes', { name: 'A–B', startPointId: a.id, endPointId: b.id, waypoints: [] })
    const duct = (await (await request('/duct-catalog')).json()).find(item => item.kind === 'microduct')
    const cable = (await (await request('/cable-catalog')).json())[0]
    const conduit = await create(`/route-installations/${route.id}/items`, { catalogId: duct.id, version: 0 })
    const installed = await create(`/route-installations/${route.id}/items`, { catalogId: cable.id, parentId: conduit.items[0].id, version: conduit.version })
    const fiber = { itemId: installed.items.at(-1).id, tubeIndex: 0, fiberIndex: 0 }
    for (const point of [a, b]) {
      const rack = id(), shelf = id(), port = id()
      const empty = await (await request(`/building-equipment/${point.id}`)).json()
      const document = { ...empty, racks: [{ id: rack, name: 'Stojan' }], shelves: [{ id: shelf, rackId: rack, kind: 'odf', name: 'ODF' }], cards: [], ports: [{ id: port, parentId: shelf, position: 1, label: 'P1', fiber, patchPortId: null }] }
      assert.equal((await request(`/building-equipment/${point.id}`, 'PUT', document)).status, 200)
      assert.deepEqual((await (await request(`/building-equipment/${point.id}`)).json()).ports[0].fiber, fiber)
      assert.equal((await request(`/network-points/${point.id}`, 'DELETE')).status, 409)
      if (point.id === b.id) {
        const splice = await (await request(`/optical-splices/${b.id}`)).json()
        const conflict = await request(`/optical-splices/${b.id}`, 'PUT', { ...splice, name: 'S1', connections: [], reserves: [], splitters: [{ id: id(), name: '1:2', outputCount: 2, input: fiber, outputs: [], lossSource: '' }] })
        assert.equal(conflict.status, 409)
        assert.match((await conflict.json()).error, /ODF/)
      }
    }
  } finally {
    server.kill(); await once(server, 'exit'); await rm(directory, { recursive: true, force: true })
  }
})
