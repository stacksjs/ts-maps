// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/core/ClassSpec.js
import { beforeEach, describe, expect, it } from 'bun:test'
import { Class, createSpy } from './_harness'

describe('Class', () => {
  describe('#extends', () => {
    // Ported from ClassSpec.js#L7
    it('merges options instead of replacing them', () => {
      class KlassWithOptions1 extends Class {}
      KlassWithOptions1.setDefaultOptions({
        foo1: 1,
        foo2: 2,
      })
      class KlassWithOptions2 extends KlassWithOptions1 {}
      KlassWithOptions2.setDefaultOptions({
        foo2: 3,
        foo3: 4,
      })

      const a = new KlassWithOptions2() as any
      expect(a.options.foo1).toEqual(1)
      expect(a.options.foo2).toEqual(3)
      expect(a.options.foo3).toEqual(4)
    })

    // Ported from ClassSpec.js#L31
    it('inherits constructor hooks', () => {
      const spy1 = createSpy()
      const spy2 = createSpy()

      class Class1 extends Class {}
      class Class2 extends Class1 {}

      Class1.addInitHook(spy1)
      Class2.addInitHook(spy2)

      // eslint-disable-next-line no-new
      new Class2()

      expect(spy1.called).toBe(true)
      expect(spy2.called).toBe(true)
    })

    // Ported from ClassSpec.js#L47
    it('does not call child constructor hooks', () => {
      const spy1 = createSpy()
      const spy2 = createSpy()

      class Class1 extends Class {}
      class Class2 extends Class1 {}

      Class1.addInitHook(spy1)
      Class2.addInitHook(spy2)

      // eslint-disable-next-line no-new
      new Class1()

      expect(spy1.called).toBe(true)
      expect(spy2.called).toEqual(false)
    })
  })

  describe('#include', () => {
    let Klass: typeof Class

    beforeEach(() => {
      Klass = class extends Class {}
    })

    // Ported from ClassSpec.js#L71
    it('returns the class with the extra methods', () => {
      const q = createSpy()

      const Qlass = Klass.include({ quux: q })

      const a = new Klass() as any
      const b = new Qlass() as any

      a.quux()
      expect(q.called).toBe(true)

      b.quux()
      expect(q.called).toBe(true)
    })

    // Ported from ClassSpec.js#L87 (#6070)
    it('keeps parent options', () => {
      class Quux extends Class {}
      Quux.setDefaultOptions({ foo: 'Foo!' })

      Quux.include({
        options: { bar: 'Bar!' },
      })

      const q = new Quux() as any
      expect(q.options).toHaveProperty('foo')
      expect(q.options).toHaveProperty('bar')
    })

    // Ported from ClassSpec.js#L104
    it('does not reuse original props.options', () => {
      const props = { options: {} }
      const K = Klass.include(props)

      expect((K.prototype as any).options).not.toBe(props.options)
    })
  })
})
