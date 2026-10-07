/**
 * Search result pins that would overlap, gathered into one.
 *
 * A category search in a dense neighbourhood drops two dozen pins inside a
 * few blocks, and at that zoom they sit on top of each other. As Apple Maps
 * does, pins closer on screen than a pin is wide become one bubble with a
 * count, and come apart again as the map zooms in. This is the screen-space
 * pass that decides which: greedy, most important first, so a cluster sits
 * where its best result is.
 */

export interface PinPoint {
  id: string
  /** Container pixels. */
  x: number
  y: number
}

export interface PinCluster {
  /** Members, most important first: the order the points were given in. */
  ids: string[]
  /** Where it is drawn: its first member. */
  x: number
  y: number
}

/** Pins nearer than this, in pixels, are one cluster. About a pin's width. */
export const PIN_CLUSTER_RADIUS = 36

/**
 * Gather `points`, given most important first, into clusters of those within
 * `radius` pixels of a cluster's first member. `apart` (the selected pin) is
 * always on its own: chosen, it must not disappear into a bubble.
 */
export function clusterPins(points: readonly PinPoint[], radius: number = PIN_CLUSTER_RADIUS, apart?: string): PinCluster[] {
  const clusters: PinCluster[] = []
  const r2 = radius * radius
  for (const point of points) {
    if (point.id !== apart) {
      const near = clusters.find(c => c.ids[0] !== apart && (c.x - point.x) ** 2 + (c.y - point.y) ** 2 < r2)
      if (near) {
        near.ids.push(point.id)
        continue
      }
    }
    clusters.push({ ids: [point.id], x: point.x, y: point.y })
  }
  return clusters
}
