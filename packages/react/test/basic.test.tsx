import { describe, expect, test } from 'bun:test'
import { act, createElement, useContext } from 'react'
import { createRoot } from 'react-dom/client'
import ReactDOMServer from 'react-dom/server'
import { Map, MapContext, useMap, useMapEvent } from '../src'
import { EVENT_PROPS } from '../src/eventProps'

describe('@ts-maps/react exports', () => {
  test('module exports the public surface', () => {
    expect(typeof Map).toBe('function')
    expect(typeof useMap).toBe('function')
    expect(typeof useMapEvent).toBe('function')
    expect(MapContext).toBeDefined()
  })

  test('SSR renders the container without throwing', () => {
    const html = ReactDOMServer.renderToString(
      createElement(Map, {
        className: 'my-map',
        containerStyle: { width: '400px', height: '300px' },
      }),
    )
    expect(html).toContain('class="my-map"')
    expect(html).toContain('width:400px')
  })

  test('event prop mapping covers the common TsMap events', () => {
    expect(EVENT_PROPS.onClick).toBe('click')
    expect(EVENT_PROPS.onMove).toBe('move')
    expect(EVENT_PROPS.onStyleLoad).toBe('styleload')
    expect(EVENT_PROPS.onZoomEnd).toBe('zoomend')
  })

  test('useMap throws outside of a Map provider', () => {
    function Consumer(): null {
      useMap()
      return null
    }
    expect(() =>
      ReactDOMServer.renderToString(createElement(Consumer)),
    ).toThrow(/useMap/)
  })

  test('MapContext default value exposes a null map', () => {
    function Consumer(): null {
      const ctx = useContext(MapContext)
      expect(ctx.map).toBeNull()
      return null
    }
    ReactDOMServer.renderToString(createElement(Consumer))
  })
})

describe('<Map> client mount', () => {
  test('constructs a TsMap when mounted with a sized container', async () => {
    const host = document.createElement('div')
    host.style.width = '800px'
    host.style.height = '600px'
    document.body.appendChild(host)

    let received: unknown = null
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(Map, {
          containerStyle: { width: '800px', height: '600px' },
          center: [0, 0],
          zoom: 3,
          onLoad: (m) => {
            received = m
          },
        }),
      )
    })

    expect(received).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})
