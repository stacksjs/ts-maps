// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/core/UtilSpec.js
import { describe, expect, it } from 'bun:test'
import { createSpy, Util } from './_harness'

describe('Util', () => {
  describe('#stamp', () => {
    // Ported from UtilSpec.js#L7
    it('sets a unique id on the given object and returns it', () => {
      const a: any = {}
      const id = Util.stamp(a)

      expect(typeof id).toEqual('number')
      expect(Util.stamp(a)).toEqual(id)

      const b: any = {}
      const id2 = Util.stamp(b)

      expect(id2).not.toEqual(id)
    })
  })

  describe('#falseFn', () => {
    // Ported from UtilSpec.js#L22
    it('returns false', () => {
      expect(Util.falseFn()).toBe(false)
    })
  })

  describe('#formatNum', () => {
    // Ported from UtilSpec.js#L28
    it('formats numbers with a given precision', () => {
      expect(Util.formatNum(13.12325555, 3)).toEqual(13.123)
      expect(Util.formatNum(13.12325555)).toEqual(13.123256)
      expect(Util.formatNum(13.12325555, 0)).toEqual(13)
      expect(Util.formatNum(13.12325555, false)).toEqual(13.12325555)
      expect(Number.isNaN(Util.formatNum(-7.993322e-10))).toEqual(false)
    })
  })

  describe('#throttle', () => {
    // Ported from UtilSpec.js#L38
    it('limits execution to not more often than specified time interval', (done) => {
      const spy = createSpy()

      const fn = Util.throttle(spy, 20)

      fn()
      fn()
      fn()

      expect(spy.callCount).toEqual(1)

      setTimeout(() => {
        expect(spy.callCount).toEqual(2)
        done()
      }, 30)
    })
  })

  describe('#splitWords', () => {
    // Ported from UtilSpec.js#L57
    it('splits words into an array', () => {
      expect(Util.splitWords('foo bar baz')).toEqual(['foo', 'bar', 'baz'])
    })
  })

  describe('#setOptions', () => {
    // Ported from UtilSpec.js#L63
    it('sets specified options on object', () => {
      const o: any = {}
      Util.setOptions(o, { foo: 'bar' })
      expect(o.options.foo).toEqual('bar')
    })

    // Ported from UtilSpec.js#L69
    it('returns options', () => {
      const o: any = {}
      const r = Util.setOptions(o, { foo: 'bar' })
      expect(r).toBe(o.options)
    })

    // Ported from UtilSpec.js#L75
    it('accepts undefined', () => {
      const o: any = {}
      Util.setOptions(o, undefined)
      expect(o.options).toEqual({})
    })

    // Ported from UtilSpec.js#L81
    it('creates a distinct options object', () => {
      const opts = {}
      const o: any = Object.create({ options: opts })
      Util.setOptions(o, {})
      expect(o.options).not.toBe(opts)
    })

    // Ported from UtilSpec.js#L88
    it(`doesn't create a distinct options object if object already has own options`, () => {
      const opts = {}
      const o: any = { options: opts }
      Util.setOptions(o, {})
      expect(o.options).toBe(opts)
    })

    // Ported from UtilSpec.js#L95
    it('inherits options prototypally', () => {
      const opts: any = {}
      const o: any = Object.create({ options: opts })
      Util.setOptions(o, {})
      opts.foo = 'bar'
      expect(o.options.foo).toEqual('bar')
    })
  })

  describe('#template', () => {
    // Ported from UtilSpec.js#L105
    it('evaluates templates with a given data object', () => {
      const tpl = 'Hello {foo} and {bar}!'

      const str = Util.template(tpl, {
        foo: 'Vlad',
        bar: 'Dave',
      })

      expect(str).toEqual('Hello Vlad and Dave!')
    })

    // Ported from UtilSpec.js#L116
    it('does not modify text without a token variable', () => {
      expect(Util.template('foo', {})).toEqual('foo')
    })

    // Ported from UtilSpec.js#L120
    it('supports templates with double quotes', () => {
      expect(Util.template('He said: "{foo}"!', {
        foo: 'Hello',
      })).toEqual('He said: "Hello"!')
    })

    // Ported from UtilSpec.js#L126
    it('throws when a template token is not given', () => {
      expect(() => {
        Util.template(undefined as any, { foo: 'bar' })
      }).toThrow()
    })

    // Ported from UtilSpec.js#L132
    it('allows underscores, dashes and spaces in placeholders', () => {
      expect(Util.template('{nice_stuff}', { nice_stuff: 'foo' })).toEqual('foo')
      expect(Util.template('{-y}', { '-y': 1 })).toEqual('1')
      expect(Util.template('{Day Of Month}', { 'Day Of Month': 30 })).toEqual('30')
    })
  })
})
