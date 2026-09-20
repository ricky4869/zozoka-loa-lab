export function usePersistedNumber(key: string, defaultValue: number) {
  const storageKey = `loa-lab:${key}`
  const state = ref(defaultValue)

  if (import.meta.client) {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) {
      const parsed = Number(stored)
      if (!Number.isNaN(parsed)) state.value = parsed
    }

    watch(state, (value) => {
      localStorage.setItem(storageKey, String(value))
    })
  }

  return state
}
