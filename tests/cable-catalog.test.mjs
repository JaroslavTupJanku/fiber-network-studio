// Run after dotnet build: node --test tests/cable-catalog.test.mjs
// Uses only Node's standard library and an isolated temporary data directory.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    const codeResponse = await request('/color-codes')
    assert.equal(codeResponse.status, 200)
    const codes = await codeResponse.json()
    const basic = codes.profiles.find(profile => profile.id === 'tia-598-12')
    const corning = codes.profiles.find(profile => profile.id === 'corning-aen029-24')
    const prysmian = codes.profiles.find(profile => profile.id === 'prysmian-e18-24')
    assert.equal(basic.fibers.length, 12)
    assert.equal(corning.fibers[19].transparent, true)
    assert.equal(corning.tubes[19].color, '#171717')
    assert.equal(corning.tubes[19].markerColor, '#ffffff')
    assert.equal(prysmian.fibers[21].color, '#ffffff')
    assert.equal(prysmian.fibers[21].markingSpacingMm, 35)
    assert.equal(prysmian.fibers[12].markingSpacingMm, 70)
    assert.equal(prysmian.fibers[12].markerColor, null)
    const download = await request('/color-codes/download')
    assert.ok(download.headers.get('content-disposition').includes('cable-color-codes.json'))
    assert.deepEqual(await download.json(), codes)
    assert.deepEqual(presets.map(item => item.tubes.reduce((n, tube) => n + tube.fibers.length, 0)), [12, 24, 48, 96])
    assert.ok(presets.every(item => item.isPreset))
    assert.ok(presets.every(item => item.fiberColorCode === 'tia-598-12'))
    const input = { name: '  Test cable  ', manufacturer: ' Example ', notes: 'Persistent test', tubes: presets[1].tubes }
    for (const invalid of [
      { ...input, name: ' ' }, { ...input, name: 'x'.repeat(101) }, { ...input, tubes: [] },
      { ...input, tubes: [null] }, { ...input, tubes: [{ ...input.tubes[0], fibers: [null] }] },
      { ...input, tubes: [{ ...input.tubes[0], color: 'red' }] },
      { ...input, tubes: [{ ...input.tubes[0], fibers: Array(25).fill(input.tubes[0].fibers[0]) }] },
      { ...input, fiberColorCode: 'unknown' },
      { ...input, tubeColorCode: 'prysmian-e18-24' },
      { ...input, fiberColorCode: 'tia-598-12', tubes: [{ ...input.tubes[0], fibers: Array(24).fill(input.tubes[0].fibers[0]) }] },
      { ...input, sourceUrl: 'javascript:alert(1)' },
      { ...input, tubes: [{ ...input.tubes[0], marking: 'invalid' }] },
      { ...input, tubes: [{ ...input.tubes[0], markerColor: 'red' }] },
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

    // Profiles remain separate for fibers/tubes and marks survive a write/read cycle.
    const markedInput = { ...input, fiberColorCode: corning.id, tubeColorCode: corning.id,
      tubes: corning.tubes.map((mark, i) => ({ ...mark, name: `Tube ${i + 1}`,
        fibers: corning.fibers.map((fiber, j) => ({ ...fiber, name: `Fiber ${j + 1}` })) })) }
    const markedResponse = await request('', 'POST', markedInput)
    assert.equal(markedResponse.status, 201)
    const marked = await markedResponse.json()
    assert.equal(marked.tubes[19].markerColor, '#ffffff')
    assert.equal(marked.tubes[0].fibers[19].transparent, true)
    const badColor = structuredClone(marked)
    badColor.tubes[0].fibers[0].color = '#abcdef'
    assert.equal((await request(`/${marked.id}`, 'PUT', badColor)).status, 400)
    badColor.fiberColorCode = 'custom'
    assert.equal((await request(`/${marked.id}`, 'PUT', badColor)).status, 200)
    await stop()
    await start()
    const markedStored = (await (await request()).json()).find(item => item.id === marked.id)
    assert.equal(markedStored.fiberColorCode, 'custom')
    assert.equal(markedStored.tubes[0].fibers[19].transparent, true)

    // Old files had no profile/mark fields. Loading must preserve colors and names.
    await stop()
    const legacy = { id: created.id, name: 'Legacy', manufacturer: '', notes: '', isPreset: false, version: 7,
      tubes: [{ name: 'Old tube', color: '#123456', fibers: [{ name: 'Old fiber', color: '#654321' }] }] }
    await writeFile(join(directory, 'catalog.json'), JSON.stringify([legacy]))
    await start()
    const migrated = (await (await request()).json()).find(item => item.id === legacy.id)
    assert.equal(migrated.fiberColorCode, 'custom')
    assert.equal(migrated.tubeColorCode, 'custom')
    assert.equal(migrated.tubes[0].fibers[0].color, '#654321')
    assert.equal(migrated.tubes[0].fibers[0].name, 'Old fiber')
    assert.equal(migrated.tubes[0].fibers[0].marking, 'none')
    assert.equal(migrated.version, 7)
  } finally {
    await stop()
    await rm(directory, { recursive: true, force: true })
  }
})
