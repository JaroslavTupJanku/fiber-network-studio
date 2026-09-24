import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cableFit, newDuct, resizeAssembly, validateDuct } from '../frontend/src/features/duct-catalog/model.ts'

test('assembly resize retains existing positions and validates dimensions', () => {
  const draft = newDuct('assembly')
  draft.name = 'Moje sestava'
  draft.slots[0].name = 'Červená trubička'
  const grown = resizeAssembly(draft, 2, 5)
  assert.equal(grown.slots.length, 10)
  assert.equal(grown.slots[0].name, 'Červená trubička')
  assert.equal(draft.slots.length, 6)
  assert.equal(validateDuct(grown), null)
  assert.equal(validateDuct({ ...grown, slots: [{ ...grown.slots[0], outerDiameterMm: 5, innerDiameterMm: 7 }, ...grown.slots.slice(1)] }) !== null, true)
  assert.throws(() => resizeAssembly(grown, 12, 12))
})

test('cable fit distinguishes impossible, possible and unknown without approving installation', () => {
  const cable = { outerDiameterMm: 5.4, minimumDuctInnerDiameterMm: 8 }
  assert.equal(cableFit(cable, 6), 'too-small')
  assert.equal(cableFit(cable, 8), 'possible')
  assert.equal(cableFit(cable, null), 'unknown')
  assert.equal(cableFit({ ...cable, minimumDuctInnerDiameterMm: null }, 5.4), 'too-small')
  assert.equal(cableFit({ outerDiameterMm: null, minimumDuctInnerDiameterMm: null }, 10), 'unknown')
})
