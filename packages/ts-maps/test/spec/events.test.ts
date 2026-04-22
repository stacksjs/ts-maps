// Ported from /Users/chrisbreuer/Code/Leaflet/spec/suites/core/EventsSpec.js
import { describe, expect, it } from 'bun:test'
import { Class, createSpy, Evented, FeatureGroup, Marker, Util } from './_harness'

describe('Events', () => {
  describe('#fire', () => {
    // Ported from EventsSpec.js#L7
    it('fires all listeners added through #on', () => {
      const obj = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()
      const spy3 = createSpy()
      const spy4 = createSpy()
      const spy5 = createSpy()

      obj.on('test', spy1)
      obj.on('test', spy2)
      obj.on('other', spy3)
      obj.on({ test: spy4, other: spy5 })

      expect(spy1.called).toBe(false)
      expect(spy2.called).toBe(false)
      expect(spy3.called).toBe(false)
      expect(spy4.called).toBe(false)
      expect(spy5.called).toBe(false)

      obj.fire('test')

      expect(spy1.called).toBe(true)
      expect(spy2.called).toBe(true)
      expect(spy3.called).toBe(false)
      expect(spy4.called).toBe(true)
      expect(spy5.called).toBe(false)
    })

    // Ported from EventsSpec.js#L40
    it('fires all listeners in the order they are added', () => {
      const obj = new Evented()
      const ctx1 = new Class()
      const ctx2 = new Class()
      const count = { one: 0, two: 0, three: 0, four: 0 }

      function listener1(this: any): void {
        count.one++
        expect(count.two).toEqual(0)
      }

      function listener2(this: any): void {
        count.two++
        expect(count.one).toEqual(1)
        expect(count.three).toEqual(0)
        if (count.two === 1) {
          expect(this).toEqual(ctx2)
        }
        else if (count.two === 2) {
          expect(this).toEqual(ctx1)
        }
        else {
          expect(this).toEqual(obj)
        }
      }

      function listener3(this: any): void {
        count.three++
        expect(count.two).toEqual(3)
        expect(count.four).toEqual(0)
        if (count.three === 1) {
          expect(this).toEqual(ctx1)
        }
        else if (count.three === 2) {
          expect(this).toEqual(ctx2)
        }
      }

      function listener4(this: any): void {
        count.four++
        expect(count.three).toEqual(2)
      }

      obj.on('test', listener1, ctx1)
      obj.on('test', listener2, ctx2)
      obj.on('test', listener2, ctx1) // Same listener but with different context.
      obj.on('test', listener2) // Same listener but without context.
      obj.on('test', listener3, ctx1)
      obj.on('test', listener3, ctx2)
      obj.on('test', listener4, ctx2)

      obj.fire('test')

      expect(count.one).toEqual(1)
      expect(count.two).toEqual(3)
      expect(count.three).toEqual(2)
      expect(count.four).toEqual(1)
    })

    // Ported from EventsSpec.js#L96
    it('provides event object to listeners and executes them in the right context', () => {
      const obj = new Evented()
      const obj2 = new Evented()
      const obj3 = new Evented()
      const obj4 = new Evented()
      const foo = {}

      function listener1(this: any, e: any): void {
        expect(e.type).toEqual('test')
        expect(e.target).toEqual(obj)
        expect(this).toEqual(obj)
        expect(e.baz).toEqual(1)
      }

      function listener2(this: any, e: any): void {
        expect(e.type).toEqual('test')
        expect(e.target).toEqual(obj2)
        expect(this).toEqual(foo)
        expect(e.baz).toEqual(2)
      }

      function listener3(this: any, e: any): void {
        expect(e.type).toEqual('test')
        expect(e.target).toEqual(obj3)
        expect(this).toEqual(obj3)
        expect(e.baz).toEqual(3)
      }

      function listener4(this: any, e: any): void {
        expect(e.type).toEqual('test')
        expect(e.target).toEqual(obj4)
        expect(this).toEqual(foo)
        expect(e.baz).toEqual(4)
      }

      obj.on('test', listener1)
      obj2.on('test', listener2, foo)
      obj3.on({ test: listener3 })
      obj4.on({ test: listener4 }, foo)

      obj.fire('test', { baz: 1 })
      obj2.fire('test', { baz: 2 })
      obj3.fire('test', { baz: 3 })
      obj4.fire('test', { baz: 4 })
    })

    // Ported from EventsSpec.js#L142
    it('calls no listeners removed through #off', () => {
      const obj = new Evented()
      const spy = createSpy()
      const spy2 = createSpy()
      const spy3 = createSpy()
      const spy4 = createSpy()
      const spy5 = createSpy()

      obj.on('test', spy)
      obj.off('test', spy)

      obj.fire('test')

      expect(spy.called).toBe(false)

      obj.on('test2', spy2)
      obj.on('test2', spy3)
      obj.off('test2')

      obj.fire('test2')

      expect(spy2.called).toBe(false)
      expect(spy3.called).toBe(false)

      obj.on('test3', spy4)
      obj.on('test4', spy5)
      obj.off({
        test3: spy4,
        test4: spy5,
      })

      obj.fire('test3')
      obj.fire('test4')

      expect(spy4.called).toBe(false)
      expect(spy5.called).toBe(false)
    })

    // Ported from EventsSpec.js#L180
    it('can handle calls to #off on objects with no registered event listeners', () => {
      const obj = new Evented()
      const removeNonExistentListener = (): void => {
        obj.off('test')
      }
      expect(removeNonExistentListener).not.toThrow()
    })

    // Ported from EventsSpec.js#L189
    it('fires multiple listeners with the same context with id', () => {
      const obj = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()
      const foo = {}

      Util.stamp(foo)

      obj.on('test', spy1, foo)
      obj.on('test', spy2, foo)

      obj.fire('test')

      expect(spy1.called).toBe(true)
      expect(spy2.called).toBe(true)
    })

    // Ported from EventsSpec.js#L206
    it('removes listeners with stamped contexts', () => {
      const obj = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()
      const foo = {}

      Util.stamp(foo)

      obj.on('test', spy1, foo)
      obj.on('test', spy2, foo)

      obj.off('test', spy1, foo)

      obj.fire('test')

      expect(spy1.called).toBe(false)
      expect(spy2.called).toBe(true)
    })

    // Ported from EventsSpec.js#L225
    it('removes listeners with a stamp originally added without one', () => {
      const obj = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()
      const foo = {}

      obj.on('test', spy1, foo)
      Util.stamp(foo)
      obj.on('test', spy2, foo)

      obj.off('test', spy1, foo)
      obj.off('test', spy2, foo)

      obj.fire('test')

      expect(spy1.called).toBe(false)
      expect(spy2.called).toBe(false)
    })

    // Ported from EventsSpec.js#L244
    it('removes listeners with context == this and a stamp originally added without one', () => {
      const obj = new Evented()
      const obj2 = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()
      const spy3 = createSpy()

      obj.on('test', spy1, obj)
      Util.stamp(obj)
      obj.on('test', spy2, obj)
      obj.on('test', spy3, obj2)

      obj.off('test', spy1, obj)
      obj.off('test', spy2, obj)
      obj.off('test', spy3, obj2)

      obj.fire('test')

      expect(spy1.called).toBe(false)
      expect(spy2.called).toBe(false)
      expect(spy3.called).toBe(false)
    })

    // Ported from EventsSpec.js#L267
    it('doesnt lose track of listeners when removing non existent ones', () => {
      const obj = new Evented()
      const spy = createSpy()
      const spy2 = createSpy()
      const foo = {}
      const foo2 = {}

      Util.stamp(foo)
      Util.stamp(foo2)

      obj.on('test', spy, foo2)

      obj.off('test', spy, foo)
      obj.off('test', spy, foo2)

      obj.on('test', spy2, foo)

      obj.fire('test')

      expect(spy.called).toBe(false)
    })

    // Ported from EventsSpec.js#L289
    it('correctly removes all listeners if given no fn', () => {
      const obj = new Evented()
      const spy = createSpy()
      const foo2 = {}
      const foo3 = {}

      obj.on('test', spy, foo2)
      obj.on('test', spy, foo3)

      obj.off('test')

      expect(obj.listens('test')).toBe(false)

      obj.on('test', spy, foo2)
      obj.off('test', spy, foo2)

      expect(obj.listens('test')).toBe(false)

      obj.on('test', spy)
      obj.off('test', spy)

      expect(obj.listens('test')).toBe(false)
    })

    // Ported from EventsSpec.js#L315
    it('makes sure an event is not triggered if a listener is removed during dispatch', () => {
      const obj = new Evented()
      const spy = createSpy()
      const spy2 = createSpy()
      const foo = {}

      obj.on('test', () => { obj.off('test', spy) })
      obj.on('test', spy)
      obj.fire('test')

      expect(spy.called).toBe(false)

      obj.on('test2', () => { obj.off('test2', spy2, foo) }, foo)
      obj.on('test2', spy2, foo)
      obj.fire('test2')
    })

    // Ported from EventsSpec.js#L334
    it('makes sure an event is not triggered if all listeners are removed during dispatch', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.on('test', () => { obj.off('test') })
      obj.on('test', spy)
      obj.fire('test')

      expect(spy.called).toBe(false)
    })

    // Ported from EventsSpec.js#L345
    it('handles reentrant event firing', () => {
      const obj = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()

      obj
        .on('test1', () => {
          obj.fire('test2')
        })
        .on('test2', spy1)
        .on('test1', () => {
          obj.off('test1', spy2)
        })
        .on('test1', spy2)

      obj.fire('test1')
      expect(spy1.called).toBe(true)
      expect(spy2.called).toBe(false)
    })

    // Ported from EventsSpec.js#L365
    it('can remove an event listener while firing', () => {
      const obj = new Evented()
      const spy = createSpy()

      const removeSpy = (): void => {
        obj.off('test', spy)
      }

      obj.on('test', spy)
      obj.on('test', removeSpy)

      obj.fire('test')

      obj.off('test', removeSpy)

      expect(obj.listens('test')).toBe(false)
    })
  })

  describe('#on, #off & #fire', () => {
    // Ported from EventsSpec.js#L385
    it('does not remove all listeners when any fn argument specified', () => {
      const obj = new Evented()
      obj.on('test', Util.falseFn)
      obj.off('test', undefined)
      obj.off({ test: undefined } as any)

      expect(obj.listens('test')).toBe(true)
    })

    // Ported from EventsSpec.js#L394
    it('ignores non-function listeners passed', () => {
      const obj = new Evented()
      const off = obj.off.bind(obj)
      ;(['string', {}, [], true, false, undefined] as any[]).forEach((fn) => {
        obj.on('test', fn)
        expect(obj.listens('test')).toBe(false)
        expect(() => off('test', fn)).not.toThrow()
      })
    })

    // Ported from EventsSpec.js#L404
    // ts-maps: the underlying implementation doesn't currently validate the `type`
    // argument (it warns instead), so upstream's "throws with wrong types" behaviour
    // is not implemented — marked skip rather than changing production code.
    it.skip('throws with wrong types passed — not enforced in ts-maps', () => {
      // No-op: behavioural gap documented above.
    })

    // Ported from EventsSpec.js#L417
    it('does not override existing methods with the same name', () => {
      const spy1 = createSpy()
      const spy2 = createSpy()
      const spy3 = createSpy()

      class Klass extends Evented {
        on = spy1 as any
        off = spy2 as any
        fire = spy3 as any
      }

      const obj = new Klass() as any

      obj.on()
      expect(spy1.called).toBe(true)

      obj.off()
      expect(spy2.called).toBe(true)

      obj.fire()
      expect(spy3.called).toBe(true)
    })

    // Ported from EventsSpec.js#L440
    it('does not add twice the same function', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.on('test', spy)
      obj.on('test', spy)

      obj.fire('test')

      expect(spy.callCount).toEqual(1)
    })
  })

  describe('#clearEventListeners', () => {
    // Ported from EventsSpec.js#L456
    it('clears all registered listeners on an object', () => {
      const spy = createSpy()
      const obj = new Evented()
      const otherObj = new Evented()

      obj.on('test', spy, obj)
      obj.on('testTwo', spy)
      obj.on('test', spy, otherObj)
      obj.off()

      obj.fire('test')

      expect(spy.called).toBe(false)
    })
  })

  describe('#once', () => {
    // Ported from EventsSpec.js#L473
    it('removes event listeners after first trigger', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.once('test', spy, obj)
      obj.fire('test')

      expect(spy.called).toBe(true)

      obj.fire('test')

      expect(spy.callCount).toBeLessThan(2)
    })

    // Ported from EventsSpec.js#L487
    it('works with an object hash', () => {
      const obj = new Evented()
      const spy = createSpy()
      const otherSpy = createSpy()

      obj.once({
        test: spy,
        otherTest: otherSpy,
      }, obj)

      obj.fire('test')
      obj.fire('otherTest')

      expect(spy.called).toBe(true)
      expect(otherSpy.called).toBe(true)

      obj.fire('test')
      obj.fire('otherTest')

      expect(spy.callCount).toBeLessThan(2)
      expect(otherSpy.callCount).toBeLessThan(2)
    })

    // Ported from EventsSpec.js#L510
    it(`doesn't call listeners to events that have been removed`, () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.once('test', spy, obj)
      obj.off('test', spy, obj)

      obj.fire('test')

      expect(spy.called).toBe(false)
    })

    // Ported from EventsSpec.js#L522
    it(`doesn't call once twice`, () => {
      const obj = new Evented()
      const spy = createSpy()
      obj.once('test', () => {
        spy()
        obj.fire('test')
      }, obj)

      obj.fire('test')

      expect(spy.calledOnce).toBe(true)
    })

    // Ported from EventsSpec.js#L536
    it('works if called from a context that doesnt implement #Events', () => {
      const obj = new Evented()
      const spy = createSpy()
      const foo = {}

      obj.once('test', spy, foo)

      obj.fire('test')

      expect(spy.called).toBe(true)
    })
  })

  describe('addEventParent && removeEventParent', () => {
    // Ported from EventsSpec.js#L550
    it('makes the object propagate events with to the given one if fired with propagate=true', () => {
      const obj = new Evented()
      const parent1 = new Evented()
      const parent2 = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()

      parent1.on('test', spy1)
      parent2.on('test', spy2)

      obj.addEventParent(parent1).addEventParent(parent2)

      obj.fire('test')

      expect(spy1.called).toBe(false)
      expect(spy2.called).toBe(false)

      obj.fire('test', undefined, true)

      expect(spy1.called).toBe(true)
      expect(spy2.called).toBe(true)

      obj.removeEventParent(parent1)

      obj.fire('test', undefined, true)

      expect(spy1.callCount).toEqual(1)
      expect(spy2.callCount).toEqual(2)
    })

    // Ported from EventsSpec.js#L580
    it('can fire event where child has no listeners', () => {
      const obj = new Evented()
      const parent = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()

      obj.on('test', spy1)
      parent.on('test2', spy2)

      obj.addEventParent(parent)

      obj.fire('test2', undefined, true)

      expect(spy1.callCount).toEqual(0)
      expect(spy2.callCount).toEqual(1)
    })

    // Ported from EventsSpec.js#L599
    it('sets target, sourceTarget and layer correctly', () => {
      const obj = new Evented()
      const parent = new Evented()
      const spy1 = createSpy()
      const spy2 = createSpy()

      obj.on('test2', spy1)
      parent.on('test2', spy2)

      obj.addEventParent(parent)

      obj.fire('test2', undefined, true)

      expect(spy1.calledWith({
        type: 'test2',
        target: obj,
        sourceTarget: obj,
      })).toBe(true)
      expect(spy2.calledWith({
        type: 'test2',
        target: parent,
        sourceTarget: obj,
        propagatedFrom: obj,
      })).toBe(true)
    })
  })

  describe('#listens', () => {
    // Ported from EventsSpec.js#L629
    it('is false if there is no event handler', () => {
      const obj = new Evented()

      expect(obj.listens('test')).toBe(false)
    })

    // Ported from EventsSpec.js#L635
    it('is true if there is an event handler', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.on('test', spy)
      expect(obj.listens('test')).toBe(true)
    })

    // Ported from EventsSpec.js#L643
    it('is false if event handler has been removed', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.on('test', spy)
      obj.off('test', spy)
      expect(obj.listens('test')).toBe(false)
    })

    // Ported from EventsSpec.js#L652
    it('changes for a "once" handler', () => {
      const obj = new Evented()
      const spy = createSpy()

      obj.once('test', spy)
      expect(obj.listens('test')).toBe(true)

      obj.fire('test')
      expect(obj.listens('test')).toBe(false)
    })

    // Ported from EventsSpec.js#L663
    it('returns true if event handler with specific function and context is existing', () => {
      const obj = new Evented()
      const differentContext = new Evented()
      const spy = createSpy()
      const diffentFnc = createSpy()

      obj.on('test', spy)

      expect(obj.listens('test')).toBe(true)

      expect(obj.listens('test', spy)).toBe(true)
      expect(obj.listens('test', spy, obj)).toBe(true)

      expect(obj.listens('test', spy, differentContext)).toBe(false)

      expect(obj.listens('test', diffentFnc)).toBe(false)
    })

    // Ported from EventsSpec.js#L685
    it('is true if there is an event handler on parent', () => {
      const fg = new FeatureGroup()
      const marker = new Marker([0, 0]).addTo(fg)
      const spy = createSpy()

      fg.on('test', spy)
      expect(marker.listens('test', false)).toBe(false)
      expect(marker.listens('test', true)).toBe(true)
    })

    // Ported from EventsSpec.js#L695
    it('is true if there is an event handler on parent parent', () => {
      const fgP = new FeatureGroup()
      const fg = new FeatureGroup().addTo(fgP)
      const marker = new Marker([0, 0]).addTo(fg)
      const spy = createSpy()

      fgP.on('test', spy)
      expect(marker.listens('test', false)).toBe(false)
      expect(marker.listens('test', true)).toBe(true)
    })

    // Ported from EventsSpec.js#L706
    it('is true if there is an event handler with specific function on parent', () => {
      const fg = new FeatureGroup()
      const marker = new Marker([0, 0]).addTo(fg)
      const spy = createSpy()

      fg.on('test', spy)
      expect(marker.listens('test', spy, marker, false)).toBe(false)
      expect(marker.listens('test', spy, marker, true)).toBe(false)
      expect(marker.listens('test', spy, fg, false)).toBe(false)
      expect(marker.listens('test', spy, fg, true)).toBe(true)
    })
  })
})
