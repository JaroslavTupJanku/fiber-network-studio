import type { CableSpecification } from '../cable-catalog/model'
import type { DuctType } from '../duct-catalog/model'
import type { UndergroundRoute } from './undergroundRoutes'

export type InstalledItem = {
  id: string
  routeId: string
  parentId: string | null
  slotIndex: number | null
  label: string
  catalogId: string
  runId: string
  duct: DuctType | null
  cable: CableSpecification | null
}

export type RouteInstallationDocument = { routeId: string; version: number; items: InstalledItem[] }
export type InstallationStatus = 'empty' | 'ducts' | 'cables'
export type InstallationSummary = { status: InstallationStatus; ducts: number; cables: number; items: number }

export function installationSummary(document?: RouteInstallationDocument): InstallationSummary {
  const items = document?.items ?? []
  const cables = items.filter(item => item.cable !== null).length
  const ducts = items.length - cables
  return { status: cables ? 'cables' : ducts ? 'ducts' : 'empty', ducts, cables, items: items.length }
}
export type InstallationAdd = {
  catalogId: string | null
  parentId: string | null
  slotIndex: number | null
  label: string
  version: number
  continueFromItemId: string | null
}

export const emptyInstallation = (routeId: string): RouteInstallationDocument => ({ routeId, version: 0, items: [] })

export function shareRouteEndpoint(a: UndergroundRoute, b: UndergroundRoute): boolean {
  return a.startPointId === b.startPointId || a.startPointId === b.endPointId
    || a.endPointId === b.startPointId || a.endPointId === b.endPointId
}

export function installationContinuations(route: UndergroundRoute, routes: UndergroundRoute[],
  documents: RouteInstallationDocument[]): InstalledItem[] {
  const adjacent = new Set(routes.filter(item => item.id !== route.id && shareRouteEndpoint(route, item)).map(item => item.id))
  const usedRuns = new Set(documents.find(item => item.routeId === route.id)?.items.map(item => item.runId) ?? [])
  const seen = new Set<string>()
  return documents.flatMap(document => document.items).filter(item => {
    if (!adjacent.has(item.routeId) || usedRuns.has(item.runId) || seen.has(item.runId)) return false
    seen.add(item.runId)
    return true
  })
}

export type FitStatus = 'unknown' | 'possible' | 'too-small'
export function installationFit(item: Pick<InstalledItem, 'duct' | 'cable'>,
  parent: Pick<InstalledItem, 'duct'> | null, slotIndex: number | null,
  siblings: Pick<InstalledItem, 'duct' | 'cable'>[] = []): FitStatus {
  if (!parent?.duct) return 'unknown'
  const inner = parent.duct.kind === 'assembly'
    ? slotIndex === null ? null : parent.duct.slots[slotIndex]?.innerDiameterMm ?? null
    : parent.duct.innerDiameterMm
  if (inner === null) return 'unknown'
  if (parent.duct.kind === 'conduit' && item.duct && siblings.some(other => other.duct)) {
    const diameters = [item.duct.outerDiameterMm, ...siblings.map(other => other.duct?.outerDiameterMm ?? null)]
    if (diameters.every((value): value is number => value !== null)
      && diameters.reduce((sum, value) => sum + value * value, 0) >= inner * inner) return 'too-small'
    return 'unknown'
  }
  if (item.duct) return item.duct.outerDiameterMm === null ? 'unknown'
    : item.duct.outerDiameterMm < inner ? 'possible' : 'too-small'
  if (!item.cable) return 'unknown'
  const required = item.cable.minimumDuctInnerDiameterMm ?? item.cable.outerDiameterMm
  if (required === null) return 'unknown'
  return item.cable.minimumDuctInnerDiameterMm !== null
    ? inner >= required ? 'possible' : 'too-small'
    : inner > required ? 'possible' : 'too-small'
}

export function canPlaceItem(parent: InstalledItem | null, items: InstalledItem[],
  candidate: Pick<InstalledItem, 'duct' | 'cable'>, slotIndex: number | null): boolean {
  if (!parent) return candidate.duct !== null
  if (!parent.duct) return false
  const children = items.filter(item => item.parentId === parent.id)
  if (parent.duct.kind === 'assembly') return candidate.duct !== null && slotIndex !== null
    && parent.duct.slots[slotIndex]?.kind === candidate.duct.kind
    && !children.some(item => item.slotIndex === slotIndex)
  if (slotIndex !== null) return false
  if (parent.duct.kind === 'microduct') return candidate.cable !== null && children.length === 0
  return candidate.cable !== null ? children.length === 0
    : candidate.duct?.kind !== 'conduit' && !children.some(item => item.cable !== null)
}

export function hasAvailablePlacement(item: InstalledItem, items: InstalledItem[]): boolean {
  if (!item.duct) return false
  const children = items.filter(child => child.parentId === item.id)
  if (item.duct.kind === 'assembly') return item.duct.slots.some((_, index) =>
    !children.some(child => child.slotIndex === index))
  if (item.duct.kind === 'microduct') return children.length === 0
  return !children.some(child => child.cable !== null)
}

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/route-installations${path}`, options)
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.error ?? `Osazení se nepodařilo načíst nebo uložit (${response.status}).`)
  }
  return response.json()
}

const json = (value: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
export const listRouteInstallations = (signal?: AbortSignal) => request<RouteInstallationDocument[]>('', { signal })
export const addInstalledItem = (routeId: string, input: InstallationAdd) =>
  request<RouteInstallationDocument>(`/${routeId}/items`, { method: 'POST', ...json(input) })
export const renameInstalledItem = (routeId: string, id: string, label: string, version: number) =>
  request<RouteInstallationDocument>(`/${routeId}/items/${id}`, { method: 'PUT', ...json({ label, version }) })
export const removeInstalledItem = (routeId: string, id: string, version: number) =>
  request<RouteInstallationDocument>(`/${routeId}/items/${id}?version=${version}`, { method: 'DELETE' })
