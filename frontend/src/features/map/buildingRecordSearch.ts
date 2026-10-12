export type BuildingRecord = {
  id: string; name: string; context: string; groupId: string; group: string
  floor?: number; status: string; tone?: 'ready' | 'pending'; detail?: string
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs')
export function findBuildingRecords(records: BuildingRecord[], query: string, filters: { group?: string; floor?: string; status?: string } = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  return records.filter(record => (!filters.group || record.groupId === filters.group)
    && (!filters.floor || String(record.floor) === filters.floor)
    && (!filters.status || record.status === filters.status)
    && terms.every(term => normalize(`${record.name} ${record.context} ${record.status} ${record.detail ?? ''}`).includes(term)))
}
