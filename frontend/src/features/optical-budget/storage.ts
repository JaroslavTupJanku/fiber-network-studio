import type { Scenario } from './model'

export const storageKey = 'fiber-network-studio.optical-budget.v1'
export function parseScenario(raw: string): Scenario {
  const value = JSON.parse(raw)
  const text = (x: unknown) => typeof x === 'string' && x.length <= 2000
  const rows = (x: unknown) => Array.isArray(x) && x.length <= 100
  if (!value || value.version !== 1 || !['1310', '1550'].includes(value.wavelength)
    || !['name', 'reserve', 'limit1310', 'limit1550'].every(key => text(value[key]))
    || !rows(value.sections) || !rows(value.elements)
    || !value.sections.every((x: Record<string, unknown>) => x && ['id', 'name', 'lengthM', 'loss1310', 'loss1550', 'source'].every(key => text(x[key])))
    || !value.elements.every((x: Record<string, unknown>) => x && ['id', 'name', 'count', 'loss1310', 'loss1550'].every(key => text(x[key])) && ['splice', 'connection', 'splitter', 'other'].includes(String(x.kind)))
    || new Set([...value.sections, ...value.elements].map(x => x.id)).size !== value.sections.length + value.elements.length) {
    throw new Error('Uložený výpočet má neplatný formát.')
  }
  return value
}
