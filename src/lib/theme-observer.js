const listeners = new Set()
let observer = null
let currentSignature = ''

function getThemeSourceElement() {
  return document.documentElement.getAttribute('data-theme')
    ? document.documentElement
    : document.body?.getAttribute('data-theme')
      ? document.body
      : null
}

function detectMode() {
  const html = document.documentElement
  const body = document.body
  if (!html || !body) return null

  if (html.classList.contains('dark') || body.classList.contains('dark')) return 'dark'

  if (html.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark') {
    return 'dark'
  }
  if (html.getAttribute('data-theme') === 'light' || body.getAttribute('data-theme') === 'light') {
    return 'light'
  }

  if (html.getAttribute('data-bs-theme') === 'dark' || body.getAttribute('data-bs-theme') === 'dark') {
    return 'dark'
  }
  if (html.getAttribute('data-bs-theme') === 'light' || body.getAttribute('data-bs-theme') === 'light') {
    return 'light'
  }

  if (html.getAttribute('data-mode') === 'dark') return 'dark'
  if (html.getAttribute('data-mode') === 'light') return 'light'

  const colorScheme = getComputedStyle(html).colorScheme
  if (colorScheme === 'dark') return 'dark'
  if (colorScheme === 'light') return 'light'

  return null
}

export function detectPageThemeState() {
  const themeElement = getThemeSourceElement()
  return {
    mode: detectMode(),
    theme: themeElement?.getAttribute('data-theme') || ''
  }
}

function makeSignature(state) {
  return `${state.mode || 'auto'}::${state.theme || ''}`
}

function notifyListeners(force = false) {
  const state = detectPageThemeState()
  const nextSignature = makeSignature(state)
  if (!force && nextSignature === currentSignature) return
  currentSignature = nextSignature
  listeners.forEach((listener) => listener(state))
}

function startObserver() {
  if (observer) return

  observer = new MutationObserver(() => notifyListeners())
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-bs-theme', 'data-mode', 'style']
  })

  if (document.body) {
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-bs-theme', 'data-mode', 'style']
    })
  }
}

function stopObserver() {
  if (!observer) return
  observer.disconnect()
  observer = null
}

export function observePageTheme(listener) {
  listeners.add(listener)
  if (listeners.size === 1) {
    startObserver()
  }

  notifyListeners(true)

  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      currentSignature = ''
      stopObserver()
    }
  }
}
