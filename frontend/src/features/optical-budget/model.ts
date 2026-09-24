export type Wavelength = '1310' | '1550'
export type Section = { id: string; name: string; lengthM: string; loss1310: string; loss1550: string; source: string }
export type Element = { id: string; kind: 'splice' | 'connection' | 'splitter' | 'other'; name: string; count: string; loss1310: string; loss1550: string }
export type Scenario = { version: 1; name: string; wavelength: Wavelength; sections: Section[]; elements: Element[];
  limit1310: string; limit1550: string; reserve: string }
export const kinds = { splice: 'Svar', connection: 'Konektorový spoj', splitter: 'Splitter', other: 'Jiný prvek' }
export const newSection = (): Section => ({ id: crypto.randomUUID(), name: '', lengthM: '', loss1310: '', loss1550: '', source: '' })
export const newElement = (): Element => ({ id: crypto.randomUUID(), kind: 'splice', name: '', count: '1', loss1310: '', loss1550: '' })
export const newScenario = (): Scenario => ({ version: 1, name: '', wavelength: '1310', sections: [newSection()], elements: [], limit1310: '', limit1550: '', reserve: '' })

export function hasScenarioContent(scenario: Scenario): boolean {
  return [scenario.name, scenario.reserve, scenario.limit1310, scenario.limit1550].some(value => value.trim() !== '')
    || scenario.elements.length > 0 || scenario.sections.length !== 1
    || scenario.sections.some(row => [row.name, row.lengthM, row.loss1310, row.loss1550, row.source].some(value => value.trim() !== ''))
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
  const lossKey = scenario.wavelength === '1310' ? 'loss1310' : 'loss1550'
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
  const limit = number(scenario.wavelength === '1310' ? scenario.limit1310 : scenario.limit1550)
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
