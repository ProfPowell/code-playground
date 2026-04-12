const PREFIX = 'code-playground'

export function makeStorageKey(key) {
  return `${PREFIX}:${key}`
}

export function readStorage(key) {
  try {
    const raw = localStorage.getItem(makeStorageKey(key))
    return raw ? JSON.parse(raw) : null
  } catch (_error) {
    return null
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(makeStorageKey(key), JSON.stringify(value))
  } catch (_error) {
    // Ignore storage quota and privacy mode failures.
  }
}
