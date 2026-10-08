import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { TsMap as TsMapInstance } from 'ts-maps'
import type { MapEventProps } from './eventProps'
import { useEffect, useRef, useState } from 'react'
import { TsMap } from 'ts-maps'
import { EVENT_PROPS } from './eventProps'
import { MapContext } from './MapContext'

export interface MapProps extends MapEventProps {
  /** Map center as `[lat, lng]`. Followed when its value changes. */
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  /** Style specification (object) or stylesheet URL. Followed when it changes. */
  style?: unknown
  /**
   * The language the built-in controls speak, unless one has its own
   * `locale`. Default the browser's. A change reaches each control the next
   * time it draws its words; give the control its own `locale` to relabel it
   * at once.
   */
  locale?: string
  /** CSS styles applied to the container div. */
  containerStyle?: CSSProperties
  /** CSS class applied to the container div. */
  className?: string
  /** Called once the underlying `TsMap` instance has mounted. */
  onLoad?: (map: TsMapInstance) => void
  children?: ReactNode
}

/** A style, by value: its URL, or its JSON. */
function styleKey(style: unknown): string {
  return typeof style === 'string' ? style : JSON.stringify(style)
}

/**
 * Root component that owns a `TsMap` instance and exposes it to descendants
 * via context. The instance is created on client-side mount only — during SSR
 * we render an empty container div.
 */
export function Map(props: MapProps): ReactElement {
  const {
    center,
    zoom,
    bearing,
    pitch,
    style,
    locale,
    containerStyle,
    className,
    onLoad,
    children,
    ...rest
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<TsMapInstance | null>(null)
  const [map, setMap] = useState<TsMapInstance | null>(null)
  // The latest event props, read when an event fires: listeners are bound
  // once per handler prop, not again for every render's new functions.
  const handlersRef = useRef<Record<string, unknown>>(rest)
  handlersRef.current = rest
  // The style the map was last given, by value: a style written inline is a
  // new object every render, and setting it again would fire style.load each
  // time.
  const appliedStyle = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!containerRef.current || mapRef.current)
      return

    const options: Record<string, unknown> = {}
    if (center !== undefined)
      options.center = center
    if (zoom !== undefined)
      options.zoom = zoom
    if (bearing !== undefined)
      options.bearing = bearing
    if (pitch !== undefined)
      options.pitch = pitch
    if (style !== undefined) {
      options.style = style
      appliedStyle.current = styleKey(style)
    }
    if (locale !== undefined)
      options.locale = locale

    const instance = new TsMap(containerRef.current, options)
    mapRef.current = instance
    setMap(instance)
    onLoad?.(instance)

    return () => {
      try {
        ;(instance as unknown as { remove?: () => void }).remove?.()
      }
      catch {
        // ignore cleanup errors; the host is being torn down
      }
      mapRef.current = null
      setMap(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Which event props are given: listeners change when one comes or goes,
  // and each calls whatever function the prop holds now.
  const bound = Object.keys(EVENT_PROPS).filter(prop => typeof (rest as Record<string, unknown>)[prop] === 'function').join(',')

  useEffect(() => {
    if (!map || !bound)
      return
    const bindings: { event: string, handler: (e: any) => void }[] = []
    for (const prop of bound.split(',')) {
      const event = EVENT_PROPS[prop]!
      const h = (e: any): void => {
        const handler = handlersRef.current[prop]
        if (typeof handler === 'function')
          handler(e)
      }
      map.on(event, h)
      bindings.push({ event, handler: h })
      // The map fires `load` from its constructor, before any listener
      // can exist: a map already loaded is told to this one now.
      if (event === 'load' && (map as any)._loaded)
        queueMicrotask(() => h({ type: 'load', target: map }))
    }
    return () => {
      for (const b of bindings)
        map.off(b.event, b.handler)
    }
  }, [map, bound])

  // Camera props are followed by value: a parent that re-renders with the
  // same `center` (a new array each time) mustn't undo a pan the user made.
  useEffect(() => {
    if (!map || center === undefined || zoom === undefined)
      return
    map.setView(center, zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, center?.[0], center?.[1], zoom])

  useEffect(() => {
    if (!map || style === undefined)
      return
    const key = styleKey(style)
    if (key === appliedStyle.current)
      return
    appliedStyle.current = key
    map.setStyle(style as Parameters<TsMapInstance['setStyle']>[0])
  }, [map, style])

  useEffect(() => {
    if (!map || bearing === undefined)
      return
    ;(map as unknown as { setBearing?: (b: number) => void }).setBearing?.(bearing)
  }, [map, bearing])

  useEffect(() => {
    if (!map || pitch === undefined)
      return
    ;(map as unknown as { setPitch?: (p: number) => void }).setPitch?.(pitch)
  }, [map, pitch])

  useEffect(() => {
    if (map)
      map.options.locale = locale
  }, [map, locale])

  return (
    <MapContext.Provider value={{ map }}>
      <div ref={containerRef} className={className} style={containerStyle}>
        {map ? children : null}
      </div>
    </MapContext.Provider>
  )
}
