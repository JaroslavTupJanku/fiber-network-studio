import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

test('duct catalog persists types, rejects invalid dimensions and protects concurrent changes', { timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-duct-catalog-'))
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
      env: { ...process.env, ASPNETCORE_URLS: url, DuctCatalog__Path: join(directory, 'ducts.json'),
        CableCatalog__Path: join(directory, 'cables.json'), NetworkPoints__Path: join(directory, 'points.json') },
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
  const request = (path = '', method = 'GET', body) => fetch(`${url}/api/duct-catalog${path}`, {
    method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  try {
    await start()
    const presets = await (await request()).json()
    assert.deepEqual(presets.map(item => item.kind), ['conduit', 'microduct', 'assembly', 'microduct'])
    assert.equal(presets[2].rows * presets[2].columns, 10)
    assert.ok(presets.every(item => item.isPreset))
    assert.equal(presets[3].outerDiameterMm, 7)
    assert.equal(presets[3].innerDiameterMm, 3.5)
    assert.ok(presets[3].sourceUrl.includes('hexatronic.com'))
    const single = { name: '  Trubička  ', kind: 'microduct', manufacturer: ' Test ', model: '  7/3.5 ', color: '#256f9e',
      outerDiameterMm: 7, innerDiameterMm: 3.5, rows: 1, columns: 1, slots: [], notes: '', sourceUrl: '', version: 0 }
    for (const invalid of [
      { ...single, innerDiameterMm: 7 }, { ...single, outerDiameterMm: -1 }, { ...single, name: ' ' },
      { ...single, color: 'blue' }, { ...single, sourceUrl: 'javascript:alert(1)' },
      { ...single, slots: [presets[2].slots[0]] },
      { ...single, kind: 'assembly' },
      { ...presets[2], id: undefined, isPreset: undefined, slots: presets[2].slots.slice(1), version: 0 },
      { ...presets[2], id: undefined, isPreset: undefined, slots: [{ ...presets[2].slots[0], innerDiameterMm: 20, outerDiameterMm: 10 }, ...presets[2].slots.slice(1)], version: 0 },
    ]) assert.equal((await request('', 'POST', invalid)).status, 400)
    assert.equal((await request(`/${presets[0].id}`, 'PUT', single)).status, 409)
    const createdResponse = await request('', 'POST', single)
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.equal(created.name, 'Trubička')
    assert.equal(created.manufacturer, 'Test')
    assert.equal(created.model, '7/3.5')
    assert.equal(created.innerDiameterMm, 3.5)
    const changed = { ...created, innerDiameterMm: 4 }
    const updates = await Promise.all([request(`/${created.id}`, 'PUT', changed), request(`/${created.id}`, 'PUT', changed)])
    assert.deepEqual(updates.map(response => response.status).sort(), [200, 409])
    await stop(); await start()
    const persisted = (await (await request()).json()).find(item => item.id === created.id)
    assert.equal(persisted.innerDiameterMm, 4)
    assert.equal(persisted.version, 2)
    assert.equal((await request(`/${created.id}?version=1`, 'DELETE')).status, 409)
    assert.equal((await request(`/${created.id}?version=2`, 'DELETE')).status, 204)
    assert.equal((await request(`/${created.id}?version=2`, 'DELETE')).status, 404)
    const assembly = { ...presets[2], id: undefined, isPreset: undefined, name: 'Naše trasa 2 × 5', version: 0 }
    const assemblyResponse = await request('', 'POST', assembly)
    assert.equal(assemblyResponse.status, 201)
    assert.equal((await assemblyResponse.json()).slots.length, 10)
  } finally { await stop(); await rm(directory, { recursive: true, force: true }) }
})
