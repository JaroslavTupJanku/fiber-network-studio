import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

test('prototype customers persist and remain linked to an existing building', { timeout: 50000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-customers-test-'))
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
        NetworkPoints__Path: join(directory, 'points.json'), Customers__Path: join(directory, 'customers.json'),
        BuildingDistribution__Path: join(directory, 'distribution.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout.on('data', chunk => { logs += chunk })
    server.stderr.on('data', chunk => { logs += chunk })
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${url}/api/health`)).ok) break } catch { /* starting */ }
      if (server.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    assert.deepEqual(await (await request('/customers')).json(), [])
    const building = await (await request('/network-points', 'POST', {
      kind: 'building', name: 'Ukázkový dům', latitude: 50, longitude: 14,
    })).json()
    const riser = { id: crypto.randomUUID(), name: 'Vchod 1', cableItemId: null }
    const box = { id: crypto.randomUUID(), riserId: riser.id, name: 'Box 1', floor: 1 }
    const premise = { id: crypto.randomUUID(), boxId: box.id, label: 'HP 1', status: 'planned', fiber: null }
    const distribution = await (await request(`/building-distribution/${building.id}`, 'PUT', {
      version: 0, risers: [riser], boxes: [box], premises: [premise],
    })).json()
    assert.equal(distribution.version, 1)
    const write = { version: 0, buildingPointId: building.id, premiseId: premise.id,
      name: 'Ukázkový zákazník', status: 'lead', note: '', contacts: [], messages: [] }
    assert.equal((await request('/customers', 'POST', { ...write, buildingPointId: crypto.randomUUID() })).status, 400)
    assert.equal((await request('/customers', 'POST', { ...write, premiseId: crypto.randomUUID() })).status, 400)
    const createdResponse = await request('/customers', 'POST', write)
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.equal(created.version, 1)
    assert.equal(created.name, write.name)
    assert.equal((await request(`/network-points/${building.id}`, 'DELETE')).status, 409)
    assert.equal((await request(`/building-distribution/${building.id}`, 'PUT', {
      ...distribution, premises: [],
    })).status, 409)
    const updated = { ...created, status: 'active', contacts: [{ id: crypto.randomUUID(),
      name: 'Jana Ukázková', role: 'Technický kontakt', email: 'jana@example.invalid', phone: '' }],
    messages: [{ id: crypto.randomUUID(), subject: 'Dotaz k instalaci', sender: 'jana@example.invalid',
      date: '2026-09-24', category: 'installation', status: 'todo', summary: 'Čeká na termín.' }] }
    assert.equal((await request(`/customers/${created.id}`, 'PUT', { ...updated,
      messages: [{ ...updated.messages[0], date: 'not-a-date' }] })).status, 400)
    const saved = await (await request(`/customers/${created.id}`, 'PUT', updated)).json()
    assert.equal(saved.version, 2)
    assert.deepEqual((await (await request('/customers')).json())[0].messages, updated.messages)
    assert.equal((await request(`/customers/${created.id}`, 'PUT', updated)).status, 409)
    assert.equal((await request(`/customers/${created.id}?version=1`, 'DELETE')).status, 409)
    assert.equal((await request(`/customers/${created.id}?version=2`, 'DELETE')).status, 204)
    assert.equal((await request(`/building-distribution/${building.id}`, 'PUT', {
      ...distribution, premises: [], boxes: [], risers: [],
    })).status, 200)
    assert.equal((await request(`/network-points/${building.id}`, 'DELETE')).status, 204)
  } finally {
    server?.kill()
    await rm(directory, { recursive: true, force: true })
  }
})
