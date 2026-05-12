/**
 * Code Playground Web Component
 * Live HTML, CSS, and JavaScript editing with sandboxed preview.
 *
 * @element code-playground
 * @attr {'auto'|'light'|'dark'} mode - Color mode for the shell. `auto` follows page signals.
 * @attr {'auto'|'manual'} run-mode - Whether edits re-run automatically.
 * @attr {number} debounce - Debounce delay in milliseconds for auto-run mode.
 * @attr {'right'|'bottom'} preview-position - Position of the preview pane.
 * @attr {string} html-src - External HTML file to load into the HTML panel.
 * @attr {string} css-src - External CSS file to load into the CSS panel.
 * @attr {string} js-src - External JavaScript file to load into the JS panel.
 * @attr {string} head-src - External preview-only head fragment to load into the preview document.
 * @attr {string} persist - localStorage key used to remember source and layout state.
 * @attr {boolean} inherit-theme - Propagate `data-mode` and `data-theme` into the preview iframe.
 * @attr {boolean|string} show-console - Set to "false" to hide the console panel.
 * @attr {boolean} fit-preview - Size the host element to match the preview iframe's content height.
 *
 * @csspart toolbar - File tabs, status, and primary actions.
 * @csspart editor-panel - Code editor workspace.
 * @csspart preview-panel - Preview iframe panel.
 * @csspart console-panel - Console output panel.
 */

import { composeExportDocument, composePreviewDocument, normalizePlaygroundSources } from './lib/preview-document.js'
import { readStorage, writeStorage } from './lib/storage.js'
import { observePageTheme } from './lib/theme-observer.js'

const SOURCE_TYPES = ['html', 'css', 'js']
const ALL_SOURCE_TYPES = [...SOURCE_TYPES, 'head']
const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug']
const CONSOLE_FILTERS = ['all', ...CONSOLE_LEVELS]
const SOURCE_ATTRS = {
  html: 'html-src',
  css: 'css-src',
  js: 'js-src',
  head: 'head-src'
}
const DEFAULT_DEBOUNCE = 300
const DEFAULT_SPLIT = 48
const MIN_SPLIT = 28
const MAX_SPLIT = 72
const PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals allow-downloads allow-popups'

if (typeof document !== 'undefined') {
  const antiFlash = document.createElement('style')
  antiFlash.textContent = 'code-playground:not(:defined){display:block;opacity:0}'
  document.head.appendChild(antiFlash)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  throw new Error('Clipboard API unavailable')
}

function formatTimeLabel(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (_error) {
    return timestamp
  }
}

function createRunId() {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class CodePlayground extends HTMLElement {
  static get observedAttributes() {
    return [
      'mode',
      'run-mode',
      'debounce',
      'preview-position',
      'show-console',
      'persist',
      'inherit-theme',
      'fit-preview',
      'html-src',
      'css-src',
      'js-src',
      'head-src'
    ]
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })

    this._activeTab = 'html'
    this._editors = new Map()
    this._sourceElements = new Map()
    this._persistedValueKeys = new Set()
    this._values = { html: '', css: '', js: '', head: '' }
    this._initialValues = { html: '', css: '', js: '', head: '' }
    this._appliedValues = { html: '', css: '', js: '', head: '' }
    this._consoleEntries = []
    this._consoleFilter = 'all'
    this._consoleSearch = ''
    this._consoleCollapseRepeats = true
    this._pageTheme = { mode: null, theme: '' }
    this._stopThemeObserver = null
    this._runTimer = 0
    this._runId = ''
    this._dirty = false
    this._dirtyTypes = new Set()
    this._ready = false
    this._activeExecutionMode = 'full'
    this._lastExecutionMode = 'full'
    this._splitPosition = DEFAULT_SPLIT
    this._initialized = false
    this._suspendEditorSync = false
    this._hasThemeSnapshot = false
    this._editorRuntime = null
    this._editorRuntimePromise = null
    this._editorRuntimeFailed = false
    this._editorBootstrapHandle = 0
    this._editorBootstrapMode = ''
    this._loadingSources = false
    this._sourceRequestId = 0
    this._hasConnectedOnce = false
    this._consoleOpen = false
    this._viewMode = 'split'
    this._fitPreviewFallbackHeight = ''
    this._fitPreviewFallbackCaptured = false
    this._lastPreviewScrollHeight = 0

    this._handleMessage = this._handleMessage.bind(this)
    this._handleDividerPointerDown = this._handleDividerPointerDown.bind(this)
    this._handleShareOutsideClick = (e) => {
      const menu = this.shadowRoot.querySelector('.share-menu')
      if (!menu) return
      if (!e.composedPath().includes(menu)) {
        this._closeShareMenu()
      }
    }
    this._shareOutsideClickTimer = 0
  }

  connectedCallback() {
    if (!this.shadowRoot.children.length) {
      this._renderShell()
    }

    if (!this._initialized) {
      this._captureInitialSources()

      const persisted = this.persistKey ? readStorage(this.persistKey) : null
      if (persisted?.values) {
        this._values = { ...this._values, ...persisted.values }
      }
      this._splitPosition = clamp(persisted?.splitPosition ?? DEFAULT_SPLIT, MIN_SPLIT, MAX_SPLIT)
      const validTabs = [...SOURCE_TYPES, 'result']
      this._activeTab = persisted?.activeTab && validTabs.includes(persisted.activeTab)
        ? persisted.activeTab
        : 'html'
      this._consoleOpen = persisted?.consoleOpen ?? false
      this._viewMode = persisted?.viewMode === 'code' ? 'code' : 'split'

      this._bindShellEvents()
      this._refreshDirtyState()
      this._renderConsole()
      this._initialized = true
    }

    window.addEventListener('message', this._handleMessage)

    if (!this._stopThemeObserver) {
      this._stopThemeObserver = observePageTheme((state) => this._onPageThemeChange(state))
    }

    this._applySplitPosition()
    this._applyTabState()
    this._applyUiState()
    this._scheduleEditorBootstrap()

    if (!this._hasConnectedOnce && this._hasExternalSources()) {
      this._hasConnectedOnce = true
      this.reloadSources().finally(() => {
        if (this.isConnected) {
          this.run()
        }
      })
      return
    }

    this._hasConnectedOnce = true
    this.run()
  }

  disconnectedCallback() {
    window.removeEventListener('message', this._handleMessage)
    this._stopThemeObserver?.()
    this._stopThemeObserver = null
    clearTimeout(this._runTimer)
    this._cancelEditorBootstrap()
    clearTimeout(this._shareOutsideClickTimer)
    document.removeEventListener('click', this._handleShareOutsideClick)
    this._disableFitPreview()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this._initialized) return

    if (name === 'mode' || name === 'inherit-theme') {
      this._applyUiState()
      this.run()
      return
    }

    if (name === 'run-mode') {
      this._applyUiState()
      if (this.runMode === 'auto' && this._dirty) {
        this._scheduleRun()
      }
      return
    }

    if (name === 'preview-position') {
      this._applySplitPosition()
      return
    }

    if (name === 'show-console') {
      this._applyUiState()
      return
    }

    if (name === 'fit-preview') {
      if (newValue === null) {
        this._disableFitPreview()
      } else {
        this._enableFitPreview()
      }
      return
    }

    if (name === 'persist') {
      this._persistState()
      return
    }

    if (Object.values(SOURCE_ATTRS).includes(name)) {
      this._applyUiState()
      this.reloadSources({
        types: [this._getTypeFromSourceAttribute(name)],
        forceApply: true
      }).finally(() => {
        if (this.isConnected) {
          this.run()
        }
      })
    }
  }

  get value() {
    return this.getValue()
  }

  set value(nextValue) {
    this.setValue(nextValue)
  }

  get mode() {
    const attr = this.getAttribute('mode')
    return attr === 'light' || attr === 'dark' ? attr : 'auto'
  }

  set mode(value) {
    this.setAttribute('mode', value)
  }

  get runMode() {
    return this.getAttribute('run-mode') === 'manual' ? 'manual' : 'auto'
  }

  set runMode(value) {
    this.setAttribute('run-mode', value)
  }

  get previewPosition() {
    return this.getAttribute('preview-position') === 'bottom' ? 'bottom' : 'right'
  }

  set previewPosition(value) {
    this.setAttribute('preview-position', value)
  }

  get debounce() {
    const value = Number(this.getAttribute('debounce'))
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DEBOUNCE
  }

  set debounce(value) {
    this.setAttribute('debounce', String(value))
  }

  get persistKey() {
    return this.getAttribute('persist') || ''
  }

  set persistKey(value) {
    if (value) {
      this.setAttribute('persist', String(value))
    } else {
      this.removeAttribute('persist')
    }
  }

  get inheritTheme() {
    return this.hasAttribute('inherit-theme') && this.getAttribute('inherit-theme') !== 'false'
  }

  set inheritTheme(value) {
    this.toggleAttribute('inherit-theme', Boolean(value))
  }

  get showConsole() {
    const attr = this.getAttribute('show-console')
    return attr === null ? true : attr !== 'false'
  }

  set showConsole(value) {
    if (value) {
      this.removeAttribute('show-console')
    } else {
      this.setAttribute('show-console', 'false')
    }
  }

  get fitPreview() {
    return this.hasAttribute('fit-preview') && this.getAttribute('fit-preview') !== 'false'
  }

  set fitPreview(value) {
    this.toggleAttribute('fit-preview', Boolean(value))
  }

  get sourceUrls() {
    return {
      html: this.getAttribute('html-src') || '',
      css: this.getAttribute('css-src') || '',
      js: this.getAttribute('js-src') || '',
      head: this.getAttribute('head-src') || ''
    }
  }

  set sourceUrls(value) {
    if (!value || typeof value !== 'object') return
    for (const type of ALL_SOURCE_TYPES) {
      const attr = SOURCE_ATTRS[type]
      const next = value[type]
      if (next) {
        this.setAttribute(attr, String(next))
      } else if (type in value) {
        this.removeAttribute(attr)
      }
    }
  }

  getValue() {
    return { ...this._values }
  }

  setValue(nextValue) {
    if (!nextValue || typeof nextValue !== 'object') return

    let hasChanges = false

    for (const type of SOURCE_TYPES) {
      if (type in nextValue && typeof nextValue[type] === 'string' && nextValue[type] !== this._values[type]) {
        this._values[type] = nextValue[type]
        this._setEditorValue(type, nextValue[type])
        this._syncSourceElement(type, nextValue[type])
        hasChanges = true
      }
    }

    if ('head' in nextValue && typeof nextValue.head === 'string' && nextValue.head !== this._values.head) {
      this._values.head = nextValue.head
      this._syncSourceElement('head', nextValue.head)
      hasChanges = true
    }

    if (!hasChanges) return

    this._refreshDirtyState()
    this._persistState()
    this._applyUiState()

    if (this.runMode === 'auto') {
      this._scheduleRun()
    }
  }

  run() {
    this._executePreview('full')
  }

  softRun() {
    this._executePreview('soft')
  }

  reset() {
    this._values = { ...this._initialValues }

    for (const type of SOURCE_TYPES) {
      this._setEditorValue(type, this._values[type])
      this._syncSourceElement(type, this._values[type])
    }

    this._syncSourceElement('head', this._values.head)
    this._refreshDirtyState()
    this._persistState()
    this._applyUiState()
    this.run()
  }

  async copy(type = this._activeTab) {
    if (!SOURCE_TYPES.includes(type)) return
    await copyText(this._values[type])
  }

  async copyConsole() {
    const text = this._formatVisibleConsoleText()
    if (!text) {
      throw new Error('No visible console output to copy')
    }
    await copyText(text)
  }

  downloadHTML() {
    const doc = composeExportDocument({
      ...this._values,
      title: this.getAttribute('title') || 'Code Playground Export',
      baseUrl: this.getAttribute('base-url') || document.baseURI,
      mode: this._effectiveMode(),
      theme: this._pageTheme.theme,
      inheritTheme: this.inheritTheme,
      runId: this._runId
    })

    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = this.getAttribute('download-filename') || 'playground.html'
    link.click()
    URL.revokeObjectURL(url)
  }

  openInCodePen() {
    const normalized = normalizePlaygroundSources(this._values)
    const payload = {
      title: this.getAttribute('title') || 'Code Playground Demo',
      html: [normalized.headHtml, normalized.bodyHtml].filter(Boolean).join('\n'),
      css: normalized.cssText,
      js: normalized.jsText,
      editors: '111'
    }

    const form = document.createElement('form')
    form.action = 'https://codepen.io/pen/define'
    form.method = 'POST'
    form.target = '_blank'

    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'data'
    input.value = JSON.stringify(payload)

    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  clearConsole() {
    this._consoleEntries = []
    this._renderConsole()
  }

  _refreshDirtyState() {
    this._dirtyTypes = new Set(
      ALL_SOURCE_TYPES.filter((type) => this._values[type] !== this._appliedValues[type])
    )
    this._dirty = this._dirtyTypes.size > 0
  }

  _needsFullRebuild() {
    return Array.from(this._dirtyTypes).some((type) => type !== 'js')
  }

  _pendingExecutionMode() {
    return this._needsFullRebuild() ? 'full' : 'soft'
  }

  _canSoftRun() {
    const iframe = this.shadowRoot.querySelector('iframe')
    return Boolean(iframe?.contentWindow) && this._ready
  }

  _runPendingChanges({ preferSoft = false } = {}) {
    const shouldSoftRun = this._canSoftRun() && (preferSoft || this._pendingExecutionMode() === 'soft')

    if (shouldSoftRun) {
      this.softRun()
      return
    }

    this.run()
  }

  _executePreview(executionMode = 'full') {
    const iframe = this.shadowRoot.querySelector('iframe')
    if (!iframe) return

    if (executionMode === 'soft' && !this._canSoftRun()) {
      this._executePreview('full')
      return
    }

    clearTimeout(this._runTimer)

    const runId = createRunId()
    this._runId = runId
    this._activeExecutionMode = executionMode
    this._ready = false
    this._clearConsoleEntries({ origin: 'preview' })

    if (executionMode === 'soft') {
      this._appliedValues.js = this._values.js
      this._refreshDirtyState()
      iframe.contentWindow?.postMessage({
        __codePlayground: true,
        type: 'soft-run',
        detail: {
          runId,
          js: this._values.js
        }
      }, '*')
    } else {
      this._appliedValues = { ...this._values }
      this._refreshDirtyState()
      iframe.srcdoc = composePreviewDocument({
        ...this._values,
        title: this.getAttribute('title') || 'Code Playground Preview',
        baseUrl: this.getAttribute('base-url') || document.baseURI,
        mode: this._effectiveMode(),
        theme: this._pageTheme.theme,
        inheritTheme: this.inheritTheme,
        runId
      })
    }

    this._applyUiState()
    this.dispatchEvent(new CustomEvent('code-playground:run', {
      detail: {
        runId,
        values: this.getValue(),
        executionMode
      },
      bubbles: true,
      composed: true
    }))

    this._persistState()
  }

  _enableFitPreview() {
    if (!this._fitPreviewFallbackCaptured) {
      this._fitPreviewFallbackHeight = this.style.height || ''
      this._fitPreviewFallbackCaptured = true
    }
    if (this._lastPreviewScrollHeight > 0) {
      this.style.height = `${this._lastPreviewScrollHeight}px`
    }
  }

  _disableFitPreview() {
    if (this._fitPreviewFallbackCaptured) {
      this.style.height = this._fitPreviewFallbackHeight
      this._fitPreviewFallbackCaptured = false
      this._fitPreviewFallbackHeight = ''
    }
  }

  _applyFitPreviewHeight(scrollHeight) {
    if (typeof scrollHeight !== 'number' || scrollHeight <= 0) return
    this._lastPreviewScrollHeight = scrollHeight
    if (!this.fitPreview) return
    this.style.height = `${scrollHeight}px`
  }

  /**
   * Reload any configured external source files.
   * @param {{ types?: string[], forceApply?: boolean }} [options]
   */
  async reloadSources(options = {}) {
    const requestedTypes = Array.isArray(options.types) && options.types.length
      ? options.types.filter((type) => ALL_SOURCE_TYPES.includes(type))
      : ALL_SOURCE_TYPES.filter((type) => this._getSourceUrl(type))

    if (!requestedTypes.length) {
      return { loaded: [], failed: [] }
    }

    const requestId = ++this._sourceRequestId
    this._loadingSources = true
    this._applyUiState()

    const loaded = []
    const failed = []
    let appliedValuesChanged = false

    await Promise.all(requestedTypes.map(async (type) => {
      const src = this._getSourceUrl(type)
      if (!src) return

      try {
        const value = await this._fetchSourceText(type, src)
        loaded.push({ type, src, value })
      } catch (error) {
        failed.push({
          type,
          src,
          error: error instanceof Error ? error : new Error(String(error))
        })
      }
    }))

    if (requestId !== this._sourceRequestId) {
      return { loaded: [], failed: [] }
    }

    for (const item of loaded) {
      this._initialValues[item.type] = item.value

      const shouldApply = options.forceApply === true || !this._persistedValueKeys.has(item.type)
      if (shouldApply) {
        if (this._values[item.type] !== item.value) {
          this._values[item.type] = item.value
          this._setEditorValue(item.type, item.value)
          this._syncSourceElement(item.type, item.value)
          appliedValuesChanged = true
        }
      }
    }

    for (const item of failed) {
      const message = `Failed to load ${item.type.toUpperCase()} source from ${item.src}: ${item.error.message}`
      this._pushHostConsoleEntry({
        level: 'error',
        text: message,
        timestamp: new Date().toISOString()
      })
      this.dispatchEvent(new CustomEvent('code-playground:source-error', {
        detail: {
          type: item.type,
          src: item.src,
          error: item.error.message
        },
        bubbles: true,
        composed: true
      }))
    }

    this._loadingSources = false
    if (appliedValuesChanged) {
      this._refreshDirtyState()
    }
    this._applyUiState()
    this._persistState()

    if (loaded.length) {
      this.dispatchEvent(new CustomEvent('code-playground:sources-loaded', {
        detail: {
          loaded: loaded.map(({ type, src }) => ({ type, src })),
          values: this.getValue()
        },
        bubbles: true,
        composed: true
      }))
    }

    return {
      loaded,
      failed
    }
  }

  _renderShell() {
    this.shadowRoot.innerHTML = `
      <style>${this._getStyles()}</style>
      <div class="shell">
        <div class="toolbar" part="toolbar">
          <div class="tabs" role="tablist" aria-label="Code panels">
            <button class="tab-button" data-tab="html" role="tab" aria-selected="false">HTML</button>
            <button class="tab-button" data-tab="css" role="tab" aria-selected="false">CSS</button>
            <button class="tab-button" data-tab="js" role="tab" aria-selected="false">JS</button>
            <button class="tab-button" data-tab="result" role="tab" aria-selected="false">Result</button>
          </div>
          <div class="status" data-role="status">Starting preview</div>
          <div class="actions">
            <button class="icon-button" data-action="reload-sources" type="button" title="Reload external sources" aria-label="Reload external sources" hidden>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 8a7 7 0 0113-3.5M15 8a7 7 0 01-13 3.5"/><path d="M14 1v4h-4M2 15v-4h4"/></svg>
            </button>
            <button class="icon-button" data-action="soft-run" type="button" title="Run JS" aria-label="Run JavaScript">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2l10 6-10 6V2z"/></svg>
            </button>
            <button class="icon-button primary" data-action="run" type="button" title="Rebuild preview" aria-label="Rebuild preview">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 8a7 7 0 0113-3.5M15 8a7 7 0 01-13 3.5"/><path d="M14 1v4h-4M2 15v-4h4"/></svg>
            </button>
            <button class="icon-button" data-action="reset" type="button" title="Reset to original" aria-label="Reset to original">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 2v5h5"/><path d="M3 11a6 6 0 109-4"/><path d="M2 7l1-4"/></svg>
            </button>
            <button class="icon-button" data-action="toggle-layout" type="button" title="Toggle split view" aria-label="Toggle split view">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="2"/><line x1="8" y1="2" x2="8" y2="14"/></svg>
            </button>
            <div class="share-container">
              <button class="icon-button share-trigger" data-action="share-toggle" type="button" title="Share" aria-label="Share" aria-expanded="false" aria-haspopup="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10V1M8 1L5 4M8 1l3 3"/><path d="M2 10v4a1 1 0 001 1h10a1 1 0 001-1v-4"/></svg>
              </button>
              <div class="share-menu" role="menu" hidden>
                <button class="share-menu-item" data-action="copy" role="menuitem" type="button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11V3a1.5 1.5 0 011.5-1.5H11"/></svg>
                  Copy source
                </button>
                <button class="share-menu-item" data-action="download" role="menuitem" type="button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1v10M8 11l-3-3M8 11l3-3"/><path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg>
                  Download HTML
                </button>
                <button class="share-menu-item" data-action="codepen" role="menuitem" type="button">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0L0 5v6l8 5 8-5V5L8 0zM7 10.5L2 7.5v-2l5 3v2zm1-3l-5-3L8 2l5 2.5-5 3zm1 3v-2l5-3v2l-5 3z"/></svg>
                  Open in CodePen
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="workspace" data-role="workspace">
          <section class="editor-panel" part="editor-panel">
            <div class="editor-frame" data-editor-panel="html" role="tabpanel" aria-label="HTML editor">
              <div class="editor-host" data-editor="html" data-editor-state="idle">
                <div class="editor-placeholder">Loading editor…</div>
              </div>
            </div>
            <div class="editor-frame" data-editor-panel="css" role="tabpanel" aria-label="CSS editor" hidden>
              <div class="editor-host" data-editor="css" data-editor-state="idle">
                <div class="editor-placeholder">Loading editor…</div>
              </div>
            </div>
            <div class="editor-frame" data-editor-panel="js" role="tabpanel" aria-label="JavaScript editor" hidden>
              <div class="editor-host" data-editor="js" data-editor-state="idle">
                <div class="editor-placeholder">Loading editor…</div>
              </div>
            </div>
          </section>
          <div class="divider" data-role="divider" role="separator" tabindex="0" aria-label="Resize editor and preview panels"></div>
          <section class="preview-panel" part="preview-panel">
            <div class="panel-header">
              <span>Preview</span>
              <span class="panel-meta" data-role="preview-meta"></span>
            </div>
            <iframe
              title="Code playground preview"
              sandbox="${PREVIEW_SANDBOX}"
              loading="lazy"></iframe>
          </section>
        </div>
        <section class="console-panel" part="console-panel">
          <button class="console-tray-toggle" data-action="toggle-console" type="button" aria-expanded="false">
            <svg class="console-tray-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 2l4 4-4 4"/></svg>
            <span>Console</span>
            <span class="panel-meta console-summary" data-role="console-summary">0 entries</span>
          </button>
          <div class="console-tray-body">
            <div class="panel-header console-toolbar">
              <div class="console-toolbar-main">
                <div class="console-filters" role="group" aria-label="Filter console output">
                  ${CONSOLE_FILTERS.map((filter) => `
                    <button
                      class="action-button subtle console-filter-button"
                      data-console-filter="${filter}"
                      data-filter="${filter}"
                      type="button"
                      aria-pressed="false">
                      ${filter === 'all' ? 'All' : filter}
                    </button>
                  `).join('')}
                </div>
              </div>
              <div class="console-toolbar-secondary">
                <label class="console-search">
                  <span class="visually-hidden">Search console output</span>
                  <input
                    class="console-search-input"
                    data-role="console-search"
                    type="search"
                    placeholder="Filter output"
                    aria-label="Search console output"
                    spellcheck="false">
                </label>
                <label class="console-toggle">
                  <input data-role="console-collapse" type="checkbox" checked>
                  <span>Collapse repeats</span>
                </label>
                <button class="action-button subtle" data-action="copy-console" type="button">Copy visible</button>
                <button class="action-button subtle" data-action="clear-console" type="button">Clear</button>
              </div>
            </div>
            <div class="console-entries" data-role="console" role="log" aria-live="polite"></div>
          </div>
        </section>
      </div>
    `
  }

  _captureInitialSources() {
    for (const type of ALL_SOURCE_TYPES) {
      const el = this.querySelector(`[slot="${type}"]`)
      this._sourceElements.set(type, el || null)

      let value = ''
      if (el instanceof HTMLTextAreaElement) {
        value = el.value || el.textContent || ''
        el.hidden = true
      } else if (el instanceof HTMLTemplateElement) {
        value = el.innerHTML || ''
      } else if (el) {
        value = type === 'head' ? el.innerHTML || '' : el.textContent || ''
        el.hidden = true
      }

      this._values[type] = value
      this._initialValues[type] = value
      this._appliedValues[type] = value
    }

    const persisted = this.persistKey ? readStorage(this.persistKey) : null
    this._persistedValueKeys = new Set(
      Object.entries(persisted?.values || {})
        .filter(([, value]) => typeof value === 'string')
        .map(([type]) => type)
        .filter((type) => ALL_SOURCE_TYPES.includes(type))
    )
  }

  _bindShellEvents() {
    this.shadowRoot.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        this._activeTab = button.getAttribute('data-tab')
        this._applyTabState()
        this._persistState()
        this._loadEditorRuntime().catch(() => {})
      })
    })

    this.shadowRoot.querySelector('[data-action="run"]')
      ?.addEventListener('click', () => this.run())

    this.shadowRoot.querySelector('[data-action="soft-run"]')
      ?.addEventListener('click', () => this.softRun())

    this.shadowRoot.querySelector('[data-action="reload-sources"]')
      ?.addEventListener('click', () => {
        this.reloadSources({
          forceApply: true
        }).finally(() => {
          if (this.isConnected) {
            this.run()
          }
        })
      })

    this.shadowRoot.querySelector('[data-action="reset"]')
      ?.addEventListener('click', () => this.reset())

    this.shadowRoot.querySelector('[data-action="share-toggle"]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation()
        this._toggleShareMenu()
      })

    this.shadowRoot.querySelector('[data-action="copy"]')
      ?.addEventListener('click', async () => {
        this._closeShareMenu()
        try {
          await this.copy()
          this._setStatus(`Copied ${this._activeTab.toUpperCase()}`)
        } catch (_error) {
          this._pushHostConsoleEntry({
            level: 'error',
            text: 'Copy failed: Clipboard API unavailable',
            timestamp: new Date().toISOString()
          })
        }
      })

    this.shadowRoot.querySelector('[data-action="download"]')
      ?.addEventListener('click', () => {
        this._closeShareMenu()
        this.downloadHTML()
      })

    this.shadowRoot.querySelector('[data-action="codepen"]')
      ?.addEventListener('click', () => {
        this._closeShareMenu()
        this.openInCodePen()
      })

    this.shadowRoot.querySelector('[data-action="toggle-layout"]')
      ?.addEventListener('click', () => {
        this._viewMode = this._viewMode === 'split' ? 'code' : 'split'
        this._applyViewMode()
        this._persistState()
      })

    this.shadowRoot.querySelector('[data-action="toggle-console"]')
      ?.addEventListener('click', () => {
        this._consoleOpen = !this._consoleOpen
        this._applyConsoleState()
        this._persistState()
      })

    this.shadowRoot.querySelector('[data-action="clear-console"]')
      ?.addEventListener('click', () => this.clearConsole())

    this.shadowRoot.querySelector('[data-action="copy-console"]')
      ?.addEventListener('click', async () => {
        try {
          await this.copyConsole()
          this._setStatus('Copied visible console output')
        } catch (error) {
          this._setStatus(error instanceof Error ? error.message : 'Console copy failed')
        }
      })

    this.shadowRoot.querySelectorAll('[data-console-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        this._consoleFilter = button.getAttribute('data-console-filter') || 'all'
        this._renderConsole()
      })
    })

    this.shadowRoot.querySelector('[data-role="console-search"]')
      ?.addEventListener('input', (event) => {
        this._consoleSearch = event.target && 'value' in event.target
          ? event.target.value.trim().toLowerCase()
          : ''
        this._renderConsole()
      })

    this.shadowRoot.querySelector('[data-role="console-collapse"]')
      ?.addEventListener('change', (event) => {
        this._consoleCollapseRepeats = event.target && 'checked' in event.target
          ? event.target.checked
          : true
        this._renderConsole()
      })

    this.shadowRoot.querySelector('[data-role="divider"]')
      ?.addEventListener('pointerdown', this._handleDividerPointerDown)

    this.shadowRoot.querySelector('[data-role="divider"]')
      ?.addEventListener('keydown', (event) => {
        const axis = this._layoutAxis()
        const delta = event.shiftKey ? 10 : 2

        if ((axis === 'horizontal' && event.key === 'ArrowLeft') || (axis === 'vertical' && event.key === 'ArrowUp')) {
          event.preventDefault()
          this._splitPosition = clamp(this._splitPosition - delta, MIN_SPLIT, MAX_SPLIT)
          this._applySplitPosition()
          this._persistState()
        }

        if ((axis === 'horizontal' && event.key === 'ArrowRight') || (axis === 'vertical' && event.key === 'ArrowDown')) {
          event.preventDefault()
          this._splitPosition = clamp(this._splitPosition + delta, MIN_SPLIT, MAX_SPLIT)
          this._applySplitPosition()
          this._persistState()
        }
      })
  }

  _scheduleEditorBootstrap() {
    if (this._editorRuntime || this._editorRuntimePromise || this._editorRuntimeFailed) return

    const start = () => {
      this._editorBootstrapHandle = 0
      this._editorBootstrapMode = ''
      this._loadEditorRuntime().catch(() => {})
    }

    if (typeof window.requestIdleCallback === 'function') {
      this._editorBootstrapMode = 'idle'
      this._editorBootstrapHandle = window.requestIdleCallback(start, { timeout: 1200 })
      return
    }

    this._editorBootstrapMode = 'timeout'
    this._editorBootstrapHandle = window.setTimeout(start, 180)
  }

  _cancelEditorBootstrap() {
    if (!this._editorBootstrapHandle) return

    if (this._editorBootstrapMode === 'idle' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(this._editorBootstrapHandle)
    } else {
      clearTimeout(this._editorBootstrapHandle)
    }

    this._editorBootstrapHandle = 0
    this._editorBootstrapMode = ''
  }

  async _loadEditorRuntime() {
    if (this._editorRuntime) {
      this._ensureEditorView(this._activeTab)
      return this._editorRuntime
    }

    if (this._editorRuntimePromise) {
      return this._editorRuntimePromise
    }

    this._cancelEditorBootstrap()
    this._setEditorHostState('loading')

    this._editorRuntimePromise = import('./lib/editor-runtime.js')
      .then((runtime) => {
        this._editorRuntime = runtime
        this._editorRuntimeFailed = false
        this._ensureEditorView(this._activeTab)
        this._setEditorHostState('ready')
        this._applyTabState()
        return runtime
      })
      .catch((error) => {
        this._editorRuntimeFailed = true
        this._setEditorHostState('error')
        this._pushHostConsoleEntry({
          level: 'error',
          text: `Editor runtime failed to load: ${error.message || String(error)}`,
          timestamp: new Date().toISOString()
        })
        this._setStatus('Editor failed to load')
        throw error
      })

    return this._editorRuntimePromise
  }

  _ensureEditorView(type) {
    if (!this._editorRuntime || this._editors.has(type)) return

    const mount = this.shadowRoot.querySelector(`[data-editor="${type}"]`)
    if (!mount) return

    mount.innerHTML = ''

    const view = this._editorRuntime.createEditor({
      parent: mount,
      type,
      value: this._values[type],
      onChange: (value) => this._handleEditorValueChange(type, value),
      onRunShortcut: () => this._runPendingChanges({ preferSoft: true })
    })

    this._editors.set(type, view)
  }

  _handleEditorValueChange(type, value) {
    if (this._suspendEditorSync) return

    this._values[type] = value
    this._syncSourceElement(type, value)
    this._refreshDirtyState()
    this._persistState()
    this._applyUiState()

    this.dispatchEvent(new CustomEvent('code-playground:change', {
      detail: {
        panel: type,
        value,
        values: this.getValue()
      },
      bubbles: true,
      composed: true
    }))

    if (this.runMode === 'auto') {
      this._scheduleRun()
    }
  }

  _setEditorHostState(state) {
    this.shadowRoot.querySelectorAll('[data-editor]').forEach((host) => {
      host.setAttribute('data-editor-state', state)
      if (this._editors.has(host.getAttribute('data-editor'))) return

      if (state === 'error') {
        host.innerHTML = '<div class="editor-placeholder editor-placeholder-error">Editor failed to load.</div>'
      } else if (state === 'loading' || state === 'idle') {
        host.innerHTML = '<div class="editor-placeholder">Loading editor…</div>'
      }
    })
  }

  _setEditorValue(type, value) {
    const view = this._editors.get(type)
    if (!view) return

    this._suspendEditorSync = true
    this._editorRuntime?.setEditorValue(view, value)
    this._suspendEditorSync = false
  }

  _syncSourceElement(type, value) {
    const el = this._sourceElements.get(type)
    if (!el) return

    if (el instanceof HTMLTextAreaElement) {
      el.value = value
      return
    }

    if (el instanceof HTMLTemplateElement) {
      el.innerHTML = value
      return
    }

    if (type === 'head') {
      el.innerHTML = value
      return
    }

    el.textContent = value
  }

  _hasExternalSources() {
    return ALL_SOURCE_TYPES.some((type) => Boolean(this._getSourceUrl(type)))
  }

  _getSourceUrl(type) {
    return this.getAttribute(SOURCE_ATTRS[type]) || ''
  }

  _getTypeFromSourceAttribute(attributeName) {
    return ALL_SOURCE_TYPES.find((type) => SOURCE_ATTRS[type] === attributeName) || 'html'
  }

  async _fetchSourceText(type, src) {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const text = await response.text()
    return type === 'head' ? text : text.replace(/\r\n/g, '\n')
  }

  _handleMessage(event) {
    const iframe = this.shadowRoot.querySelector('iframe')
    if (!iframe || event.source !== iframe.contentWindow) return

    const payload = event.data
    if (!payload || payload.__codePlayground !== true || payload.runId !== this._runId) return

    if (payload.type === 'console' || payload.type === 'runtime-error') {
      const entry = {
        origin: 'preview',
        level: payload.detail.level || 'log',
        text: payload.detail.text || '',
        timestamp: payload.detail.timestamp || new Date().toISOString(),
        executionMode: payload.detail.executionMode || this._activeExecutionMode
      }
      this._pushConsoleEntry(entry)

      const eventName = payload.type === 'runtime-error'
        ? 'code-playground:error'
        : 'code-playground:console'

      this.dispatchEvent(new CustomEvent(eventName, {
        detail: entry,
        bubbles: true,
        composed: true
      }))
      return
    }

    if (payload.type === 'resize') {
      this._applyFitPreviewHeight(payload.detail?.scrollHeight)
      return
    }

    if (payload.type === 'ready') {
      this._ready = true
      this._lastExecutionMode = payload.detail.executionMode || this._activeExecutionMode
      this._applyUiState()
      this.dispatchEvent(new CustomEvent('code-playground:ready', {
        detail: payload.detail,
        bubbles: true,
        composed: true
      }))
    }
  }

  _pushHostConsoleEntry(entry) {
    this._pushConsoleEntry({
      origin: 'host',
      ...entry
    })
  }

  _clearConsoleEntries({ origin } = {}) {
    if (!origin) {
      this._consoleEntries = []
      this._renderConsole()
      return
    }

    const remainingEntries = this._consoleEntries.filter((entry) => entry.origin !== origin)
    if (remainingEntries.length === this._consoleEntries.length) return

    this._consoleEntries = remainingEntries
    this._renderConsole()
  }

  _pushConsoleEntry(entry) {
    const container = this.shadowRoot.querySelector('[data-role="console"]')
    const shouldStickToBottom = !container
      || container.scrollHeight - container.scrollTop - container.clientHeight < 24

    this._consoleEntries.push({
      origin: 'host',
      ...entry
    })
    if (this._consoleEntries.length > 200) {
      this._consoleEntries.shift()
    }

    if (!this._consoleOpen) {
      this._consoleOpen = true
      this._applyConsoleState()
    }

    this._renderConsole({ stickToBottom: shouldStickToBottom })
  }

  _matchesConsoleEntry(entry, searchQuery = this._consoleSearch) {
    if (this._consoleFilter !== 'all' && entry.level !== this._consoleFilter) {
      return false
    }

    if (!searchQuery) {
      return true
    }

    return `${entry.origin} ${entry.level} ${entry.text}`.toLowerCase().includes(searchQuery)
  }

  _collapseConsoleEntries(entries) {
    return entries.reduce((collapsed, entry) => {
      const previous = collapsed.at(-1)

      if (
        previous
        && previous.origin === entry.origin
        && previous.level === entry.level
        && previous.text === entry.text
      ) {
        previous.repeatCount += 1
        previous.timestamp = entry.timestamp
        return collapsed
      }

      collapsed.push({
        ...entry,
        repeatCount: 1
      })
      return collapsed
    }, [])
  }

  _getConsoleViewModel() {
    const matchedEntries = this._consoleEntries.filter((entry) => this._matchesConsoleEntry(entry))
    const entries = this._consoleCollapseRepeats
      ? this._collapseConsoleEntries(matchedEntries)
      : matchedEntries.map((entry) => ({
          ...entry,
          repeatCount: 1
        }))

    return {
      entries,
      matchedCount: matchedEntries.length,
      totalCount: this._consoleEntries.length
    }
  }

  _formatVisibleConsoleText() {
    const { entries } = this._getConsoleViewModel()

    return entries.map((entry) => {
      const entryLabel = [
        entry.origin === 'host' ? 'HOST' : '',
        entry.level.toUpperCase(),
        entry.repeatCount > 1 ? `x${entry.repeatCount}` : ''
      ].filter(Boolean).join(' ')

      return `[${formatTimeLabel(entry.timestamp)}] [${entryLabel}] ${entry.text}`
    }).join('\n')
  }

  _formatConsoleSummary({ entries, matchedCount, totalCount }) {
    if (!totalCount) {
      return '0 entries'
    }

    if (entries.length === totalCount && matchedCount === totalCount) {
      return formatCount(totalCount, 'entry', 'entries')
    }

    const parts = []

    if (entries.length !== matchedCount) {
      parts.push(formatCount(entries.length, 'row'))
    } else {
      parts.push(`${entries.length} shown`)
    }

    if (matchedCount !== totalCount) {
      parts.push(`${matchedCount} matching`)
    }

    parts.push(`${totalCount} total`)
    return parts.join(' · ')
  }

  _renderConsole({ stickToBottom = false } = {}) {
    const container = this.shadowRoot.querySelector('[data-role="console"]')
    if (!container) return

    const summary = this.shadowRoot.querySelector('[data-role="console-summary"]')
    const searchInput = this.shadowRoot.querySelector('[data-role="console-search"]')
    const collapseToggle = this.shadowRoot.querySelector('[data-role="console-collapse"]')
    const viewModel = this._getConsoleViewModel()

    if (summary) {
      summary.textContent = this._formatConsoleSummary(viewModel)
    }

    if (searchInput && searchInput.value !== this._consoleSearch) {
      searchInput.value = this._consoleSearch
    }

    if (collapseToggle) {
      collapseToggle.checked = this._consoleCollapseRepeats
    }

    this.shadowRoot.querySelectorAll('[data-console-filter]').forEach((button) => {
      const isActive = button.getAttribute('data-console-filter') === this._consoleFilter
      button.setAttribute('aria-pressed', String(isActive))
      button.dataset.active = isActive ? 'true' : 'false'
    })

    if (!viewModel.totalCount) {
      container.innerHTML = '<p class="console-empty">No console output yet.</p>'
      return
    }

    if (!viewModel.entries.length) {
      container.innerHTML = '<p class="console-empty">No matching console output.</p>'
      return
    }

    container.innerHTML = viewModel.entries.map((entry) => `
      <article class="console-entry" data-level="${escapeHtml(entry.level)}" data-origin="${escapeHtml(entry.origin)}">
        <span class="console-time">${escapeHtml(formatTimeLabel(entry.timestamp))}</span>
        <span class="console-level">${escapeHtml(entry.origin === 'host' ? `host ${entry.level}` : entry.level)}</span>
        <span class="console-repeat" data-empty="${entry.repeatCount > 1 ? 'false' : 'true'}">${entry.repeatCount > 1 ? `x${entry.repeatCount}` : ''}</span>
        <pre class="console-text">${escapeHtml(entry.text)}</pre>
      </article>
    `).join('')

    if (stickToBottom) {
      container.scrollTop = container.scrollHeight
    }
  }

  _applyTabState() {
    const isResult = this._activeTab === 'result'

    this.shadowRoot.querySelectorAll('[data-tab]').forEach((button) => {
      const isActive = button.getAttribute('data-tab') === this._activeTab
      button.setAttribute('aria-selected', String(isActive))
      button.dataset.active = isActive ? 'true' : 'false'
    })

    this.shadowRoot.querySelectorAll('[data-editor-panel]').forEach((panel) => {
      panel.hidden = isResult || panel.getAttribute('data-editor-panel') !== this._activeTab
    })

    const workspace = this.shadowRoot.querySelector('[data-role="workspace"]')
    if (workspace) workspace.dataset.result = isResult ? 'true' : 'false'

    if (!isResult) {
      this._ensureEditorView(this._activeTab)
      this._editorRuntime?.focusEditor(this._editors.get(this._activeTab))
    }
  }

  _toggleShareMenu() {
    const menu = this.shadowRoot.querySelector('.share-menu')
    const trigger = this.shadowRoot.querySelector('[data-action="share-toggle"]')
    if (!menu || !trigger) return

    if (!menu.hidden) {
      this._closeShareMenu()
    } else {
      menu.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      clearTimeout(this._shareOutsideClickTimer)
      this._shareOutsideClickTimer = setTimeout(() => {
        document.addEventListener('click', this._handleShareOutsideClick)
      }, 0)
    }
  }

  _closeShareMenu() {
    const menu = this.shadowRoot.querySelector('.share-menu')
    const trigger = this.shadowRoot.querySelector('[data-action="share-toggle"]')
    if (menu) menu.hidden = true
    if (trigger) trigger.setAttribute('aria-expanded', 'false')
    clearTimeout(this._shareOutsideClickTimer)
    document.removeEventListener('click', this._handleShareOutsideClick)
  }

  _applyViewMode() {
    const workspace = this.shadowRoot.querySelector('[data-role="workspace"]')
    if (workspace) workspace.dataset.view = this._viewMode

    const toggleBtn = this.shadowRoot.querySelector('[data-action="toggle-layout"]')
    if (toggleBtn) {
      const isSplit = this._viewMode === 'split'
      toggleBtn.title = isSplit ? 'Code only' : 'Split view'
      toggleBtn.setAttribute('aria-label', isSplit ? 'Code only' : 'Split view')
      // Swap icon: split icon when in code mode, code icon when in split mode
      toggleBtn.innerHTML = isSplit
        ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="2"/><line x1="8" y1="2" x2="8" y2="14"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="2" width="14" height="12" rx="2"/></svg>'
    }
  }

  _applyConsoleState() {
    const panel = this.shadowRoot.querySelector('.console-panel')
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-console"]')
    if (panel) panel.dataset.open = this._consoleOpen ? 'true' : 'false'
    if (toggle) toggle.setAttribute('aria-expanded', String(this._consoleOpen))
  }

  _layoutAxis() {
    if (this.previewPosition === 'bottom') return 'vertical'
    return window.innerWidth <= 860 ? 'vertical' : 'horizontal'
  }

  _applySplitPosition() {
    this.style.setProperty('--cp-split', `${this._splitPosition}%`)

    const workspace = this.shadowRoot.querySelector('[data-role="workspace"]')
    const divider = this.shadowRoot.querySelector('[data-role="divider"]')
    if (!workspace || !divider) return

    const axis = this._layoutAxis()
    workspace.dataset.axis = axis
    divider.setAttribute('aria-orientation', axis === 'horizontal' ? 'vertical' : 'horizontal')
    divider.setAttribute('aria-valuemin', String(MIN_SPLIT))
    divider.setAttribute('aria-valuemax', String(MAX_SPLIT))
    divider.setAttribute('aria-valuenow', String(Math.round(this._splitPosition)))
  }

  _handleDividerPointerDown(event) {
    event.preventDefault()

    const workspace = this.shadowRoot.querySelector('[data-role="workspace"]')
    if (!workspace) return

    const axis = this._layoutAxis()

    const onMove = (moveEvent) => {
      const rect = workspace.getBoundingClientRect()
      const raw = axis === 'horizontal'
        ? ((moveEvent.clientX - rect.left) / rect.width) * 100
        : ((moveEvent.clientY - rect.top) / rect.height) * 100

      this._splitPosition = clamp(raw, MIN_SPLIT, MAX_SPLIT)
      this._applySplitPosition()
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      this._persistState()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  _scheduleRun() {
    clearTimeout(this._runTimer)
    this._runTimer = setTimeout(() => this._runPendingChanges(), this.debounce)
  }

  _onPageThemeChange(state) {
    this._pageTheme = state
    this._applyUiState()
    if (!this._hasThemeSnapshot) {
      this._hasThemeSnapshot = true
      return
    }
    if (this.mode === 'auto' || this.inheritTheme) {
      this.run()
    }
  }

  _effectiveMode() {
    if (this.mode === 'light' || this.mode === 'dark') return this.mode
    return this._pageTheme.mode || 'light'
  }

  _applyUiState() {
    this.setAttribute('data-effective-mode', this._effectiveMode())

    const consolePanel = this.shadowRoot.querySelector('.console-panel')
    if (consolePanel) {
      consolePanel.hidden = !this.showConsole
    }
    this._applyConsoleState()
    this._applyViewMode()

    const previewMeta = this.shadowRoot.querySelector('[data-role="preview-meta"]')
    if (previewMeta) {
      if (this._loadingSources) {
        previewMeta.textContent = 'Loading sources'
      } else if (!this._ready) {
        previewMeta.textContent = this._activeExecutionMode === 'soft'
          ? 'Running JS'
          : 'Rebuilding preview'
      } else {
        const executionLabel = this._lastExecutionMode === 'soft' ? 'JS rerun' : 'Preview rebuilt'
        previewMeta.textContent = `${executionLabel} · ${this._effectiveMode()} mode`
      }
    }

    const reloadSourcesButton = this.shadowRoot.querySelector('[data-action="reload-sources"]')
    if (reloadSourcesButton) {
      reloadSourcesButton.hidden = !this._hasExternalSources()
      reloadSourcesButton.disabled = this._loadingSources
      const reloadLabel = this._loadingSources ? 'Loading sources…' : 'Reload external sources'
      reloadSourcesButton.title = reloadLabel
      reloadSourcesButton.setAttribute('aria-label', reloadLabel)
    }

    const softRunButton = this.shadowRoot.querySelector('[data-action="soft-run"]')
    if (softRunButton) {
      const previewBusy = !this._ready && Boolean(this._runId)
      softRunButton.disabled = this._loadingSources || previewBusy || !this._runId
      const softLabel = this._dirtyTypes.has('js') ? 'Run JS changes' : 'Run JS'
      softRunButton.title = softLabel
      softRunButton.setAttribute('aria-label', softLabel)
    }

    const runButton = this.shadowRoot.querySelector('[data-action="run"]')
    if (runButton) {
      const previewBusy = !this._ready && Boolean(this._runId)
      runButton.disabled = this._loadingSources || previewBusy
      const runLabel = this._dirty && this._needsFullRebuild() ? 'Rebuild changes' : 'Rebuild preview'
      runButton.title = runLabel
      runButton.setAttribute('aria-label', runLabel)
    }

    const status = this.shadowRoot.querySelector('[data-role="status"]')
    if (status) {
      if (this._loadingSources) {
        status.textContent = 'Loading external sources'
      } else if (!this._ready) {
        status.textContent = this._activeExecutionMode === 'soft'
          ? 'JavaScript rerunning'
          : 'Preview rebuilding'
      } else if (this.runMode === 'manual' && this._dirty) {
        status.textContent = this._pendingExecutionMode() === 'soft'
          ? 'Manual mode: JavaScript changes pending'
          : 'Manual mode: preview rebuild pending'
      } else if (this.runMode === 'auto' && this._dirty) {
        status.textContent = this._pendingExecutionMode() === 'soft'
          ? 'Auto run: JavaScript changes queued'
          : 'Auto run: preview rebuild queued'
      } else if (this.runMode === 'auto') {
        status.textContent = `Auto run, ${this._effectiveMode()} shell`
      } else {
        status.textContent = this._lastExecutionMode === 'soft'
          ? 'Manual run, JavaScript rerun ready'
          : `Manual run, ${this._effectiveMode()} shell`
      }
    }
  }

  _setStatus(text) {
    const status = this.shadowRoot.querySelector('[data-role="status"]')
    if (status) {
      status.textContent = text
    }
  }

  _persistState() {
    if (!this.persistKey) return

    writeStorage(this.persistKey, {
      values: this.getValue(),
      activeTab: this._activeTab,
      splitPosition: this._splitPosition,
      consoleOpen: this._consoleOpen,
      viewMode: this._viewMode
    })
  }

  _getStyles() {
    return `
      :host {
        --cp-bg: var(--color-surface, #ffffff);
        --cp-panel-bg: var(--color-surface-raised, #f6f8fb);
        --cp-editor-bg: var(--color-surface-sunken, #f8fafc);
        --cp-preview-bg: var(--color-background, #ffffff);
        --cp-border: var(--color-border, #d0d7de);
        --cp-border-subtle: var(--color-border-subtle, #e5e7eb);
        --cp-text: var(--color-text, #111827);
        --cp-muted: var(--color-text-muted, #6b7280);
        --cp-accent: var(--color-interactive, #2563eb);
        --cp-radius: var(--radius-m, 16px);
        --cp-radius-inner: var(--radius-s, 12px);
        --cp-font-sans: var(--font-sans, "SF Pro Text", "Segoe UI", sans-serif);
        --cp-font-mono: var(--font-mono, "SFMono-Regular", Consolas, monospace);
        --cp-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        --cp-toolbar-bg: color-mix(in oklab, var(--cp-panel-bg) 88%, var(--cp-bg));
        --cp-gutter-bg: color-mix(in oklab, var(--cp-panel-bg) 92%, var(--cp-bg));
        --cp-active-line: color-mix(in oklab, var(--cp-accent) 8%, var(--cp-editor-bg));
        --cp-selection: color-mix(in oklab, var(--cp-accent) 22%, transparent);
        --cp-token-keyword: #9a3412;
        --cp-token-string: #166534;
        --cp-token-number: #1d4ed8;
        --cp-token-comment: #64748b;
        --cp-token-variable: #0f172a;
        --cp-token-type: #7c3aed;
        --cp-token-tag: #be123c;
        --cp-token-attribute: #0369a1;
        --cp-token-property: #155e75;
        --cp-token-function: #7c2d12;
        --cp-token-meta: #6d28d9;
        --cp-split: ${DEFAULT_SPLIT}%;
        display: block;
        color: var(--cp-text);
        font-family: var(--cp-font-sans);
      }

      :host([data-effective-mode="dark"]) {
        --cp-bg: var(--color-surface, #0f172a);
        --cp-panel-bg: var(--color-surface-raised, #111827);
        --cp-editor-bg: var(--color-surface-sunken, #0b1220);
        --cp-preview-bg: var(--color-background, #0b1220);
        --cp-border: var(--color-border, #374151);
        --cp-border-subtle: var(--color-border-subtle, #1f2937);
        --cp-text: var(--color-text, #e5eefb);
        --cp-muted: var(--color-text-muted, #94a3b8);
        --cp-shadow: 0 24px 60px rgba(2, 6, 23, 0.48);
        --cp-token-keyword: #ff7b72;
        --cp-token-string: #7ee787;
        --cp-token-number: #79c0ff;
        --cp-token-comment: #8b949e;
        --cp-token-variable: #e6edf3;
        --cp-token-type: #d2a8ff;
        --cp-token-tag: #7ee787;
        --cp-token-attribute: #79c0ff;
        --cp-token-property: #a5d6ff;
        --cp-token-function: #d2a8ff;
        --cp-token-meta: #ffa657;
      }

      * {
        box-sizing: border-box;
      }

      .shell {
        display: grid;
        gap: 12px;
        padding: 12px;
        border: 1px solid var(--cp-border);
        border-radius: var(--cp-radius);
        background:
          radial-gradient(circle at top right, color-mix(in oklab, var(--cp-accent) 14%, transparent), transparent 34%),
          linear-gradient(180deg, color-mix(in oklab, var(--cp-toolbar-bg) 85%, var(--cp-bg)), var(--cp-bg));
        box-shadow: var(--cp-shadow);
      }

      .toolbar,
      .panel-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .toolbar {
        justify-content: space-between;
        flex-wrap: wrap;
        padding: 0 12px;
        border: 1px solid var(--cp-border);
        border-radius: calc(var(--cp-radius-inner) + 2px);
        background: var(--cp-toolbar-bg);
        align-items: stretch;
      }

      .tabs {
        display: inline-flex;
        align-items: stretch;
        gap: 0;
        margin-right: auto;
        border-bottom: 1px solid var(--cp-border-subtle);
      }

      .actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: 6px 0;
      }

      .status {
        display: flex;
        align-items: center;
        color: var(--cp-muted);
        font-size: 0.8rem;
      }

      .panel-meta {
        color: var(--cp-muted);
        font-size: 0.875rem;
      }

      .workspace {
        display: flex;
        min-block-size: 26rem;
        border: 1px solid var(--cp-border);
        border-radius: var(--cp-radius-inner);
        overflow: hidden;
        background: var(--cp-panel-bg);
      }

      .workspace[data-axis="vertical"] {
        flex-direction: column;
      }

      .workspace[data-view="code"] .preview-panel,
      .workspace[data-view="code"] .divider {
        display: none;
      }

      .workspace[data-view="code"] .editor-panel {
        flex: 1 1 100%;
      }

      .workspace[data-result="true"] .editor-panel,
      .workspace[data-result="true"] .divider,
      .workspace[data-result="true"] .preview-panel .panel-header {
        display: none;
      }

      .workspace[data-result="true"] .preview-panel {
        flex: 1 1 100%;
      }

      .editor-panel,
      .preview-panel {
        min-width: 0;
        min-height: 0;
      }

      .editor-panel {
        flex: 0 0 var(--cp-split);
        display: grid;
        background: var(--cp-editor-bg);
      }

      .preview-panel {
        flex: 1 1 auto;
        display: grid;
        grid-template-rows: auto 1fr;
        background: var(--cp-preview-bg);
      }

      .workspace[data-axis="vertical"] .editor-panel {
        flex-basis: var(--cp-split);
      }

      .editor-frame {
        min-height: 0;
      }

      .editor-host {
        block-size: 100%;
        min-block-size: 26rem;
        position: relative;
      }

      .workspace[data-axis="vertical"] .editor-host {
        min-block-size: 14rem;
      }

      .editor-placeholder {
        display: grid;
        place-items: center;
        block-size: 100%;
        min-block-size: inherit;
        padding: 1.5rem;
        color: var(--cp-muted);
        font-family: var(--cp-font-mono);
        font-size: 0.92rem;
        background:
          linear-gradient(135deg, color-mix(in oklab, var(--cp-panel-bg) 86%, transparent), transparent),
          repeating-linear-gradient(
            -45deg,
            color-mix(in oklab, var(--cp-border-subtle) 34%, transparent),
            color-mix(in oklab, var(--cp-border-subtle) 34%, transparent) 10px,
            transparent 10px,
            transparent 20px
          );
      }

      .editor-placeholder-error {
        color: #dc2626;
      }

      .divider {
        flex: 0 0 10px;
        position: relative;
        cursor: col-resize;
        background:
          linear-gradient(180deg, transparent, color-mix(in oklab, var(--cp-border) 85%, transparent), transparent);
        touch-action: none;
      }

      .divider::after {
        content: '';
        position: absolute;
        inset: 50% auto auto 50%;
        inline-size: 4px;
        block-size: 38px;
        transform: translate(-50%, -50%);
        border-radius: 999px;
        background: color-mix(in oklab, var(--cp-accent) 18%, var(--cp-border));
      }

      .workspace[data-axis="vertical"] .divider {
        cursor: row-resize;
      }

      .workspace[data-axis="vertical"] .divider::after {
        inline-size: 38px;
        block-size: 4px;
      }

      .panel-header {
        justify-content: space-between;
        padding: 10px 12px;
        border-bottom: 1px solid var(--cp-border-subtle);
        background: color-mix(in oklab, var(--cp-panel-bg) 92%, var(--cp-preview-bg));
      }

      iframe {
        inline-size: 100%;
        block-size: 100%;
        min-block-size: 16rem;
        border: 0;
        background: white;
      }

      .console-panel {
        border: 1px solid var(--cp-border);
        border-radius: var(--cp-radius-inner);
        overflow: hidden;
        background: var(--cp-panel-bg);
      }

      .console-tray-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 6px 12px;
        background: none;
        border: none;
        color: var(--cp-text);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .console-tray-toggle:hover {
        background: color-mix(in oklab, var(--cp-text) 5%, transparent);
      }

      .console-tray-chevron {
        transition: transform 0.2s ease;
        color: var(--cp-muted);
        flex-shrink: 0;
      }

      .console-panel[data-open="true"] .console-tray-chevron {
        transform: rotate(90deg);
      }

      .console-tray-body {
        display: none;
      }

      .console-panel[data-open="true"] .console-tray-body {
        display: grid;
        grid-template-rows: auto minmax(0, 12rem);
      }

      .console-entries {
        overflow: auto;
        padding: 8px 0;
      }

      .console-toolbar {
        align-items: flex-start;
        flex-wrap: wrap;
        padding: 6px 10px;
        gap: 6px;
      }

      .console-toolbar-main,
      .console-toolbar-secondary,
      .console-heading,
      .console-filters {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .console-toolbar-main {
        flex: 1 1 24rem;
      }

      .console-toolbar-secondary {
        flex: 1 1 18rem;
        justify-content: flex-end;
      }

      .console-summary {
        white-space: nowrap;
      }

      .console-search {
        flex: 1 1 14rem;
      }

      .console-search-input {
        inline-size: 100%;
        min-inline-size: 10rem;
        border: 1px solid var(--cp-border);
        border-radius: 4px;
        padding: 4px 8px;
        background: color-mix(in oklab, var(--cp-bg) 82%, var(--cp-panel-bg));
        color: var(--cp-text);
        font-family: var(--cp-font-mono);
        font-size: 0.8rem;
      }

      .console-search-input::placeholder {
        color: var(--cp-muted);
      }

      .console-search-input:focus-visible {
        outline: 2px solid var(--cp-accent);
        outline-offset: 2px;
      }

      .console-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        color: var(--cp-muted);
        font-size: 0.8rem;
      }

      .console-toggle input {
        accent-color: var(--cp-accent);
      }

      .console-empty {
        margin: 0;
        padding: 14px 16px;
        color: var(--cp-muted);
        font-size: 0.92rem;
      }

      .console-entry {
        display: grid;
        grid-template-columns: auto auto auto 1fr;
        gap: 8px;
        align-items: start;
        padding: 3px 12px 3px 8px;
        border-left: 3px solid transparent;
        font-family: var(--cp-font-mono);
        font-size: 0.82rem;
        line-height: 1.5;
      }

      .console-entry:hover {
        background: color-mix(in oklab, var(--cp-text) 4%, transparent);
      }

      .console-entry[data-level="log"] {
        border-left-color: #3794ff;
      }

      .console-entry[data-level="info"] {
        border-left-color: #75beff;
        background: color-mix(in oklab, #75beff 5%, transparent);
      }

      .console-entry[data-level="warn"] {
        border-left-color: #cca700;
        background: color-mix(in oklab, #cca700 6%, transparent);
      }

      .console-entry[data-level="error"] {
        border-left-color: #f14c4c;
        background: color-mix(in oklab, #f14c4c 6%, transparent);
      }

      .console-entry[data-level="debug"] {
        border-left-color: #b5cea8;
      }

      .console-entry[data-origin="host"] {
        border-left-color: var(--cp-accent);
      }

      .console-time {
        color: var(--cp-muted);
        white-space: nowrap;
        font-size: 0.72rem;
        opacity: 0.7;
      }

      .console-level {
        display: inline-flex;
        align-items: center;
        padding: 0 0.4rem;
        border-radius: 3px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        line-height: 1.6;
        white-space: nowrap;
        background: color-mix(in oklab, var(--cp-muted) 12%, transparent);
        color: var(--cp-muted);
      }

      .console-entry[data-level="log"] .console-level {
        background: color-mix(in oklab, #3794ff 14%, transparent);
        color: #3794ff;
      }

      .console-entry[data-level="info"] .console-level {
        background: color-mix(in oklab, #75beff 14%, transparent);
        color: #75beff;
      }

      .console-entry[data-level="warn"] .console-level {
        background: color-mix(in oklab, #cca700 16%, transparent);
        color: #cca700;
      }

      .console-entry[data-level="error"] .console-level {
        background: color-mix(in oklab, #f14c4c 16%, transparent);
        color: #f14c4c;
      }

      .console-entry[data-level="debug"] .console-level {
        background: color-mix(in oklab, #b5cea8 14%, transparent);
        color: #b5cea8;
      }

      .console-entry[data-origin="host"] .console-level {
        background: color-mix(in oklab, var(--cp-accent) 14%, transparent);
        color: var(--cp-accent);
      }

      .console-repeat {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-inline-size: 2.4rem;
        min-block-size: 1.55rem;
        padding: 0 0.45rem;
        border-radius: 999px;
        background: color-mix(in oklab, var(--cp-accent) 14%, var(--cp-bg));
        color: var(--cp-text);
        font-size: 0.74rem;
        line-height: 1;
      }

      .console-repeat[data-empty="true"] {
        visibility: hidden;
      }

      .console-text {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--cp-text);
        font-family: var(--cp-font-mono);
      }

      .tab-button {
        appearance: none;
        border: none;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        padding: 0.5rem 0.75rem;
        background: transparent;
        color: var(--cp-muted);
        font: inherit;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: color 0.16s ease, border-color 0.16s ease;
      }

      .tab-button[data-active="true"] {
        color: var(--cp-accent);
        border-bottom-color: var(--cp-accent);
      }

      .tab-button:hover {
        color: var(--cp-text);
      }

      .action-button {
        appearance: none;
        border: 1px solid var(--cp-border);
        border-radius: 6px;
        padding: 0.4rem 0.75rem;
        background: color-mix(in oklab, var(--cp-bg) 80%, var(--cp-panel-bg));
        color: var(--cp-text);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
      }

      .action-button.primary {
        background: var(--cp-accent);
        border-color: var(--cp-accent);
        color: white;
      }

      .action-button.subtle {
        background: transparent;
      }

      .action-button:disabled {
        opacity: 0.55;
        cursor: default;
        transform: none;
      }

      .icon-button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 4px;
        padding: 0.35rem;
        background: transparent;
        color: var(--cp-muted);
        cursor: pointer;
        transition: color 0.15s ease, background 0.15s ease;
      }

      .icon-button:hover {
        color: var(--cp-text);
        background: color-mix(in oklab, var(--cp-text) 8%, transparent);
      }

      .icon-button:active {
        transform: scale(0.92);
      }

      .icon-button.primary {
        color: var(--cp-accent);
      }

      .icon-button.primary:hover {
        background: color-mix(in oklab, var(--cp-accent) 12%, transparent);
      }

      .icon-button:focus-visible {
        outline: 2px solid var(--cp-accent);
        outline-offset: 2px;
      }

      .icon-button svg {
        width: 16px;
        height: 16px;
      }

      .share-container {
        position: relative;
        display: inline-flex;
      }

      .share-trigger[aria-expanded="true"] {
        color: var(--cp-accent);
        background: color-mix(in oklab, var(--cp-accent) 10%, transparent);
      }

      .share-menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 180px;
        background: var(--cp-panel-bg);
        border: 1px solid var(--cp-border);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        overflow: hidden;
        z-index: 100;
      }

      .share-menu-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        padding: 0.625rem 1rem;
        background: none;
        border: none;
        border-bottom: 1px solid var(--cp-border-subtle);
        color: var(--cp-text);
        font: inherit;
        font-size: 0.875rem;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .share-menu-item:last-child {
        border-bottom: none;
      }

      .share-menu-item:hover {
        background: color-mix(in oklab, var(--cp-accent) 8%, var(--cp-panel-bg));
      }

      .share-menu-item:focus-visible {
        outline: 2px solid var(--cp-accent);
        outline-offset: -2px;
      }

      .share-menu-item svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: var(--cp-muted);
      }

      .console-filter-button {
        padding: 3px 10px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
        letter-spacing: 0;
        border-radius: 3px;
        border: 1px solid var(--cp-border-subtle);
        background: transparent;
      }

      .console-filter-button[data-active="true"] {
        background: var(--cp-accent);
        border-color: var(--cp-accent);
        color: white;
      }

      .console-filter-button[data-filter="warn"][data-active="true"],
      .console-filter-button[data-filter="error"][data-active="true"],
      .console-filter-button[data-filter="info"][data-active="true"] {
        background: var(--cp-accent);
        border-color: var(--cp-accent);
        color: white;
      }

      .action-button:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .action-button:disabled:hover {
        transform: none;
      }

      .tab-button:focus-visible,
      .action-button:focus-visible,
      .divider:focus-visible,
      .console-search-input:focus-visible {
        outline: 2px solid var(--cp-accent);
        outline-offset: 2px;
      }

      .visually-hidden {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 860px) {
        .workspace {
          flex-direction: column;
        }

        .divider {
          cursor: row-resize;
        }

        .divider::after {
          inline-size: 38px;
          block-size: 4px;
        }

        .editor-panel {
          flex-basis: var(--cp-split);
        }

        .console-toolbar-secondary {
          justify-content: flex-start;
        }

        .console-search {
          flex-basis: 100%;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .tab-button,
        .action-button,
        .icon-button {
          transition: none;
        }
      }
    `
  }
}

if (!customElements.get('code-playground')) {
  customElements.define('code-playground', CodePlayground)
}
