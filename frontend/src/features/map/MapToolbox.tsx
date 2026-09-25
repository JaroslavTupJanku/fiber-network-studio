import { useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, CircleDot, HousePlus, Layers3, LoaderCircle, MousePointer2, Route, RefreshCw, X, ZoomIn, type LucideIcon } from 'lucide-react'
import type { NetworkPointKind } from './networkPoints'
import { crossedDragThreshold } from './interactions'

export type CadastreStatus = 'loading' | 'ready' | 'error'
export type BaseMap = 'street' | 'orthophoto'
export type OrthophotoStatus = 'loading' | 'ready' | 'error'
export type PlacementPointer = { kind: NetworkPointKind, x: number, y: number }
type ToolDrag = { kind: NetworkPointKind, pointerId: number, startX: number, startY: number, dragging: boolean }

const POINT_TOOLS: { kind: NetworkPointKind; label: string; Icon: LucideIcon; hint: string }[] = [
  { kind: 'building', label: 'Budova', Icon: HousePlus, hint: 'Přidat budovu nebo ji přetáhnout na mapu' },
  { kind: 'chamber', label: 'Šachta', Icon: CircleDot, hint: 'Přidat šachtu nebo ji přetáhnout na mapu' },
]

type MapToolboxProps = {
  activeTool: NetworkPointKind | null
  placementActive: boolean
  toolsDisabled: boolean
  onToolChange: (kind: NetworkPointKind | null) => void
  routeDrawing: boolean
  canDrawRoute: boolean
  onRouteToolChange: () => void
  onToolDropAt: (kind: NetworkPointKind, clientX: number, clientY: number) => void
  onDragPointerChange: Dispatch<SetStateAction<PlacementPointer | null>>
  mapBounds: () => DOMRect | undefined
  baseMap: BaseMap
  onBaseMapChange: (baseMap: BaseMap) => void
  orthophotoStatus: OrthophotoStatus
  onOrthophotoRetry: () => void
  cadastreEnabled: boolean
  cadastreStatus: CadastreStatus
  needsZoom: boolean
  onCadastreChange: (enabled: boolean) => void
  onCadastreRetry: () => void
  onZoomToCadastre: () => void
}

export function MapToolbox({ activeTool, placementActive, toolsDisabled, onToolChange, routeDrawing, canDrawRoute, onRouteToolChange, onToolDropAt,
  onDragPointerChange: setDragPointer, mapBounds,
  baseMap, onBaseMapChange, orthophotoStatus, onOrthophotoRetry, cadastreEnabled, cadastreStatus,
  needsZoom, onCadastreChange, onCadastreRetry, onZoomToCadastre }: MapToolboxProps) {
  const [toolboxOpen, setToolboxOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches)
  const toolDrag = useRef<ToolDrag | null>(null)
  const [draggingTool, setDraggingTool] = useState<NetworkPointKind | null>(null)
  const suppressToolClick = useRef(false)
  const handleToolPointerDown = (kind: NetworkPointKind, event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    toolDrag.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleToolPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = toolDrag.current
    const rect = mapBounds()
    if (!drag || !rect || drag.pointerId !== event.pointerId) return
    if (!drag.dragging && !crossedDragThreshold(drag.startX, drag.startY, event.clientX, event.clientY, 6)) return
    drag.dragging = true
    setDraggingTool(drag.kind)
    event.preventDefault()
    setDragPointer({ kind: drag.kind, x: event.clientX - rect.left, y: event.clientY - rect.top })
  }
  const handleToolPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = toolDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    toolDrag.current = null
    setDraggingTool(null)
    setDragPointer(null)
    if (!drag.dragging) return
    event.preventDefault()
    suppressToolClick.current = true
    window.setTimeout(() => { suppressToolClick.current = false }, 0)
    onToolDropAt(drag.kind, event.clientX, event.clientY)
  }
  const handleToolPointerCancel = () => {
    toolDrag.current = null
    setDraggingTool(null)
    setDragPointer(null)
  }
  const handleToolClick = (kind: NetworkPointKind) => {
    if (suppressToolClick.current) { suppressToolClick.current = false; return }
    onToolChange(activeTool === kind ? null : kind)
  }
  return (
    <div className={`map-toolbar ${toolboxOpen ? '' : 'collapsed'}`} aria-label="Panel nástrojů mapy">
      <button type="button" className="map-toolbox-header" aria-expanded={toolboxOpen} aria-controls="map-toolbox-content" onClick={() => setToolboxOpen(value => !value)}>
        <span><MousePointer2 size={17} aria-hidden="true" /> Nástroje mapy</span>
        <ChevronDown size={17} className={toolboxOpen ? 'toolbox-chevron open' : 'toolbox-chevron'} aria-hidden="true" />
      </button>
      <div className="map-toolbox-content" id="map-toolbox-content" hidden={!toolboxOpen}>
        <section className="map-toolbox-section" aria-label="Bodové objekty">
          <h2>Bodové objekty</h2>
          <div className="map-tool-actions" role="group" aria-label="Přidat bodový objekt">
            {POINT_TOOLS.map(({ kind, label, Icon, hint }) => (
              <button key={kind} type="button" className={`map-tool${activeTool === kind ? ' active' : ''}${draggingTool === kind ? ' dragging' : ''}`} aria-pressed={activeTool === kind} disabled={toolsDisabled} onClick={() => handleToolClick(kind)} onPointerDown={(event) => handleToolPointerDown(kind, event)} onPointerMove={handleToolPointerMove} onPointerUp={handleToolPointerUp} onPointerCancel={handleToolPointerCancel} onLostPointerCapture={handleToolPointerCancel} title={hint}>
                <Icon size={18} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <p className="map-toolbox-hint">Klikněte na nástroj a potom do mapy, nebo ho rovnou přetáhněte. Zrušení: Esc.</p>
          {placementActive && (
            <div className="placement-state">
              <span>{activeTool ? `Umístit: ${POINT_TOOLS.find(tool => tool.kind === activeTool)?.label ?? ''}` : 'Přesunout bod'}</span>
              <button type="button" className="layer-action" onClick={() => onToolChange(null)} title="Zrušit umístění" aria-label="Zrušit umístění"><X size={15} /></button>
            </div>
          )}
        </section>
        <section className="map-toolbox-section" aria-label="Trasy">
          <h2>Trasy</h2>
          <button type="button" className={`map-tool route-tool${routeDrawing ? ' active' : ''}`}
            aria-pressed={routeDrawing} disabled={toolsDisabled || !canDrawRoute}
            onClick={onRouteToolChange} title="Nakreslit podzemní trasu mezi dvěma body sítě">
            <Route size={18} aria-hidden="true" /> Podzemní trasa
          </button>
          <p className="map-toolbox-hint">{canDrawRoute
            ? 'Vyberte první bod, případné lomové body a koncový bod.'
            : 'Pro trasu nejdřív přidejte dva body sítě.'}</p>
        </section>
        <section className="map-toolbox-section" aria-label="Podklady a vrstvy">
          <h2>Podklady a vrstvy</h2>
          <div className="base-map-options" role="radiogroup" aria-label="Podklad mapy">
            <span className="base-map-title">Podklad mapy</span>
            <div className="base-map-choices">
              <label><input type="radio" name="base-map" value="street" checked={baseMap === 'street'} onChange={() => onBaseMapChange('street')} />Mapa</label>
              <label><input type="radio" name="base-map" value="orthophoto" checked={baseMap === 'orthophoto'} onChange={() => onBaseMapChange('orthophoto')} />Ortofoto</label>
            </div>
          </div>
          {baseMap === 'orthophoto' && (
            <div className={`layer-status ${orthophotoStatus === 'error' ? 'layer-status-error' : ''}`} role="status" aria-live="polite">
              {orthophotoStatus === 'error' ? <><AlertCircle size={15} /><span>Ortofoto se nenačetlo</span>
                <button type="button" className="layer-action" onClick={onOrthophotoRetry} title="Zkusit znovu" aria-label="Načíst ortofoto znovu"><RefreshCw size={15} /></button></>
                : orthophotoStatus === 'ready' ? <><CheckCircle2 size={15} /><span>Ortofoto ČÚZK</span></>
                  : <><LoaderCircle size={15} className="spin" /><span>Načítání ortofota…</span></>}
            </div>
          )}
          <label className="layer-toggle">
            <input type="checkbox" checked={cadastreEnabled} onChange={(event) => onCadastreChange(event.target.checked)} />
            <Layers3 size={17} aria-hidden="true" />
            <span>Katastr</span>
          </label>
          {cadastreEnabled && (
            <div className={`layer-status ${cadastreStatus === 'error' && !needsZoom ? 'layer-status-error' : ''}`} role="status" aria-live="polite">
              {needsZoom ? (
                <button type="button" className="layer-zoom-action" onClick={onZoomToCadastre}>
                  <ZoomIn size={16} aria-hidden="true" /><span>Přiblížit na parcely</span>
                </button>
              ) : cadastreStatus === 'error' ? (
                <><AlertCircle size={15} aria-hidden="true" /><span>ČÚZK se nenačetl</span>
                  <button type="button" className="layer-action" onClick={onCadastreRetry} title="Zkusit načíst znovu" aria-label="Zkusit načíst katastr znovu"><RefreshCw size={15} /></button>
                </>
              ) : cadastreStatus === 'ready' ? (
                <><CheckCircle2 size={15} aria-hidden="true" /><span>Katastr načten</span></>
              ) : (
                <><LoaderCircle size={15} className="spin" aria-hidden="true" /><span>Načítání ČÚZK</span></>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
