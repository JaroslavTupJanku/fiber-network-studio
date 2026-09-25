import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { canPlaceItem, installationContinuations, installationFit, installationSummary } from '../frontend/src/features/map/routeInstallations.ts'

test('route status follows saved contents instead of treating every route as cabled', () => {
  assert.deepEqual(installationSummary(), { status: 'empty', ducts: 0, cables: 0, items: 0 })
  const document = { items: [{ duct: { kind: 'conduit' }, cable: null }] }
  assert.deepEqual(installationSummary(document), { status: 'ducts', ducts: 1, cables: 0, items: 1 })
  document.items.push({ duct: null, cable: { name: 'Optický kabel' } })
  assert.deepEqual(installationSummary(document), { status: 'cables', ducts: 1, cables: 1, items: 2 })
})

test('installation preview distinguishes occupied positions and unknown dimensions', () => {
  const assembly = { id: 'parent', duct: { kind: 'assembly', slots: [{ kind: 'microduct', innerDiameterMm: null }] }, cable: null }
  const duct = { duct: { kind: 'microduct', outerDiameterMm: null }, cable: null }
  assert.equal(canPlaceItem(assembly, [], duct, 0), true)
  assert.equal(canPlaceItem(assembly, [{ parentId: 'parent', slotIndex: 0 }], duct, 0), false)
  assert.equal(installationFit(duct, assembly, 0), 'unknown')
  assert.equal(installationFit({ duct: { outerDiameterMm: 7 }, cable: null },
    { duct: { kind: 'conduit', innerDiameterMm: 9 } }, null,
    [{ duct: { outerDiameterMm: 7 }, cable: null }]), 'too-small')
  const routeA = { id: 'a', startPointId: 'p1', endPointId: 'p2' }
  const routeB = { id: 'b', startPointId: 'p2', endPointId: 'p3' }
  const routeC = { id: 'c', startPointId: 'p4', endPointId: 'p5' }
  const cable = { id: 'i', routeId: 'b', runId: 'run', cable: {}, duct: null }
  assert.deepEqual(installationContinuations(routeA, [routeA, routeB, routeC],
    [{ routeId: 'b', items: [cable] }]), [cable])
})

test('route installation API stores physical instances, prevents invalid placement and preserves catalog snapshots',
  { timeout: 50000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fiber-installations-test-'))
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
          NetworkPoints__Path: join(directory, 'points.json'), UndergroundRoutes__Path: join(directory, 'routes.json'),
          RouteInstallations__Path: join(directory, 'installed.json'), CableCatalog__Path: join(directory, 'cables.json'),
          DuctCatalog__Path: join(directory, 'ducts.json') },
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
    const body = async response => response.json()
    const add = (routeId, input) => request(`/route-installations/${routeId}/items`, 'POST', input)
    try {
      await start()
      const createPoint = async (name, longitude) => body(await request('/network-points', 'POST',
        { kind: 'chamber', name, latitude: 50, longitude }))
      const [a, b, c, d, e] = await Promise.all([
        createPoint('A', 14), createPoint('B', 14.001), createPoint('C', 14.002),
        createPoint('D', 14.003), createPoint('E', 14.004),
      ])
      const makeRoute = async (name, startPointId, endPointId) => body(await request('/underground-routes', 'POST',
        { name, startPointId, endPointId, waypoints: [] }))
      const first = await makeRoute('A–B', a.id, b.id)
      const second = await makeRoute('B–C', b.id, c.id)
      const separate = await makeRoute('D–E', d.id, e.id)
      const ducts = await body(await request('/duct-catalog'))
      const cables = await body(await request('/cable-catalog'))
      const conduit = ducts.find(item => item.kind === 'conduit')
      const microduct = ducts.find(item => item.kind === 'microduct' && item.innerDiameterMm === 3.5)
      const assembly = ducts.find(item => item.kind === 'assembly')
      const cable = cables[0]
      assert.ok(conduit && microduct && assembly && cable)
      const custom = await body(await request('/duct-catalog', 'POST',
        { ...conduit, name: 'Původní typ', isPreset: false, version: 0 }))
      const thickCable = await body(await request('/cable-catalog', 'POST',
        { ...cable, name: 'Silný kabel', isPreset: false, version: 0,
          outerDiameterMm: 5, minimumDuctInnerDiameterMm: 5 }))
      const tightConduit = await body(await request('/duct-catalog', 'POST',
        { ...conduit, name: 'Těsná chránička', outerDiameterMm: 12,
          innerDiameterMm: 9, isPreset: false, version: 0 }))
      assert.ok(custom.id && thickCable.id && tightConduit.id)

      const rootResponse = await add(first.id,
        { catalogId: custom.id, parentId: null, slotIndex: null, label: 'CH-01', version: 0 })
      assert.equal(rootResponse.status, 200)
      let doc = await body(rootResponse)
      const root = doc.items[0]
      assert.equal(root.duct.name, 'Původní typ')
      assert.equal(root.label, 'CH-01')
      assert.equal((await add(first.id,
        { catalogId: conduit.id, parentId: null, slotIndex: null, version: 0 })).status, 409)
      const changedType = await request(`/duct-catalog/${custom.id}`, 'PUT',
        { ...custom, name: 'Přejmenovaný typ' })
      assert.equal(changedType.status, 200)

      doc = await body(await add(first.id,
        { catalogId: microduct.id, parentId: root.id, slotIndex: null, version: doc.version }))
      const inner = doc.items.at(-1)
      assert.equal((await add(first.id,
        { catalogId: thickCable.id, parentId: inner.id, slotIndex: null, version: doc.version })).status, 409)
      doc = await body(await add(first.id,
        { catalogId: cable.id, parentId: inner.id, slotIndex: null, version: doc.version }))
      const installedCable = doc.items.at(-1)
      assert.equal((await add(first.id,
        { catalogId: cable.id, parentId: inner.id, slotIndex: null, version: doc.version })).status, 409)
      doc = await body(await add(first.id,
        { catalogId: tightConduit.id, parentId: null, slotIndex: null, version: doc.version }))
      const tightRoot = doc.items.at(-1)
      doc = await body(await add(first.id,
        { catalogId: microduct.id, parentId: tightRoot.id, slotIndex: null, version: doc.version }))
      assert.equal((await add(first.id,
        { catalogId: microduct.id, parentId: tightRoot.id, slotIndex: null, version: doc.version })).status, 409)
      assert.equal((await request(`/route-installations/${first.id}/items/${root.id}?version=${doc.version}`, 'DELETE')).status, 409)
      assert.equal((await request(`/underground-routes/${first.id}`, 'DELETE')).status, 409)
      assert.equal((await request(`/underground-routes/${first.id}`, 'PUT',
        { ...first, endPointId: c.id })).status, 409)

      let next = await body(await add(second.id,
        { catalogId: conduit.id, parentId: null, slotIndex: null, version: 0 }))
      const secondRoot = next.items[0]
      next = await body(await add(second.id,
        { catalogId: microduct.id, parentId: secondRoot.id, slotIndex: null, version: next.version }))
      const secondInner = next.items.at(-1)
      next = await body(await add(second.id,
        { continueFromItemId: installedCable.id, parentId: secondInner.id, slotIndex: null, version: next.version }))
      assert.equal(next.items.at(-1).runId, installedCable.runId)
      assert.equal(next.items.at(-1).cable.name, installedCable.cable.name)
      const third = await makeRoute('C–D', c.id, d.id)
      const branch = await makeRoute('B–E', b.id, e.id)
      const addMicroductContainer = async routeId => {
        let state = await body(await add(routeId,
          { catalogId: conduit.id, parentId: null, slotIndex: null, version: 0 }))
        const rootId = state.items[0].id
        state = await body(await add(routeId,
          { catalogId: microduct.id, parentId: rootId, slotIndex: null, version: state.version }))
        return state
      }
      let thirdDoc = await addMicroductContainer(third.id)
      thirdDoc = await body(await add(third.id,
        { continueFromItemId: next.items.at(-1).id, parentId: thirdDoc.items.at(-1).id,
          slotIndex: null, version: thirdDoc.version }))
      assert.equal(thirdDoc.items.at(-1).runId, installedCable.runId)
      assert.equal((await request(`/route-installations/${second.id}/items/${next.items.at(-1).id}?version=${next.version}`,
        'DELETE')).status, 409)
      const branchDoc = await addMicroductContainer(branch.id)
      assert.equal((await add(branch.id,
        { continueFromItemId: installedCable.id, parentId: branchDoc.items.at(-1).id,
          slotIndex: null, version: branchDoc.version })).status, 409)
      assert.equal((await add(separate.id,
        { continueFromItemId: installedCable.id, parentId: null, slotIndex: null, version: 0 })).status, 400)
      const assemblyDoc = await body(await add(separate.id,
        { catalogId: assembly.id, parentId: null, slotIndex: null, version: 0 }))
      const assemblyRoot = assemblyDoc.items[0]
      assert.equal((await add(separate.id,
        { catalogId: microduct.id, parentId: assemblyRoot.id, slotIndex: 0, version: assemblyDoc.version })).status, 409)
      const placed = await body(await add(separate.id,
        { catalogId: conduit.id, parentId: assemblyRoot.id, slotIndex: 0, version: assemblyDoc.version }))
      assert.equal((await add(separate.id,
        { catalogId: conduit.id, parentId: assemblyRoot.id, slotIndex: 0, version: placed.version })).status, 409)

      await stop()
      await start()
      const persisted = await body(await request('/route-installations'))
      const savedFirst = persisted.find(item => item.routeId === first.id)
      assert.equal(savedFirst.items.find(item => item.id === root.id).duct.name, 'Původní typ')
      assert.equal(savedFirst.items.find(item => item.id === installedCable.id).runId, next.items.at(-1).runId)
      const renamed = await request(`/route-installations/${first.id}/items/${root.id}`, 'PUT',
        { label: 'CH-01A', version: savedFirst.version })
      assert.equal(renamed.status, 200)
    } finally {
      await stop()
      await rm(directory, { recursive: true, force: true })
    }
  })
