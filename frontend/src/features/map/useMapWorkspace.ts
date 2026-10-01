import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { findParcelAt, type Parcel } from './parcels'
import { useUndergroundRoutes } from './useUndergroundRoutes'
import { saveUndergroundRoute, waypointsAfterPointMove } from './undergroundRoutes'
import {
  createNetworkPoint,
  deleteNetworkPoint,
  listNetworkPoints,
  updateNetworkPoint,
  type Coordinates,
  type NetworkPoint,
  type NetworkPointInput,
  type NetworkPointKind,
} from './networkPoints'

type PointEditor = NetworkPointInput & { id?: string }
type ParcelStatus = 'idle' | 'loading' | 'not-found' | 'error'

export function useMapWorkspace() {
  const [points, setPoints] = useState<NetworkPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [activeTool, setActiveTool] = useState<NetworkPointKind | null>(null)
  const [moving, setMoving] = useState(false)
  const [editor, setEditor] = useState<PointEditor | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null)
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null)
  const [parcelStatus, setParcelStatus] = useState<ParcelStatus>('idle')
  const parcelRequest = useRef<AbortController | null>(null)
  const [query, setQuery] = useState('')
  const route = useUndergroundRoutes(points)

  useEffect(() => () => parcelRequest.current?.abort(), [])

  useEffect(() => {
    const controller = new AbortController()
    listNetworkPoints(controller.signal)
      .then((data) => {
        setPoints(data)
        setLoadError(false)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reloadVersion])

  const clearParcel = useCallback(() => {
    parcelRequest.current?.abort()
    parcelRequest.current = null
    setSelectedParcel(null)
    setParcelStatus('idle')
  }, [])

  const relocatePoint = useCallback(async (id: string, location: Coordinates) => {
    const point = points.find(item => item.id === id)
    if (!point || saving) return
    const changedRoutes = route.routes.filter(item => item.startPointId === id || item.endPointId === id)
      .filter(item => item.waypoints.length > 0)
      .map(original => ({ original, changed: { ...original,
        waypoints: waypointsAfterPointMove(original, points, id, location) } }))
    const draftBeforeMove = route.drawing ? route.draft : null
    if (draftBeforeMove) route.setDraft(current => current ? { ...current,
      waypoints: waypointsAfterPointMove(current, points, id, location) } : current)
    else route.cancel()
    clearParcel()
    if (!draftBeforeMove) setEditor(current => current?.id === id ? { ...current, ...location } : { ...point, ...location })
    setPoints(current => current.map(item => item.id === id ? { ...item, ...location } : item))
    route.setRoutes(current => current.map(item => changedRoutes.find(entry => entry.original.id === item.id)?.changed ?? item))
    setSelectedLocation(null)
    setActiveTool(null)
    setMoving(false)
    setActionError('')
    setSaving(true)
    const changedOnServer: typeof changedRoutes = []
    try {
      for (const entry of changedRoutes) {
        await saveUndergroundRoute(entry.changed)
        changedOnServer.push(entry)
      }
      const saved = await updateNetworkPoint({ ...point, ...location })
      setPoints(current => current.map(item => item.id === id ? saved : item))
    } catch {
      let rollbackFailed = false
      for (const entry of changedOnServer.reverse()) {
        try { await saveUndergroundRoute(entry.original) }
        catch { rollbackFailed = true }
      }
      if (draftBeforeMove) route.setDraft(current => current ? { ...current,
        waypoints: draftBeforeMove.waypoints } : current)
      else setEditor(current => current?.id === id
        ? { ...current, latitude: point.latitude, longitude: point.longitude } : current)
      setPoints(current => current.map(item => item.id === id ? point : item))
      route.setRoutes(current => current.map(item => changedRoutes.find(entry => entry.original.id === item.id)?.original ?? item))
      if (rollbackFailed) route.setReloadVersion(value => value + 1)
      setActionError(rollbackFailed
        ? 'Přesun se nepodařilo dokončit. Obnovte trasy a zkontrolujte jejich průběh.'
        : 'Přesun se nepodařilo uložit. Původní poloha i průběh tras byly obnoveny.')
    } finally {
      setSaving(false)
    }
  }, [points, route, clearParcel, saving])

  const handleToolChange = useCallback((kind: NetworkPointKind | null) => {
    setActiveTool(kind)
    setMoving(false)
    setActionError('')
    if (kind) {
      route.cancel()
      clearParcel()
      setEditor(null)
      setSelectedLocation(null)
    }
  }, [clearParcel, route])

  const handleLocationClick = useCallback((location: Coordinates, lookupParcel: boolean) => {
    if (route.drawing) { route.addWaypoint(location); return }
    clearParcel()
    setActionError('')
    if (activeTool) {
      route.cancel()
      setEditor({ kind: activeTool, name: '', ...location })
      setActiveTool(null)
    } else if (moving && editor) {
      if (editor.id) void relocatePoint(editor.id, location)
      else { setEditor({ ...editor, ...location }); setMoving(false) }
    } else {
      route.cancel()
      setEditor(null)
      setSelectedLocation(location)
      if (lookupParcel) {
        const controller = new AbortController()
        parcelRequest.current = controller
        setParcelStatus('loading')
        findParcelAt(location, controller.signal)
          .then((parcel) => {
            if (controller.signal.aborted) return
            setSelectedParcel(parcel)
            setParcelStatus(parcel ? 'idle' : 'not-found')
          })
          .catch((error: unknown) => {
            if (!(error instanceof Error && error.name === 'AbortError')) setParcelStatus('error')
          })
      }
    }
  }, [activeTool, moving, editor, clearParcel, route, relocatePoint])

  const handlePointSelect = useCallback((id: string, location?: Coordinates) => {
    if (route.drawing) { route.addPoint(id); return }
    const point = points.find((item) => item.id === id)
    if (!point) return
    route.cancel()
    clearParcel()
    setEditor((current) => ({ ...(current?.id === id ? current : point), ...location }))
    setSelectedLocation(null)
    setActiveTool(null)
    setMoving(false)
    setActionError('')
  }, [points, clearParcel, route])

  const handleRouteToolChange = () => {
    if (route.drawing) { route.cancelDrawing(); return }
    setActiveTool(null)
    setMoving(false)
    setEditor(null)
    setSelectedLocation(null)
    clearParcel()
    setActionError('')
    route.startDrawing()
  }

  const handleRouteSelect = (id: string) => {
    route.selectRoute(id)
    setActiveTool(null)
    setMoving(false)
    setEditor(null)
    setSelectedLocation(null)
    clearParcel()
    setActionError('')
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (activeTool || moving)) handleToolChange(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTool, moving, handleToolChange])

  const startDraft = (kind: NetworkPointKind, location: Coordinates) => {
    route.cancel()
    setEditor({ kind, name: '', ...location })
    setSelectedLocation(null)
    setActionError('')
  }

  const handleToolDrop = (kind: NetworkPointKind, location: Coordinates) => {
    route.cancel()
    clearParcel()
    setEditor({ kind, name: '', ...location })
    setSelectedLocation(null)
    setActiveTool(null)
    setMoving(false)
    setActionError('')
  }

  const moveDraft = useCallback((location: Coordinates) => {
    setEditor(current => current && !current.id ? { ...current, ...location } : current)
  }, [])

  const savePoint = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor || !editor.name.trim() || saving) return
    setSaving(true)
    setActionError('')
    try {
      const saved = editor.id
        ? await updateNetworkPoint({ ...editor, id: editor.id, name: editor.name.trim() })
        : await createNetworkPoint({ ...editor, name: editor.name.trim() })
      setPoints((current) => editor.id
        ? current.map((point) => point.id === saved.id ? saved : point)
        : [...current, saved])
      setEditor(saved)
      clearParcel()
      setMoving(false)
    } catch {
      setActionError('Uložení se nezdařilo. Zkontrolujte, zda běží API.')
    } finally {
      setSaving(false)
    }
  }

  const removePoint = async () => {
    if (!editor?.id || saving || !window.confirm(`Smazat objekt „${editor.name}“?`)) return
    setSaving(true)
    setActionError('')
    try {
      await deleteNetworkPoint(editor.id)
      setPoints((current) => current.filter((point) => point.id !== editor.id))
      setEditor(null)
      setMoving(false)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Objekt se nepodařilo smazat.')
    } finally {
      setSaving(false)
    }
  }

  const copyCoordinates = async (location: Coordinates) => {
    await navigator.clipboard.writeText(
      `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
    )
  }

  const visiblePoints = useMemo(() => points
    .filter((point) => point.name.toLocaleLowerCase('cs').includes(query.toLocaleLowerCase('cs')))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs')), [points, query])
  const buildings = points.filter((point) => point.kind === 'building').length
  const chambers = points.length - buildings
  const originalPoint = points.find((point) => point.id === editor?.id)
  const preview = editor && (!editor.id || (originalPoint && (editor.latitude !== originalPoint.latitude || editor.longitude !== originalPoint.longitude)))
    ? editor : selectedLocation

  return {
    points, loading, loadError, actionError, saving, activeTool, moving, editor, route,
    selectedLocation, selectedParcel, parcelStatus, query, visiblePoints,
    buildings, chambers, preview, setQuery, setEditor, setSelectedLocation,
    setMoving, setActiveTool, setLoading, setReloadVersion, setActionError,
    clearParcel, handleToolChange, handleRouteToolChange, handleRouteSelect,
    handleLocationClick, handlePointSelect, relocatePoint,
    handleToolDrop, moveDraft, savePoint, removePoint, copyCoordinates, startDraft,
  }
}
