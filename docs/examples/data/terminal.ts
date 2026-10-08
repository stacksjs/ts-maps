/**
 * A small airport terminal in IMDF, Apple's Indoor Mapping Data Format, for
 * example 14: two levels, Arrivals below and Departures above, with gates,
 * cafés, shops and restrooms off a central concourse. A real venue comes as
 * a `.zip` of these same files; `indoorMap({ venue: '/imdf/terminal.zip' })`
 * reads one.
 */

/** Where the terminal stands: a rectangle about 160 by 60 metres. */
const WEST = -122.3880
const SOUTH = 37.6150
const ACROSS = 0.0018
const UP = 0.00054

export const TERMINAL_CENTER: [number, number] = [SOUTH + UP / 2, WEST + ACROSS / 2]

type Position = [number, number]

/** A point at fractions across and up the building. */
function at(x: number, y: number): Position {
  return [WEST + x * ACROSS, SOUTH + y * UP]
}

function rect(x0: number, y0: number, x1: number, y1: number): { type: 'Polygon', coordinates: Position[][] } {
  return { type: 'Polygon', coordinates: [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]] }
}

function feature(id: string, type: string, geometry: unknown, properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'Feature', id, feature_type: type, geometry, properties }
}

const name = (en: string): { en: string } => ({ en })

/** Rooms in a row along one side of the concourse, with a door onto it. */
function row(level: string, side: 'south' | 'north', rooms: Array<[string, string, number]>): { units: unknown[], openings: unknown[] } {
  const [y0, y1, door] = side === 'south' ? [0, 0.38, 0.38] : [0.62, 1, 0.62]
  const units: unknown[] = []
  const openings: unknown[] = []
  let x = 0.04
  for (const [label, category, width] of rooms) {
    const id = `${level}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    units.push(feature(id, 'unit', rect(x, y0, x + width, y1), { level_id: level, category, name: name(label) }))
    const middle = x + width / 2
    openings.push(feature(`${id}-door`, 'opening', { type: 'LineString', coordinates: [at(middle - 0.02, door), at(middle + 0.02, door)] }, { level_id: level, category: 'pedestrian' }))
    x += width
  }
  return { units, openings }
}

/** The terminal's IMDF files, parsed: what `indoorMap({ venue })` takes. */
export function terminal(): Record<string, { features: unknown[] }> {
  const outline = rect(0, 0, 1, 1)
  const arrivals = [
    row('l0', 'south', [['Baggage Claim 1', 'room', 0.2], ['Baggage Claim 2', 'room', 0.2], ['Restrooms', 'restroom', 0.08], ['Car Rental', 'retail', 0.16], ['Information', 'room', 0.1], ['Ground Transport', 'room', 0.18]]),
    row('l0', 'north', [['Arrivals Hall Café', 'foodservice', 0.16], ['Pharmacy', 'retail', 0.12], ['Lost & Found', 'room', 0.12], ['Customs', 'nonpublic', 0.3], ['Elevators', 'elevator', 0.08], ['Restrooms', 'restroom', 0.14]]),
  ]
  const departures = [
    row('l1', 'north', [['Gate A1', 'room', 0.15], ['Gate A2', 'room', 0.15], ['Gate A3', 'room', 0.15], ['Gate A4', 'room', 0.15], ['Gate A5', 'room', 0.15], ['Gate A6', 'room', 0.17]]),
    row('l1', 'south', [['Security', 'nonpublic', 0.16], ['Blue Bottle Coffee', 'foodservice', 0.12], ['Newsstand', 'retail', 0.1], ['Restrooms', 'restroom', 0.08], ['Elevators', 'elevator', 0.08], ['Burger Bar', 'foodservice', 0.12], ['Duty Free', 'retail', 0.16], ['Lounge', 'room', 0.1]]),
  ]
  const concourse = (level: string, label: string): unknown => feature(`${level}-concourse`, 'unit', rect(0.02, 0.38, 0.98, 0.62), { level_id: level, category: 'walkway', name: name(label) })
  const all = [...arrivals, ...departures]
  return {
    venue: { features: [feature('venue', 'venue', outline, { name: name('Terminal 3'), category: 'airport' })] },
    level: { features: [
      feature('l0', 'level', outline, { ordinal: 0, name: name('Arrivals'), short_name: name('1') }),
      feature('l1', 'level', outline, { ordinal: 1, name: name('Departures'), short_name: name('2') }),
    ] },
    unit: { features: [concourse('l0', 'Arrivals Concourse'), concourse('l1', 'Departures Concourse'), ...all.flatMap(r => r.units)] },
    opening: { features: all.flatMap(r => r.openings) },
  }
}
