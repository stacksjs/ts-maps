# Search

`control.search()` is search as in Apple Maps: one "Search Maps" field for
places, addresses and kinds of place, with suggestions as you type, a pin for
every result, and a card for the place you choose.

```ts
import { control, styles, TsMap } from 'ts-maps'

const map = new TsMap('map', {
  center: [51.5072, -0.1276],
  zoom: 14,
  style: styles.light({ url: 'https://tiles.openfreemap.org/planet' }),
})

const search = control.search().addTo(map)
```

That is the whole of the [search example](../examples/09-search.md). It
needs no key: answers come from the map's own tiles and from Photon,
OpenStreetMap's geocoder.

## What it does

- **Focused and empty:** it offers **Find Nearby** (Restaurants, Fast Food,
  Coffee, Bars, Groceries, Gas Stations, Parking, EV Chargers) and your
  **Recents**, kept in `localStorage`.
- **As you type:** suggestions appear straight away. Each shows its icon (the
  same badge the map draws), what kind of place it is, how far away, and its
  street: "Café · 0.3 mi · Market Street". The typed part is in bold.
- **A category, or Enter on a query:** a pin drops for every result and they
  are listed, nearest first. Move the map, and **Search This Area** runs the
  search again there. Where pins would overlap they gather into a bubble with
  how many, in the colour of their kind, and come apart as the map zooms in;
  tapping one zooms to what is in it. The chosen result always has a pin of
  its own.
- **Choosing a place:** the map flies to it and opens its card: kind,
  distance, address, coordinates, and **Directions**.
- **Its details:** the card shows at once from what search knows, then fills
  in as OpenStreetMap answers: whether it is open ("Open · Closes 9 PM",
  "Closed · Opens tomorrow 8 AM", read from `opening_hours`), its phone and
  website, with **Call** and **Website** buttons. **Share** opens the system
  share sheet, or copies a link where there is none.
- **Saving:** **Save** on the card adds the place to Favorites. See
  [Favorites and Guides](#favorites-and-guides).
- **Keyboard:** the arrow keys move through the rows, Enter picks, and Escape
  goes back one step. The field is an ARIA combobox, and a live region reads
  out how many results a search found and which place was chosen.

## Where answers come from

Three places are asked at once, and their answers merged so the same café is
one result:

- **The map's own vector tiles.** Instant, and needs no network. OpenMapTiles,
  Protomaps, Shortbread and Mapbox Streets tiles are all read, told apart by
  their layer names; `schema` names one if the guess is wrong.
- **Downloaded [offline maps](./offline.md).**
- **An online geocoder.** Photon by default, which is built for
  search-as-you-type (Nominatim's usage policy forbids autocomplete). Pass
  `provider: null` to stay off the network. The geocoder is skipped when the
  browser is offline or "Only Use Offline Maps" is on.

## Options

| Option | Default | |
| --- | --- | --- |
| `provider` | Photon | Any `GeocoderProvider`, or `null` for none. |
| `offline` | the page's | Downloaded maps to search, or `null`. |
| `categories` | the first eight of `SEARCH_CATEGORIES` | The Find Nearby buttons. |
| `recents` | `true` | Keep Recents. |
| `units` | from the locale | `'metric'` or `'imperial'`. |
| `location` | the map's centre | `() => LatLng`: where distances are measured from. |
| `turnByTurn`, `origin`, `onDirections` | — | What Directions does. See [Directions](#directions). |
| `details` | OpenStreetMap through Overpass | A `PlaceDetailsProvider` for hours, phone and website, or `null`. None by default with `provider: null`. |
| `shareUrl` | the place on openstreetmap.org | `(place) => string`: the link Share sends. |
| `saved` | the page's `savedPlaces()` | Where Save keeps Favorites and Guides, or `null` for no saving. |
| `showSaved` | `true` | Favorites as stars on the map. |
| `lookAround` | — | A [`LookAround`](./look-around.md): a place card with pictures near it shows one. |
| `language` | — | The language results' names are asked for in. |
| `locale` | `language`, else the map's | The language of its own words. See [Localization](./localization.md). |
| `schema` | found from the tiles | The tiles' schema: `OPENMAPTILES`, `PROTOMAPS`, `SHORTBREAD` or `MAPBOX_STREETS`. |
| `placeholder` | "Search Maps" | The field's placeholder. |
| `position` | `'topleft'` | |

Every framework binding has it as `<Search>`, with `query` followed as a
prop; see [framework bindings](../guide/framework-bindings.md#search).

## Directions

Directions on a place's card previews the route on a
[`TurnByTurn`](./services.md#turn-by-turn-navigation) you pass, from
`origin`: the device's position by default, or the middle of the map where
that is not to be had. `onDirections(place)` is called as well, or instead
when there is no `turnByTurn`:

```ts
import { control, turnByTurn } from 'ts-maps'

const nav = turnByTurn(map)
control.search({ turnByTurn: nav }).addTo(map)
```

## Driving it from code

```ts
import { SEARCH_CATEGORIES } from 'ts-maps'

const places = await search.search('coffee') // as though typed and Enter pressed
await search.searchCategory(SEARCH_CATEGORIES[2]) // Coffee
search.select(places[0]) // fly to it and open its card
search.cancel() // close results, pins and card

search.results // the places listed now
search.selected // the place whose card is open
```

`setProvider(provider)` and `setOffline(maps)` change where answers come from
for the next query. `search.listen((type, e) => …)` hears what happens and
returns a function that stops listening:

| Event | Carries |
| --- | --- |
| `results` | `{ query?, category?, places }` |
| `select` | `{ place }` |
| `details` | `{ place, details }`, once the hours, phone and website arrive |
| `directions` | `{ place }` |
| `save`, `unsave` | `{ place }` |
| `clear` | nothing |

A place is a `SearchPlace`: `id`, `name`, `center`, `kind` (`cafe`,
`restaurant`, `street`, …), `icon`, and where known `address`, `distance`
in metres and `bbox`, with `source` saying whether it came from the `map`,
an `offline` map or the `online` geocoder.

### Places of your own

Search can find places that are not in the tiles: the shops of an
[indoor map](./indoor.md), a page's own points. Give its engine a source
with a `places(query)` function that returns those whose names might match;
search scores them like the map's own:

```ts
const stores = [
  { id: 'store-1', name: 'Corner Books', center: { lat: 51.5079, lng: -0.1281 }, kind: 'books', icon: 'shopping', rank: 5 },
]

const stop = search.engine.addSource({
  places: query => stores.filter(s => s.name.toLowerCase().includes(query.toLowerCase())),
})
```

## Favorites and Guides

Saved places live in a `SavedPlaces` store: the page's own, kept in
`localStorage`, unless `saved` names another. Favorites are stars on the map
and chips above Recents; **Guides**, named collections, are listed between
and open as results. Each place is kept once, however many guides it is in,
and dropped when it is in none.

The store works without the control too:

```ts
import { savedPlaces } from 'ts-maps'

const [place] = await search.search('Monmouth Coffee')

const saved = savedPlaces()
await saved.favorite(place)
const guide = await saved.createGuide('Coffee to try', [place])
const geojson = saved.toGeoJSON(guide.id) // share it
await saved.importGeoJSON(geojson, 'From a friend') // and take one in
```

It also has `unfavorite`, `toggleFavorite`, `renameGuide`, `deleteGuide`,
`addToGuide` and `removeFromGuide`, and fires `change` after each.

Its backend is anything with `load()` and `save(data)`, so it can sync to a
server. Set the page's store before adding search:

```ts
import { SavedPlaces, setSavedPlaces } from 'ts-maps'

setSavedPlaces(new SavedPlaces({
  backend: {
    load: () => fetch('/api/saved').then(r => r.json()),
    save: data => fetch('/api/saved', { method: 'PUT', body: JSON.stringify(data) }).then(() => {}),
  },
}))
```

`search.toggleSaved(place)` and `search.showGuide(id)` do what the card's
Save and a tap on a guide do.

## In production: rate limits and your own geocoder

The map's own places answer instantly and offline, but typing still asks the
online geocoder once per pause. Photon's public instance at
`photon.komoot.io` is free and shared, with a fair-use limit and no
guarantee; it is right for development and small sites. When it answers
`429 Too Many Requests`:

- a short `Retry-After` (2 s or less) is waited out and the request retried
  once;
- a longer one, or a second 429, puts the provider in a back-off of 30 s,
  doubling for each limit in a row up to five minutes (or the `Retry-After`,
  if longer). It asks nothing while it backs off;
- search carries on with the map's own places and downloaded maps, as it does
  with no network. The user sees fewer addresses, not an error.

Tune it with `rateLimit: { retries, maxRetryDelay, cooldown }` on
`PhotonGeocoder` or `NominatimGeocoder`. A rate-limited call throws
`RateLimitError`, with `retryAfter` in milliseconds, for code of your own.

For a production app, use a geocoder you control or pay for. All are in
`services`:

| Provider | | Cost |
| --- | --- | --- |
| **Photon, self-hosted** | `new services.PhotonGeocoder({ baseUrl: 'https://geo.example.com' })` | A server. Photon runs from one Java process over a prebuilt index; GraphHopper publishes planet and country indexes, and a country is far smaller than the planet. Same answers as the public instance, no limit but your hardware. |
| **MapTiler** | `new services.MaptilerGeocoder({ apiKey })` | A key. A free tier, then paid plans by requests. See [maptiler.com/cloud/pricing](https://www.maptiler.com/cloud/pricing/). |
| **Mapbox** | `new services.MapboxGeocoder({ accessToken })` | A token. Free up to a monthly request allowance, then per request. See [mapbox.com/pricing](https://www.mapbox.com/pricing#search). |
| **Google** | `new services.GoogleGeocoder({ apiKey })` | A key with billing on. Per request after the monthly credit; autocomplete is billed by session. See [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/). |

Nominatim's public instance is not on that list for search: its usage policy
forbids autocomplete. A self-hosted Nominatim is fine.

Prices change; check the provider's page before you choose. Whichever you
pick, keep its attribution in the map's credits.

To try one and then another, chain them. The next provider is asked when one
fails, and a provider that is backing off is skipped without being asked:

```ts
import { control, services } from 'ts-maps'

control.search({
  provider: services.geocoderChain([
    new services.PhotonGeocoder({ baseUrl: 'https://geo.example.com' }), // yours
    new services.MaptilerGeocoder({ apiKey: 'YOUR_KEY' }), // when yours is down or busy
  ]),
}).addTo(map)
```

An empty answer is an answer: the chain stops there. Pass
`{ fallThroughOnEmpty: true }` as the second argument to go on to the next
provider, which suits a regional instance in front of a global one, at the
cost of a second request for every query the first cannot answer.
[Services](./services.md#geocoding) covers the providers themselves.

## Your own search UI

The engine underneath is `SearchEngine`. Use it on its own to build a search
box of your own over the same three sources:

```ts
import { SEARCH_CATEGORIES, SearchEngine } from 'ts-maps'

const engine = new SearchEngine({ map }) // Photon, the map's tiles, offline maps
const suggestions = await engine.suggest('caf', { limit: 8 })
const results = await engine.search('coffee') // up to 25
const nearby = await engine.nearby(SEARCH_CATEGORIES[2], { near: { lat: 51.5072, lng: -0.1276 } })
```

`near` defaults to the middle of the map, and `signal` cancels a query.

## The simpler box

`control.geocoder()` is a plain search box over one provider, without Find
Nearby, the map's own places or cards. See
[Controls](./controls.md#geocoder).
