import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Popup as TsPopup } from 'ts-maps'
import { useMap } from './useMap'

export interface PopupProps {
  position: [number, number]
  /** Popup HTML content. Prefer React children, but `content` is accepted too. */
  content?: string
  options?: Record<string, unknown>
  children?: ReactNode
}

/**
 * Creates a `Popup` at `position` for as long as this component is mounted.
 * Content is taken from the `content` prop or rendered children as a string.
 */
export function Popup({ position, content, options, children }: PopupProps): null {
  const map = useMap()
  const popupRef = useRef<InstanceType<typeof TsPopup> | null>(null)

  useEffect(() => {
    const popup = new TsPopup(options)
    ;(popup as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(position)
    const html = content ?? (typeof children === 'string' ? children : '')
    if (html)
      (popup as unknown as { setContent: (c: string) => void }).setContent(html)
    ;(popup as unknown as { openOn: (m: unknown) => void }).openOn(map)
    popupRef.current = popup
    return () => {
      ;(map as unknown as { removeLayer: (l: any) => void }).removeLayer(popup)
      popupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  useEffect(() => {
    const popup = popupRef.current
    if (!popup)
      return
    ;(popup as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(position)
  }, [position[0], position[1]])

  useEffect(() => {
    const popup = popupRef.current
    if (!popup)
      return
    const html = content ?? (typeof children === 'string' ? children : '')
    if (html)
      (popup as unknown as { setContent: (c: string) => void }).setContent(html)
  }, [content, children])

  return null
}
