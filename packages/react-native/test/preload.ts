import { createElement } from 'react'
import { GlobalRegistrator } from 'very-happy-dom'

GlobalRegistrator.register()

const g = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
g.IS_REACT_ACT_ENVIRONMENT = true

// Mock `react-native` — we only need `ViewStyle` as a type alias at runtime
// and an (unused) `View` component. Bun resolves this via the registered
// module alias below.
const reactNativeMock = {
  // ViewStyle is a type; runtime consumers don't exist. Keep it here for
  // TypeScript import { type ViewStyle } from 'react-native' calls.
  View: (props: Record<string, unknown>) => createElement('div', props),
}

// Mock react-native-webview. The mock is a DOM div carrying the source as a
// data attribute so tests can assert on it, plus a ref API that captures the
// two helper methods our component calls.
// eslint-disable-next-line no-unused-vars
type MessageHandler = (e: { nativeEvent: { data: string } }) => void
const webviewInstances: Array<{
  ref: unknown
  onMessage: MessageHandler | undefined
}> = []

// eslint-disable-next-line no-unused-vars
function WebViewMock(props: Record<string, unknown>): unknown {
  const source = (props.source ?? {}) as { html?: string, uri?: string }
  const onMessage = props.onMessage as MessageHandler | undefined
  // Capture the ref so tests can reply from the "WebView side".
  const refCandidate = (props as { ref?: { current: unknown } }).ref
  const handle = {
    postMessage: (msg: string): void => {
      // round-trip: deliver back to the RN side as a bridge message
      void msg
    },
    injectJavaScript: (js: string): void => {
      // eslint-disable-next-line no-unused-vars
      void js
    },
  }
  if (refCandidate && typeof refCandidate === 'object')
    refCandidate.current = handle

  webviewInstances.push({ ref: handle, onMessage })

  return createElement('div', {
    'data-testid': 'webview',
    'data-source': JSON.stringify(source),
  })
}

const gx = globalThis as unknown as { __tsMapsRnTestWebViews: typeof webviewInstances }
gx.__tsMapsRnTestWebViews = webviewInstances

// Register bun module mocks.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require('bun:test') as { mock: { module: (name: string, factory: () => unknown) => void } }
mod.mock.module('react-native', () => reactNativeMock)
mod.mock.module('react-native-webview', () => ({
  default: WebViewMock,
  WebView: WebViewMock,
}))
