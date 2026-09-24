import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculate, changeTechnology, changeLimit, limitFor, demoScenario, newScenario, newElement, number } from '../frontend/src/features/optical-budget/model.ts'
import { parseScenario } from '../frontend/src/features/optical-budget/storage.ts'

test('physical loss and design reserve remain separate, metres convert to kilometres', () => {
  const result = calculate(demoScenario())
  assert.equal(result.total, 1.6)
  assert.equal(result.reserve, 1)
  assert.ok(Math.abs(result.margin - 0.4) < 1e-12)
  assert.equal(result.verdict, 'pass')
  const shorter = demoScenario(); shorter.sections[0].lengthM = '200'
  assert.equal(calculate(shorter).total, 1.06)
})
test('wavelengths use separate cable, element and equipment specifications', () => {
  const scenario = demoScenario(); scenario.wavelength = '1550'
  assert.ok(Math.abs(calculate(scenario).total - 1.4) < 1e-12)
  scenario.limit1550 = ''; assert.equal(calculate(scenario).verdict, 'unknown')
  scenario.elements[0].loss1550 = ''; assert.equal(calculate(scenario).total, null)
  scenario.wavelength = '1310'; assert.equal(calculate(scenario).total, 1.6)
})
test('missing, invalid and zero are distinct; no partial total or false pass', () => {
  assert.equal(calculate(newScenario()).total, null)
  for (const value of ['', '-1', 'NaN', 'Infinity', '1e309', 'abc', '0x10']) {
    const scenario = demoScenario(); scenario.sections[0].loss1310 = value
    assert.equal(calculate(scenario).total, null, value)
  }
  const scenario = demoScenario(); scenario.sections[0].loss1310 = '0'
  assert.equal(calculate(scenario).total, 1)
  scenario.elements[0].count = '1.5'; assert.equal(calculate(scenario).total, null)
  scenario.elements[0].count = '0'; assert.equal(calculate(scenario).total, null)
  scenario.sections = []; assert.equal(calculate(scenario).total, null)
  assert.equal(number('0,35'), 0.35); assert.equal(number(' .35 '), .35)
  assert.equal(number('1e-7'), 0.0000001)
})
test('limits and splitter path loss use specified values, exact boundary is explicit', () => {
  const scenario = demoScenario()
  scenario.limit1310 = '2.6'; assert.equal(calculate(scenario).verdict, 'boundary')
  scenario.limit1310 = '2.5'; assert.equal(calculate(scenario).verdict, 'fail')
  scenario.reserve = ''; assert.equal(calculate(scenario).verdict, 'unknown')
  scenario.reserve = '0'; scenario.elements.push({ ...newElement(), kind: 'splitter', count: '1', loss1310: '10.5', loss1550: '10.8' })
  assert.equal(calculate(scenario).total, 12.1)
})
test('download roundtrip retains inputs; invalid or duplicate imported rows rejected', () => {
  const scenario = demoScenario()
  assert.deepEqual(parseScenario(JSON.stringify(scenario)), scenario)
  for (const value of [null, {}, { ...scenario, version: 3 }, { ...scenario, wavelength: '850' },
    { ...scenario, sections: [null] }, { ...scenario, sections: [scenario.sections[0], scenario.sections[0]] },
    { ...scenario, elements: [{ ...scenario.elements[0], kind: 'unknown' }] }]) {
    assert.throws(() => parseScenario(JSON.stringify(value)))
  }
})

test('technology selects valid wavelengths, preserves direction and isolates equipment limits', () => {
  let scenario = changeTechnology(demoScenario(), 'gpon')
  assert.equal(scenario.wavelength, '1490')
  assert.equal(calculate(scenario).total, null)
  scenario.wavelength = '1310'
  assert.equal(calculate(scenario).total, 1.6)
  assert.equal(limitFor(scenario), '')
  scenario = changeLimit(scenario, '28')
  scenario = changeTechnology(scenario, 'xgspon')
  assert.equal(scenario.wavelength, '1270')
  assert.equal(limitFor(scenario), '')
  assert.equal(calculate(scenario).total, null)
  scenario = changeTechnology(scenario, 'gpon')
  assert.equal(limitFor(scenario), '28')
  scenario = changeTechnology(scenario, 'manual')
  assert.equal(limitFor(scenario), '3')
  assert.equal(calculate(scenario).total, 1.6)
  assert.throws(() => parseScenario(JSON.stringify({ ...scenario, technology: 'xgspon' })))
})

test('legacy files migrate without inventing losses or technology limits', () => {
  const old = demoScenario()
  old.version = 1
  delete old.technology; delete old.ponLimits
  for (const wave of ['1270', '1490', '1577']) {
    delete old[`limit${wave}`]
    for (const row of [...old.sections, ...old.elements]) delete row[`loss${wave}`]
  }
  const migrated = parseScenario(JSON.stringify(old))
  assert.equal(migrated.version, 2)
  assert.equal(calculate(migrated).total, 1.6)
  assert.equal(migrated.sections[0].loss1490, '')
  assert.equal(migrated.ponLimits.gpon.upstream, '')
  assert.equal(migrated.equipment, undefined)
})

test('scenario transfer keeps selected profile IDs while older scenario files remain valid', () => {
  const scenario = demoScenario()
  scenario.equipment = { oltId: 'olt', onuId: 'onu', oltModuleId: '', onuModuleId: '' }
  assert.deepEqual(parseScenario(JSON.stringify(scenario)).equipment, scenario.equipment)
  assert.throws(() => parseScenario(JSON.stringify({ ...scenario, equipment: { ...scenario.equipment, onuId: null } })))
})
