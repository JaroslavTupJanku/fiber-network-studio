export const wavelengths = ['1270', '1310', '1490', '1550', '1577'] as const
export type Wavelength = typeof wavelengths[number]
export type Technology = 'manual' | 'gpon' | 'xgspon'
type Losses = { loss1270: string; loss1310: string; loss1490: string; loss1550: string; loss1577: string }
export type Section = Losses & { id: string; name: string; lengthM: string; source: string }
export type Element = Losses & { id: string; kind: 'splice' | 'connection' | 'splitter' | 'other'; name: string; count: string; source?: string }
export type Scenario = { version: 2; name: string; technology: Technology; wavelength: Wavelength; sections: Section[]; elements: Element[];
  equipment?: { oltId: string; onuId: string; oltModuleId: string; onuModuleId: string };
  limit1310: string; limit1550: string; reserve: string; limit1270: string; limit1490: string; limit1577: string;
  ponLimits: { gpon: { upstream: string; downstream: string }; xgspon: { upstream: string; downstream: string } } }
export const technologies = { manual: 'Vlastní nastavení', gpon: 'GPON', xgspon: 'XGS-PON · základní pásmo' }
export const ponWavelengths = { gpon: { downstream: '1490', upstream: '1310' }, xgspon: { downstream: '1577', upstream: '1270' } } as const
export const emptyLosses: Losses = { loss1270: '', loss1310: '', loss1490: '', loss1550: '', loss1577: '' }
export const emptyPonLimits = () => ({ gpon: { upstream: '', downstream: '' }, xgspon: { upstream: '', downstream: '' } })
export const lossKeyFor = (wavelength: Wavelength): keyof Losses => `loss${wavelength}`
export const limitKeyFor = (wavelength: Wavelength) => `limit${wavelength}` as const
export const directionFor = (scenario: Scenario) => scenario.technology === 'manual' ? null
  : scenario.wavelength === ponWavelengths[scenario.technology].downstream ? 'downstream' : 'upstream'
export function changeTechnology(scenario: Scenario, technology: Technology): Scenario {
  const direction = directionFor(scenario) ?? 'downstream'
  return { ...scenario, technology, wavelength: technology === 'manual' ? scenario.wavelength : ponWavelengths[technology][direction] }
}
export const limitFor = (scenario: Scenario) => scenario.technology === 'manual' ? scenario[limitKeyFor(scenario.wavelength)]
  : scenario.ponLimits[scenario.technology][directionFor(scenario)!]
export function changeLimit(scenario: Scenario, value: string): Scenario {
  if (scenario.technology === 'manual') return { ...scenario, [limitKeyFor(scenario.wavelength)]: value }
  return { ...scenario, ponLimits: { ...scenario.ponLimits, [scenario.technology]: { ...scenario.ponLimits[scenario.technology], [directionFor(scenario)!]: value } } }
}
export const directionLabel = (scenario: Scenario) => scenario.technology === 'manual' ? 'Vlastní vlnová délka'
  : directionFor(scenario) === 'downstream' ? 'K zákazníkovi · OLT → ONT' : 'Od zákazníka · ONT → OLT'
export const kinds = { splice: 'Svar', connection: 'Konektorový spoj', splitter: 'Splitter', other: 'Jiný prvek' }
export const newSection = (): Section => ({ ...emptyLosses, id: crypto.randomUUID(), name: '', lengthM: '', source: '' })
export const newElement = (): Element => ({ ...emptyLosses, id: crypto.randomUUID(), kind: 'splice', name: '', count: '1' })
export const newScenario = (): Scenario => ({ version: 2, technology: 'manual', name: '', wavelength: '1310', sections: [newSection()], elements: [], limit1310: '', limit1550: '', limit1270: '', limit1490: '', limit1577: '', reserve: '', ponLimits: emptyPonLimits() })

export function hasScenarioContent(scenario: Scenario): boolean {
  return [scenario.name, scenario.reserve, ...Object.values(scenario.equipment ?? {}), ...wavelengths.map(wave => scenario[limitKeyFor(wave)]), ...Object.values(scenario.ponLimits).flatMap(value => Object.values(value))].some(value => value.trim() !== '')
    || scenario.elements.length > 0 || scenario.sections.length !== 1
    || scenario.sections.some(row => [row.name, row.lengthM, ...wavelengths.map(wave => row[lossKeyFor(wave)]), row.source].some(value => value.trim() !== ''))
}

// Keep input text until calculation so blank, invalid and explicit zero remain distinct.
export function number(value: string): number | null {
  const text = value.trim().replace(',', '.')
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null
  const result = Number(text)
  return Number.isFinite(result) && result >= 0 ? result : null
}
export function calculate(scenario: Scenario) {
  const errors: string[] = []
  const lossKey = lossKeyFor(scenario.wavelength)
  if (scenario.technology !== 'manual' && !Object.values(ponWavelengths[scenario.technology]).some(wave => wave === scenario.wavelength)) errors.push('Vlnová délka neodpovídá zvolené technologii.')
  const rows: { id: string; name: string; loss: number | null; category: 'fiber' | 'element' }[] = []
  if (!scenario.sections.length) errors.push('Přidejte alespoň jeden kabelový úsek.')
  scenario.sections.forEach((section, index) => {
    const name = section.name.trim() || `Úsek ${index + 1}`
    const length = number(section.lengthM), rate = number(section[lossKey])
    const loss = length !== null && length > 0 && rate !== null ? length / 1000 * rate : null
    if (loss === null || !Number.isFinite(loss)) errors.push(`${name}: doplňte kladnou délku a nezáporný útlum pro ${scenario.wavelength} nm.`)
    rows.push({ id: section.id, name, loss: loss !== null && Number.isFinite(loss) ? loss : null, category: 'fiber' })
  })
  scenario.elements.forEach((element, index) => {
    const name = element.name.trim() || `${kinds[element.kind]} ${index + 1}`
    const count = number(element.count), rate = number(element[lossKey])
    const loss = count !== null && Number.isSafeInteger(count) && count > 0 && rate !== null ? count * rate : null
    if (loss === null || !Number.isFinite(loss)) errors.push(`${name}: doplňte kladný celý počet a ztrátu pro ${scenario.wavelength} nm.`)
    rows.push({ id: element.id, name, loss: loss !== null && Number.isFinite(loss) ? loss : null, category: 'element' })
  })
  const sum = rows.reduce((total, row) => total + (row.loss ?? 0), 0)
  if (!Number.isFinite(sum)) errors.push('Součet je příliš velký. Zkontrolujte vstupy.')
  const total = errors.length ? null : sum
  const limit = number(limitFor(scenario))
  const reserve = number(scenario.reserve)
  const margin = total !== null && limit !== null && reserve !== null ? limit - total - reserve : null
  return { rows, errors, total, limit, reserve, margin,
    verdict: margin === null ? 'unknown' : margin < -1e-9 ? 'fail' : Math.abs(margin) <= 1e-9 ? 'boundary' : 'pass' }
}

export function demoScenario(): Scenario {
  return { ...newScenario(), name: 'Ukázka · 2 km a šest spojů', reserve: '1', limit1310: '3', limit1550: '3',
    sections: [{ ...newSection(), name: 'Ukázkový kabel', lengthM: '2000', loss1310: '0,3', loss1550: '0,2', source: 'Ilustrační hodnoty, nikoli specifikace výrobku.' }],
    elements: [{ ...newElement(), count: '4', loss1310: '0,1', loss1550: '0,1' },
      { ...newElement(), kind: 'connection', count: '2', loss1310: '0,3', loss1550: '0,3' }] }
}
