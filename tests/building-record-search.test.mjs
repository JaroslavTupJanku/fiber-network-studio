import test from 'node:test'
import assert from 'node:assert/strict'
import { findBuildingRecords } from '../frontend/src/features/map/buildingRecordSearch.ts'

const records = Array.from({ length: 120 }, (_, index) => ({
  id: String(index), name: `Byt ${index + 1}`, groupId: index < 60 ? 'a' : 'b', group: index < 60 ? 'Vchod A' : 'Vchod B',
  context: `${index < 60 ? 'Vchod A' : 'Vchod B'} · ${index % 6}. podlaží`, floor: index % 6,
  status: index % 2 ? 'Čeká na přiřazení vlákna' : 'Vlákno přiřazeno',
}))

test('search reaches records beyond the sidebar preview and first page', () => {
  assert.deepEqual(findBuildingRecords(records, 'byt 120').map(item => item.id), ['119'])
})
test('search ignores accents and case and combines terms across name and location', () => {
  assert.deepEqual(findBuildingRecords(records, 'BYT 120 PODLAZI VCHOD B').map(item => item.id), ['119'])
  assert.equal(findBuildingRecords(records, 'cekA prirazeni').length, 60)
})
test('filters combine over the complete building, including ground floor', () => {
  const found = findBuildingRecords(records, '', { group: 'b', floor: '0', status: 'Vlákno přiřazeno' })
  assert.equal(found.length, 10)
  assert.ok(found.every(item => item.groupId === 'b' && item.floor === 0))
  assert.equal(findBuildingRecords(records, 'Byt 120', { group: 'a' }).length, 0)
  assert.equal(findBuildingRecords(records, '', { group: 'b', floor: '0', status: 'Čeká na přiřazení vlákna' }).length, 0)
  assert.equal(findBuildingRecords(records, '  ').length, 120)
})
