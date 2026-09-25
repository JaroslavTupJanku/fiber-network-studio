import { equipmentStorageKey, type EquipmentCatalog } from './equipment.ts'

export function saveEquipmentCatalog(storage: Pick<Storage, 'setItem'>, catalog: EquipmentCatalog): boolean {
  try {
    storage.setItem(equipmentStorageKey, JSON.stringify(catalog))
    return true
  } catch {
    return false
  }
}
