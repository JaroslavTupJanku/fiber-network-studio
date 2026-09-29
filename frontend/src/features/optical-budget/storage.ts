import type { Scenario } from './model'

export const storageKey = 'fiber-network-studio.optical-budget.v1'
export function parseScenario(raw: string): Scenario {
  let value = JSON.parse(raw)
  // Version 1 only knew 1310/1550. Preserve those inputs as manual calculations.
  if (value?.version === 1) {
    const extend = (rows: unknown) => Array.isArray(rows) ? rows.map(row => row && typeof row === 'object'
      ? { ...row, loss1270: '', loss1490: '', loss1577: '' } : row) : rows
    value = { ...value, version: 2, technology: 'manual', limit1270: '', limit1490: '', limit1577: '',
      ponLimits: { gpon: { upstream: '', downstream: '' }, xgspon: { upstream: '', downstream: '' } },
      sections: extend(value.sections), elements: extend(value.elements) }
  }
  const text = (x: unknown) => typeof x === 'string' && x.length <= 2000
  const rows = (x: unknown) => Array.isArray(x) && x.length <= 100
  const lossKeys = ['loss1270', 'loss1310', 'loss1490', 'loss1550', 'loss1577']
  if (!value || value.version !== 2 || !['manual', 'gpon', 'xgspon'].includes(value.technology)
    || !['1270', '1310', '1490', '1550', '1577'].includes(value.wavelength)
    || (value.technology === 'gpon' && !['1490', '1310'].includes(value.wavelength))
    || (value.technology === 'xgspon' && !['1577', '1270'].includes(value.wavelength))
    || !['name', 'reserve', 'limit1270', 'limit1310', 'limit1490', 'limit1550', 'limit1577'].every(key => text(value[key]))
    || !['gpon', 'xgspon'].every(technology => value.ponLimits?.[technology] && ['upstream', 'downstream'].every(direction => text(value.ponLimits[technology][direction])))
    || (value.equipment !== undefined && (!value.equipment || !['oltId', 'onuId', 'oltModuleId', 'onuModuleId'].every(key => text(value.equipment[key]))))
    || !rows(value.sections) || !rows(value.elements)
    || !value.sections.every((x: Record<string, unknown>) => x && ['id', 'name', 'lengthM', ...lossKeys, 'source'].every(key => text(x[key])))
    || !value.elements.every((x: Record<string, unknown>) => x && ['id', 'name', 'count', ...lossKeys].every(key => text(x[key]))
      && (x.source === undefined || text(x.source)) && ['splice', 'connection', 'splitter', 'other'].includes(String(x.kind)))
    || new Set([...value.sections, ...value.elements].map(x => x.id)).size !== value.sections.length + value.elements.length) {
    throw new Error('Uložený výpočet má neplatný formát.')
  }
  return value
}
