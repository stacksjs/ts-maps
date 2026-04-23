import type { PropType } from 'vue'
import { Popup as TsPopup } from 'ts-maps'
import { defineComponent, onBeforeUnmount, watch } from 'vue'
import { useMap } from './useMap'

export const Popup = defineComponent({
  name: 'TsPopup',
  props: {
    position: { type: Array as unknown as PropType<[number, number]>, required: true },
    content: { type: String, default: undefined },
    options: { type: Object as PropType<Record<string, unknown>>, default: undefined },
  },
  setup(props, { slots }) {
    const mapRef = useMap()
    let popup: InstanceType<typeof TsPopup> | null = null

    const resolveContent = (): string => {
      if (props.content !== undefined)
        return props.content
      const s = slots.default?.()
      if (!s)
        return ''
      return s
        .map((v) => {
          const child = v.children
          return typeof child === 'string' ? child : ''
        })
        .join('')
    }

    const stop = watch(
      mapRef,
      (map) => {
        if (!map || popup)
          return
        popup = new TsPopup(props.options)
        ;(popup as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(props.position)
        const html = resolveContent()
        if (html)
          (popup as unknown as { setContent: (c: string) => void }).setContent(html)
        ;(popup as unknown as { openOn: (m: unknown) => void }).openOn(map)
      },
      { immediate: true },
    )

    watch(
      () => props.position,
      (pos) => {
        if (!popup || !pos)
          return
        ;(popup as unknown as { setLatLng: (p: [number, number]) => void }).setLatLng(pos)
      },
    )

    watch(
      () => props.content,
      () => {
        if (!popup)
          return
        const html = resolveContent()
        if (html)
          (popup as unknown as { setContent: (c: string) => void }).setContent(html)
      },
    )

    onBeforeUnmount(() => {
      stop()
      const m = mapRef.value
      if (popup && m)
        (m as unknown as { removeLayer: (l: any) => void }).removeLayer(popup)
      popup = null
    })

    return () => null
  },
})

export default Popup
