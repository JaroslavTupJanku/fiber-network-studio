import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crossedDragThreshold, mapCursor, resolveMapClick } from '../frontend/src/features/map/interactions.ts'

test('map cursor follows the action under the pointer', () => {
  const idle = { draggingTool: false, draggingMap: false, draggingPoint: false, placing: false, overPoint: false, overParcel: false }
  assert.equal(mapCursor(idle), 'grab')
  assert.equal(mapCursor({ ...idle, overPoint: true }), 'grab')
  assert.equal(mapCursor({ ...idle, overParcel: true }), 'pointer')
  assert.equal(mapCursor({ ...idle, placing: true, overPoint: true }), 'crosshair')
  assert.equal(mapCursor({ ...idle, placing: true, draggingMap: true }), 'grabbing')
  assert.equal(mapCursor({ ...idle, draggingPoint: true }), 'grabbing')
  assert.equal(mapCursor({ ...idle, draggingTool: true, placing: true }), 'copy')
})

test('map click selects an existing point ahead of parcel lookup', () => {
  assert.deepEqual(resolveMapClick('point-1', false, true, 18, 17), { kind: 'point', id: 'point-1' })
})

test('an existing point remains selectable while a placement tool is active', () => {
  assert.deepEqual(resolveMapClick('point-1', true, true, 18, 17), { kind: 'point', id: 'point-1' })
  assert.deepEqual(resolveMapClick(null, true, true, 18, 17), { kind: 'location', lookupParcel: false })
})

test('empty-map click looks up a parcel only when the cadastre is available at sufficient zoom', () => {
  assert.deepEqual(resolveMapClick(null, false, true, 17, 17), { kind: 'location', lookupParcel: true })
  assert.deepEqual(resolveMapClick(null, false, true, 16.9, 17), { kind: 'location', lookupParcel: false })
  assert.deepEqual(resolveMapClick(null, false, false, 18, 17), { kind: 'location', lookupParcel: false })
})

test('dragging starts only after the configured movement threshold', () => {
  assert.equal(crossedDragThreshold(10, 20, 13, 20, 4), false)
  assert.equal(crossedDragThreshold(10, 20, 13, 24, 4), true)
  assert.equal(crossedDragThreshold(10, 20, 13, 24, 6), false)
})
