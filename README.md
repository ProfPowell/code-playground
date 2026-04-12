# @ProfPowell/code-playground

A standalone web component for live HTML, CSS, and JavaScript editing with a sandboxed preview iframe, runtime console output, CodePen export, and theme-aware styling that fits naturally inside Vanilla Breeze.

## Installation

```bash
npm install @profpowell/code-playground
```

```js
import '@profpowell/code-playground'
```

## Basic Usage

```html
<code-playground inherit-theme persist="intro-demo">
  <textarea slot="html"><h1>Hello</h1><p>Edit me.</p></textarea>
  <textarea slot="css">h1 { color: tomato; }</textarea>
  <textarea slot="js">console.log('ready')</textarea>
</code-playground>
```

## External Sources

Use external files when you want the playground to track authored demo files directly:

```html
<code-playground
  html-src="/examples/demo.html"
  css-src="/examples/demo.css"
  js-src="/examples/demo.js"
  head-src="/examples/demo-head.html"
  inherit-theme
  persist="demo-files">
</code-playground>
```

`head-src` is useful for preview-only assets such as external stylesheets, fonts, or extra `<meta>` tags.

## Current Status

The first implementation slice includes:

- CodeMirror-powered editors for HTML, CSS, and JavaScript
- Sandboxed preview via `iframe.srcdoc`
- Auto and manual run modes
- JS-only soft reruns without a full iframe rebuild when possible
- Runtime console and error capture from the iframe
- Console filters, text search, repeat collapsing, and copy-visible output
- Host-origin diagnostics stay visible across preview reruns and rebuilds
- Reset, copy, download, and CodePen actions
- Theme detection compatible with `data-mode` and `data-theme`
- Local persistence for sources, active tab, and split position
- External source loading via `html-src`, `css-src`, `js-src`, and `head-src`
- Public `reloadSources()` support for refetching external source files

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```
