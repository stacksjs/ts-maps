/**
 * Normalizes an IPv6 address to its canonical form according to IETF Draft RFC.
 * Based on: http://tools.ietf.org/html/draft-ietf-6man-text-addr-representation-04
 *
 * @param address - The IPv6 address to normalize
 * @returns The normalized IPv6 address string
 *
 * @example
 * Remove leading zeros from segments:
 * ```ts
 * normalize('2001:0db8:0000:0000:0000:ff00:0042:8329')
 * // => '2001:db8:0:0:0:ff00:42:8329'
 * ```
 *
 * @example
 * Collapse consecutive zero segments:
 * ```ts
 * normalize('2001:db8:0:0:0:ff00:42:8329')
 * // => '2001:db8::ff00:42:8329'
 * ```
 *
 * @example
 * Handle IPv4-mapped addresses:
 * ```ts
 * normalize('::ffff:192.168.1.1')
 * // => '::ffff:192.168.1.1'
 * ```
 *
 * @example
 * Handle :: notation at start:
 * ```ts
 * normalize('::1')
 * // => '::1'
 * ```
 *
 * @example
 * Handle :: notation in middle:
 * ```ts
 * normalize('2001:db8::1428:57ab')
 * // => '2001:db8::1428:57ab'
 * ```
 */
export function normalize(address: string): string {
  const _address = address.toLowerCase()
  const segments = _address.split(':')
  let length = segments.length
  let total = 8

  // trim colons (:: or ::a:b:c… or …a:b:c::)
  if (segments[0] === '' && segments[1] === '' && segments[2] === '') {
    // must have been ::
    // remove first two items
    segments.shift()
    segments.shift()
  }
  else if (segments[0] === '' && segments[1] === '') {
    // must have been ::xxxx
    // remove the first item
    segments.shift()
  }
  else if (segments[length - 1] === '' && segments[length - 2] === '') {
    // must have been xxxx::
    segments.pop()
  }

  length = segments.length

  // adjust total segments for IPv4 trailer
  if (segments[length - 1].includes('.')) {
    // found a "." which means IPv4
    total = 7
  }

  // fill empty segments them with "0000"
  let pos: number
  for (pos = 0; pos < length; pos++) {
    if (segments[pos] === '') {
      break
    }
  }

  if (pos < total) {
    segments.splice(pos, 1, '0000')
    while (segments.length < total) {
      segments.splice(pos, 0, '0000')
    }

    length = segments.length
  }

  // strip leading zeros
  for (let i = 0; i < total; i++) {
    const _segments = segments[i].split('')
    for (let j = 0; j < 3; j++) {
      if (_segments[0] === '0' && _segments.length > 1) {
        _segments.splice(0, 1)
      }
      else {
        break
      }
    }

    segments[i] = _segments.join('')
  }

  // find longest sequence of zeroes and coalesce them into one segment
  let best = -1
  let _best = 0
  let _current = 0
  let current = -1
  let inzeroes = false

  for (let i = 0; i < total; i++) {
    if (inzeroes) {
      if (segments[i] === '0') {
        _current += 1
      }
      else {
        inzeroes = false
        if (_current > _best) {
          best = current
          _best = _current
        }
      }
    }
    else {
      if (segments[i] === '0') {
        inzeroes = true
        current = i
        _current = 1
      }
    }
  }

  if (_current > _best) {
    best = current
    _best = _current
  }

  if (_best > 1) {
    segments.splice(best, _best, '')
  }

  length = segments.length

  // assemble remaining segments
  let result = ''
  if (segments[0] === '') {
    result = ':'
  }

  for (let i = 0; i < length; i++) {
    result += segments[i]
    if (i === length - 1) {
      break
    }

    result += ':'
  }

  if (segments[length - 1] === '') {
    result += ':'
  }

  return result
}
