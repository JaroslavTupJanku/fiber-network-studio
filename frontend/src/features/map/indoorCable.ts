import type { CableSpecification } from '../cable-catalog/model'

export const indoorWavelengths = [1270, 1310, 1490, 1550, 1577] as const
export type IndoorWavelength = typeof indoorWavelengths[number]
export type IndoorLossKey = `loss${IndoorWavelength}`
export type IndoorLosses = Record<IndoorLossKey, number | null>

export type IndoorCableRun = {
  cableName: string
  catalogCableId: string | null
  lengthMeters: number | null
  attenuationDbPerKm: IndoorLosses
  spliceCount: number | null
  spliceLossDb: IndoorLosses
  connectorPairCount: number | null
  connectorLossDb: IndoorLosses
  source: string
}

export const emptyIndoorLosses = (): IndoorLosses => ({
  loss1270: null, loss1310: null, loss1490: null, loss1550: null, loss1577: null,
})

export const newIndoorCableRun = (): IndoorCableRun => ({
  cableName: '', catalogCableId: null, lengthMeters: null,
  attenuationDbPerKm: emptyIndoorLosses(), spliceCount: null,
  spliceLossDb: emptyIndoorLosses(), connectorPairCount: null,
  connectorLossDb: emptyIndoorLosses(), source: '',
})

export const indoorRunFromCatalog = (current: IndoorCableRun, cable: CableSpecification): IndoorCableRun => ({
  ...current, catalogCableId: cable.id, cableName: cable.name,
  attenuationDbPerKm: {
    ...emptyIndoorLosses(),
    loss1310: cable.attenuation1310DbPerKm,
    loss1550: cable.attenuation1550DbPerKm,
  },
  source: cable.sourceUrl ?? '',
})

export function indoorCableError(run: IndoorCableRun): string | null {
  if (!run.cableName.trim() || run.cableName.trim().length > 120) return 'Zadejte označení domovního kabelu (nejvýše 120 znaků).'
  if (run.lengthMeters !== null && (!Number.isFinite(run.lengthMeters) || run.lengthMeters <= 0 || run.lengthMeters > 10000))
    return 'Délka domovního kabelu musí být kladná a nejvýše 10 000 m.'
  for (const count of [run.spliceCount, run.connectorPairCount])
    if (count !== null && (!Number.isInteger(count) || count < 0 || count > 100))
      return 'Počet spojů musí být celé číslo od 0 do 100.'
  const groups = [run.attenuationDbPerKm, run.spliceLossDb, run.connectorLossDb]
  if (groups.some(group => indoorWavelengths.some(wave => {
    const value = group[`loss${wave}`]
    return value !== null && (!Number.isFinite(value) || value < 0 || value > 100)
  }))) return 'Útlum musí být nezáporný a nejvýše 100 dB.'
  if ((!(run.spliceCount !== null && run.spliceCount > 0)
    && indoorWavelengths.some(wave => run.spliceLossDb[`loss${wave}`] !== null))
    || (!(run.connectorPairCount !== null && run.connectorPairCount > 0)
    && indoorWavelengths.some(wave => run.connectorLossDb[`loss${wave}`] !== null)))
    return 'Ztrátu spoje lze zadat až po uvedení jeho počtu.'
  if (run.source.length > 2000) return 'Zdroj hodnot může mít nejvýše 2 000 znaků.'
  return null
}
