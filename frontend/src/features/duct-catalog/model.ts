import type { CableSpecification } from '../cable-catalog/model'

export type DuctKind = 'conduit' | 'microduct' | 'assembly'
export type SlotKind = 'conduit' | 'microduct'
export type DuctSlot = { name: string; kind: SlotKind; color: string; outerDiameterMm: number | null; innerDiameterMm: number | null }
export type DuctInput = {
  name: string; kind: DuctKind; manufacturer: string; model: string; color: string
  outerDiameterMm: number | null; innerDiameterMm: number | null; rows: number; columns: number
  slots: DuctSlot[]; notes: string; sourceUrl: string; version: number
}
export type DuctType = DuctInput & { id: string; isPreset: boolean }
export type DuctDraft = DuctInput & { id?: string }

export const kindLabel = (kind: DuctKind | SlotKind) => kind === 'conduit' ? 'Chránička' : kind === 'microduct' ? 'Mikrotrubička' : 'Sestava'
export const newSlot = (index: number, kind: SlotKind = 'microduct'): DuctSlot => ({
  name: `Pozice ${index + 1}`, kind, color: '#64748b', outerDiameterMm: null, innerDiameterMm: null,
})
export const newDuct = (kind: DuctKind = 'conduit'): DuctDraft => ({
  name: '', kind, manufacturer: '', model: '', color: '#257568', outerDiameterMm: null, innerDiameterMm: null,
  rows: kind === 'assembly' ? 2 : 1, columns: kind === 'assembly' ? 3 : 1,
  slots: kind === 'assembly' ? Array.from({ length: 6 }, (_, index) => newSlot(index)) : [],
  notes: '', sourceUrl: '', version: 0,
})

export function changeKind(draft: DuctDraft, kind: DuctKind): DuctDraft {
  if (kind === draft.kind) return draft
  return { ...draft, kind, rows: kind === 'assembly' ? 2 : 1, columns: kind === 'assembly' ? 3 : 1,
    slots: kind === 'assembly' ? Array.from({ length: 6 }, (_, index) => newSlot(index)) : [],
    outerDiameterMm: kind === 'assembly' ? null : draft.outerDiameterMm,
    innerDiameterMm: kind === 'assembly' ? null : draft.innerDiameterMm,
  }
}

export function resizeAssembly(draft: DuctDraft, rows: number, columns: number): DuctDraft {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || rows > 12 || columns < 1 || columns > 12 || rows * columns > 100) throw new Error('Sestava může mít nejvýše 100 pozic v 1 až 12 řadách a sloupcích.')
  return { ...draft, rows, columns, slots: Array.from({ length: rows * columns }, (_, index) => draft.slots[index] ?? newSlot(index)) }
}

const validDiameter = (value: number | null) => value === null || Number.isFinite(value) && value > 0 && value <= 1000
const validPair = (outer: number | null, inner: number | null) => validDiameter(outer) && validDiameter(inner)
  && (outer === null || inner === null || inner < outer)

export function validateDuct(item: DuctInput): string | null {
  if (!item.name.trim() || item.name.trim().length > 100) return 'Zadejte název (1 až 100 znaků).'
  if (!['conduit', 'microduct', 'assembly'].includes(item.kind)) return 'Vyberte druh typu.'
  if (item.manufacturer.length > 100 || item.model.length > 100 || item.notes.length > 2000) return 'Zkraťte výrobce, model nebo poznámku.'
  if (!/^#[\da-f]{6}$/i.test(item.color)) return 'Vyberte platnou barvu.'
  if (!validPair(item.outerDiameterMm, item.innerDiameterMm)) return 'Průměry musí být kladné; vnitřní musí být menší než vnější.'
  if (item.sourceUrl) {
    try { if (!['http:', 'https:'].includes(new URL(item.sourceUrl).protocol) || item.sourceUrl.length > 2000) throw new Error() }
    catch { return 'Technický list musí být odkaz HTTP nebo HTTPS.' }
  }
  if (item.kind !== 'assembly') return item.rows === 1 && item.columns === 1 && item.slots.length === 0 ? null : 'Samostatný typ nemůže obsahovat pozice sestavy.'
  if (item.outerDiameterMm !== null || item.innerDiameterMm !== null) return 'Sestava nemá společné kruhové průměry.'
  if (!Number.isInteger(item.rows) || !Number.isInteger(item.columns) || item.rows < 1 || item.rows > 12 || item.columns < 1 || item.columns > 12 || item.rows * item.columns > 100 || item.slots.length !== item.rows * item.columns) return 'Počet pozic musí odpovídat řadám a sloupcům (nejvýše 100).'
  if (item.slots.some(slot => !slot.name.trim() || slot.name.trim().length > 40 || !['conduit', 'microduct'].includes(slot.kind)
    || !/^#[\da-f]{6}$/i.test(slot.color) || !validPair(slot.outerDiameterMm, slot.innerDiameterMm))) return 'Zkontrolujte názvy, druhy, barvy a průměry pozic.'
  return null
}

export type FitResult = 'unknown' | 'too-small' | 'possible'
export function cableFit(cable: CableSpecification, innerDiameterMm: number | null): FitResult {
  if (innerDiameterMm === null) return 'unknown'
  if (cable.minimumDuctInnerDiameterMm !== null) return innerDiameterMm >= cable.minimumDuctInnerDiameterMm ? 'possible' : 'too-small'
  if (cable.outerDiameterMm === null) return 'unknown'
  return innerDiameterMm > cable.outerDiameterMm ? 'possible' : 'too-small'
}
