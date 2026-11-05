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

## Sizing

By default a playground picks its own height, and a longer document makes it taller. Set a height on the element and the layout fills it instead, with the editor scrolling inside:

```css
code-playground {
  block-size: 70vh;
  min-block-size: 480px;
}
```

## Saved Edits

With `persist`, a panel is saved only when it differs from its authored source. Each saved edit remembers the source it was made against, so if you later change that panel, its visitors get your new version and their edit to it is dropped. Their edits to other panels are kept. Reset clears saved edits, and active tab, split position, and console state are remembered either way.

## Console

The console stays closed until it's opened, so messages never move the layout. When there's output, the collapsed bar shows a colored dot (red for errors, yellow for warnings) and the counts, such as `2 entries · 1 error, 1 warning`.

## Avoiding a Flash on Load

The component loads as a deferred module, so the browser can paint your page before the element upgrades. Until then, the source `<textarea>`s are ordinary visible content. The component can't prevent this from its own script, so add this rule to CSS that loads in `<head>`:

```css
code-playground:not(:defined) {
  display: block;
  min-block-size: 31rem; /* approximate height of the default layout */
}

code-playground:not(:defined) > * {
  display: none;
}
```

## Fit to Preview Content

For inline tutorial embeds where the preview should size to its content (rather than filling a fixed pane), set the `fit-preview` attribute. The preview pane follows its content as it grows or shrinks, and the playground's height follows the taller of the editor and the preview. Remove the attribute to return to the default layout.

```html
<code-playground fit-preview>
  <textarea slot="html"><p>Short demo.</p></textarea>
  <textarea slot="css">p { color: tomato; }</textarea>
</code-playground>
```

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
- Optional `fit-preview` attribute that sizes the host element to the preview iframe's content

## Development

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```
