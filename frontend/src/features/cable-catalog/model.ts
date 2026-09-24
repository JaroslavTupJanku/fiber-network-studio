export type CableFiber = { name: string; color: string }
export type CableTube = { name: string; color: string; fibers: CableFiber[] }
export type CableInput = { name: string; manufacturer: string; notes: string; tubes: CableTube[]; version: number }
export type CableSpecification = CableInput & { id: string; isPreset: boolean }
export type CableDraft = CableInput & { id?: string }

export const palette = ['#2563eb', '#f97316', '#16a34a', '#92400e', '#64748b', '#ffffff',
  '#dc2626', '#171717', '#eab308', '#9333ea', '#ec4899', '#06b6d4']

export function createTubes(tubeCount: number, fiberCount: number): CableTube[] {
  return Array.from({ length: tubeCount }, (_, tube) => ({
    name: `Tuba ${tube + 1}`, color: palette[tube % palette.length],
    fibers: Array.from({ length: fiberCount }, (_, fiber) => ({
      name: `Vlákno ${fiber + 1}`, color: palette[fiber % palette.length],
    })),
  }))
}

export const countFibers = (cable: CableInput) => cable.tubes.reduce((sum, tube) => sum + tube.fibers.length, 0)
export const newCable = (): CableDraft => ({ name: '', manufacturer: '', notes: '', tubes: createTubes(1, 12), version: 0 })

export function validateCable(cable: CableInput): string | null {
  if (!cable.name.trim() || cable.name.trim().length > 100) return 'Zadejte název kabelu (1 až 100 znaků).'
  if (cable.manufacturer.length > 100 || cable.notes.length > 2000) return 'Výrobce může mít 100 znaků a poznámka 2000 znaků.'
  if (cable.tubes.length < 1 || cable.tubes.length > 24) return 'Kabel musí obsahovat 1 až 24 tub.'
  for (const tube of cable.tubes) {
    if (tube.fibers.length < 1 || tube.fibers.length > 24) return 'Tuba musí obsahovat 1 až 24 vláken.'
    for (const part of [tube, ...tube.fibers]) {
      if (!part.name.trim() || part.name.trim().length > 40) return 'Každá tuba i vlákno potřebuje název (1 až 40 znaků).'
      if (!/^#[\da-f]{6}$/i.test(part.color)) return 'Vyberte platnou barvu tuby a vláken.'
    }
  }
  return null
}
