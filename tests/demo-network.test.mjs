import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { tracePremisePath } from '../frontend/src/features/map/traceOpticalPath.ts'

test('fictional demo loads, validates its terminations and keeps changes across restart', { timeout: 50000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-demo-test-'))
  const socket = createServer().listen(0, '127.0.0.1'); await once(socket, 'listening')
  const url = `http://127.0.0.1:${socket.address().port}`
  await new Promise(done => socket.close(done))
  const stores = { NetworkPoints: 'network-points', UndergroundRoutes: 'underground-routes',
    RouteInstallations: 'route-installations', OpticalSplices: 'optical-splices', BuildingEquipment: 'building-equipment',
    BuildingDistribution: 'building-distribution', Customers: 'customers', FiberAllocations: 'fiber-allocations',
    CableCatalog: 'cable-catalog', DuctCatalog: 'duct-catalog' }
  const env = { ...process.env, ASPNETCORE_URLS: url, FNS_DEMO_SEED: '1' }
  for (const [key, name] of Object.entries(stores)) env[`${key}__Path`] = join(directory, `${name}.json`)
  let server, logs = ''
  const start = async () => {
    server = spawn('dotnet', [process.env.FNS_API_DLL ?? resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')],
      { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
    server.stdout.on('data', data => { logs += data }); server.stderr.on('data', data => { logs += data })
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${url}/api/health`)).ok) return } catch { /* startup */ }
      if (server.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    throw new Error(logs)
  }
  const stop = async () => {
    if (server?.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited }
  }
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`${url}/api/${path}`, { method,
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
    const text = await response.text()
    assert.ok(response.ok, `${path}: ${response.status}: ${text}`)
    return text ? JSON.parse(text) : null
  }
  try {
    await cp(resolve('demo/data'), directory, { recursive: true })
    await start()
    assert.equal((await request('demo')).enabled, true)
    for (const name of Object.values(stores)) await request(name)
    const routes = await request('underground-routes'), installed = await request('route-installations')
    const equipment = await request('building-equipment'), distribution = await request('building-distribution')
    const splices = await request('optical-splices')
    // Re-save through actual validation; reading fixture JSON alone could hide an impossible model.
    for (const doc of equipment) await request(`building-equipment/${doc.pointId}`, 'PUT', doc)
    for (const doc of distribution) await request(`building-distribution/${doc.pointId}`, 'PUT', doc)
    for (const doc of splices) await request(`optical-splices/${doc.pointId}`, 'PUT', doc)
    for (const doc of distribution) for (const premise of doc.premises.filter(item => item.status === 'connected')) {
      const path = tracePremisePath(premise.id, equipment, routes, installed, splices, distribution)
      assert.equal(path.status, 'connected')
      assert.ok(path.steps.some(step => step.kind === 'indoor-cable' && step.lengthMeters === null))
    }
    const customers = await request('customers')
    const changed = await request(`customers/${customers[0].id}`, 'PUT', { ...customers[0], note: 'Uložená změna v ukázce' })
    await stop(); await start()
    assert.equal((await request('customers')).find(item => item.id === changed.id).note, changed.note)
    assert.deepEqual((await request('building-distribution')).map(doc => doc.premises.map(item => item.id)),
      distribution.map(doc => doc.premises.map(item => item.id)))
    assert.equal(JSON.parse(await readFile(join(directory, 'fiber-allocations.json'), 'utf8')).version, 0)
  } finally { await stop(); await rm(directory, { recursive: true, force: true }) }
})
