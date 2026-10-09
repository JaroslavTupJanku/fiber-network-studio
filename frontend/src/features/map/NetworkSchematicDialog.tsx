import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, Cable, House, Network, X } from 'lucide-react'
import { layoutScheme, opticalScheme, physicalScheme, schemeComponents } from './networkSchematic'
import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import { listRouteInstallations, type RouteInstallationDocument } from './routeInstallations'
import { listBuildingEquipment, type BuildingEquipmentDocument } from './buildingEquipment'
import { listOpticalSplices, type OpticalSpliceDocument } from './opticalSplices'
import { listBuildingDistribution, type BuildingDistributionDocument } from './buildingDistribution'

export function NetworkSchematicDialog({ open, points, routes, installations, equipment, splices, distributions, onClose, onOpenPoint, onOpenRoute }: {
  open: boolean
  points: NetworkPoint[]; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  equipment: BuildingEquipmentDocument[]; splices: OpticalSpliceDocument[]; distributions: BuildingDistributionDocument[]
  onClose: () => void; onOpenPoint: (id: string) => void; onOpenRoute: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'physical' | 'optical'>('physical')
  const [component, setComponent] = useState('all')
  const [zoom, setZoom] = useState(1)
  const [includeFree, setIncludeFree] = useState(false)
  const [snapshot, setSnapshot] = useState<{ equipment: BuildingEquipmentDocument[]; splices: OpticalSpliceDocument[]; distributions: BuildingDistributionDocument[]; installations: RouteInstallationDocument[] } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const full = useMemo(() => mode === 'physical' ? physicalScheme(points, routes, snapshot?.installations ?? installations)
    : opticalScheme(points, routes, snapshot?.installations ?? installations, snapshot?.equipment ?? equipment, snapshot?.splices ?? splices, snapshot?.distributions ?? distributions), [mode, points, routes, installations, equipment, splices, distributions, snapshot])
  const visible = useMemo(() => {
    if (mode === 'physical' || includeFree) return full
    const retained = new Set(schemeComponents(full).flatMap(ids => {
      const set = new Set(ids)
      return ids.some(id => !id.startsWith('fiber:')) || full.edges.some(edge => set.has(edge.from) && edge.kind !== 'cable') ? ids : []
    }))
    return { nodes: full.nodes.filter(node => retained.has(node.id)), edges: full.edges.filter(edge => retained.has(edge.from)) }
  }, [full, mode, includeFree])
  const components = useMemo(() => schemeComponents(visible), [visible])
  const scheme = useMemo(() => {
    const selected = component === 'all' ? null : new Set(components[Number(component)] ?? [])
    return selected ? { nodes: visible.nodes.filter(node => selected.has(node.id)), edges: visible.edges.filter(edge => selected.has(edge.from) && selected.has(edge.to)) } : visible
  }, [visible, component, components])
  const layout = useMemo(() => layoutScheme(scheme), [scheme])
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  useEffect(() => {
    if (!open) return
    let live = true
    Promise.all([listBuildingEquipment(), listOpticalSplices(), listBuildingDistribution(), listRouteInstallations()])
      .then(([equipment, splices, distributions, installations]) => { if (live) { setSnapshot({ equipment, splices, distributions, installations }); setLoadError('') } })
      .catch(reason => { if (live) setLoadError(reason instanceof Error ? reason.message : 'Zapojení se nenačetlo.') })
    return () => { live = false }
  }, [open, retry])
  const fit = () => { if (canvas.current) { setZoom(Math.max(0.25, Math.min(1, (canvas.current.clientWidth - 15) / layout.width, (canvas.current.clientHeight - 15) / layout.height))); canvas.current.scrollTo(0, 0) } }
  return createPortal(<dialog ref={dialog} className="network-scheme-dialog" onCancel={onClose}>
    <header><div><span className="scheme-eyebrow">PŘEHLED PROPOJENÍ</span><h2>Schéma sítě</h2><p>Od páteřní sítě až k přípojce. Vyberte objekt a pokračujte na mapě.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít schéma"><X /></button></header>
    <div className="network-scheme-controls">
      <div className="scheme-view-switch" role="group" aria-label="Pohled na síť"><button type="button" aria-pressed={mode === 'physical'} onClick={() => { setMode('physical'); setComponent('all') }}>Body a trasy</button><button type="button" aria-pressed={mode === 'optical'} onClick={() => { setMode('optical'); setComponent('all') }}>Optické propojení</button></div>
      <label>Zobrazená část <select value={component} onChange={event => { setComponent(event.target.value); if (canvas.current) canvas.current.scrollTo(0, 0) }}><option value="all">Celá síť ({components.length} oddělených částí)</option>{components.map((ids, index) => <option key={index} value={index}>Část {index + 1}: {full.nodes.find(node => node.id === ids[0])?.label} ({ids.length} prvků)</option>)}</select></label>
      <label>Přiblížení <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, zoom])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{Math.round(value * 100)} %</option>)}</select></label>
      <button type="button" onClick={() => { setZoom(1); setComponent('all'); canvas.current?.scrollTo(0, 0) }}>Na přehled</button>
      <button type="button" onClick={fit}>Přizpůsobit oknu</button>
      {mode === 'optical' && <label><span><input type="checkbox" checked={includeFree} onChange={event => { setIncludeFree(event.target.checked); setComponent('all') }} /> Zobrazit i nezapojená vlákna</span></label>}
    </div>
    <p className="network-scheme-help">{mode === 'physical' ? 'Čára znamená trasu mezi body. Sama nepotvrzuje propojení vláken.' : 'Každé vlákno má vlastní spojení. Oddělené části nejsou opticky propojené; krajní vlákno může být otevřené. Připravené porty a přípojky bez zapojení stojí samostatně.'}</p>
    {loadError ? <div className="panel-error" role="alert">{loadError}<button type="button" onClick={() => setRetry(value => value + 1)}>Načíst znovu</button></div> : !snapshot ? <p role="status">Načítám zapojení sítě…</p> : !scheme.nodes.length ? <p className="equipment-empty">{mode === 'physical' ? 'Síť je zatím prázdná. Přidejte body a trasy na mapě.' : includeFree ? 'Zatím nejsou evidovaná vlákna ani porty. Nejprve osaďte kabely nebo optické vybavení.' : 'Zatím nejsou evidovaná propojení. Volné kabely zobrazíte volbou „Zobrazit i nezapojená vlákna“.'}</p> : <div ref={canvas} className="network-scheme-canvas"
      onPointerDown={event => { if (event.target !== event.currentTarget && (event.target as Element).tagName !== 'svg') return; drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (drag.current) { event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.x; event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.y } }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label={mode === 'physical' ? 'Schéma bodů a tras' : 'Schéma optických propojení'}>
        {scheme.edges.map(edge => {
          const a = layout.positions.get(edge.from), b = layout.positions.get(edge.to)
          if (!a || !b) return null
          const vertical = Math.abs(a.x - b.x) < 50
          const forward = b.x > a.x
          const x1 = vertical ? a.x + 125 : a.x + (forward ? 250 : 0)
          const x2 = vertical ? b.x + 125 : b.x + (forward ? 0 : 250)
          const y1 = vertical ? a.y + (b.y > a.y ? 104 : 0) : a.y + 52
          const y2 = vertical ? b.y + (b.y > a.y ? 0 : 104) : b.y + 52
          const d = vertical ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`
          const label = edge.kind === 'patch' ? 'Propojka' : edge.kind === 'connector' ? 'Ukončení'
            : edge.kind === 'splitter' ? 'Splitter' : edge.kind === 'splice' ? 'Spoj' : edge.routeId ? 'Kabel' : 'Propojení'
          return <g key={edge.id} className={`scheme-edge ${edge.kind === 'splitter' ? 'splitter' : ''} ${edge.routeId ? 'clickable' : ''}`}
            aria-label={edge.label} onClick={() => edge.routeId && onOpenRoute(edge.routeId)}
            role={edge.routeId ? 'button' : undefined} tabIndex={edge.routeId ? 0 : undefined}
            onKeyDown={event => { if (edge.routeId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenRoute(edge.routeId) } }}>
            <title>{edge.label}</title><path className="scheme-edge-hit" d={d} /><path className="scheme-edge-line" d={d} />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 9} textAnchor="middle">{mode === 'physical' ? 'Trasa' : label}</text>
          </g>
        })}
        {scheme.nodes.map(node => {
          const pos = layout.positions.get(node.id)!
          const kind = node.id.startsWith('fiber:') ? 'fiber' : node.id.startsWith('port:') ? 'port'
            : node.id.startsWith('premise:') ? 'premise' : 'point'
          const Icon = kind === 'fiber' ? Cable : kind === 'port' ? Network : kind === 'premise' ? House : Box
          const caption = kind === 'fiber' ? 'Optické vlákno' : kind === 'port' ? 'Optický port' : kind === 'premise' ? 'Přípojné místo' : node.detail
          return <g key={node.id} transform={`translate(${pos.x},${pos.y})`} className={`scheme-node scheme-node-${kind}`}
            role={node.pointId ? 'button' : undefined} tabIndex={node.pointId ? 0 : undefined} aria-label={`${node.label} · ${node.detail}`}
            onClick={() => node.pointId && onOpenPoint(node.pointId)}
            onKeyDown={event => { if (node.pointId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenPoint(node.pointId) } }}>
            <title>{node.label} · {node.detail}</title>
            <foreignObject width="250" height="104"><div className="scheme-card">
              <div className="scheme-card-type"><span className="scheme-card-icon"><Icon size={15} /></span>{caption}</div>
              <strong>{node.label}</strong><span className="scheme-card-detail">{node.detail}</span>
            </div></foreignObject>
          </g>
        })}
      </svg>
    </div>}
    <footer className="scheme-footer"><span><i /> {scheme.nodes.length} prvků · {scheme.edges.length} spojení</span><span>Posun tažením · kliknutí otevře objekt na mapě</span></footer>
  </dialog>, document.body)
}
