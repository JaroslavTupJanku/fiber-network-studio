// Node 24: run with node --test tests/cable-structure.test.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === './model' && context.parentURL?.endsWith('/structure.ts')) specifier = './model.ts'
  return next(specifier, context)
} })
const { appendTube, removeTube, removeFiber, resizeFibers, resizeStructure } = await import('../frontend/src/features/cable-catalog/structure.ts')
const { newCable } = await import('../frontend/src/features/cable-catalog/model.ts')
const data = JSON.parse(await readFile(new URL('../backend/FiberNetworkStudio.Api/CableCatalog/color-codes.json', import.meta.url)))

test('resize preserves aliases, custom markings and input; limits fail atomically', () => {
  const draft = newCable(data)
  draft.name = 'Test'
  draft.fiberColorCode = 'custom'
  draft.tubes[0].name = 'Special tube'
  Object.assign(draft.tubes[0].fibers[0], { name: 'Special fiber', marking: 'mark', markerColor: '#123456', markingSpacingMm: 35 })
  const before = structuredClone(draft)
  const grown = resizeStructure(draft, 3, 15, data)
  assert.deepEqual(grown.tubes[0].fibers.slice(0, 12), before.tubes[0].fibers)
  assert.equal(grown.tubes[0].name, 'Special tube')
  assert.equal(grown.tubes[0].fibers[12].marking, 'none')
  assert.equal(new Set(grown.tubes.map(t => t.name)).size, 3)
  assert.deepEqual(draft, before)
  const shrunk = resizeStructure(grown, 2, 3, data)
  assert.deepEqual(shrunk.tubes[0].fibers, before.tubes[0].fibers.slice(0, 3))
  assert.throws(() => resizeStructure(draft, 25, 12, data))
  assert.throws(() => resizeStructure(newCable(data), 2, 13, data), /nejvýše 12/)
  assert.deepEqual(draft, before)
})

test('individual removals keep all other markings and switch only the reordered profile', () => {
  const draft = resizeStructure(newCable(data), 3, 3, data)
  const removed = removeTube(draft, 1)
  assert.deepEqual(removed.tubes, [draft.tubes[0], draft.tubes[2]])
  assert.equal(removed.tubeColorCode, 'custom')
  assert.equal(removed.fiberColorCode, 'tia-598-12')
  const fiberRemoved = removeFiber(draft, 1, 0)
  assert.deepEqual(fiberRemoved.tubes[1].fibers, draft.tubes[1].fibers.slice(1))
  assert.deepEqual(fiberRemoved.tubes[0], draft.tubes[0])
  assert.equal(fiberRemoved.fiberColorCode, 'custom')
  assert.equal(fiberRemoved.tubeColorCode, 'tia-598-12')
  assert.equal(removeTube(draft, 2).tubeColorCode, 'tia-598-12')
  assert.equal(removeFiber(draft, 0, 2).fiberColorCode, 'tia-598-12')
  assert.throws(() => removeTube(newCable(data), 0))
  assert.throws(() => removeFiber(resizeStructure(newCable(data), 1, 1, data), 0, 0))
})

test('different fiber counts and additions after removals retain unique default names', () => {
  let draft = resizeStructure(newCable(data), 3, 3, data)
  draft = removeTube(draft, 1)
  draft = appendTube(draft, data, 1)
  assert.deepEqual(draft.tubes.map(t => t.fibers.length), [3, 3, 1])
  assert.equal(new Set(draft.tubes.map(t => t.name)).size, 3)
  draft = removeFiber(draft, 0, 1)
  const tube = resizeFibers(draft.tubes[0], 3, data, draft.fiberColorCode)
  assert.equal(new Set(tube.fibers.map(f => f.name)).size, 3)
  assert.deepEqual(tube.fibers.slice(0, 2), draft.tubes[0].fibers)
})
