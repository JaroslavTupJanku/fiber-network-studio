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
  const elements = path.steps.filter(step => step.kind !== 'cable' && step.kind !== 'premise').map(step => ({ ...newElement(),
    kind: step.kind === 'splice' ? 'splice' as const : step.kind === 'connector' ? 'connection' as const
      : step.kind === 'splitter' ? 'splitter' as const : 'other' as const,
    name: step.label, count: step.kind === 'patch' ? '2' : '1', source: step.source ?? '',
    loss1270: step.losses?.loss1270Db?.toString() ?? '',
    loss1310: step.losses?.loss1310Db?.toString() ?? '',
    loss1490: step.losses?.loss1490Db?.toString() ?? '',
    loss1550: step.losses?.loss1550Db?.toString() ?? '',
    loss1577: step.losses?.loss1577Db?.toString() ?? '' }))
  if (path.endPremiseId) elements.push({ ...newElement(), kind: 'other',
    name: 'Vnitřní kabeláž k HP (zatím neevidovaná)', count: '1', source: 'Délka a útlum v budově nejsou v evidenci.',
    loss1270: '', loss1310: '', loss1490: '', loss1550: '', loss1577: '' })
  return { ...newScenario(), name: path.endPremiseId ? 'Cesta k HP z mapy' : 'Cesta z mapy',
    sections: sections.length ? sections : [newSection()], elements }
}
