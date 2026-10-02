import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { previewConnections, previewPortAssignments } from '../frontend/src/features/map/fiberBatch.ts'
import { pathAllocatedFibers, allocationConflicts } from '../frontend/src/features/map/fiberAllocations.ts'

test('bulk previews reject a conflicted range without offering partial pairs', () => {
  const cable = id => ({ id, runId: id, cable: { tubes: [{ name: 'Tuba', fibers: Array.from({ length: 4 }, (_, i) => ({ name: `${i + 1}` })) }] } })
  const left = cable('left')
  const right = cable('right')
  const pairs = previewConnections(left, right, 0, 0, 3, new Set(['right:0:1']))
  assert.equal(pairs.length, 3)
  assert.equal(pairs[1].conflict, 'Druhý konec je obsazený')
  assert.equal(previewConnections(left, right, 3, 0, 3, new Set()).length, 0)
  const ports = Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, position: i + 1, fiber: null }))
  const assignment = previewPortAssignments(ports, left, 1, 0, 3, new Set(['left:0:2']))
  assert.equal(assignment[2].conflict, 'Vlákno už je připojené')
})

test('path allocation groups all sections of one physical run and identifies overlap', () => {
  const path = { steps: [
    { kind: 'cable', runId: 'run', tubeIndex: 0, fiberIndex: 1 },
    { kind: 'cable', runId: 'run', tubeIndex: 0, fiberIndex: 1 },
    { kind: 'splice' },
    { kind: 'cable', runId: 'next', tubeIndex: 0, fiberIndex: 1 },
  ] }
  const fibers = pathAllocatedFibers(path)
  assert.deepEqual(fibers, [{ runId: 'run', tubeIndex: 0, fiberIndex: 1 },
    { runId: 'next', tubeIndex: 0, fiberIndex: 1 }])
  assert.equal(allocationConflicts(fibers, [{ id: 'a', fibers: [fibers[1]] }]).length, 1)
})

test('fiber allocation API validates conflicts, stale writes and cable deletion', { timeout: 50000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-allocations-test-'))
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
        RouteInstallations__Path: join(directory, 'installed.json'), FiberAllocations__Path: join(directory, 'allocations.json'),
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
    const point = async (name, longitude) => (await request('/network-points', 'POST',
      { kind: 'chamber', name, latitude: 50, longitude })).json()
    const [a, b] = await Promise.all([point('A', 14), point('B', 14.001)])
    const route = await (await request('/underground-routes', 'POST',
      { name: 'A–B', startPointId: a.id, endPointId: b.id, waypoints: [] })).json()
    const ducts = await (await request('/duct-catalog')).json()
    const cables = await (await request('/cable-catalog')).json()
    const microduct = ducts.find(item => item.kind === 'microduct' && item.innerDiameterMm === 3.5)
    assert.ok(microduct && cables[0])
    let installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: microduct.id, parentId: null, slotIndex: null, version: 0 })).json()
    installed = await (await request(`/route-installations/${route.id}/items`, 'POST',
      { catalogId: cables[0].id, parentId: installed.items[0].id, slotIndex: null, version: installed.version })).json()
    const item = installed.items.at(-1)
    const fiber = { runId: item.runId, tubeIndex: 0, fiberIndex: 0 }
    let splice = await request(`/optical-splices/${a.id}`, 'PUT',
      { version: 0, name: 'Spojka A', connections: [], reserves: [], splitters: [] })
    assert.equal(splice.status, 200)
    const first = { id: crypto.randomUUID(), label: 'Rezerva pro zákazníka', status: 'reserved', premiseId: null, fibers: [fiber] }
    assert.deepEqual(await (await request('/fiber-allocations')).json(), { version: 0, allocations: [] })
    let response = await request('/fiber-allocations', 'PUT', { version: 0, allocations: [first] })
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.version, 1)
    assert.equal((await request('/fiber-allocations', 'PUT', { version: 0, allocations: [] })).status, 409)
    assert.equal((await request('/fiber-allocations', 'PUT', { ...saved, allocations: [first,
      { ...first, id: crypto.randomUUID(), label: 'Konflikt' }] })).status, 409)
    assert.equal((await request('/fiber-allocations', 'PUT', { ...saved, allocations: [
      { ...first, fibers: [{ ...fiber, fiberIndex: 999 }] }] })).status, 400)
    assert.equal((await request(`/route-installations/${route.id}/items/${item.id}?version=${installed.version}`, 'DELETE')).status, 409)
    assert.equal((await request(`/optical-splices/${a.id}`, 'DELETE')).status, 409)
    splice = await request(`/optical-splices/${a.id}`, 'PUT',
      { version: 1, name: 'Spojka A přejmenovaná', connections: [], reserves: [], splitters: [] })
    assert.equal(splice.status, 200)
    response = await request('/fiber-allocations', 'PUT', { version: saved.version, allocations: [] })
    assert.equal(response.status, 200)
    assert.equal((await request(`/optical-splices/${a.id}`, 'DELETE')).status, 204)
    assert.equal((await request(`/route-installations/${route.id}/items/${item.id}?version=${installed.version}`, 'DELETE')).status, 200)
  } finally {
    if (server) { server.kill(); await once(server, 'exit').catch(() => {}) }
    await rm(directory, { recursive: true, force: true })
  }
})
