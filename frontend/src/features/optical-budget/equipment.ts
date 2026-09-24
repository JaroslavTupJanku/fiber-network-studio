import { ponWavelengths, type Scenario, type Technology, type Wavelength, calculate, number } from './model.ts'

export type EquipmentKind = 'olt' | 'onu' | 'module'
export type EquipmentProfile = {
  id: string; kind: EquipmentKind; manufacturer: string; model: string; technology: Exclude<Technology, 'manual'>
  txWavelength: Wavelength; rxWavelength: Wavelength; txMin: string; txMax: string
  rxSensitivity: string; rxOverload: string; source: string
}
export type EquipmentCatalog = { version: 1; profiles: EquipmentProfile[] }
export type EndpointSelection = { oltId: string; onuId: string; oltModuleId: string; onuModuleId: string }
export const equipmentStorageKey = 'fiber-network-studio.optical-equipment.v1'
export const emptyCatalog = (): EquipmentCatalog => ({ version: 1, profiles: [] })
export const emptyEndpointSelection = (): EndpointSelection => ({ oltId: '', onuId: '', oltModuleId: '', onuModuleId: '' })
export const newProfile = (kind: EquipmentKind = 'olt'): EquipmentProfile => ({ id: crypto.randomUUID(), kind, manufacturer: '', model: '', technology: 'gpon', txWavelength: kind === 'onu' ? '1310' : '1490', rxWavelength: kind === 'onu' ? '1490' : '1310', txMin: '', txMax: '', rxSensitivity: '', rxOverload: '', source: '' })

const validText = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000
export function parseEquipmentCatalog(raw: string): EquipmentCatalog {
  const value = JSON.parse(raw)
  const profiles = value?.profiles
  const waves = ['1270', '1310', '1490', '1550', '1577']
  if (value?.version !== 1 || !Array.isArray(profiles) || profiles.length > 500
    || !profiles.every((p: Record<string, unknown>) => p && validText(p.id) && ['olt', 'onu', 'module'].includes(String(p.kind))
      && validText(p.manufacturer) && validText(p.model) && ['gpon', 'xgspon'].includes(String(p.technology))
      && waves.includes(String(p.txWavelength)) && waves.includes(String(p.rxWavelength))
      && ['txMin', 'txMax', 'rxSensitivity', 'rxOverload', 'source'].every(k => validText(p[k])))
    || new Set(profiles.map((p: EquipmentProfile) => p.id)).size !== profiles.length) throw new Error('Katalog zařízení má neplatný formát.')
  if (profiles.some((p: EquipmentProfile) => profileErrors(p).length > 0)) throw new Error('Katalog obsahuje neúplný nebo neplatný profil.')
  return value
}

export function mergeEquipmentCatalog(local: EquipmentCatalog, incoming: EquipmentCatalog, replaceConflicts = false) {
  const localIds = new Set(local.profiles.map(p => p.id))
  const conflicts = incoming.profiles.filter(p => localIds.has(p.id)).map(p => p.id)
  const replacements = new Map(incoming.profiles.map(p => [p.id, p]))
  const profiles = local.profiles.map(p => replaceConflicts ? replacements.get(p.id) ?? p : p)
  profiles.push(...incoming.profiles.filter(p => !localIds.has(p.id)))
  return { catalog: { version: 1 as const, profiles }, conflicts }
}

export function profileErrors(p: EquipmentProfile): string[] {
  const errors: string[] = []
  const parsed = (s: string) => /^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?$/i.test(s.trim()) ? Number(s.trim().replace(',', '.')) : NaN
  const txMin = parsed(p.txMin), txMax = parsed(p.txMax)
  const sensitivity = parsed(p.rxSensitivity), overload = parsed(p.rxOverload)
  if (!p.manufacturer.trim() || !p.model.trim() || !p.source.trim()) errors.push('Chybí výrobce, model nebo zdroj hodnot.')
  if (![txMin, txMax, sensitivity, overload].every(Number.isFinite)) errors.push('Všechny čtyři optické parametry musí být uvedené číslo v dBm.')
  else if (txMin > txMax || sensitivity >= overload) errors.push('Rozsah Tx nebo dynamický rozsah Rx je obrácený.')
  const waves = ponWavelengths[p.technology]
  if (!((p.txWavelength === waves.downstream && p.rxWavelength === waves.upstream)
    || (p.txWavelength === waves.upstream && p.rxWavelength === waves.downstream))) errors.push('Vlnové délky neodpovídají zvolené technologii.')
  return errors
}

export function evaluateEquipment(scenario: Scenario, catalog: EquipmentCatalog, selection: EndpointSelection) {
  const byId = (id: string) => catalog.profiles.find(p => p.id === id)
  const olt = byId(selection.oltId), onu = byId(selection.onuId)
  const oltModule = selection.oltModuleId ? byId(selection.oltModuleId) : undefined
  const onuModule = selection.onuModuleId ? byId(selection.onuModuleId) : undefined
  const errors: string[] = []
  if (!olt || olt.kind !== 'olt') errors.push('Vyberte platný profil OLT.')
  if (!onu || onu.kind !== 'onu') errors.push('Vyberte platný profil ONT/ONU.')
  if (selection.oltModuleId && (!oltModule || oltModule.kind !== 'module')) errors.push('Vyberte platný modul OLT.')
  if (selection.onuModuleId && (!onuModule || onuModule.kind !== 'module')) errors.push('Vyberte platný modul ONT/ONU.')
  const oltOptic = oltModule ?? olt, onuOptic = onuModule ?? onu
  if (olt && onu && olt.technology !== onu.technology) errors.push('OLT a ONT/ONU používají rozdílné technologie.')
  const technology = olt?.technology ?? onu?.technology ?? (scenario.technology === 'manual' ? undefined : scenario.technology)
  const waves = technology ? ponWavelengths[technology] : null
  if (oltOptic && onuOptic && waves && (oltOptic.technology !== technology || onuOptic.technology !== technology
    || oltOptic.txWavelength !== waves.downstream || oltOptic.rxWavelength !== waves.upstream
    || onuOptic.txWavelength !== waves.upstream || onuOptic.rxWavelength !== waves.downstream)) errors.push('Profily zařízení nebo modulů nejsou vlnovou délkou kompatibilní.')
  for (const profile of [olt, onu, oltModule, onuModule]) if (profile) errors.push(...profileErrors(profile).map(e => `${profile.manufacturer} ${profile.model}: ${e}`))
  if (scenario.technology === 'manual' || (technology && scenario.technology !== technology)) errors.push('Vyberte shodnou technologii PON ve výpočtu i v profilech.')
  const reserve = number(scenario.reserve)
  if (reserve === null) errors.push('Zadejte platnou návrhovou rezervu pro posouzení slabého signálu.')
  const directions = waves ? (['downstream', 'upstream'] as const).map(direction => {
    const tx = direction === 'downstream' ? oltOptic : onuOptic
    const rx = direction === 'downstream' ? onuOptic : oltOptic
    const wavelength = waves[direction]
    const path = calculate({ ...scenario, wavelength })
    const parse = (value?: string) => value === undefined || !/^[-+]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[-+]?\d+)?$/i.test(value.trim()) ? null : Number(value.replace(',', '.'))
    const txMin = parse(tx?.txMin), txMax = parse(tx?.txMax), sensitivity = parse(rx?.rxSensitivity), overload = parse(rx?.rxOverload)
    const receivedMin = txMin !== null && path.total !== null ? txMin - path.total : null
    const receivedMax = txMax !== null && path.total !== null ? txMax - path.total : null
    const designReceivedMin = txMin !== null && path.total !== null && reserve !== null ? txMin - (path.total + reserve) : null
    const complete = !errors.length && receivedMin !== null && receivedMax !== null && designReceivedMin !== null && sensitivity !== null && overload !== null
    const weak = complete && designReceivedMin < sensitivity
    const overloadExceeded = complete && receivedMax > overload
    const verdict = !complete ? 'unknown' : weak && overloadExceeded ? 'outside' : weak ? 'weak' : overloadExceeded ? 'overload' : 'pass'
    return { direction, wavelength, pathLoss: path.total, reserve, receivedMin, receivedMax, designReceivedMin, sensitivity, overload, weak, overloadExceeded, verdict }
  }) : []
  return { errors: [...new Set(errors)], directions }
}
