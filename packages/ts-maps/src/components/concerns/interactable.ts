interface Label {
  render?: (...args: any[]) => string
  offsets?: ((key: string) => [number, number]) | Array<[number, number]>
}

const Interactable = {
  getLabelText(key: string, label?: Label): string | undefined {
    if (!label) {
      return undefined
    }

    if (typeof label.render === 'function') {
      const params: any[] = []

      // Pass additional paramater (Marker config object) in case it's a Marker.
      if ((this as any).constructor.Name === 'marker') {
        params.push((this as any).getConfig())
      }

      // Becuase we need to add the key always at the end
      params.push(key)

      return label.render.apply(this, params)
    }

    return key
  },

  getLabelOffsets(key: string, label?: Label): [number, number] {
    if (label && typeof label.offsets === 'function') {
      return label.offsets(key)
    }

    // If offsets are an array of offsets e.g offsets: [ [0, 25], [10, 15] ]
    if (label && Array.isArray(label.offsets)) {
      return label.offsets[key as any] || [0, 0]
    }

    return [0, 0]
  },

  setStyle(property: string, value: any): void {
    (this as any).shape.setStyle(property, value)
  },

  remove(): void {
    (this as any).shape.remove()
    if ((this as any).label) {
      (this as any).label.remove()
    }
  },

  hover(state: boolean): void {
    this._setStatus('isHovered', state)
  },

  select(state: boolean): void {
    this._setStatus('isSelected', state)
  },

  // Private

  _setStatus(property: string, state: boolean): void {
    (this as any).shape[property] = state
    ;(this as any).shape.updateStyle()
    ;(this as any)[property] = state

    if ((this as any).label) {
      (this as any).label[property] = state
      ;(this as any).label.updateStyle()
    }
  },
}

export default Interactable
