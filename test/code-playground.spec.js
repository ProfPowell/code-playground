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
