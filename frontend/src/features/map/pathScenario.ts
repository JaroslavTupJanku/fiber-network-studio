import { newElement, newScenario, newSection, type Scenario } from '../optical-budget/model.ts'
import type { RouteInstallationDocument } from './routeInstallations'
import type { OpticalPath } from './traceOpticalPath'

export function scenarioFromOpticalPath(path: OpticalPath,
  installations: RouteInstallationDocument[]): Scenario {
  const byId = new Map(installations.flatMap(document => document.items).map(item => [item.id, item]))
  const sections = path.steps.filter(step => step.kind === 'cable' && step.routeId && step.itemId)
    .map(step => {
      const item = byId.get(step.itemId!)
      return { ...newSection(), name: step.label, lengthM: item?.actualLengthMeters?.toString() ?? '',
        loss1310: item?.cable?.attenuation1310DbPerKm?.toString() ?? '',
        loss1550: item?.cable?.attenuation1550DbPerKm?.toString() ?? '',
        source: item?.cable ? `${item.cable.name} · ${item.actualLengthMeters ? 'délka z evidence instalace' : 'délku doplňte podle instalace'}` : '' }
    })
  const elements = path.steps.filter(step => step.kind !== 'cable').map(step => ({ ...newElement(),
    kind: step.kind === 'splice' ? 'splice' as const : step.kind === 'connector' ? 'connection' as const : 'other' as const,
    name: step.label, count: step.kind === 'patch' ? '2' : '1' }))
  return { ...newScenario(), name: 'Cesta z mapy', sections: sections.length ? sections : [newSection()], elements }
}
