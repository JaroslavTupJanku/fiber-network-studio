import type { BuildingEquipmentDocument, EquipmentPort } from './buildingEquipment'

export function countCzech(count: number, one: string, few: string, many: string): string {
  const form = count === 1 ? one : count >= 2 && count <= 4 ? few : many
  return `${count} ${form}`
}

export function portLocation(document: BuildingEquipmentDocument, port: EquipmentPort): string {
  const card = document.cards.find(item => item.id === port.parentId)
  const shelf = document.shelves.find(item => item.id === (card?.shelfId ?? port.parentId))
  const rack = document.racks.find(item => item.id === shelf?.rackId)
  return [rack?.name, shelf ? `${shelf.kind.toUpperCase()} ${shelf.name}` : null,
    card?.name, `${port.label} (pozice ${port.position})`].filter(Boolean).join(' / ')
}
