import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/test-page.html')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => {
    const el = document.querySelector('#auto-playground')
    return el?.shadowRoot?.querySelector('iframe')?.getAttribute('srcdoc')
  })
})

test('renders the component shell and initial preview', async ({ page }) => {
  const el = page.locator('#auto-playground')
  await expect(el.locator('[data-tab="html"]')).toHaveAttribute('data-active', 'true')
  await expect(el.locator('iframe')).toBeVisible()
  await expect(el.locator('[data-role="status"]')).toContainText('Auto run')
})

test('auto mode re-runs after programmatic changes', async ({ page }) => {
  const el = page.locator('#auto-playground')

  await page.evaluate(() => {
    document.querySelector('#auto-playground').setValue({
      js: "console.log('auto updated')"
    })
  })

  await expect(el.locator('.console-entries')).toContainText('auto updated')
})

test('manual mode waits for an explicit run', async ({ page }) => {
  const el = page.locator('#manual-playground')

  await page.evaluate(() => {
    document.querySelector('#manual-playground').setValue({
      js: "console.log('manual run fired')"
    })
  })

  await expect(el.locator('[data-role="status"]')).toContainText('changes pending')
  await expect(el.locator('.console-entries')).not.toContainText('manual run fired')

  await el.locator('[data-action="run"]').click()
  await expect(el.locator('.console-entries')).toContainText('manual run fired')
})

test('reset restores authored sources', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#auto-playground').setValue({
      html: '<h1>Changed</h1>'
    })
  })

  await page.evaluate(() => {
    document.querySelector('#auto-playground').reset()
  })

  const html = await page.evaluate(() => document.querySelector('#auto-playground').getValue().html)
  expect(html).toContain('Auto preview')
})

test('persisted values survive a reload', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#persist-playground').setValue({
      html: '<p>Persisted after reload</p>'
    })
  })

  await page.reload()
  await page.waitForFunction(() => document.querySelector('#persist-playground'))

  const html = await page.evaluate(() => document.querySelector('#persist-playground').getValue().html)
  expect(html).toContain('Persisted after reload')
})

test('loads html-src, css-src, js-src, and head-src content', async ({ page }) => {
  const el = page.locator('#external-playground')

  await page.waitForFunction(() => {
    const value = document.querySelector('#external-playground')?.getValue()
    return value?.html?.includes('Loaded from html-src')
      && value?.css?.includes('.external-demo')
      && value?.js?.includes('external loaded')
      && value?.head?.includes('external-head-marker')
  })

  await expect(el.locator('[data-action="reload-sources"]')).toBeVisible()
  await expect(el.locator('.console-entries')).toContainText('external loaded')
})

test('reset restores externally loaded source baselines', async ({ page }) => {
  await page.waitForFunction(() => {
    const value = document.querySelector('#external-playground')?.getValue()
    return value?.html?.includes('Loaded from html-src')
  })

  await page.evaluate(() => {
    document.querySelector('#external-playground').setValue({
      html: '<h1>Mutated</h1>'
    })
  })

  await page.evaluate(() => {
    document.querySelector('#external-playground').reset()
  })

  const html = await page.evaluate(() => document.querySelector('#external-playground').getValue().html)
  expect(html).toContain('Loaded from html-src')
})

test('filters console output and supports text search', async ({ page }) => {
  const el = page.locator('#auto-playground')

  await page.evaluate(() => {
    document.querySelector('#auto-playground').setValue({
      js: `
        console.log('alpha ready')
        console.warn('beta warning')
        console.error('gamma error')
      `
    })
  })

  await expect(el.locator('.console-entries')).toContainText('alpha ready')
  await expect(el.locator('.console-entries')).toContainText('beta warning')
  await expect(el.locator('.console-entries')).toContainText('gamma error')

  await el.locator('[data-action="toggle-console"]').click()
  await el.locator('[data-console-filter="warn"]').click()
  await expect(el.locator('.console-entries')).toContainText('beta warning')
  await expect(el.locator('.console-entries')).not.toContainText('alpha ready')
  await expect(el.locator('[data-role="console-summary"]')).toContainText('1 shown')

  await el.locator('[data-role="console-search"]').fill('gamma')
  await expect(el.locator('.console-entries')).toContainText('No matching console output.')

  await el.locator('[data-role="console-search"]').fill('beta')
  await expect(el.locator('.console-entries')).toContainText('beta warning')
})

test('collapses repeated console entries and can expand them', async ({ page }) => {
  const el = page.locator('#auto-playground')

  await page.evaluate(() => {
    document.querySelector('#auto-playground').setValue({
      js: `
        console.warn('repeat me')
        console.warn('repeat me')
        console.warn('repeat me')
        console.error('separate issue')
      `
    })
  })

  await expect(el.locator('.console-entry')).toHaveCount(2)
  await expect(el.locator('.console-entries')).toContainText('repeat me')
  await expect(el.locator('.console-entries')).toContainText('x3')
  await expect(el.locator('[data-role="console-summary"]')).toContainText('2 rows')

  await el.locator('[data-action="toggle-console"]').click()
  await el.locator('[data-role="console-collapse"]').uncheck()
  await expect(el.locator('.console-entry')).toHaveCount(4)
  await expect(el.locator('[data-role="console-summary"]')).toContainText('4 entries')

  await el.locator('[data-action="clear-console"]').click()
  await expect(el.locator('.console-entries')).toContainText('No console output yet.')
})

test('soft rerun preserves preview state while full rebuild resets it', async ({ page }) => {
  const el = page.locator('#auto-playground')

  await page.evaluate(() => {
    document.querySelector('#auto-playground').setValue({
      js: `
        window.__runCount = (window.__runCount || 0) + 1
        console.log('run count ' + window.__runCount)
      `
    })
  })

  await expect(el.locator('.console-entries')).toContainText('run count 1')
  await expect(el.locator('[data-role="preview-meta"]')).toContainText('JS rerun')

  await el.locator('[data-action="soft-run"]').click()
  await expect(el.locator('.console-entries')).toContainText('run count 2')

  await el.locator('[data-action="run"]').click()
  await expect(el.locator('.console-entries')).toContainText('run count 1')
  await expect(el.locator('.console-entries')).not.toContainText('run count 2')
  await expect(el.locator('[data-role="preview-meta"]')).toContainText('Preview rebuilt')
})

test('fitPreview property mirrors fit-preview attribute', async ({ page }) => {
  const initial = await page.evaluate(() => document.querySelector('#fit-preview-playground').fitPreview)
  expect(initial).toBe(false)

  await page.evaluate(() => {
    document.querySelector('#fit-preview-playground').fitPreview = true
  })
  const hasAttr = await page.evaluate(() => document.querySelector('#fit-preview-playground').hasAttribute('fit-preview'))
  expect(hasAttr).toBe(true)

  await page.evaluate(() => {
    document.querySelector('#fit-preview-playground').fitPreview = false
  })
  const removed = await page.evaluate(() => document.querySelector('#fit-preview-playground').hasAttribute('fit-preview'))
  expect(removed).toBe(false)
})

test('host diagnostics survive soft and full reruns', async ({ page }) => {
  const el = page.locator('#missing-source-playground')

  await expect(el.locator('.console-entries')).toContainText('Failed to load JS source')
  await expect(el.locator('.console-entry[data-origin="host"]')).toHaveCount(1)

  await el.locator('[data-action="soft-run"]').click()
  await expect(el.locator('.console-entries')).toContainText('Failed to load JS source')

  await el.locator('[data-action="run"]').click()
  await expect(el.locator('.console-entries')).toContainText('Failed to load JS source')
  await expect(el.locator('.console-entry[data-origin="host"]')).toHaveCount(1)
})

test.describe('load and setup', () => {
  test('each playground runs exactly once on page load', async ({ page }) => {
    await page.addInitScript(() => {
      window.__runCounts = {}
      document.addEventListener('code-playground:run', (event) => {
        const { id } = event.target
        window.__runCounts[id] = (window.__runCounts[id] || 0) + 1
      })
    })
    await page.reload()
    await page.waitForFunction(() =>
      [...document.querySelectorAll('code-playground')].every((el) => el._ready)
    )

    const counts = await page.evaluate(() => window.__runCounts)
    expect(Object.keys(counts)).toHaveLength(6)
    expect(Object.values(counts).every((count) => count === 1)).toBe(true)
  })

  test('loading the editor does not take focus from the page', async ({ page }) => {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('code-playground')].every((el) =>
        el.shadowRoot.querySelector('.cm-editor')
      )
    )
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
  })

  test('choosing a tab still moves focus into its editor', async ({ page }) => {
    const el = page.locator('#auto-playground')
    await expect(el.locator('.cm-editor').first()).toBeAttached()
    await el.locator('[data-tab="css"]').click()
    await expect(el.locator('[data-editor="css"] .cm-content')).toBeFocused()
  })

  test('shows the source while the editor runtime is still loading', async ({ page }) => {
    let release = () => {}
    const held = new Promise((resolve) => {
      release = resolve
    })
    await page.route('**/editor-runtime.js*', async (route) => {
      await held
      await route.continue()
    })
    await page.reload()

    const host = page.locator('#auto-playground [data-editor="html"]')
    await expect(host).toContainText('Auto preview')
    await expect(host).not.toContainText('Loading editor')

    release()
    await expect(host.locator('.cm-content')).toContainText('Auto preview')
  })

  test('docs hide raw sources and reserve space before upgrade', async ({ page }) => {
    await page.route('https://unpkg.com/**', (route) => route.abort())
    await page.goto('/docs/index.html')

    const el = page.locator('code-playground').first()
    await expect(el.locator('textarea').first()).toBeHidden()
    const box = await el.boundingBox()
    expect(box.height).toBeGreaterThan(500)
  })
})

test.describe('host page isolation', () => {
  test('inherited text-align does not reach the editor', async ({ page }) => {
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', `
        <div style="text-align: center">
          <code-playground id="centered"><textarea slot="html"><p>x</p></textarea></code-playground>
        </div>`)
    })
    const line = page.locator('#centered .cm-line').first()
    await expect(line).toHaveCSS('text-align', 'start')
  })

  test('forced mode resolves light-dark() page tokens in that mode', async ({ page }) => {
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.textContent = ':root { --color-surface-sunken: light-dark(rgb(255, 255, 255), rgb(1, 2, 3)); }'
      document.head.append(style)
      document.body.insertAdjacentHTML('beforeend', `
        <code-playground id="forced-dark" mode="dark"><textarea slot="html"><p>x</p></textarea></code-playground>`)
    })
    const el = page.locator('#forced-dark')
    await expect(el).toHaveCSS('color-scheme', 'dark')
    await expect(el.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  })
})

const mount = (page, id, attrs, sources) =>
  page.evaluate(({ id, attrs, sources }) => {
    document.getElementById(id)?.remove()
    const el = document.createElement('code-playground')
    el.id = id
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
    for (const [slot, value] of Object.entries(sources)) {
      const area = document.createElement('textarea')
      area.slot = slot
      area.value = value
      el.append(area)
    }
    document.querySelector('main').prepend(el)
  }, { id, attrs, sources })

const readStored = (page, key) =>
  page.evaluate((storageKey) => JSON.parse(localStorage.getItem('code-playground:' + storageKey)), key)

const valueOf = (page, id, type) =>
  page.evaluate(({ id, type }) => document.getElementById(id).getValue()[type], { id, type })

test.describe('saved edits', () => {
  test('an unedited playground picks up changed authored source', async ({ page }) => {
    await mount(page, 'p', { persist: 'k1' }, { html: '<p>one</p>' })
    await mount(page, 'p', { persist: 'k1' }, { html: '<p>two</p>' })
    expect(await valueOf(page, 'p', 'html')).toBe('<p>two</p>')
  })

  test('stores only the panels that were edited', async ({ page }) => {
    await mount(page, 'p', { persist: 'k2' }, { html: '<p>one</p>', css: 'a{}' })
    await page.evaluate(() => document.getElementById('p').setValue({ html: '<p>edited</p>' }))
    await expect.poll(async () => (await readStored(page, 'k2'))?.values).toEqual({ html: '<p>edited</p>' })
  })

  test('an edit survives while its authored source is unchanged', async ({ page }) => {
    await mount(page, 'p', { persist: 'k3' }, { html: '<p>one</p>', css: 'a{}' })
    await page.evaluate(() => document.getElementById('p').setValue({ html: '<p>edited</p>' }))
    await mount(page, 'p', { persist: 'k3' }, { html: '<p>one</p>', css: 'b{}' })
    expect(await valueOf(page, 'p', 'html')).toBe('<p>edited</p>')
    expect(await valueOf(page, 'p', 'css')).toBe('b{}')
  })

  test('an edit is dropped once that panel\'s authored source changes', async ({ page }) => {
    await mount(page, 'p', { persist: 'k4' }, { html: '<p>one</p>' })
    await page.evaluate(() => document.getElementById('p').setValue({ html: '<p>edited</p>' }))
    await mount(page, 'p', { persist: 'k4' }, { html: '<p>two</p>' })
    expect(await valueOf(page, 'p', 'html')).toBe('<p>two</p>')
  })

  test('reset clears a saved edit', async ({ page }) => {
    await mount(page, 'p', { persist: 'k5' }, { html: '<p>one</p>' })
    await page.evaluate(() => {
      const el = document.getElementById('p')
      el.setValue({ html: '<p>edited</p>' })
      el.reset()
    })
    await mount(page, 'p', { persist: 'k5' }, { html: '<p>one</p>' })
    expect(await valueOf(page, 'p', 'html')).toBe('<p>one</p>')
    expect((await readStored(page, 'k5')).values).toEqual({})
  })

  test('layout state is still remembered without any edits', async ({ page }) => {
    await mount(page, 'p', { persist: 'k6' }, { html: '<p>one</p>' })
    await page.locator('#p [data-tab="css"]').click()
    await mount(page, 'p', { persist: 'k6' }, { html: '<p>one</p>' })
    await expect(page.locator('#p [data-tab="css"]')).toHaveAttribute('data-active', 'true')
  })

  test('entries saved by older versions keep real edits and drop unchanged copies', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('code-playground:k7', JSON.stringify({
      values: { html: '<p>learner edit</p>', css: 'a{}', js: '', head: '' }
    })))
    await mount(page, 'p', { persist: 'k7' }, { html: '<p>one</p>', css: 'a{}' })
    expect(await valueOf(page, 'p', 'html')).toBe('<p>learner edit</p>')
    await expect.poll(async () => (await readStored(page, 'k7'))?.values).toEqual({ html: '<p>learner edit</p>' })
  })

  test.describe('external sources', () => {
    let body
    test.beforeEach(async ({ page }) => {
      body = '<p>file one</p>'
      await page.route('**/ext-source.html', (route) =>
        body === null ? route.fulfill({ status: 500 }) : route.fulfill({ contentType: 'text/plain', body }))
    })
    const mountExternal = async (page, key) => {
      await mount(page, 'p', { persist: key, 'html-src': '/ext-source.html' }, {})
    }
    const settled = (page) => page.waitForFunction(() => {
      const el = document.getElementById('p')
      return el && !el._loadingSources && el._ready
    })

    test('an unedited panel picks up a changed file', async ({ page }) => {
      await mountExternal(page, 'k8')
      await settled(page)
      body = '<p>file two</p>'
      await mountExternal(page, 'k8')
      await settled(page)
      expect(await valueOf(page, 'p', 'html')).toBe('<p>file two</p>')
    })

    test('an edit survives an unchanged file and yields to a changed one', async ({ page }) => {
      await mountExternal(page, 'k9')
      await settled(page)
      await page.evaluate(() => document.getElementById('p').setValue({ html: '<p>edited</p>' }))
      await mountExternal(page, 'k9')
      await settled(page)
      expect(await valueOf(page, 'p', 'html')).toBe('<p>edited</p>')

      body = '<p>file two</p>'
      await mountExternal(page, 'k9')
      await settled(page)
      expect(await valueOf(page, 'p', 'html')).toBe('<p>file two</p>')
    })

    test('a failed fetch does not lose the edit or its baseline', async ({ page }) => {
      await mountExternal(page, 'k10')
      await settled(page)
      await page.evaluate(() => document.getElementById('p').setValue({ html: '<p>edited</p>' }))

      body = null
      await mountExternal(page, 'k10')
      await settled(page)
      expect(await valueOf(page, 'p', 'html')).toBe('<p>edited</p>')

      body = '<p>file one</p>'
      await mountExternal(page, 'k10')
      await settled(page)
      expect(await valueOf(page, 'p', 'html')).toBe('<p>edited</p>')
    })
  })
})

const box = (page, id, selector) =>
  page.evaluate(({ id, selector }) => {
    const root = document.getElementById(id)
    const el = selector ? root.shadowRoot.querySelector(selector) : root
    const rect = el.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, height: rect.height }
  }, { id, selector })

const longDoc = Array.from({ length: 200 }, (_, i) => '<p>line ' + i + '</p>').join('\n')

test.describe('sizing', () => {
  test('default height is unchanged', async ({ page }) => {
    await mount(page, 'p', {}, { html: '<p>x</p>' })
    expect((await box(page, 'p', '.workspace')).height).toBeCloseTo(416, -1)
    await mount(page, 'q', { 'preview-position': 'bottom' }, { html: '<p>x</p>' })
    const bottom = (await box(page, 'q', '.workspace')).height
    expect(bottom).toBeGreaterThan(520)
    expect(bottom).toBeLessThan(550)
  })

  for (const display of ['default', 'block']) {
    test('the layout fills an explicit host height, display ' + display, async ({ page }) => {
      const style = 'block-size: 700px;' + (display === 'block' ? ' display: block;' : '')
      await mount(page, 'p', { style }, { html: '<p>x</p>' })
      const host = await box(page, 'p')
      const shell = await box(page, 'p', '.shell')
      const iframe = await box(page, 'p', 'iframe')
      expect(host.height).toBe(700)
      expect(shell.height).toBe(700)
      expect(iframe.height).toBeGreaterThan(450)
    })
  }

  test('min-block-size alone also sizes the layout', async ({ page }) => {
    await mount(page, 'p', { style: 'min-block-size: 800px' }, { html: '<p>x</p>' })
    expect((await box(page, 'p', '.shell')).height).toBe(800)
  })

  test('a short host keeps its panels inside and the editor scrolls', async ({ page }) => {
    await mount(page, 'p', { style: 'block-size: 320px' }, { html: longDoc })
    await expect(page.locator('#p .cm-editor')).toBeAttached()
    const shell = await box(page, 'p', '.shell')
    expect(shell.height).toBe(320)
    const workspace = await box(page, 'p', '.workspace')
    expect(workspace.bottom).toBeLessThanOrEqual(shell.bottom)
    const scroller = await page.evaluate(() => {
      const el = document.getElementById('p').shadowRoot.querySelector('.cm-scroller')
      return { scroll: el.scrollHeight, client: el.clientHeight }
    })
    expect(scroller.client).toBeLessThanOrEqual(workspace.height)
    expect(scroller.scroll).toBeGreaterThan(scroller.client)
  })

  test('a hidden console leaves no empty row', async ({ page }) => {
    await mount(page, 'p', { 'show-console': 'false', style: 'block-size: 600px' }, { html: '<p>x</p>' })
    const shell = await box(page, 'p', '.shell')
    const workspace = await box(page, 'p', '.workspace')
    expect(shell.bottom - workspace.bottom).toBeLessThan(20)
  })

  test.describe('fit-preview', () => {
    const iframeHeight = (page) => box(page, 'p', 'iframe').then((rect) => rect.height)
    const css = 'body { margin: 0 }'

    test('the preview matches its content and follows it both ways', async ({ page }) => {
      await mount(page, 'p', { 'fit-preview': '' }, { html: '<div style="height: 500px">tall</div>', css })
      await expect.poll(() => iframeHeight(page)).toBe(500)
      const tall = (await box(page, 'p')).height

      await page.evaluate(() => document.getElementById('p').setValue({ html: '<div style="height: 80px">x</div>' }))
      await expect.poll(() => iframeHeight(page)).toBe(80)
      expect((await box(page, 'p')).height).toBeLessThan(tall)
    })

    test('reacts to content changed by the preview\'s own script', async ({ page }) => {
      await mount(page, 'p', { 'fit-preview': '' }, {
        html: '<div id="a" style="height: 80px">x</div>',
        css,
        js: "setTimeout(() => { document.getElementById('a').style.height = '300px' }, 200)"
      })
      await expect.poll(() => iframeHeight(page)).toBe(300)
    })

    test('a full-height body does not hold the preview open', async ({ page }) => {
      await mount(page, 'p', { 'fit-preview': '' }, {
        html: '<div style="height: 80px">x</div>',
        css: 'body { margin: 0; min-height: 100vh }'
      })
      await expect.poll(() => iframeHeight(page)).toBe(80)
    })

    test('works with the preview below the editor', async ({ page }) => {
      await mount(page, 'p', { 'fit-preview': '', 'preview-position': 'bottom' }, {
        html: '<div style="height: 400px">x</div>',
        css
      })
      await expect.poll(() => iframeHeight(page)).toBe(400)
    })

    test('removing the attribute restores the default layout', async ({ page }) => {
      await mount(page, 'p', { 'fit-preview': '' }, { html: '<div style="height: 80px">x</div>', css })
      await expect.poll(() => iframeHeight(page)).toBe(80)
      await page.evaluate(() => document.getElementById('p').removeAttribute('fit-preview'))
      await expect.poll(async () => (await box(page, 'p', '.workspace')).height).toBeGreaterThan(400)
      expect(await page.evaluate(() => document.getElementById('p').style.height)).toBe('')
    })
  })
})

test.describe('console indicator', () => {
  const panel = (page) => page.locator('#p .console-panel')
  const summary = (page) => page.locator('#p [data-role="console-summary"]')

  test('messages do not open the console or move the layout', async ({ page }) => {
    await mount(page, 'p', {}, { html: '<p>x</p>' })
    const before = (await box(page, 'p')).height
    await page.evaluate(() => document.getElementById('p').setValue({ js: "console.log('a'); console.error('b')" }))
    await expect(summary(page)).toContainText('2 entries')
    await expect(panel(page)).toHaveAttribute('data-open', 'false')
    expect((await box(page, 'p')).height).toBe(before)
  })

  test('source load failures do not open it either', async ({ page }) => {
    const missing = page.locator('#missing-source-playground')
    await expect(missing.locator('.console-entries')).toContainText('Failed to load JS source')
    await expect(missing.locator('.console-panel')).toHaveAttribute('data-open', 'false')
    await expect(missing.locator('.console-panel')).toHaveAttribute('data-severity', 'error')
  })

  test('severity reflects the worst message and is spelled out', async ({ page }) => {
    await mount(page, 'p', {}, { html: '<p>x</p>', js: "console.log('a')" })
    await expect(panel(page)).toHaveAttribute('data-severity', 'log')
    await expect(page.locator('#p .console-indicator')).toBeVisible()
    await expect(summary(page)).toHaveText('1 entry')

    await page.evaluate(() => document.getElementById('p').setValue({ js: "console.warn('a'); console.warn('b')" }))
    await expect(panel(page)).toHaveAttribute('data-severity', 'warn')
    await expect(summary(page)).toHaveText('2 entries · 2 warnings')

    await page.evaluate(() => document.getElementById('p').setValue({ js: "console.warn('a'); console.error('b')" }))
    await expect(panel(page)).toHaveAttribute('data-severity', 'error')
    await expect(summary(page)).toHaveText('2 entries · 1 error, 1 warning')
  })

  test('no messages means no indicator, and opening hides it', async ({ page }) => {
    await mount(page, 'p', {}, { html: '<p>x</p>' })
    await expect(page.locator('#p .console-indicator')).toBeHidden()
    await page.evaluate(() => document.getElementById('p').setValue({ js: "console.log('a')" }))
    await expect(page.locator('#p .console-indicator')).toBeVisible()
    await page.locator('#p [data-action="toggle-console"]').click()
    await expect(page.locator('#p .console-indicator')).toBeHidden()
    await expect(page.locator('#p .console-entries')).toBeVisible()
  })

  test('a console left open stays open after a reload', async ({ page }) => {
    await mount(page, 'p', { persist: 'k11' }, { html: '<p>x</p>' })
    await page.locator('#p [data-action="toggle-console"]').click()
    await mount(page, 'p', { persist: 'k11' }, { html: '<p>x</p>' })
    await expect(panel(page)).toHaveAttribute('data-open', 'true')
  })
})
