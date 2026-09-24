import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculate, demoScenario, newScenario, newElement, number } from '../frontend/src/features/optical-budget/model.ts'
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
  for (const value of [null, {}, { ...scenario, version: 2 }, { ...scenario, wavelength: '850' },
    { ...scenario, sections: [null] }, { ...scenario, sections: [scenario.sections[0], scenario.sections[0]] },
    { ...scenario, elements: [{ ...scenario.elements[0], kind: 'unknown' }] }]) {
    assert.throws(() => parseScenario(JSON.stringify(value)))
  }
})
