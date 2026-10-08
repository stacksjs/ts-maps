# Look Around

Street-level pictures you can turn in and walk through, as in Apple Maps'
Look Around:

```ts
import { control, lookAround, Map, styles } from 'ts-maps'

const map = new Map('map', {
  center: [48.8606, 2.3376],
  zoom: 16,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const look = lookAround().addTo(map) // Panoramax: open, no key
control.search({ lookAround: look }).addTo(map)
```

`lookAround()` and `control.lookAround()` are the same control. The
[Look Around example](../examples/16-look-around.md) opens by the Louvre,
looking along the Rue de Rivoli.

## Using it

- **The binoculars button** shows the streets with pictures in blue, with a
  dot for each picture closer in. Tap one and the map gives way to the
  picture taken there, full-bleed.
- **In the picture:** drag to look round, scroll or pinch to zoom, and tap
  ahead or use the arrows to move along the street. Each step zooms into the
  picture you leave as the next fades in.
- **The keyboard:** left and right turn, up and down step forward and back,
  `+` and `-` zoom, Escape closes.
- **A small map** in the corner shows where you stand and which way you look.
- **A place card** in [search](./search.md) shows a picture when there is one
  near the place; tapping it looks from there toward the place.

Pictures are drawn with WebGL, by ray from the camera into the 360° picture,
so straight lines stay straight at any zoom. A sharper copy replaces the
first when it arrives. Without WebGL the picture scrolls as a background
image instead. The imagery's credit is shown in the viewer.

## Where pictures come from

- `new PanoramaxImagery()`, the default, uses the open
  [Panoramax](https://panoramax.fr) federation. `endpoint` picks one
  instance instead of the federation's catalogue.
- `new MapillaryImagery({ accessToken })` uses Mapillary, with a client token
  from Mapillary.

Both keep to 360° pictures unless `panoramasOnly: false`, and both back off
when the service rate-limits them (`rateLimit`, as on the
[geocoders](./search.md#in-production-rate-limits-and-your-own-geocoder)).

```ts
import { lookAround, MapillaryImagery } from 'ts-maps'

lookAround({ provider: new MapillaryImagery({ accessToken: 'YOUR_TOKEN' }) }).addTo(map)
```

Any object with `name`, `attribution`, `near(at, { radius, limit, signal })`
and `get(id)` is a provider; `coverage()` is optional and gives the vector
tiles that draw the blue streets.

## Options

| Option | Default | |
| --- | --- | --- |
| `provider` | `PanoramaxImagery` | Where pictures come from. |
| `miniMap` | `true` | The small map in the corner. |
| `locale` | the map's | The language of its words. |
| `title` | "Look Around" | The button's label. |
| `position` | `'topright'` | |

## From code

```ts
await look.open([48.86145, 2.33458], { heading: 100 }) // the picture nearest a place
await look.open([48.8611, 2.3358], { lookAt: [48.8606, 2.3376] }) // facing the Louvre's pyramid
await look.step('forward') // or 'back', 'left', 'right'
look.setView({ heading: 90, pitch: 10, fov: 60 })
look.setChoosing(true) // as the binoculars button
look.close()
```

`open` takes a place or a picture, and resolves to the picture, or
`undefined` when none is within `radius` metres (default 60). `look.isOpen`,
`look.image` and `look.view` say where you are.

`look.listen((type, e) => …)` hears `open` and `imagechange` (`{ image }`),
`close`, `viewchange` (`{ heading, pitch, fov }`), `choosingchange`
(`{ choosing }`) and `notfound` (`{ at }`, a tap with no picture near), and
returns a function that stops listening. Every framework binding has it as
`<LookAround>`; see
[framework bindings](../guide/framework-bindings.md#look-around).
