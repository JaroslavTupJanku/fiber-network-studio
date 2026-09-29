import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Coordinates, NetworkPoint } from './networkPoints'
import { deleteUndergroundRoute, listUndergroundRoutes, saveUndergroundRoute,
  undoRouteStep, type RouteDraft, type UndergroundRoute } from './undergroundRoutes'

const copyRoute = (route: UndergroundRoute): RouteDraft => ({ ...route,
  waypoints: route.waypoints.map(point => ({ ...point })) })

export function useUndergroundRoutes(points: NetworkPoint[]) {
  const [routes, setRoutes] = useState<UndergroundRoute[]>([])
  const [draft, setDraft] = useState<RouteDraft | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [continuationSourceId, setContinuationSourceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)
  const insertedWaypoints = useRef<number[]>([])

  useEffect(() => {
    const controller = new AbortController()
    listUndergroundRoutes(controller.signal)
      .then(data => { setRoutes(data); setLoadError(false) })
      .catch((reason: unknown) => {
        if (!(reason instanceof Error && reason.name === 'AbortError')) setLoadError(true)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reloadVersion])

  const cancel = useCallback(() => {
    insertedWaypoints.current = []
    setDraft(null)
    setDrawing(false)
    setContinuationSourceId(null)
    setError('')
  }, [])

  const cancelDrawing = useCallback(() => {
    insertedWaypoints.current = []
    setDrawing(false)
    setDraft(current => {
      const saved = routes.find(route => route.id === (current?.id ?? continuationSourceId))
      return saved ? copyRoute(saved) : null
    })
    setContinuationSourceId(null)
    setError('')
  }, [routes, continuationSourceId])

  const startDrawing = () => {
    insertedWaypoints.current = []
    setDraft({ name: '', startPointId: null, endPointId: null, waypoints: [] })
    setDrawing(true)
    setContinuationSourceId(null)
    setError('')
  }

  const selectRoute = (id: string) => {
    insertedWaypoints.current = []
    const route = routes.find(item => item.id === id)
    if (!route) return
    setDraft(copyRoute(route))
    setDrawing(false)
    setContinuationSourceId(null)
    setError('')
  }

  const startEditing = () => {
    if (!draft) return
    insertedWaypoints.current = []
    setDrawing(true)
    setError('')
  }

  const continueFrom = (pointId: string) => {
    if (!draft?.id || drawing || saving || !points.some(point => point.id === pointId)) return false
    const saved = routes.find(route => route.id === draft.id)
    if (!saved || (pointId !== saved.startPointId && pointId !== saved.endPointId)) return false
    if (draft.name !== saved.name || draft.startPointId !== saved.startPointId
      || draft.endPointId !== saved.endPointId
      || JSON.stringify(draft.waypoints) !== JSON.stringify(saved.waypoints)) {
      setError('Nejdřív uložte změny této trasy, potom z ní můžete navázat.')
      return false
    }
    insertedWaypoints.current = []
    setDraft({ name: '', startPointId: pointId, endPointId: null, waypoints: [] })
    setDrawing(true)
    setContinuationSourceId(saved.id)
    setError('')
    return true
  }

  const addPoint = (id: string) => {
    if (!drawing) return
    if (draft?.endPointId) {
      setError('Tento úsek už má konec. Dokončete a uložte ho; další úsek pak navážete od vybraného objektu.')
      return
    }
    if (draft?.startPointId === id) {
      setError('Konec trasy musí být jiný objekt než začátek.')
      return
    }
    setDraft(current => {
      if (!current) return current
      if (!current.startPointId) return { ...current, startPointId: id }
      return { ...current, endPointId: id }
    })
    setError('')
  }

  const setEndpoint = (endpoint: 'startPointId' | 'endPointId', id: string | null) => {
    if (!drawing) return
    if (id && !points.some(point => point.id === id)) return
    const other = endpoint === 'startPointId' ? 'endPointId' : 'startPointId'
    if (id && draft?.[other] === id) {
      setError('Začátek a konec musí být různé objekty.')
      return
    }
    insertedWaypoints.current = []
    setDraft(current => current ? { ...current, [endpoint]: id } : current)
    setError('')
  }

  const addWaypoint = (location: Coordinates) => {
    if (!drawing) return
    if (!draft?.startPointId) { setError('Nejdřív klikněte na výchozí budovu nebo šachtu.'); return }
    setDraft(current => current ? { ...current, waypoints: [...current.waypoints, location] } : current)
    setError('')
  }

  const insertWaypoint = (segmentIndex: number, location: Coordinates) => {
    if (!drawing || !draft?.startPointId || !draft.endPointId
      || segmentIndex < 0 || segmentIndex > draft.waypoints.length) return
    insertedWaypoints.current.push(segmentIndex)
    setDraft(current => current && segmentIndex >= 0 && segmentIndex <= current.waypoints.length
      ? { ...current, waypoints: [
        ...current.waypoints.slice(0, segmentIndex), location, ...current.waypoints.slice(segmentIndex),
      ] } : current)
    setError('')
  }

  const moveWaypoint = (index: number, location: Coordinates) => {
    if (!drawing) return
    setDraft(current => current && current.waypoints[index]
      ? { ...current, waypoints: current.waypoints.map((point, position) => position === index ? location : point) }
      : current)
  }

  const removeWaypoint = (index: number) => {
    insertedWaypoints.current = []
    setDraft(current => current
      ? { ...current, waypoints: current.waypoints.filter((_, position) => position !== index) }
      : current)
  }

  const undo = () => {
    const insertedIndex = insertedWaypoints.current.pop()
    setDraft(current => current ? undoRouteStep(current, insertedIndex) : current)
    setError('')
  }

  const resetGeometry = () => {
    insertedWaypoints.current = []
    setDraft(current => current
      ? { ...current, startPointId: null, endPointId: null, waypoints: [] }
      : current)
    setError('')
  }

  const finish = () => {
    if (!draft?.startPointId || !draft.endPointId || draft.startPointId === draft.endPointId) {
      setError('Vyberte dva různé koncové body sítě.')
      return
    }
    if (!points.some(point => point.id === draft.startPointId)
      || !points.some(point => point.id === draft.endPointId)) {
      setError('Koncový bod již neexistuje.')
      return
    }
    setDrawing(false)
    insertedWaypoints.current = []
    setError('')
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft || drawing || saving) return
    if (!draft.name.trim() || !draft.startPointId || !draft.endPointId) {
      setError('Vyplňte název a oba koncové body.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const saved = await saveUndergroundRoute(draft)
      setRoutes(current => draft.id
        ? current.map(route => route.id === saved.id ? saved : route)
        : [...current, saved])
      setDraft(copyRoute(saved))
      setContinuationSourceId(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trasu se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || saving || !window.confirm(`Smazat trasu "${draft.name}"?`)) return
    setSaving(true)
    setError('')
    try {
      await deleteUndergroundRoute(draft.id)
      setRoutes(current => current.filter(route => route.id !== draft.id))
      cancel()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Trasu se nepodařilo smazat.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!drawing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      cancelDrawing()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawing, cancelDrawing])

  const original = routes.find(route => route.id === draft?.id)
  const preview = draft && (drawing || !draft.id || !original
    || draft.startPointId !== original.startPointId || draft.endPointId !== original.endPointId
    || JSON.stringify(draft.waypoints) !== JSON.stringify(original.waypoints)) ? draft : null
  const visibleRoutes = useMemo(() => routes.slice().sort((a, b) => a.name.localeCompare(b.name, 'cs')), [routes])

  return { routes, visibleRoutes, draft, drawing, loading, loadError, error, saving, preview,
    setRoutes, setDraft, setLoading, setReloadVersion, cancel, cancelDrawing, startDrawing, selectRoute, startEditing, continueFrom,
    addPoint, setEndpoint, addWaypoint, insertWaypoint, moveWaypoint, removeWaypoint, undo, resetGeometry, finish, save, remove }
}
