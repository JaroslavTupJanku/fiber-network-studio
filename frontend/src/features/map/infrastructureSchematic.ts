import type { RouteInstallationDocument } from './routeInstallations'
import type { UndergroundRoute } from './undergroundRoutes'

export type InfrastructureLink = {
  routeId: string
  routeName: string
  otherPointId: string
  otherPointName: string
  cableRuns: number
  conduitRuns: number
}

export function infrastructureLinks(pointId: string, routes: UndergroundRoute[],
  installations: RouteInstallationDocument[], pointNames: Record<string, string>): InfrastructureLink[] {
  const byRoute = new Map(installations.map(document => [document.routeId, document.items]))
  return routes.filter(route => route.startPointId === pointId || route.endPointId === pointId)
    .map(route => {
      const otherPointId = route.startPointId === pointId ? route.endPointId : route.startPointId
      const items = byRoute.get(route.id) ?? []
      return {
        routeId: route.id, routeName: route.name, otherPointId,
        otherPointName: pointNames[otherPointId] ?? 'Neznámý bod',
        cableRuns: new Set(items.filter(item => item.cable !== null).map(item => item.runId)).size,
        conduitRuns: new Set(items.filter(item => item.duct !== null).map(item => item.runId)).size,
      }
    }).sort((a, b) => a.otherPointName.localeCompare(b.otherPointName, 'cs')
      || a.routeName.localeCompare(b.routeName, 'cs'))
}
