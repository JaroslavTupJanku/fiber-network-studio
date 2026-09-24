// Run after dotnet build: node --test tests/cable-catalog.test.mjs
// Uses only Node's standard library and an isolated temporary data directory.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

test('catalog presets, validation, persistence and concurrent edits', { timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiber-catalog-test-'))
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const url = `http://127.0.0.1:${port}`
  let process
  let logs = ''
  const stop = async () => {
    if (process && process.exitCode === null) {
      const exited = once(process, 'exit')
      process.kill()
      await exited
    }
  }
  const start = async () => {
    process = spawn('dotnet', [resolve('backend/FiberNetworkStudio.Api/bin/Debug/net10.0/FiberNetworkStudio.Api.dll')], {
      windowsHide: true,
      env: { ...globalThis.process.env, ASPNETCORE_URLS: url, CableCatalog__Path: join(directory, 'catalog.json') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    process.stdout.on('data', chunk => { logs += chunk })
    process.stderr.on('data', chunk => { logs += chunk })
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${url}/api/health`)).ok) return } catch { /* wait for API */ }
      if (process.exitCode !== null) throw new Error(logs)
      await delay(100)
    }
    throw new Error(`API did not start: ${logs}`)
  }
  const request = (path = '', method = 'GET', body) => fetch(`${url}/api/cable-catalog${path}`, {
    method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  try {
    await start()
    const presets = await (await request()).json()
    assert.deepEqual(presets.map(item => item.tubes.reduce((n, tube) => n + tube.fibers.length, 0)), [12, 24, 48, 96])
    assert.ok(presets.every(item => item.isPreset))
    const input = { name: '  Test cable  ', manufacturer: ' Example ', notes: 'Persistent test', tubes: presets[1].tubes }
    for (const invalid of [
      { ...input, name: ' ' }, { ...input, name: 'x'.repeat(101) }, { ...input, tubes: [] },
      { ...input, tubes: [null] }, { ...input, tubes: [{ ...input.tubes[0], fibers: [null] }] },
      { ...input, tubes: [{ ...input.tubes[0], color: 'red' }] },
      { ...input, tubes: [{ ...input.tubes[0], fibers: Array(25).fill(input.tubes[0].fibers[0]) }] },
    ]) assert.equal((await request('', 'POST', invalid)).status, 400)
    assert.equal((await request(`/${presets[0].id}`, 'PUT', input)).status, 409)
    assert.equal((await request(`/${presets[0].id}?version=1`, 'DELETE')).status, 409)
    const createdResponse = await request('', 'POST', input)
    assert.equal(createdResponse.status, 201)
    const created = await createdResponse.json()
    assert.equal(created.name, 'Test cable')
    assert.equal(created.manufacturer, 'Example')
    assert.equal(created.isPreset, false)
    assert.equal(created.version, 1)
    const changes = { ...created, name: 'Changed', tubes: structuredClone(created.tubes) }
    changes.tubes[1].fibers[3] = { name: 'Custom fiber', color: '#123456' }
    const updates = await Promise.all([request(`/${created.id}`, 'PUT', changes), request(`/${created.id}`, 'PUT', changes)])
    assert.deepEqual(updates.map(response => response.status).sort(), [200, 409])
    await stop()
    await start()
    const persisted = (await (await request()).json()).find(item => item.id === created.id)
    assert.equal(persisted.version, 2)
    assert.equal(persisted.tubes[1].fibers[3].color, '#123456')
    assert.equal(persisted.tubes[1].fibers[3].name, 'Custom fiber')
    assert.equal((await request(`/${created.id}?version=1`, 'DELETE')).status, 409)
    assert.equal((await request(`/${created.id}?version=2`, 'DELETE')).status, 204)
    assert.equal((await request(`/${created.id}?version=2`, 'DELETE')).status, 404)
    assert.equal((await (await request()).json()).length, 4)
  } finally {
    await stop()
    await rm(directory, { recursive: true, force: true })
  }
})
