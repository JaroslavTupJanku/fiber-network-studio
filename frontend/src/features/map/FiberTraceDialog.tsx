import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import type { RouteInstallationDocument } from './routeInstallations'
import { listBuildingEquipment, type BuildingEquipmentDocument } from './buildingEquipment'
import { listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'
import { listOpticalSplices, type OpticalSpliceDocument } from './opticalSplices'
import { loadFiberAllocations, type FiberAllocationDocument } from './fiberAllocations'
import { traceFiberPath, type OpticalPath } from './traceOpticalPath'
import { OpticalPathSteps } from './OpticalPathSteps'
import { pathExportRows, toCzechCsv } from './networkExports'
import { listColorCodes } from '../cable-catalog/api'
import { colorName, markingLabel, type ColorCodeData } from '../cable-catalog/model'

export function FiberTraceDialog({ points, routes, installations, initialRouteId, initialPointId, onClose, onTrace, onViewMap, onOpenRoute }: {
  points: NetworkPoint[]; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  initialRouteId?: string; initialPointId?: string
  onClose: () => void; onTrace: (path: OpticalPath | null) => void; onViewMap: () => void; onOpenRoute: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [data, setData] = useState<{ equipment: BuildingEquipmentDocument[]; splices: OpticalSpliceDocument[]; distributions: BuildingDistributionDocument[]; allocations: FiberAllocationDocument; colorCodes: ColorCodeData } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const available = useMemo(() => installations.flatMap(doc => doc.items).filter(item => item.cable
    && (!initialRouteId || item.routeId === initialRouteId)
    && (!initialPointId || routes.some(route => route.id === item.routeId && (route.startPointId === initialPointId || route.endPointId === initialPointId)))), [installations, initialRouteId, initialPointId, routes])
  const [itemId, setItemId] = useState(available[0]?.id ?? '')
  const [fiber, setFiber] = useState('0:0')
  const [direction, setDirection] = useState<'start' | 'end'>('start')
  const [outputs, setOutputs] = useState<Record<string, number>>({})
  const cable = available.find(item => item.id === itemId)
  const route = routes.find(route => route.id === cable?.routeId)
  const name = (id?: string | null) => points.find(point => point.id === id)?.name ?? 'Bod sítě'
  const [tubeIndex, fiberIndex] = fiber.split(':').map(Number)
  const path = useMemo(() => data && cable && route ? traceFiberPath(direction === 'start' ? route.startPointId : route.endPointId,
    cable.id, tubeIndex, fiberIndex, data.equipment, routes, installations, data.splices, outputs, data.distributions) : null,
  [data, cable, route, direction, tubeIndex, fiberIndex, routes, installations, outputs])
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    let live = true
    Promise.all([listBuildingEquipment(), listOpticalSplices(), listBuildingDistribution(), loadFiberAllocations(), listColorCodes()])
      .then(([equipment, splices, distributions, allocations, colorCodes]) => { if (live) { setData({ equipment, splices, distributions, allocations, colorCodes }); setError('') } })
      .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'Síť se nenačetla.') })
    return () => { live = false }
  }, [retry])
  useEffect(() => { onTrace(path) }, [path, onTrace])
  const resetSelection = () => { setOutputs({}); onTrace(null) }
  const exportPath = () => {
    if (!path) return
    const rows = pathExportRows(path), csv = toCzechCsv(rows, Object.keys(rows[0] ?? {}))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'sledovane-vlakno.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return createPortal(<dialog ref={dialog} className="fiber-trace-dialog" onCancel={onClose}>
    <header><div><h2>Sledovat vlákno</h2><p>Sledujete uložené zapojení. Vyberte kabel, vlákno a směr po kabelu.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít trasování"><X /></button></header>
    {error ? <div className="panel-error" role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>Načíst znovu</button></div> : !data ? <p role="status">Načítám zapojení sítě…</p> : !available.length ? <p className="equipment-empty">Zatím tu není kabel. Nejprve osaďte navazující trasu.</p> : <>
      <div className="fiber-trace-fields"><label>Kabel <select value={itemId} onChange={event => { setItemId(event.target.value); setFiber('0:0'); resetSelection() }}>{available.map(item => <option key={item.id} value={item.id}>{item.label} · {routes.find(route => route.id === item.routeId)?.name}</option>)}</select></label>
        <label>Tuba a vlákno <select value={fiber} onChange={event => { setFiber(event.target.value); resetSelection() }}>{cable?.cable?.tubes.flatMap((tube, ti) => tube.fibers.map((f, fi) => <option key={`${ti}:${fi}`} value={`${ti}:${fi}`}>{tube.name} · vlákno {fi + 1} · {f.name} · {colorName(f, data.colorCodes)}{f.marking !== 'none' ? ` · ${markingLabel(f, data.colorCodes)}` : ''}</option>))}</select></label>
        <label>Směr po kabelu <select value={direction} onChange={event => { setDirection(event.target.value as 'start' | 'end'); resetSelection() }}><option value="start">Od {name(route?.startPointId)} k {name(route?.endPointId)}</option><option value="end">Od {name(route?.endPointId)} k {name(route?.startPointId)}</option></select></label>
      </div>
      <p className="equipment-note">Pro dohledání opačného konce změňte směr. Propojení ani rezervace se tím nemění.</p>
      {path && <section aria-live="polite"><h3>{path.status === 'connected' ? 'Dohledáno ke koncovému místu' : path.status === 'ambiguous' ? 'Je potřeba upřesnit cestu' : 'Otevřený konec'}</h3><p>{path.message}{path.endPointId ? ` Bod: ${name(path.endPointId)}.` : ''}</p>
        {[...new Set(path.branchChoices.map(branch => branch.splitterId))].map((splitterId, index) => <label key={splitterId}>Větev splitteru {index + 1} <select value={outputs[splitterId] ?? ''} onChange={event => setOutputs(current => ({ ...current, [splitterId]: Number(event.target.value) }))}><option value="">Vyberte výstup</option>{path.branchChoices.filter(branch => branch.splitterId === splitterId).map(branch => <option key={branch.position} value={branch.position}>{branch.label}</option>)}</select></label>)}
        <OpticalPathSteps path={path} allocations={data.allocations} onOpenRoute={onOpenRoute} />
        <div className="network-scheme-controls"><button type="button" className="move-button" onClick={onViewMap}>Zobrazit cestu na mapě</button><button type="button" className="move-button" disabled={!path.steps.length} onClick={exportPath}>Exportovat cestu CSV</button><button type="button" className="move-button" onClick={() => onTrace(null)}>Zrušit zvýraznění</button></div>
      </section>}
    </>}
  </dialog>, document.body)
}
