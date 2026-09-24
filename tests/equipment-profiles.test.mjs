import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoScenario } from '../frontend/src/features/optical-budget/model.ts'
import { emptyCatalog, emptyEndpointSelection, mergeEquipmentCatalog, parseEquipmentCatalog, profileErrors, evaluateEquipment } from '../frontend/src/features/optical-budget/equipment.ts'

function pair() {
  const profile = (id, kind, txWavelength, rxWavelength, txMin = '-18', txMax = '-15') => ({
    id, kind, manufacturer: 'Test', model: id, technology: 'gpon', txWavelength, rxWavelength,
    txMin, txMax, rxSensitivity: '-27', rxOverload: '-8', source: 'test fixture'
  })
  const catalog = { version: 1, profiles: [
    profile('olt', 'olt', '1490', '1310'), profile('onu', 'onu', '1310', '1490')
  ] }
  const selection = { oltId: 'olt', onuId: 'onu', oltModuleId: '', onuModuleId: '' }
  const scenario = demoScenario()
  scenario.technology = 'gpon'
  scenario.sections[0].lengthM = '1000'
  for (const row of [...scenario.sections, ...scenario.elements]) {
    row.loss1270 = '0'; row.loss1310 = '0'; row.loss1490 = '0'; row.loss1577 = '0'
  }
  return { catalog, selection, scenario }
}

test('equipment catalog is empty by default and rejects incomplete or invalid stored profiles', () => {
  assert.deepEqual(emptyCatalog(), { version: 1, profiles: [] })
  const { catalog } = pair()
  assert.deepEqual(parseEquipmentCatalog(JSON.stringify(catalog)), catalog)
  assert.throws(() => parseEquipmentCatalog(JSON.stringify({ ...catalog, profiles: [{ ...catalog.profiles[0], txMax: '' }] })))
  assert.ok(profileErrors({ ...catalog.profiles[0], txMin: '', txMax: 'NaN' }).length > 0)
  assert.ok(profileErrors({ ...catalog.profiles[0], txMin: '-10', txMax: '-15' }).length > 0)
})

test('catalog file roundtrip merges profiles and requires explicit replacement for duplicate IDs', () => {
  const incoming = pair().catalog
  const decoded = parseEquipmentCatalog(JSON.stringify(incoming))
  assert.deepEqual(decoded, incoming)
  const local = { version: 1, profiles: [{ ...incoming.profiles[0], model: 'Local version' }] }
  const safe = mergeEquipmentCatalog(local, decoded)
  assert.deepEqual(safe.conflicts, ['olt'])
  assert.equal(safe.catalog.profiles.length, 2)
  assert.equal(safe.catalog.profiles[0].model, 'Local version')
  assert.equal(mergeEquipmentCatalog(local, decoded, true).catalog.profiles[0].model, incoming.profiles[0].model)
  assert.throws(() => parseEquipmentCatalog(JSON.stringify({ version: 1, profiles: [{ ...incoming.profiles[0], rxOverload: 'invalid' }] })))
})

test('both directions check receiver sensitivity and overload; missing loss cannot pass', () => {
  const { catalog, selection, scenario } = pair()
  let result = evaluateEquipment(scenario, catalog, selection)
  assert.deepEqual(result.directions.map(d => d.verdict), ['pass', 'pass'])
  catalog.profiles[0].txMin = '-30'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].verdict, 'weak')
  catalog.profiles[0].txMin = '-18'; catalog.profiles[0].txMax = '-5'; scenario.reserve = '1'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].verdict, 'overload')
  assert.equal(result.directions[0].receivedMax, -5, 'reserve must not be added to the overload path loss')
  scenario.reserve = '100'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].overloadExceeded, true, 'reserve must not affect the overload check')
  catalog.profiles[0].txMin = '-30'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].verdict, 'outside')
  catalog.profiles[0].txMin = '-18'; catalog.profiles[0].txMax = '-15'; scenario.reserve = ''
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].verdict, 'unknown')
  assert.ok(result.errors.some(e => e.includes('rezervu')))
  scenario.reserve = '-1'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[0].verdict, 'unknown')
  scenario.reserve = '1'
  scenario.sections[0].loss1310 = ''
  result = evaluateEquipment(scenario, catalog, selection)
  assert.equal(result.directions[1].verdict, 'unknown')
})

test('incompatible technology or wavelength and missing endpoints stay unknown', () => {
  const { catalog, selection, scenario } = pair()
  catalog.profiles[1].technology = 'xgspon'
  let result = evaluateEquipment(scenario, catalog, selection)
  assert.ok(result.errors.length > 0)
  assert.ok(result.directions.every(d => d.verdict === 'unknown'))
  catalog.profiles[1].technology = 'gpon'
  catalog.profiles[1].txWavelength = '1490'
  result = evaluateEquipment(scenario, catalog, selection)
  assert.ok(result.errors.some(e => e.includes('vlnovou délkou')))
  assert.equal(evaluateEquipment(scenario, catalog, emptyEndpointSelection()).directions[0].verdict, 'unknown')
})
