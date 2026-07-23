import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'

import { useMediaQuery } from './use-media-query'

const originalWindow = globalThis.window

test.afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    globalThis.window = originalWindow
  }
})

test('defaults to false during server rendering', () => {
  function Harness() {
    return useMediaQuery('(min-width: 768px)') ? 'desktop' : 'mobile'
  }

  assert.equal(renderToString(createElement(Harness)), 'mobile')
})

test('reads the initial media-query match when rendering in the browser', () => {
  let calls = 0
  globalThis.window = {
    matchMedia() {
      calls += 1
      return { matches: true }
    },
  } as unknown as Window & typeof globalThis

  function Harness() {
    return useMediaQuery('(min-width: 768px)') ? 'desktop' : 'mobile'
  }

  assert.equal(renderToString(createElement(Harness)), 'desktop')
  assert.equal(calls, 1)
})
