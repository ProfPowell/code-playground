import { EditorState } from '@codemirror/state'
import { html } from '@codemirror/lang-html'
import { css as cssLanguage } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView, minimalSetup } from 'codemirror'

const CODE_THEME = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--cp-text)',
    backgroundColor: 'var(--cp-editor-bg)',
    fontFamily: 'var(--cp-font-mono)',
    fontSize: '14px'
  },
  '.cm-scroller': {
    overflow: 'auto'
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '16px 18px'
  },
  '.cm-focused': {
    outline: 'none'
  },
  '.cm-line': {
    padding: '0 2px'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--cp-gutter-bg)',
    color: 'var(--cp-muted)',
    borderRight: '1px solid var(--cp-border-subtle)'
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--cp-active-line)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--cp-active-line)'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--cp-accent)'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cp-selection)'
  },
  '.cm-panels': {
    backgroundColor: 'var(--cp-panel-bg)',
    color: 'var(--cp-text)'
  }
})

const CODE_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], color: 'var(--cp-token-keyword)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--cp-token-string)' },
  { tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null], color: 'var(--cp-token-number)' },
  { tag: [tags.comment], color: 'var(--cp-token-comment)', fontStyle: 'italic' },
  { tag: [tags.definition(tags.variableName), tags.variableName], color: 'var(--cp-token-variable)' },
  { tag: [tags.typeName, tags.className], color: 'var(--cp-token-type)' },
  { tag: [tags.tagName], color: 'var(--cp-token-tag)' },
  { tag: [tags.attributeName], color: 'var(--cp-token-attribute)' },
  { tag: [tags.propertyName], color: 'var(--cp-token-property)' },
  { tag: [tags.function(tags.variableName), tags.labelName], color: 'var(--cp-token-function)' },
  { tag: [tags.meta, tags.processingInstruction], color: 'var(--cp-token-meta)' }
])

function createLanguageExtension(type) {
  if (type === 'css') return cssLanguage()
  if (type === 'js') return javascript({ jsx: true })
  return html()
}

export function createEditor({ parent, type, value, onChange, onRunShortcut }) {
  const view = new EditorView({
    state: EditorState.create({
      doc: value,
      extensions: [
        minimalSetup,
        createLanguageExtension(type),
        EditorView.lineWrapping,
        CODE_THEME,
        syntaxHighlighting(CODE_HIGHLIGHT_STYLE),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return
          onChange(update.state.doc.toString())
        })
      ]
    }),
    parent
  })

  view.dom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onRunShortcut()
    }
  })

  return view
}

export function setEditorValue(view, value) {
  if (!view) return

  const current = view.state.doc.toString()
  if (current === value) return

  view.dispatch({
    changes: {
      from: 0,
      to: current.length,
      insert: value
    }
  })
}

export function focusEditor(view) {
  view?.focus()
}
