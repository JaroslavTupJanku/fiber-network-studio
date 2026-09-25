import type { KeyboardEvent } from 'react'

export function acceptExampleOnArrowRight(
  event: KeyboardEvent<HTMLInputElement>,
  onAccept: (value: string) => void,
  suggestedValue?: string,
) {
  if (event.key !== 'ArrowRight' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const input = event.currentTarget
  if (input.value) return
  const example = suggestedValue ?? (/^Např\.\s*(.+)$/u.exec(input.placeholder)?.[1] ?? '')
  if (!example) return
  event.preventDefault()
  onAccept(example)
}
