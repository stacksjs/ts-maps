import type { CSSProperties, ReactElement, ReactNode } from 'react'
import type { TsMap as TsMapInstance } from 'ts-maps'
import type { MapEventProps } from './eventProps'
import { useEffect, useRef, useState } from 'react'
import { TsMap } from 'ts-maps'
import { EVENT_PROPS } from './eventProps'
import { MapContext } from './MapContext'

export interface MapProps extends MapEventProps {
  /** Initial map center as `[lat, lng]`. */
  center?: [number, number]
  zoom?: number
  bearing?: number
  pitch?: number
  /** Style specification (object) or stylesheet URL. */
  style?: unknown
  /** CSS styles applied to the container div. */
  containerStyle?: CSSProperties
  /** CSS class applied to the container div. */
  className?: string
  /** Called once the underlying `TsMap` instance has mounted. */
  onLoad?: (map: TsMapInstance) => void
  children?: ReactNode
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
    containerStyle,
    className,
    onLoad,
    children,
    ...rest
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<TsMapInstance | null>(null)
  const [map, setMap] = useState<TsMapInstance | null>(null)

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
    if (style !== undefined)
      options.style = style

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

  // Bind event props whenever the map or handlers change.
  useEffect(() => {
    if (!map)
      return
    const bindings: { event: string, handler: (e: any) => void }[] = []
    for (const prop of Object.keys(EVENT_PROPS)) {
      const handler = (rest as Record<string, unknown>)[prop]
      if (typeof handler === 'function') {
        const event = EVENT_PROPS[prop]
        const h = handler as (e: any) => void
        map.on(event, h)
        bindings.push({ event, handler: h })
      }
    }
    return () => {
      for (const b of bindings)
        map.off(b.event, b.handler)
    }
  }, [map, rest])

  // Camera prop sync — runs after the map exists.
  useEffect(() => {
    if (!map || center === undefined || zoom === undefined)
      return
    map.setView(center, zoom)
  }, [map, center, zoom])

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

  return (
    <MapContext.Provider value={{ map }}>
      <div ref={containerRef} className={className} style={containerStyle}>
        {map ? children : null}
      </div>
    </MapContext.Provider>
  )
}
