function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function escapeStyleContent(value) {
  return String(value).replace(/<\/style/gi, '<\\/style')
}

function escapeScriptString(value) {
  return JSON.stringify(String(value)).replace(/<\//g, '<\\/')
}

function createBridgeScript(runId) {
  return `
(() => {
  const state = {
    runId: ${escapeScriptString(runId)}
  }

  const send = (type, detail = {}) => {
    try {
      parent.postMessage({
        __codePlayground: true,
        runId: state.runId,
        type,
        detail
      }, '*')
    } catch (_error) {
      // Ignore host messaging failures.
    }
  }

  const toText = (value, depth = 0, seen = new WeakSet()) => {
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
    if (typeof value === 'function') {
      return value.name ? '[Function ' + value.name + ']' : '[Function]'
    }
    if (value instanceof Error) {
      return value.stack || value.message || String(value)
    }
    if (value instanceof Element) {
      return value.outerHTML.replace(/\\s+/g, ' ').slice(0, 240)
    }
    if (Array.isArray(value)) {
      if (depth > 1) return '[Array(' + value.length + ')]'
      return '[' + value.map((item) => toText(item, depth + 1, seen)).join(', ') + ']'
    }
    if (typeof value === 'object') {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
      if (depth > 1) return '[Object]'
      try {
        return JSON.stringify(value, (_key, nested) => {
          if (typeof nested === 'function') return '[Function]'
          if (nested instanceof Error) return nested.message
          if (nested instanceof Element) return nested.outerHTML
          return nested
        })
      } catch (_error) {
        return Object.prototype.toString.call(value)
      }
    }
    return String(value)
  }

  const setRunId = (nextRunId) => {
    if (typeof nextRunId === 'string' && nextRunId) {
      state.runId = nextRunId
    }
  }

  const sendReady = (executionMode = 'full') => {
    send('ready', {
      timestamp: new Date().toISOString(),
      mode: document.documentElement.getAttribute('data-mode') || '',
      theme: document.documentElement.getAttribute('data-theme') || '',
      title: document.title || '',
      executionMode
    })
  }

  const executeUserCode = (userCode, executionMode = 'soft', shouldSendReady = true) => {
    try {
      if (String(userCode).trim()) {
        globalThis.eval(String(userCode))
      }
    } catch (error) {
      console.error(error)
    }

    if (shouldSendReady) {
      sendReady(executionMode)
    }
  }

  Object.defineProperty(globalThis, '__codePlaygroundBridge', {
    configurable: true,
    value: {
      run({ runId: nextRunId = '', userCode = '', executionMode = 'soft', sendReady: shouldSendReady = true } = {}) {
        setRunId(nextRunId)
        executeUserCode(userCode, executionMode, shouldSendReady)
      }
    }
  })

  ;['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    const original = console[method] ? console[method].bind(console) : null
    console[method] = (...args) => {
      send('console', {
        level: method,
        text: args.map((arg) => toText(arg)).join(' '),
        timestamp: new Date().toISOString()
      })
      if (original) original(...args)
    }
  })

  window.addEventListener('error', (event) => {
    send('runtime-error', {
      level: 'error',
      text: event.error?.stack || event.message || 'Unknown runtime error',
      timestamp: new Date().toISOString()
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    send('runtime-error', {
      level: 'error',
      text: event.reason?.stack || event.reason?.message || String(event.reason),
      timestamp: new Date().toISOString()
    })
  })

  window.addEventListener('message', (event) => {
    const payload = event.data
    if (!payload || payload.__codePlayground !== true || payload.type !== 'soft-run') return

    const detail = payload.detail || {}
    globalThis.__codePlaygroundBridge.run({
      runId: detail.runId || '',
      userCode: detail.js || '',
      executionMode: 'soft',
      sendReady: true
    })
  })

  const measure = () => {
    const target = document.scrollingElement || document.documentElement
    if (!target) return 0
    return target.scrollHeight
  }

  const sendResize = () => {
    send('resize', { scrollHeight: measure() })
  }

  if (typeof ResizeObserver === 'function') {
    const target = document.scrollingElement || document.documentElement
    if (target) {
      new ResizeObserver(() => sendResize()).observe(target)
    }
  }
  window.addEventListener('load', sendResize)
  if (document.readyState === 'complete') {
    sendResize()
  } else {
    document.addEventListener('DOMContentLoaded', sendResize)
  }
})()
  `.trim()
}

function createRuntimeScript({ runId, userJs, sendReady, includeBridge }) {
  const readyClause = sendReady
    ? `
    parent.postMessage({
      __codePlayground: true,
      runId,
      type: 'ready',
      detail: {
        timestamp: new Date().toISOString(),
        mode: document.documentElement.getAttribute('data-mode') || '',
        theme: document.documentElement.getAttribute('data-theme') || '',
        title: document.title || '',
        executionMode: 'full'
      }
    }, '*')
    `
    : ''

  return `
(() => {
  const runId = ${escapeScriptString(runId)}
  const userCode = ${escapeScriptString(userJs)}

  try {
    ${includeBridge
      ? `
    if (globalThis.__codePlaygroundBridge?.run) {
      globalThis.__codePlaygroundBridge.run({
        runId,
        userCode,
        executionMode: 'full',
        sendReady: ${sendReady ? 'true' : 'false'}
      })
      return
    }
    `
      : ''}
    if (userCode.trim()) {
      globalThis.eval(userCode)
    }
  } catch (error) {
    console.error(error)
  }

  ${readyClause}
})()
  `.trim()
}

export function normalizePlaygroundSources({ html = '', css = '', js = '', head = '' }) {
  const source = String(html || '')
  const looksLikeDocument = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(source)

  if (!looksLikeDocument) {
    return {
      bodyHtml: source,
      headHtml: String(head || ''),
      cssText: String(css || ''),
      jsText: String(js || '')
    }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(source, 'text/html')

  const inlineStyles = Array.from(doc.querySelectorAll('style'))
    .map((styleEl) => styleEl.textContent || '')
    .join('\n\n')
  doc.querySelectorAll('style').forEach((styleEl) => styleEl.remove())

  const inlineScripts = Array.from(doc.querySelectorAll('script:not([src])'))
    .map((scriptEl) => scriptEl.textContent || '')
    .join('\n\n')
  doc.querySelectorAll('script:not([src])').forEach((scriptEl) => scriptEl.remove())

  return {
    bodyHtml: doc.body?.innerHTML || '',
    headHtml: [doc.head?.innerHTML || '', String(head || '')].filter(Boolean).join('\n'),
    cssText: [inlineStyles, String(css || '')].filter(Boolean).join('\n\n'),
    jsText: [inlineScripts, String(js || '')].filter(Boolean).join('\n\n')
  }
}

function buildDocument({
  html,
  css,
  js,
  head,
  title,
  baseUrl,
  mode,
  theme,
  inheritTheme,
  runId,
  includeBridge,
  sendReady
}) {
  const normalized = normalizePlaygroundSources({ html, css, js, head })
  const htmlAttributes = []

  if (inheritTheme && theme) {
    htmlAttributes.push(`data-theme="${escapeAttribute(theme)}"`)
  }
  if (inheritTheme && mode) {
    htmlAttributes.push(`data-mode="${escapeAttribute(mode)}"`)
  }

  const documentMode = mode || 'light'
  const bridgeScript = includeBridge ? createBridgeScript(runId) : ''
  const runtimeScript = createRuntimeScript({
    runId,
    userJs: normalized.jsText,
    sendReady,
    includeBridge
  })

  return `
<!doctype html>
<html ${htmlAttributes.join(' ')}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base href="${escapeAttribute(baseUrl)}">
    <title>${escapeHtml(title || 'Code Playground Preview')}</title>
    ${normalized.headHtml}
    <style>
      :root {
        color-scheme: ${escapeHtml(documentMode)};
      }
      ${escapeStyleContent(normalized.cssText)}
    </style>
  </head>
  <body>
    ${normalized.bodyHtml}
    ${includeBridge ? `<script>${bridgeScript}</script>` : ''}
    <script>${runtimeScript}</script>
  </body>
</html>
  `.trim()
}

export function composePreviewDocument(options) {
  return buildDocument({
    ...options,
    includeBridge: true,
    sendReady: true
  })
}

export function composeExportDocument(options) {
  return buildDocument({
    ...options,
    includeBridge: false,
    sendReady: false
  })
}
