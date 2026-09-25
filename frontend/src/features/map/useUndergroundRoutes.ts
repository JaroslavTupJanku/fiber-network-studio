import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Coordinates, NetworkPoint } from './networkPoints'
import { deleteUndergroundRoute, listUndergroundRoutes, saveUndergroundRoute,
  undoRouteStep, type RouteDraft, type UndergroundRoute } from './undergroundRoutes'

const copyRoute = (route: UndergroundRoute): RouteDraft => ({ ...route,
  waypoints: route.waypoints.map(point => ({ ...point })) })

export function useUndergroundRoutes(points: NetworkPoint[]) {
  const [routes, setRoutes] = useState<UndergroundRoute[]>([])
  const [draft, setDraft] = useState<RouteDraft | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reloadVersion, setReloadVersion] = useState(0)

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
    setDraft(null)
    setDrawing(false)
    setError('')
  }, [])

  const cancelDrawing = useCallback(() => {
    setDrawing(false)
    setDraft(current => {
      const saved = routes.find(route => route.id === current?.id)
      return saved ? copyRoute(saved) : null
    })
    setError('')
  }, [routes])

  const startDrawing = () => {
    setDraft({ name: '', startPointId: null, endPointId: null, waypoints: [] })
    setDrawing(true)
    setError('')
  }

  const selectRoute = (id: string) => {
    const route = routes.find(item => item.id === id)
    if (!route) return
    setDraft(copyRoute(route))
    setDrawing(false)
    setError('')
  }

  const startEditing = () => {
    if (!draft) return
    setDrawing(true)
    setError('')
  }

  const addPoint = (id: string) => {
    if (!drawing) return
    setDraft(current => {
      if (!current) return current
      if (!current.startPointId) return { ...current, startPointId: id }
      if (current.startPointId === id) return current
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
    setDraft(current => current ? { ...current, [endpoint]: id } : current)
    setError('')
  }

  const addWaypoint = (location: Coordinates) => {
    if (!drawing) return
    if (!draft?.startPointId) { setError('Nejdřív klikněte na výchozí budovu nebo šachtu.'); return }
    setDraft(current => current ? { ...current, waypoints: [...current.waypoints, location] } : current)
    setError('')
  }

  const moveWaypoint = (index: number, location: Coordinates) => {
    if (!drawing) return
    setDraft(current => current && current.waypoints[index]
      ? { ...current, waypoints: current.waypoints.map((point, position) => position === index ? location : point) }
      : current)
  }

  const removeWaypoint = (index: number) => {
    setDraft(current => current
      ? { ...current, waypoints: current.waypoints.filter((_, position) => position !== index) }
      : current)
  }

  const undo = () => setDraft(current => current ? undoRouteStep(current) : current)

  const resetGeometry = () => setDraft(current => current
    ? { ...current, startPointId: null, endPointId: null, waypoints: [] }
    : current)

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
    setDraft, setLoading, setReloadVersion, cancel, cancelDrawing, startDrawing, selectRoute, startEditing,
    addPoint, setEndpoint, addWaypoint, moveWaypoint, removeWaypoint, undo, resetGeometry, finish, save, remove }
}
