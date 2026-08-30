/**
 * The demo's incident feed.
 *
 * Fabricated, and deliberately so: a public safety feed is exactly the kind of
 * data that should not be shipped in a demo, and nothing here needs to be real
 * for the map to be exercised. The shape mirrors what a live feed would carry —
 * a category, a coordinate, an age, a view count — so swapping in a real source
 * is a change of loader, not a change of app.
 */

export type IncidentCategory = 'assault' | 'fire' | 'police' | 'hazard' | 'theft' | 'medical'

export interface Incident {
  id: string
  title: string
  category: IncidentCategory
  emoji: string
  /** [lat, lng] — the order ts-maps takes. */
  coords: [number, number]
  minutesAgo: number
  views: number
  status: string
  /** Opened as a callout when the map first loads. */
  featured?: boolean
}

/** Ring colour per category. Warm for harm, cool for everything else. */
export const CATEGORY_COLORS: Record<IncidentCategory, string> = {
  assault: '#ff4d5e',
  fire: '#ff8a3d',
  police: '#4d9dff',
  hazard: '#ffc53d',
  theft: '#c77dff',
  medical: '#4ddb9e',
}

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  assault: 'Assault',
  fire: 'Fire',
  police: 'Police activity',
  hazard: 'Hazard',
  theft: 'Theft',
  medical: 'Medical',
}

/** Roughly Santa Monica / Ocean Park, matching the reference screenshot. */
export const INCIDENTS: Incident[] = [
  {
    id: 'a1',
    title: 'Person Assaulted',
    category: 'assault',
    emoji: '👊',
    coords: [34.0281, -118.4735],
    minutesAgo: 41,
    views: 167,
    status: 'Reported',
    featured: true,
  },
  {
    id: 'h1',
    title: 'Road Blocked by Debris',
    category: 'hazard',
    emoji: '⚠️',
    coords: [34.0264, -118.4515],
    minutesAgo: 32,
    views: 88,
    status: 'Unconfirmed',
  },
  {
    id: 'f1',
    title: 'Structure Fire',
    category: 'fire',
    emoji: '🔥',
    coords: [34.0152, -118.4903],
    minutesAgo: 12,
    views: 1240,
    status: 'On scene',
  },
  {
    id: 'p1',
    title: 'Police Activity',
    category: 'police',
    emoji: '🚔',
    coords: [34.0198, -118.4661],
    minutesAgo: 8,
    views: 402,
    status: 'Active',
  },
  {
    id: 't1',
    title: 'Vehicle Break-In',
    category: 'theft',
    emoji: '🚗',
    coords: [34.0105, -118.4772],
    minutesAgo: 95,
    views: 51,
    status: 'Reported',
  },
  {
    id: 'm1',
    title: 'Medical Emergency',
    category: 'medical',
    emoji: '🚑',
    coords: [34.0233, -118.4823],
    minutesAgo: 3,
    views: 76,
    status: 'On scene',
  },
  {
    id: 'f2',
    title: 'Brush Fire Contained',
    category: 'fire',
    emoji: '🔥',
    coords: [34.0089, -118.4585],
    minutesAgo: 320,
    views: 2103,
    status: 'Contained',
  },
  {
    id: 'p2',
    title: 'Traffic Stop',
    category: 'police',
    emoji: '🚔',
    coords: [34.0312, -118.4802],
    minutesAgo: 61,
    views: 34,
    status: 'Cleared',
  },
  {
    id: 'h2',
    title: 'Downed Power Line',
    category: 'hazard',
    emoji: '⚠️',
    coords: [34.0175, -118.4952],
    minutesAgo: 210,
    views: 512,
    status: 'Crews en route',
  },
  {
    id: 't2',
    title: 'Bike Stolen',
    category: 'theft',
    emoji: '🚲',
    coords: [34.0247, -118.4601],
    minutesAgo: 480,
    views: 19,
    status: 'Reported',
  },
]

/** Where the demo opens: the featured incident, roughly centred. */
export const INITIAL_VIEW = {
  center: [34.0215, -118.4735] as [number, number],
  zoom: 14,
}

/** The blue dot. Fixed rather than real, so the demo never prompts for location. */
export const USER_LOCATION: [number, number] = [34.0197, -118.4666]

export function timeAgo(minutes: number): string {
  if (minutes < 60)
    return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24)
    return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function formatViews(views: number): string {
  return views >= 1000 ? `${(views / 1000).toFixed(1)}k` : String(views)
}
