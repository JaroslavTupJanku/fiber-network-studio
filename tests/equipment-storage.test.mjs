import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyCatalog, equipmentStorageKey } from '../frontend/src/features/optical-budget/equipment.ts'
import { saveEquipmentCatalog } from '../frontend/src/features/optical-budget/equipmentStorage.ts'

test('equipment catalog reports success only after browser storage accepts the data', () => {
  const catalog = emptyCatalog()
  let savedKey = ''
  let savedValue = ''
  assert.equal(saveEquipmentCatalog({ setItem(key, value) { savedKey = key; savedValue = value } }, catalog), true)
  assert.equal(savedKey, equipmentStorageKey)
  assert.deepEqual(JSON.parse(savedValue), catalog)
  assert.equal(saveEquipmentCatalog({ setItem() { throw new Error('storage full') } }, catalog), false)
})
