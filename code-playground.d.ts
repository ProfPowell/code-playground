export interface CodePlaygroundValue {
  html: string
  css: string
  js: string
  head: string
}

export interface CodePlaygroundSourceUrls {
  html: string
  css: string
  js: string
  head: string
}

export interface CodePlaygroundConsoleEntry {
  origin: 'preview' | 'host'
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
  timestamp: string
  executionMode?: 'full' | 'soft'
}

export type CodePlaygroundMode = 'auto' | 'light' | 'dark'
export type CodePlaygroundRunMode = 'auto' | 'manual'
export type CodePlaygroundPreviewPosition = 'right' | 'bottom'

export class CodePlayground extends HTMLElement {
  value: CodePlaygroundValue
  mode: CodePlaygroundMode
  runMode: CodePlaygroundRunMode
  previewPosition: CodePlaygroundPreviewPosition
  debounce: number
  persistKey: string
  inheritTheme: boolean
  showConsole: boolean
  fitPreview: boolean
  sourceUrls: CodePlaygroundSourceUrls

  getValue(): CodePlaygroundValue
  setValue(value: Partial<CodePlaygroundValue>): void
  reloadSources(options?: {
    types?: Array<'html' | 'css' | 'js' | 'head'>
    forceApply?: boolean
  }): Promise<{
    loaded: Array<{ type: 'html' | 'css' | 'js' | 'head'; src: string; value: string }>
    failed: Array<{ type: 'html' | 'css' | 'js' | 'head'; src: string; error: Error }>
  }>
  run(): void
  softRun(): void
  reset(): void
  copy(type?: 'html' | 'css' | 'js'): Promise<void>
  copyConsole(): Promise<void>
  downloadHTML(): void
  openInCodePen(): void
  clearConsole(): void
}

declare global {
  interface HTMLElementTagNameMap {
    'code-playground': CodePlayground
  }
}
