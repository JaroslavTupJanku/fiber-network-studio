import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Box, Cable, Crosshair, House, Maximize2, MousePointer2, Network, Printer, Route, X } from 'lucide-react'
import { useOpticalSnapshot } from './useOpticalSnapshot'
import { layoutScheme, opticalScheme, physicalScheme, schemeComponents, visibleOpticalScheme, type SchemeView } from './networkSchematic'
import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import { type RouteInstallationDocument } from './routeInstallations'
import { type BuildingEquipmentDocument } from './buildingEquipment'
import { type OpticalSpliceDocument } from './opticalSplices'
import { type BuildingDistributionDocument } from './buildingDistribution'

export function NetworkSchematicDialog({ open, points, routes, installations, equipment, splices, distributions, onClose, onOpenPoint, onOpenRoute, onMovePoint, onEditRoute, onPrint }: {
  open: boolean
  points: NetworkPoint[]; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  equipment: BuildingEquipmentDocument[]; splices: OpticalSpliceDocument[]; distributions: BuildingDistributionDocument[]
  onMovePoint: (id: string) => void; onEditRoute: (id: string) => void
  onPrint: (view: SchemeView) => void; onClose: () => void; onOpenPoint: (id: string) => void; onOpenRoute: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'physical' | 'optical'>('physical')
  const [component, setComponent] = useState('all')
  const [zoom, setZoom] = useState(1)
  const [includeFree, setIncludeFree] = useState(false)
  const [selected, setSelected] = useState<{ id: string; label: string; detail: string; pointId?: string; routeId?: string } | null>(null)
  const { snapshot, error: loadError, retry } = useOpticalSnapshot(open)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const full = useMemo(() => mode === 'physical' ? physicalScheme(points, routes, snapshot?.installations ?? installations)
    : opticalScheme(points, routes, snapshot?.installations ?? installations, snapshot?.equipment ?? equipment, snapshot?.splices ?? splices, snapshot?.distributions ?? distributions, snapshot?.allocations), [mode, points, routes, installations, equipment, splices, distributions, snapshot])
  const visible = useMemo(() => mode === 'physical' ? full : visibleOpticalScheme(full, includeFree), [full, mode, includeFree])
  const components = useMemo(() => schemeComponents(visible), [visible])
  const scheme = useMemo(() => {
    const selected = component === 'all' ? null : new Set(components[Number(component)] ?? [])
    return selected ? { nodes: visible.nodes.filter(node => selected.has(node.id)), edges: visible.edges.filter(edge => selected.has(edge.from) && selected.has(edge.to)) } : visible
  }, [visible, component, components])
  const layout = useMemo(() => {
    const source = layoutScheme(scheme)
    const positions = new Map([...source.positions].map(([id, pos]) => [id, { x: 24 + (pos.x - 30) * 0.83, y: 24 + (pos.y - 30) * 0.8 }]))
    return { positions, width: Math.max(300, ...[...positions.values()].map(pos => pos.x + 274)), height: Math.max(160, ...[...positions.values()].map(pos => pos.y + 128)) }
  }, [scheme])
  useEffect(() => { if (open) dialog.current?.showModal(); else { dialog.current?.close(); setSelected(null) } }, [open])
  const fit = () => { if (canvas.current) { setZoom(Math.max(0.25, Math.min(1, (canvas.current.clientWidth - 15) / layout.width, (canvas.current.clientHeight - 15) / layout.height))); canvas.current.scrollTo(0, 0) } }
  const selectedRoute = routes.find(route => route.id === selected?.routeId)
  const connectedRoutes = selected?.pointId ? routes.filter(route => route.startPointId === selected.pointId || route.endPointId === selected.pointId) : []
  const pointName = (id: string) => points.find(point => point.id === id)?.name ?? 'Neznámý objekt'
  useEffect(() => {
    if (!open || !canvas.current) return
    const element = canvas.current
    const observer = new ResizeObserver(() => {
      setZoom(Math.max(0.65, Math.min(1, (element.clientWidth - 48) / layout.width, (element.clientHeight - 48) / layout.height)))
      element.scrollTo(0, 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [open, layout.width, layout.height, mode, component, snapshot])
  return createPortal(<dialog ref={dialog} className="network-scheme-dialog" onCancel={onClose} aria-labelledby="scheme-title">
    <header>
      <div className="scheme-title-group"><span className="scheme-title-icon"><Network size={22} /></span><div><h2 id="scheme-title">Schéma sítě</h2><p>Zapojení a návaznosti na jednom místě</p></div></div>
      <div className="scheme-header-actions"><button type="button" className="scheme-print-button" disabled={!snapshot || !!loadError} onClick={() => onPrint({ mode, component, includeFree })}><Printer size={16} /><span>Tisk schématu</span></button><button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít schéma"><X size={20} /></button></div>
    </header>
    <div className="network-scheme-controls">
      <div className="scheme-view-switch" role="group" aria-label="Pohled na síť"><button type="button" aria-pressed={mode === 'physical'} onClick={() => { setMode('physical'); setComponent('all'); setSelected(null) }}><Box size={15} />Body a trasy</button><button type="button" aria-pressed={mode === 'optical'} onClick={() => { setMode('optical'); setComponent('all'); setSelected(null) }}><Cable size={15} />Optické propojení</button></div>
      <select aria-label="Zobrazená část" value={component} onChange={event => { setComponent(event.target.value); setSelected(null) }}><option value="all">Celá síť</option>{components.map((ids, index) => <option key={index} value={index}>{full.nodes.find(node => node.id === ids[0])?.label} · {ids.length} prvků</option>)}</select>
      <div className="scheme-zoom-controls"><button type="button" onClick={fit} title="Přizpůsobit schéma oknu" aria-label="Přizpůsobit oknu"><Maximize2 size={16} /></button><select aria-label="Přiblížení" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, zoom])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{Math.round(value * 100)} %</option>)}</select></div>
    </div>
    <div className="scheme-workspace">
      <div className="scheme-diagram-area">
        <div className="scheme-view-caption"><span className="scheme-view-dot" />{mode === 'physical' ? 'Fyzická síť · objekty a vedení tras' : 'Optická síť · propojení vláken a portů'}{mode === 'optical' && <label><input type="checkbox" checked={includeFree} onChange={event => { setIncludeFree(event.target.checked); setComponent('all'); setSelected(null) }} />I nezapojená vlákna</label>}</div>
        {loadError ? <div className="scheme-state" role="alert"><p>{loadError}</p><button type="button" onClick={retry}>Načíst znovu</button></div> : !snapshot ? <p className="scheme-state" role="status">Načítám zapojení sítě…</p> : !scheme.nodes.length ? <div className="scheme-state"><Network size={32} /><p>{mode === 'physical' ? 'Síť je zatím prázdná. Přidejte objekty na mapě.' : 'Zatím nejsou evidovaná propojení. Zkuste zobrazit i nezapojená vlákna.'}</p></div> : <div ref={canvas} className="network-scheme-canvas"
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
          return <g key={edge.id} className={`scheme-edge ${edge.kind === 'splitter' ? 'splitter' : ''} ${edge.routeId ? 'clickable' : ''} ${selected?.id === edge.id ? 'selected' : ''}`}
            aria-label={edge.label} onClick={() => edge.routeId && setSelected({ id: edge.id, label: routes.find(route => route.id === edge.routeId)?.name ?? edge.label, detail: mode === 'physical' ? 'Trasa sítě' : label, routeId: edge.routeId })}
            role={edge.routeId ? 'button' : undefined} tabIndex={edge.routeId ? 0 : undefined}
            onKeyDown={event => { if (edge.routeId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelected({ id: edge.id, label: routes.find(route => route.id === edge.routeId)?.name ?? edge.label, detail: mode === 'physical' ? 'Trasa sítě' : label, routeId: edge.routeId }) } }}>
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
          return <g key={node.id} transform={`translate(${pos.x},${pos.y})`} className={`scheme-node scheme-node-${kind}${selected?.id === node.id ? ' selected' : ''}`}
            role={node.pointId ? 'button' : undefined} tabIndex={node.pointId ? 0 : undefined} aria-label={`${node.label} · ${node.detail}${node.usage ? ` · ${node.usage.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${node.usage.label}` : ''}`}
            onClick={() => node.pointId && setSelected({ id: node.id, label: node.label, detail: node.detail, pointId: node.pointId })}
            onKeyDown={event => {
              if (node.pointId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelected({ id: node.id, label: node.label, detail: node.detail, pointId: node.pointId }) }
            }}>
            <title>{node.label} · {node.detail}</title>
            <foreignObject width="250" height="104"><div className={`scheme-card${kind === 'fiber' ? ' has-usage' : ''}`}>
              <div className="scheme-card-type"><span className="scheme-card-icon"><Icon size={15} /></span>{caption}</div>
              <strong>{node.label}</strong><span className="scheme-card-detail">{node.detail}</span>{kind === 'fiber' && <span className={`scheme-usage usage-${node.usage?.status ?? 'none'}`} title={node.usage ? `${node.usage.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${node.usage.label}` : undefined}>{node.usage ? `${node.usage.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${node.usage.label}` : 'Bez evidované služby'}</span>}
            </div></foreignObject>
          </g>
        })}
          </svg>
        </div>}
        <div className="scheme-diagram-hint"><MousePointer2 size={13} /><span>Vyberte objekt nebo trasu · tažením pozadí posouváte pohled</span></div>
      </div>
      <aside className="scheme-inspector" aria-label="Vybraný prvek">
        {selected ? <>
          <div className="scheme-inspector-heading"><span>VYBRANÝ PRVEK</span><button type="button" aria-label="Zrušit výběr" onClick={() => setSelected(null)}><X size={16} /></button></div>
          <span className="scheme-inspector-icon">{selected.routeId ? <Route size={24} /> : mode === 'optical' ? <Network size={24} /> : <Box size={24} />}</span>
          <h3>{selected.label}</h3><p className="scheme-inspector-kind">{selected.detail}</p>
          {selectedRoute && <dl className="scheme-endpoints"><div><dt>Odkud</dt><dd>{pointName(selectedRoute.startPointId)}</dd></div><div><dt>Kam</dt><dd>{pointName(selectedRoute.endPointId)}</dd></div></dl>}
          <div className="scheme-inspector-actions">
            <button type="button" className="scheme-action-primary" onClick={() => selected.pointId ? onOpenPoint(selected.pointId) : selected.routeId && onOpenRoute(selected.routeId)}><ArrowUpRight size={16} />Otevřít detail</button>
            {selected.pointId && mode === 'physical' && <button type="button" onClick={() => onMovePoint(selected.pointId!)}><Crosshair size={16} />Přesunout na mapě</button>}
            {selected.routeId && <button type="button" onClick={() => onEditRoute(selected.routeId!)}><Route size={16} />Upravit průběh trasy</button>}
          </div>
          {selected.pointId && <section className="scheme-related"><h4>Navazující trasy <span>{connectedRoutes.length}</span></h4>{connectedRoutes.length ? connectedRoutes.map(route => <button type="button" key={route.id} onClick={() => setSelected({ id: route.id, label: route.name, detail: 'Trasa sítě', routeId: route.id })}><Route size={14} /><span>{route.name}</span><ArrowUpRight size={14} /></button>) : <p>Objekt zatím nemá navazující trasu.</p>}</section>}
          <p className="scheme-inspector-note">{selected.pointId ? mode === 'optical' ? 'Zapojení vláken a portů upravíte v detailu objektu.' : 'Polohu změníte na mapě. Zapojení a vybavení upravíte v detailu objektu.' : 'Průběh trasy upravíte na mapě. Kabely a chráničky najdete v jejím detailu.'}</p>
        </> : <div className="scheme-inspector-empty"><span className="scheme-inspector-icon"><MousePointer2 size={24} /></span><h3>Prozkoumejte síť</h3><p>Klikněte na objekt nebo trasu. Zobrazí se podrobnosti, návaznosti a dostupné úpravy.</p><div><span><Box size={16} />Objekty sítě</span><span><Route size={16} />Navazující trasy</span><span><Cable size={16} />Optické propojení</span></div></div>}
      </aside>
    </div>
    <footer className="scheme-footer"><span><i />{scheme.nodes.length} prvků <b>·</b> {scheme.edges.length} spojení</span><span>{mode === 'physical' ? 'Trasa mezi objekty neznamená propojení vláken.' : 'Bez evidované služby neznamená ověřené volné vlákno.'}</span></footer>
  </dialog>, document.body)
}
