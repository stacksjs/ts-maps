# Territory capture

Everything needed for a game where running a loop claims the ground inside it:
turning a GPS track into a shape, working out what that shape takes from whom,
and drawing the result so a player can read it at a glance.

Four pieces, usable separately:

| | |
| --- | --- |
| `LoopDetector` | Watches a live GPS stream and says when the path closes. |
| `TerritoryStore` | Who owns what, and what each capture changed. |
| `TerritoryLayer` | Draws territories, with the capture animation. |
| `RunTrailLayer` | The live trail, and what closing it now would be worth. |

See `playground/core-map/11-territory.html` for all four wired together.

## The short version

```ts
import { LoopDetector, TerritoryLayer, TerritoryStore, TsMap } from 'ts-maps'

const map = new TsMap('map', { center: [34.02, -118.47], zoom: 16 })
const store = new TerritoryStore()
const detector = new LoopDetector()

map.addLayer(new TerritoryLayer({ store, self: 'me' }))

navigator.geolocation.watchPosition((position) => {
  const loop = detector.push([position.coords.longitude, position.coords.latitude])
  if (loop)
    store.capture('me', loop.ring)
})
```

That is the whole game loop. What follows is what each piece decides for you.

## Closing a loop

A GPS track is a stream of points, not a shape, and there are two ways a run
actually closes one:

- **The runner crosses their own path.** The captured shape starts at the
  crossing, not at the start of the run — the tail before it is not part of
  what was enclosed.
- **The runner comes back to where they started.** GPS will not report the same
  coordinate twice, so "back to the start" means within some metres of it.

`LoopDetector` handles both, crossings first. It works incrementally — only the
newest segment is tested against the ones already recorded — so calling it once
a second for an hour is cheap.

```ts
const detector = new LoopDetector({
  snapDistance: 20,   // metres; how close counts as "back at the start"
  minArea: 200,       // m²; below this it is GPS noise, not a lap
  minLoopLength: 120, // m; stops jitter reading as a lap of something tiny
})
```

Those three defaults are the difference between a game that feels fair and one
that does not. `snapDistance` is a tolerance rather than a precision: consumer
GPS is good to about five metres in the open and much worse between buildings.
The two floors exist because a receiver sitting still wanders by a few metres,
and without them a player standing at a bus stop slowly claims the bus stop.

After a loop closes the detector keeps the runner's current position, so the
next lap does not have to start from a standstill.

`detectLoop(track, options)` does the same thing to a finished track, for
scoring a run after the fact.

### Fewer points, same shape

A receiver logging at 1 Hz produces a great many points that lie on the line
between their neighbours. They change none of the answers and cost every area
calculation, boolean operation and redraw:

```ts
import { simplifyTrack } from 'ts-maps'

const trimmed = simplifyTrack(track, 3) // tolerance in metres
```

The tolerance is in metres rather than degrees, so it means the same thing
wherever the run happened.

## Who owns what

```ts
const store = new TerritoryStore()

const result = store.capture('sam', loop.ring)
result.areaClaimed // enclosed by the loop, whoever held it
result.areaGained  // what sam did not already hold — what the run added
result.stolen      // [{ owner: 'alex', area: 12043 }], largest first
result.totalArea   // sam's holding now
```

Three rules are baked in, and they are what make it a game:

- A loop is **added** to what the player already holds. Two laps of adjacent
  blocks become one territory, and the border between them stops existing.
- Ground inside the loop that someone else held **changes hands**. That is the
  reason to run somewhere rather than anywhere.
- Nobody holds the same square metre twice, so the totals always add up — which
  matters, because the totals are the scoreboard.

`capture` reports what changed rather than leaving you to diff two leaderboards,
because a player wants to be told *"you took 1.2 ha off Alex"*.

```ts
store.on('capture', ({ owner, areaGained, stolen }) => {
  if (stolen.length > 0)
    toast(`${owner} took ${formatArea(stolen[0].area)} from ${stolen[0].owner}`)
})
```

Other things it answers:

```ts
store.leaderboard()          // [{ owner, area, pieces }], largest first
store.areaOf('sam')          // m²
store.ownerAt([lng, lat])    // who holds this spot
store.preview('sam', ring)   // what a lap would be worth, without claiming it
store.toGeoJSON()            // save
store.loadGeoJSON(saved)     // load
```

`preview` is for telling a runner what the lap they are on is currently worth,
which is the number that makes people run one more block.

### Co-operative mode

`new TerritoryStore({ steal: false })` lets territories overlap and counts
ground held by more than one player for each of them.

## Drawing it

```ts
const layer = new TerritoryLayer({
  store,
  self: 'me',
  styles: {
    me: { color: '#38bdf8' },
    alex: { color: '#f97316' },
  },
  labelMinZoom: 15,
})
map.addLayer(layer)
```

The layer follows the store: captures animate and changes redraw without being
told. Owners with no colour of their own are assigned one from a palette whose
entries differ in hue rather than only in lightness, so two neighbouring
territories are still two territories to a colour-blind player. Once assigned, a
colour sticks — territory changing colour between frames reads as it changing
hands.

`self` gets a stronger fill, a heavier border and a glow, so "mine" and "theirs"
separate before any label is read.

Fills are deliberately light. A player needs to know *which* blocks are theirs,
which means seeing the streets through the fill; the border carries the colour.

Area labels appear only where the territory is big enough on screen to hold one
— a label that does not fit inside the shape it names belongs to whichever
neighbour the reader guesses.

Clicking works through the map, because the canvas takes no pointer events and
so does not make the map undraggable over your own ground:

```ts
map.on('click', (event) => {
  const owner = layer.ownerAtContainerPoint(event.containerPoint)
})
```

When a capture arrives over the network rather than from the local runner, call
`layer.animateCapture({ owner, ring })` so losing ground looks the same as
taking it.

## The live trail

```ts
const trail = new RunTrailLayer({ color: '#38bdf8', showPotential: true })
map.addLayer(trail)

// each GPS tick
trail.setTrack(detector.track)
```

The trail fades toward its tail, because the runner's recent path is what
matters now and the start of it is history. With `showPotential`, it also shades
the shape the trail would enclose if the runner closed it from where they are —
the closing leg dashed, since it is the only part they have not actually run.

## The geometry underneath

The pieces above are built on operations that are useful on their own:

```ts
import { difference, formatArea, intersection, ringArea, union } from 'ts-maps'

ringArea(ring)             // m², signed — the sign distinguishes a hole
union(a, b)                // MultiPolygon
difference(a, b)
intersection(a, b)
formatArea(12043)          // '1.2 ha'
```

Two things worth knowing about them.

**Area is measured on the sphere, not in Web Mercator.** Measuring in the
projection inflates area by `1 / cos²(latitude)` — about 1.7× at 40°, over 4× at
60° — which would make the same lap around a park worth twice as much in
Stockholm as in Barcelona.

**The boolean operations handle coincident edges.** Two territories that grew
against each other share their whole border, so for this use that is the normal
case rather than an edge case, and the simpler clippers get it wrong. The
implementation is Martínez–Rueda–Feito for that reason.

`formatArea` picks its unit for the magnitude, because a territory game spans
four orders of it and "0.004 km²" tells a player nothing they can feel.
