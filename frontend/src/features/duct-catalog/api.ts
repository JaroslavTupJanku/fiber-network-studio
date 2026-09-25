import type { DuctInput, DuctType } from './model'

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/duct-catalog${path}`, options).catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new Error('Katalog chrániček není dostupný. Zkontrolujte připojení a zkuste to znovu.')
  })
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.detail || (problem?.errors ? Object.values(problem.errors).flat().join(' ') : null)
      || (response.status === 404 ? 'Typ už neexistuje. Načtěte katalog znovu.' : 'Uložení se nezdařilo. Zkuste to znovu.'))
  }
  return response.status === 204 ? undefined as T : response.json()
}

export const listDucts = (signal?: AbortSignal) => request<DuctType[]>('', { signal })
export const saveDuct = (input: DuctInput, id?: string) => request<DuctType>(id ? `/${id}` : '', {
  method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
})
export const deleteDuct = (item: DuctType) => request<void>(`/${item.id}?version=${item.version}`, { method: 'DELETE' })
