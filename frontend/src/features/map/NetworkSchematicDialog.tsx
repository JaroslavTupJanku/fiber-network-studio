import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Box, Cable, House, Network, Printer, X } from 'lucide-react'
import { useOpticalSnapshot } from './useOpticalSnapshot'
import { layoutScheme, opticalScheme, physicalScheme, schemeComponents, visibleOpticalScheme, type SchemeView } from './networkSchematic'
import type { NetworkPoint } from './networkPoints'
import type { UndergroundRoute } from './undergroundRoutes'
import { type RouteInstallationDocument } from './routeInstallations'
import { type BuildingEquipmentDocument } from './buildingEquipment'
import { type OpticalSpliceDocument } from './opticalSplices'
import { type BuildingDistributionDocument } from './buildingDistribution'

export function NetworkSchematicDialog({ open, points, routes, installations, equipment, splices, distributions, onClose, onOpenPoint, onOpenRoute, onPrint }: {
  open: boolean
  points: NetworkPoint[]; routes: UndergroundRoute[]; installations: RouteInstallationDocument[]
  equipment: BuildingEquipmentDocument[]; splices: OpticalSpliceDocument[]; distributions: BuildingDistributionDocument[]
  onPrint: (view: SchemeView) => void; onClose: () => void; onOpenPoint: (id: string) => void; onOpenRoute: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'physical' | 'optical'>('physical')
  const [component, setComponent] = useState('all')
  const [zoom, setZoom] = useState(1)
  const [includeFree, setIncludeFree] = useState(false)
  const [arrange, setArrange] = useState(false)
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>({})
  const nodeDrag = useRef<{ key: string; x: number; y: number; origin: { x: number; y: number } } | null>(null)
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
  const layout = useMemo(() => layoutScheme(scheme), [scheme])
  const positionKey = (id: string) => `${mode}:${component}:${id}`
  const positions = new Map([...layout.positions].map(([id, pos]) => [id, manualPositions[positionKey(id)] ?? pos]))
  const moveCard = (key: string, x: number, y: number) => setManualPositions(current => ({ ...current, [key]: {
    x: Math.max(10, Math.min(layout.width - 260, x)), y: Math.max(10, Math.min(layout.height - 114, y)),
  } }))
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  const fit = () => { if (canvas.current) { setZoom(Math.max(0.25, Math.min(1, (canvas.current.clientWidth - 15) / layout.width, (canvas.current.clientHeight - 15) / layout.height))); canvas.current.scrollTo(0, 0) } }
  return createPortal(<dialog ref={dialog} className="network-scheme-dialog" onCancel={onClose}>
    <header><div><span className="scheme-eyebrow">PŘEHLED PROPOJENÍ</span><h2>Schéma sítě</h2><p>Od páteřní sítě až k přípojce. Vyberte objekt a pokračujte na mapě.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Zavřít schéma"><X /></button></header>
    <div className="network-scheme-controls">
      <div className="scheme-view-switch" role="group" aria-label="Pohled na síť"><button type="button" aria-pressed={mode === 'physical'} onClick={() => { setMode('physical'); setComponent('all') }}>Body a trasy</button><button type="button" aria-pressed={mode === 'optical'} onClick={() => { setMode('optical'); setComponent('all') }}>Optické propojení</button></div>
      <label>Zobrazená část <select value={component} onChange={event => { setComponent(event.target.value); if (canvas.current) canvas.current.scrollTo(0, 0) }}><option value="all">Celá síť ({components.length} oddělených částí)</option>{components.map((ids, index) => <option key={index} value={index}>Část {index + 1}: {full.nodes.find(node => node.id === ids[0])?.label} ({ids.length} prvků)</option>)}</select></label>
      <label>Přiblížení <select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[...new Set([0.25, 0.5, 0.75, 1, 1.25, 1.5, zoom])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{Math.round(value * 100)} %</option>)}</select></label>
      <div className="scheme-toolbar-actions">
      <button type="button" onClick={() => { setZoom(1); setComponent('all'); canvas.current?.scrollTo(0, 0) }}>Na přehled</button>
      <button type="button" onClick={fit}>Přizpůsobit oknu</button><button type="button" disabled={!snapshot || !!loadError} onClick={() => onPrint({ mode, component, includeFree })}><Printer size={14} /> Tisk schématu</button>
      <button type="button" aria-pressed={arrange} onClick={() => setArrange(value => !value)}>{arrange ? 'Hotovo · prohlížet' : 'Uspořádat karty'}</button>
      <button type="button" disabled={!Object.keys(manualPositions).length} onClick={() => setManualPositions({})}>Obnovit rozložení</button>
      </div>
      {mode === 'optical' && <label className="scheme-free-toggle"><span><input type="checkbox" checked={includeFree} onChange={event => { setIncludeFree(event.target.checked); setComponent('all') }} /> Zobrazit i nezapojená vlákna</span></label>}
    </div>
    <p className="network-scheme-help">{mode === 'physical' ? 'Čára znamená trasu mezi body. Sama nepotvrzuje propojení vláken.' : 'Každé vlákno má vlastní spojení. Oddělené části nejsou opticky propojené; krajní vlákno může být otevřené. Připravené porty a přípojky bez zapojení stojí samostatně.'}</p>
    {mode === 'optical' && <div className="scheme-usage-legend"><span className="usage-used">Obsazeno službou</span><span className="usage-reserved">Rezervováno</span><span>Bez evidované služby ≠ ověřeně volné vlákno</span></div>}
    <p className={`scheme-interaction-help${arrange ? ' arranging' : ''}`}>{arrange ? 'Přetáhněte kartu, nebo ji posuňte šipkami po výběru klávesou Tab. Měníte jen rozložení náhledu, nikoli zapojení sítě. Tisk má vlastní automatické rozložení.' : 'Kliknutí na kartu otevře detail. Zapojení upravujte v detailu objektu; rozložení karet změníte volbou Uspořádat karty.'}</p>
    {loadError ? <div className="panel-error" role="alert">{loadError}<button type="button" onClick={retry}>Načíst znovu</button></div> : !snapshot ? <p role="status">Načítám zapojení sítě…</p> : !scheme.nodes.length ? <p className="equipment-empty">{mode === 'physical' ? 'Síť je zatím prázdná. Přidejte body a trasy na mapě.' : includeFree ? 'Zatím nejsou evidovaná vlákna ani porty. Nejprve osaďte kabely nebo optické vybavení.' : 'Zatím nejsou evidovaná propojení. Volné kabely zobrazíte volbou "Zobrazit i nezapojená vlákna".'}</p> : <div ref={canvas} className={`network-scheme-canvas${arrange ? ' arranging' : ''}`}
      onPointerDown={event => { if (event.target !== event.currentTarget && (event.target as Element).tagName !== 'svg') return; drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (drag.current) { event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.x; event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.y } }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <svg width={layout.width * zoom} height={layout.height * zoom} viewBox={`0 0 ${layout.width} ${layout.height}`} aria-label={mode === 'physical' ? 'Schéma bodů a tras' : 'Schéma optických propojení'}>
        {scheme.edges.map(edge => {
          const a = positions.get(edge.from), b = positions.get(edge.to)
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
            aria-label={edge.label} onClick={() => !arrange && edge.routeId && onOpenRoute(edge.routeId)}
            role={!arrange && edge.routeId ? 'button' : undefined} tabIndex={!arrange && edge.routeId ? 0 : undefined}
            onKeyDown={event => { if (!arrange && edge.routeId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenRoute(edge.routeId) } }}>
            <title>{edge.label}</title><path className="scheme-edge-hit" d={d} /><path className="scheme-edge-line" d={d} />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 9} textAnchor="middle">{mode === 'physical' ? 'Trasa' : label}</text>
          </g>
        })}
        {scheme.nodes.map(node => {
          const pos = positions.get(node.id)!
          const kind = node.id.startsWith('fiber:') ? 'fiber' : node.id.startsWith('port:') ? 'port'
            : node.id.startsWith('premise:') ? 'premise' : 'point'
          const Icon = kind === 'fiber' ? Cable : kind === 'port' ? Network : kind === 'premise' ? House : Box
          const caption = kind === 'fiber' ? 'Optické vlákno' : kind === 'port' ? 'Optický port' : kind === 'premise' ? 'Přípojné místo' : node.detail
          return <g key={node.id} transform={`translate(${pos.x},${pos.y})`} className={`scheme-node scheme-node-${kind}`}
            role={arrange || node.pointId ? 'button' : undefined} tabIndex={arrange || node.pointId ? 0 : undefined} aria-label={`${node.label} · ${node.detail}${node.usage ? ` · ${node.usage.status === 'used' ? 'Obsazeno' : 'Rezervováno'}: ${node.usage.label}` : ''}`}
            onPointerDown={event => {
              if (!arrange) return
              event.preventDefault(); event.stopPropagation()
              nodeDrag.current = { key: positionKey(node.id), x: event.clientX, y: event.clientY, origin: pos }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={event => {
              const drag = nodeDrag.current
              if (!arrange || !drag || drag.key !== positionKey(node.id)) return
              event.stopPropagation()
              moveCard(drag.key, drag.origin.x + (event.clientX - drag.x) / zoom, drag.origin.y + (event.clientY - drag.y) / zoom)
            }}
            onPointerUp={() => { nodeDrag.current = null }} onPointerCancel={() => { nodeDrag.current = null }}
            onClick={() => !arrange && node.pointId && onOpenPoint(node.pointId)}
            onKeyDown={event => {
              if (arrange && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault(); const step = event.shiftKey ? 5 : 20
                moveCard(positionKey(node.id), pos.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), pos.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0))
              } else if (!arrange && node.pointId && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpenPoint(node.pointId) }
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
    <footer className="scheme-footer"><span><i /> {scheme.nodes.length} prvků · {scheme.edges.length} spojení</span><span>{arrange ? 'Tažením karty měníte rozložení náhledu' : 'Tažením pozadí posouváte pohled · kliknutí otevře detail'}</span></footer>
  </dialog>, document.body)
}
