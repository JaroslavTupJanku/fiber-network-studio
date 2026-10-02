import type { NetworkPoint } from './networkPoints'
import type { OpticalSpliceDocument } from './opticalSplices'
import type { RouteInstallationDocument } from './routeInstallations'
import type { OpticalPath } from './traceOpticalPath'
import { routeCoordinates, routeLengthMeters, type UndergroundRoute } from './undergroundRoutes.ts'

export type ExportRow = Record<string, string | number | null>

const meters = (value: number | null | undefined) => value == null ? null : Math.round(value * 100) / 100

export function routeExportRows(route: UndergroundRoute, points: NetworkPoint[],
  installations: RouteInstallationDocument[]): ExportRow[] {
  const names = new Map(points.map(point => [point.id, point.name]))
  const coordinates = routeCoordinates(route, points)
  const mapLength = coordinates.length > 1 ? meters(routeLengthMeters(coordinates)) : null
  const items = installations.find(document => document.routeId === route.id)?.items ?? []
  const base = { 'Trasa': route.name, 'Od': names.get(route.startPointId) ?? 'Neznámý bod',
    'Do': names.get(route.endPointId) ?? 'Neznámý bod', 'Délka z mapy (m, přibližně)': mapLength }
  if (items.length === 0) return [{ ...base, 'Prvek': 'Bez evidovaného osazení', 'Druh': '',
    'Skutečná délka kabelu (m)': null }]
  return items.map(item => ({ ...base, 'Prvek': item.label,
    'Druh': item.cable ? 'Optický kabel' : item.duct ? 'Chránička / trubička' : 'Neznámý',
    'Katalog': item.cable?.name ?? item.duct?.name ?? '',
    'Skutečná délka kabelu (m)': item.cable ? meters(item.actualLengthMeters) : null }))
}

export function spliceExportRows(splice: OpticalSpliceDocument,
  installations: RouteInstallationDocument[], routes: UndergroundRoute[] = []): ExportRow[] {
  const routeNames = new Map(routes.map(route => [route.id, route.name]))
  const labels = new Map(installations.flatMap(document => document.items.map(item =>
    [item.id, `${item.label}${routeNames.has(document.routeId) ? ` · ${routeNames.get(document.routeId)}` : ''}`] as const)))
  return splice.connections.map(connection => ({
    'Spojka': splice.name, 'Typ': connection.kind === 'fusion' ? 'Svar' : 'Konektorové spojení',
    'První kabel': labels.get(connection.left.itemId) ?? 'Neznámý kabel',
    'První tuba': connection.left.tubeIndex + 1, 'První vlákno': connection.left.fiberIndex + 1,
    'Druhý kabel': labels.get(connection.right.itemId) ?? 'Neznámý kabel',
    'Druhá tuba': connection.right.tubeIndex + 1, 'Druhé vlákno': connection.right.fiberIndex + 1,
  }))
}

export function pathExportRows(path: OpticalPath): ExportRow[] {
  return path.steps.map((step, index) => ({ 'Pořadí': index + 1, 'Prvek': step.label,
    'Druh': step.kind, 'Délka (m)': meters(step.lengthMeters),
    'Počet': step.count ?? null, 'Zdroj údaje': step.source ?? '' }))
}

// Czech Excel recognizes semicolon-separated UTF-8 CSV with BOM. Guard cells against formulas.
export function toCzechCsv(rows: ExportRow[], columns: string[]): string {
  const cell = (value: string | number | null | undefined) => {
    const plain = value == null ? '' : typeof value === 'number' ? value.toLocaleString('cs-CZ', { useGrouping: false }) : value
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(plain) ? `'${plain}` : plain
    return `"${safe.replaceAll('"', '""')}"`
  }
  return `\uFEFF${[columns, ...rows.map(row => columns.map(column => row[column]))]
    .map(values => values.map(cell).join(';')).join('\r\n')}\r\n`
}
