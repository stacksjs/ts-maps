import type { Component } from 'vue'
import { VectorMap } from 'ts-maps'
import { defineComponent, getCurrentInstance, h, onMounted, onUnmounted, shallowRef, useAttrs } from 'vue'

export const Namespace = '$VUE_VECTOR_MAP'

const component: Component = defineComponent({
  name: 'vue-vector-map',
  inheritAttrs: false,

  props: {
    options: Object,
    width: {
      type: [Number, String],
      default: 650,
    },
    height: {
      type: [Number, String],
      default: 350,
    },
  },

  setup(props, { expose }) {
    const listeners: { [key: string]: any } = {}
    const map = shallowRef()
    const instance = getCurrentInstance()
    const uid = `__vm__${instance?.uid}`
    const globals = instance?.appContext.config.globalProperties[Namespace]

    for (const [name, fn] of Object.entries(useAttrs())) {
      if (name.startsWith('on')) {
        listeners[name] = fn
      }
    }

    onMounted(() => {
      map.value = new VectorMap({
        selector: `#${uid}`,
        ...globals,
        ...props.options,
        ...listeners,
      })
    })

    onUnmounted(() => {
      map.value.destroy()
    })

    expose({ map })

    return () => h('div', {
      id: uid,
      style: {
        height: `${props.height}px`,
        width: `${props.width}px`,
      },
    })
  },
})

export default component
