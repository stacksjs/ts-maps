// Formatted — the value `format` evaluates to.
//
// `["format", "Main", {}, " St", { "font-scale": 0.8 }]` is one label whose
// parts are drawn differently: a road shield's number larger than its prefix,
// a place name above a smaller subtitle, a unit in a lighter colour. The
// sections have to survive as structure all the way to the renderer, because
// the whole point of them is that they are not one uniform run of text.
//
// They also have to keep behaving like a string. `text-field` is read in
// several places that only want to know whether there is any text and how
// long it is, and a caller reading a feature's label through the query API
// expects a string. `toString` concatenates, so every one of those paths keeps
// working and only the drawing code needs to know sections exist.

export interface FormattedSection {
  text: string
  /** Multiplier on the layer's `text-size`, from `font-scale`. */
  scale?: number
  /** Per-section `text-font`, overriding the layer's. */
  fontStack?: string[]
  /** Per-section `text-color`, overriding the layer's. */
  color?: string
}

export class Formatted {
  sections: FormattedSection[]

  constructor(sections: FormattedSection[]) {
    this.sections = sections
  }

  toString(): string {
    let out = ''
    for (const section of this.sections)
      out += section.text
    return out
  }

  /** True when no section carries any styling of its own. */
  get uniform(): boolean {
    return isUniform(this.sections)
  }
}

/**
 * Whether these sections are just a string in disguise.
 *
 * Most `format` expressions in real styles carry no options at all — they are
 * written for the newline, or for a conditional the author found easier to
 * express there. Those take the plain text path, which measures and draws in
 * one call instead of per section.
 */
export function isUniform(sections: FormattedSection[]): boolean {
  return sections.every(s => s.scale === undefined && s.fontStack === undefined && s.color === undefined)
}

/** Duck-typed, so a value crossing a module boundary is still recognised. */
export function isFormatted(value: unknown): value is Formatted {
  return value instanceof Formatted
    || (!!value && typeof value === 'object' && Array.isArray((value as Formatted).sections))
}
