const PREFIX = 'code-playground'

export function makeStorageKey(key) {
  return `${PREFIX}:${key}`
}

/** Short fingerprint of a panel's authored source, used to detect that it changed. */
export function hashText(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`
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
