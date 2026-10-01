import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { closestRouteSegment, routeCoordinates, routeGeometryHit, routeLengthMeters, undoRouteStep,
  waypointsAfterPointMove } from '../frontend/src/features/map/undergroundRoutes.ts'
import { crossingBuildingFootprints, routeWithinFootprintCoverage } from '../frontend/src/features/map/buildingFootprints.ts'

test('route check rejects another building but allows entry into an endpoint building', () => {
  const building = (kod, west, east) => ({ type: 'Feature', properties: { kod },
    geometry: { type: 'Polygon', coordinates: [[
      [west, 49.9999], [east, 49.9999], [east, 50.0001], [west, 50.0001], [west, 49.9999],
    ]] } })
  const points = [
    { id: 'start', kind: 'building', name: 'Start', latitude: 50, longitude: 14 },
    { id: 'end', kind: 'building', name: 'Cíl', latitude: 50, longitude: 14.003 },
  ]
  const route = { name: 'Přípojka', startPointId: 'start', endPointId: 'end', waypoints: [] }
  const start = building(1, 13.9999, 14.0001)
  const middle = building(2, 14.001, 14.002)
  const end = building(3, 14.0029, 14.0031)
  assert.deepEqual(crossingBuildingFootprints(route, points, [start, middle, end]).map(item => item.properties.kod), [2])
  assert.deepEqual(crossingBuildingFootprints(route, [points[0], { ...points[1], kind: 'chamber' }],
    [start, end]), [])
  const around = { ...route, waypoints: [
    { latitude: 50.0003, longitude: 14.0005 }, { latitude: 50.0003, longitude: 14.0025 },
  ] }
  assert.deepEqual(crossingBuildingFootprints(around, points, [start, middle, end]), [])
})

test('route preview rechecks cached nearby buildings as a bend moves', () => {
  const points = [
    { id: 'start', latitude: 50, longitude: 14 },
    { id: 'end', latitude: 50, longitude: 14.003 },
  ]
  const building = { type: 'Feature', properties: { kod: 2 }, geometry: { type: 'Polygon', coordinates: [[
    [14.001, 49.9999], [14.002, 49.9999], [14.002, 50.0001], [14.001, 50.0001], [14.001, 49.9999],
  ]] } }
  const clear = { name: 'Trasa', startPointId: 'start', endPointId: 'end', waypoints: [
    { latitude: 50.0003, longitude: 14.0015 },
  ] }
  const crossing = { ...clear, waypoints: [{ latitude: 50, longitude: 14.0015 }] }
  assert.deepEqual(crossingBuildingFootprints(clear, points, [building]), [])
  assert.equal(crossingBuildingFootprints(crossing, points, [building]).length, 1)
  const reference = routeCoordinates(clear, points)
  assert.equal(routeWithinFootprintCoverage(reference.map((point, index) =>
    index === 1 ? { ...point, latitude: point.latitude + 0.0001 } : point), reference), true)
  assert.equal(routeWithinFootprintCoverage(routeCoordinates(crossing, points), reference), false)
})

test('route geometry follows its endpoint objects and measures only map geometry', () => {
  const points = [
    { id: 'a', kind: 'building', name: 'A', latitude: 50, longitude: 14 },
    { id: 'b', kind: 'chamber', name: 'B', latitude: 50, longitude: 14.001 },
  ]
  const route = { name: 'Test', startPointId: 'a', endPointId: 'b', waypoints: [] }
  assert.equal(Math.round(routeLengthMeters(routeCoordinates(route, points))), 71)
  assert.equal(Math.round(routeLengthMeters(routeCoordinates(route, [{ ...points[0], longitude: 14.0005 }, points[1]]))), 36)
  assert.deepEqual(undoRouteStep({ ...route, waypoints: [{ latitude: 50, longitude: 14.0005 }] }).endPointId, null)
  assert.deepEqual(routeCoordinates({ ...route, endPointId: 'missing' }, points), [])
})

test('moving an endpoint bends its existing route smoothly without adding a vertex', () => {
  const points = [
    { id: 'a', latitude: 50, longitude: 14 },
    { id: 'b', latitude: 50, longitude: 14.002 },
  ]
  const route = { id: 'route', startPointId: 'a', endPointId: 'b',
    waypoints: [{ latitude: 50, longitude: 14.001 }] }
  const shifted = waypointsAfterPointMove(route, points, 'a', { latitude: 50, longitude: 14.0002 })
  assert.equal(shifted.length, 1)
  assert.ok(Math.abs(shifted[0].longitude - 14.0011) < 1e-8)
  assert.deepEqual(waypointsAfterPointMove(route, points, 'other', { latitude: 0, longitude: 0 }), route.waypoints)
  assert.deepEqual(waypointsAfterPointMove({ ...route, waypoints: [] }, points, 'a',
    { latitude: 50, longitude: 14.0002 }), [])
  const unfinished = { ...route, endPointId: null }
  assert.deepEqual(waypointsAfterPointMove(unfinished, points, 'a',
    { latitude: 50, longitude: 14.0002 }), unfinished.waypoints)
})

test('a new bend is inserted in the nearest leg of an already connected route', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
  assert.equal(closestRouteSegment(line, { x: 30, y: 40 }), 0)
  assert.equal(closestRouteSegment(line, { x: 140, y: 70 }), 1)
  assert.equal(closestRouteSegment(line, { x: 100, y: 0 }), 0)
  const completed = { startPointId: 'a', endPointId: 'b', waypoints: [
    { latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 },
  ] }
  assert.deepEqual(undoRouteStep(completed, 0).waypoints, [completed.waypoints[1]])
  assert.equal(undoRouteStep(completed).endPointId, null)
})

test('route hover and click share a generous geometric hit target', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
  assert.deepEqual(routeGeometryHit(line, { x: 40, y: 10 }, 12),
    { kind: 'segment', index: 0, x: 40, y: 0 })
  assert.deepEqual(routeGeometryHit(line, { x: 109, y: 3 }, 12),
    { kind: 'vertex', index: 0 })
  assert.deepEqual(routeGeometryHit([{ x: 0, y: 0 }, { x: 100, y: 0 }], { x: 100, y: 0 }, 12, true),
    { kind: 'vertex', index: 0 })
  assert.equal(routeGeometryHit(line, { x: 40, y: 13 }, 12), null)
  assert.equal(routeGeometryHit([], { x: 0, y: 0 }, 12), null)
})

test('route API validates endpoints and vertices, persists edits, and protects connected points', { timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-routes-test-'))
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(done => socket.close(done))
  const url = `http://127.0.0.1:${port}`
  let server
  let logs = ''
  const stop = async () => {
    if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
  }
  const start = async () => {
    server = spawn('dotnet', [resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], {
      windowsHide: true,
      env: { ...process.env, ASPNETCORE_URLS: url,
        NetworkPoints__Path: join(directory, 'points.json'), UndergroundRoutes__Path: join(directory, 'routes.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
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
  try {
    await start()
    const point = async (name, longitude) => {
      const response = await request('/network-points', 'POST', { kind: 'chamber', name, latitude: 50, longitude })
      assert.equal(response.status, 201)
      return response.json()
    }
    const a = await point('A', 14)
    const b = await point('B', 14.001)
    const draft = { name: '  Podzemní cesta  ', startPointId: a.id, endPointId: b.id,
      waypoints: [{ latitude: 50.0002, longitude: 14.0005 }] }
    for (const invalid of [
      { ...draft, name: ' ' }, { ...draft, endPointId: a.id },
      { ...draft, endPointId: '00000000-0000-0000-0000-000000000001' },
      { ...draft, waypoints: [{ latitude: 99, longitude: 14 }] },
      { ...draft, waypoints: [null] }, { ...draft, waypoints: Array(201).fill(draft.waypoints[0]) },
    ]) assert.equal((await request('/underground-routes', 'POST', invalid)).status, 400)
    const createdResponse = await request('/underground-routes', 'POST', draft)
    assert.equal(createdResponse.status, 201)
    const route = await createdResponse.json()
    assert.equal(route.name, 'Podzemní cesta')
    assert.equal(route.waypoints.length, 1)
    assert.equal((await request(`/network-points/${a.id}`, 'DELETE')).status, 409)
    const edited = await request(`/underground-routes/${route.id}`, 'PUT', { ...draft, name: 'Upravená cesta', waypoints: [] })
    assert.equal(edited.status, 200)
    await stop()
    await start()
    const routes = await (await request('/underground-routes')).json()
    assert.equal(routes.length, 1)
    assert.equal(routes[0].name, 'Upravená cesta')
    assert.deepEqual(routes[0].waypoints, [])
    assert.equal((await request(`/underground-routes/${route.id}`, 'DELETE')).status, 204)
    assert.equal((await request(`/network-points/${a.id}`, 'DELETE')).status, 204)
  } finally {
    await stop()
    await rm(directory, { recursive: true, force: true })
  }
})
