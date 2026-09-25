export type ColorMark = {
  color: string; marking: 'none' | 'mark'; markerColor: string | null; markingSpacingMm: number | null; transparent: boolean
}
export type ColorProfile = {
  id: string; label: string; sourceUrl: string; sourceLabel: string; note: string; fibers: ColorMark[]; tubes: ColorMark[]
}
export type ColorCodeData = {
  schemaVersion: number; reviewedOn: string; displayNote: string; colors: { name: string; hex: string }[]; profiles: ColorProfile[]
}
export type CableFiber = ColorMark & { name: string }
export type CableTube = ColorMark & { name: string; fibers: CableFiber[] }
export type CableInput = {
  name: string; manufacturer: string; notes: string; tubes: CableTube[]; version: number
  fiberColorCode: string; tubeColorCode: string; sourceUrl: string
  attenuation1310DbPerKm: number | null; attenuation1550DbPerKm: number | null
  outerDiameterMm: number | null; minimumDuctInnerDiameterMm: number | null
}
export type CableSpecification = CableInput & { id: string; isPreset: boolean }
export type CableDraft = CableInput & { id?: string }

export const emptyMark: ColorMark = { color: '#64748b', marking: 'none', markerColor: null, markingSpacingMm: null, transparent: false }
export function normalizeCable(cable: CableSpecification): CableSpecification {
  return { ...cable, fiberColorCode: cable.fiberColorCode ?? 'custom', tubeColorCode: cable.tubeColorCode ?? 'custom',
    attenuation1310DbPerKm: cable.attenuation1310DbPerKm ?? null, attenuation1550DbPerKm: cable.attenuation1550DbPerKm ?? null,
    outerDiameterMm: cable.outerDiameterMm ?? null, minimumDuctInnerDiameterMm: cable.minimumDuctInnerDiameterMm ?? null,
    sourceUrl: cable.sourceUrl ?? '', tubes: cable.tubes.map(tube => ({ ...emptyMark, ...tube,
      fibers: tube.fibers.map(fiber => ({ ...emptyMark, ...fiber })),
    })) }
}

export function sequence(data: ColorCodeData, id: string, scope: 'fibers' | 'tubes', count: number): ColorMark[] {
  if (id === 'custom') return Array.from({ length: count }, () => ({ ...emptyMark }))
  const profile = data.profiles.find(item => item.id === id)
  if (!profile || count > profile[scope].length) throw new Error(`Vybraný profil podporuje nejvýše ${profile?.[scope].length ?? 0} ${scope === 'fibers' ? 'vláken v tubě' : 'tub'}. Vyberte jiný profil nebo vlastní značení.`)
  return profile[scope].slice(0, count).map(mark => ({ ...mark }))
}

export function createTubes(data: ColorCodeData, tubeCount: number, fiberCount: number, fiberCode = 'tia-598-12', tubeCode = 'tia-598-12'): CableTube[] {
  const fibers = sequence(data, fiberCode, 'fibers', fiberCount)
  return sequence(data, tubeCode, 'tubes', tubeCount).map((mark, index) => ({ ...mark, name: `Tuba ${index + 1}`,
    fibers: fibers.map((fiber, i) => ({ ...fiber, name: `Vlákno ${i + 1}` })),
  }))
}

export const countFibers = (cable: CableInput) => cable.tubes.reduce((sum, tube) => sum + tube.fibers.length, 0)
export const newCable = (data: ColorCodeData): CableDraft => ({ name: '', manufacturer: '', notes: '', sourceUrl: '',
  attenuation1310DbPerKm: null, attenuation1550DbPerKm: null,
  outerDiameterMm: null, minimumDuctInnerDiameterMm: null,
  tubes: createTubes(data, 1, 12), version: 0, fiberColorCode: 'tia-598-12', tubeColorCode: 'tia-598-12' })
export const colorName = (part: ColorMark, data: ColorCodeData) => part.transparent ? 'Bezbarvá'
  : data.colors.find(color => color.hex.toLowerCase() === part.color.toLowerCase())?.name ?? `Vlastní (${part.color.toUpperCase()})`
export const markingLabel = (part: ColorMark, data: ColorCodeData) => part.marking === 'none' ? 'Bez značky'
  : `${part.markerColor ? colorName({ ...emptyMark, color: part.markerColor }, data) + ' značka' : 'Značka – barva neurčena'}${part.markingSpacingMm ? ` po ${part.markingSpacingMm} mm` : ''}`
export const markSignature = (part: ColorMark) => JSON.stringify([part.color, part.transparent, part.marking,
  part.marking === 'mark' ? part.markerColor : null, part.marking === 'mark' ? part.markingSpacingMm : null])
export const profileLabel = (data: ColorCodeData, id: string) => data.profiles.find(profile => profile.id === id)?.label ?? 'Vlastní značení'

export function validateCable(cable: CableInput): string | null {
  if ([cable.outerDiameterMm, cable.minimumDuctInnerDiameterMm].some(value => value !== null && (!Number.isFinite(value) || value <= 0 || value > 1000))) return 'Průměr musí být kladné číslo v mm nebo nevyplněný.'
  if (cable.outerDiameterMm !== null && cable.minimumDuctInnerDiameterMm !== null && cable.minimumDuctInnerDiameterMm < cable.outerDiameterMm) return 'Doporučený minimální vnitřní průměr trubičky nesmí být menší než průměr kabelu.'
  if ([cable.attenuation1310DbPerKm, cable.attenuation1550DbPerKm].some(value => value !== null && (!Number.isFinite(value) || value < 0))) return 'Útlum musí být nezáporné konečné číslo nebo nevyplněný.'
  if (!cable.name.trim() || cable.name.trim().length > 100) return 'Zadejte název kabelu (1 až 100 znaků).'
  if (cable.manufacturer.length > 100 || cable.notes.length > 2000) return 'Výrobce může mít 100 znaků a poznámka 2000 znaků.'
  if (cable.sourceUrl) {
    try { if (!['http:', 'https:'].includes(new URL(cable.sourceUrl).protocol) || cable.sourceUrl.length > 2000) throw new Error() }
    catch { return 'Zdroj specifikace musí být odkaz HTTP nebo HTTPS.' }
  }
  if (cable.tubes.length < 1 || cable.tubes.length > 24) return 'Kabel musí obsahovat 1 až 24 tub.'
  for (const tube of cable.tubes) {
    if (tube.fibers.length < 1 || tube.fibers.length > 24) return 'Tuba musí obsahovat 1 až 24 vláken.'
    for (const part of [tube, ...tube.fibers]) {
      if (!part.name.trim() || part.name.trim().length > 40) return 'Každá tuba i vlákno potřebuje název (1 až 40 znaků).'
      if (!/^#[\da-f]{6}$/i.test(part.color)) return 'Vyberte platnou barvu tuby a vláken.'
      if (part.markingSpacingMm !== null && (!Number.isInteger(part.markingSpacingMm) || part.markingSpacingMm < 1 || part.markingSpacingMm > 10000)) return 'Rozestup značek musí být 1 až 10000 mm nebo prázdný.'
    }
  }
  return null
}
