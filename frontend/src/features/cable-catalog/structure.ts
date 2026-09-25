import { sequence, type CableDraft, type CableTube, type ColorCodeData } from './model'

function nextName(parts: { name: string }[], prefix: string): string {
  let number = 1
  while (parts.some(part => part.name === `${prefix} ${number}`)) number++
  return `${prefix} ${number}`
}

function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new Error('Počet musí být 1 až 24.')
}

export function resizeFibers(tube: CableTube, count: number, data: ColorCodeData, profile: string): CableTube {
  checkCount(count)
  const fibers = tube.fibers.slice(0, count)
  if (count > fibers.length) {
    const marks = sequence(data, profile, 'fibers', count)
    while (fibers.length < count) fibers.push({ ...marks[fibers.length], name: nextName(fibers, 'Vlákno') })
  }
  return { ...tube, fibers }
}

export function appendTube(draft: CableDraft, data: ColorCodeData, fiberCount = 1): CableDraft {
  checkCount(draft.tubes.length + 1)
  const mark = sequence(data, draft.tubeColorCode, 'tubes', draft.tubes.length + 1).at(-1)!
  const tube = resizeFibers({ ...mark, name: nextName(draft.tubes, 'Tuba'), fibers: [] }, fiberCount, data, draft.fiberColorCode)
  return { ...draft, tubes: [...draft.tubes, tube] }
}

export function resizeStructure(draft: CableDraft, tubeCount: number, fiberCount: number, data: ColorCodeData): CableDraft {
  checkCount(tubeCount); checkCount(fiberCount)
  let result = { ...draft, tubes: draft.tubes.slice(0, tubeCount).map(tube => resizeFibers(tube, fiberCount, data, draft.fiberColorCode)) }
  while (result.tubes.length < tubeCount) result = appendTube(result, data, fiberCount)
  return result
}

export function removeTube(draft: CableDraft, index: number): CableDraft {
  if (draft.tubes.length <= 1 || !draft.tubes[index]) throw new Error('V kabelu musí zůstat alespoň jedna tuba.')
  return { ...draft, tubes: draft.tubes.filter((_, i) => i !== index),
    tubeColorCode: index === draft.tubes.length - 1 ? draft.tubeColorCode : 'custom' }
}

export function removeFiber(draft: CableDraft, tubeIndex: number, fiberIndex: number): CableDraft {
  const tube = draft.tubes[tubeIndex]
  if (!tube || tube.fibers.length <= 1 || !tube.fibers[fiberIndex]) throw new Error('V tubě musí zůstat alespoň jedno vlákno.')
  return { ...draft, tubes: draft.tubes.map((part, i) => i === tubeIndex
    ? { ...tube, fibers: tube.fibers.filter((_, j) => j !== fiberIndex) } : part),
    fiberColorCode: fiberIndex === tube.fibers.length - 1 ? draft.fiberColorCode : 'custom' }
}
