import type { ControlSpec, IndoorSpec, LandmarkSpec, LookAroundSpec, MapRuntime, MapTypeSpec, MarkerSpec, OfflineMapsSpec, SearchSpec, TerritorySpec, TreesSpec, TurnByTurnSpec } from './types'

export interface BuildHtmlOptions {
  runtime: MapRuntime
  initial: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
    styleSpec?: unknown
    /** The language the built-in controls speak. */
    locale?: string
    controls?: ControlSpec[]
    markers?: MarkerSpec[]
    territories?: TerritorySpec[]
    self?: string
    runTrail?: number[][]
    turnByTurn?: TurnByTurnSpec
    offlineMaps?: OfflineMapsSpec
    search?: SearchSpec
    mapType?: MapTypeSpec
    indoor?: IndoorSpec
    lookAround?: LookAroundSpec
    landmarks?: LandmarkSpec[]
    trees?: boolean | TreesSpec
    /** Keep downloaded maps in the app's storage, over the bridge. */
    nativeStore?: boolean
  }
}

/**
 * Build the HTML document loaded by the WebView. The inner script wires up
 * ts-maps, forwards `load`/`move`/`click`/`error` events back to the RN side,
 * and handles inbound `call`/`setCamera`/`setStyle`/`setLocale` envelopes.
 */
export function buildHtml(options: BuildHtmlOptions): string {
  const runtimeTag = options.runtime.source === 'cdn'
    ? `<script src="${escapeAttr(options.runtime.url)}"></script>`
    : `<script>${options.runtime.bundledSource}</script>`

  const initialJson = JSON.stringify(options.initial ?? {})
  const script = RUNTIME_SCRIPT.replace('__INITIAL__', initialJson)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
    width: 100%;
    background: transparent;
  }
  #map {
    height: 100%;
    width: 100%;
  }
</style>
</head>
<body>
<div id="map"></div>
${runtimeTag}
<script>
${script}
</script>
</body>
</html>`
}

function escapeAttr(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// The inline script is stored as a plain string constant so the surrounding
// TypeScript lint rules don't try to interpret browser JS as TS.
// eslint-disable-next-line pickier/no-unused-vars
const RUNTIME_SCRIPT = [
  '(function () {',
  '  const initial = __INITIAL__;',
  '  const pending = {};',
  '  function send(env) {',
  '    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage)',
  '      window.ReactNativeWebView.postMessage(JSON.stringify(env));',
  '  }',
  '  function fail(message) {',
  '    send({ type: "error", id: `e${Date.now()}`, payload: { message: String(message) } });',
  '  }',
  // Downloaded maps in the app's storage: every read and write of the
  // page's offline maps goes across as a `store` envelope, answered by
  // MapView's `offlineStore`. Set up before the map, which reads from them.
  '  const storeCalls = {};',
  '  let storeSeq = 0;',
  '  function ask(op, key, value) {',
  '    return new Promise(function (resolve, reject) {',
  '      const id = `st${++storeSeq}`;',
  '      storeCalls[id] = { resolve: resolve, reject: reject };',
  '      send({ type: "store", id: id, payload: { op: op, key: key, value: value } });',
  '    });',
  '  }',
  '  if (initial.nativeStore) {',
  '    const ns0 = window.tsMaps || window;',
  '    if (ns0.KeyValueOfflineStore && ns0.OfflineMaps && ns0.setOfflineMaps) {',
  '      const storage = { get: function (k) { return ask("get", k); }, set: function (k, v) { return ask("set", k, v); }, delete: function (k) { return ask("delete", k); } };',
  '      ns0.setOfflineMaps(new ns0.OfflineMaps({ store: new ns0.KeyValueOfflineStore(storage) }));',
  '    }',
  '    else fail("this ts-maps runtime has no KeyValueOfflineStore; offline maps stay in the WebView");',
  '  }',
  '  const Ctor = (window.tsMaps && window.tsMaps.TsMap) || window.TsMap;',
  '  if (!Ctor) { fail("ts-maps runtime not found on window"); return; }',
  '  const opts = {};',
  '  if (initial.center) opts.center = initial.center;',
  '  if (initial.zoom != null) opts.zoom = initial.zoom;',
  '  if (initial.bearing != null) opts.bearing = initial.bearing;',
  '  if (initial.pitch != null) opts.pitch = initial.pitch;',
  '  if (initial.styleSpec) opts.style = initial.styleSpec;',
  '  let locale = initial.locale == null ? undefined : initial.locale;',
  '  if (locale) opts.locale = locale;',
  '  let map;',
  '  try { map = new Ctor(document.getElementById("map"), opts); }',
  '  catch (e) { fail((e && e.message) || e); return; }',
  '  const controlNs = (window.tsMaps && window.tsMaps.control) || window.control;',
  '  if (controlNs && Array.isArray(initial.controls)) {',
  '    initial.controls.forEach(function (spec) {',
  '      const make = spec && controlNs[spec.type];',
  '      if (typeof make !== "function") { fail("unknown control: " + (spec && spec.type)); return; }',
  '      const o = Object.assign({}, spec.options);',
  '      if (spec.position) o.position = spec.position;',
  '      try { make(o).addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); }',
  '    });',
  '  }',
  '  function camera() {',
  '    return {',
  '      center: (function (c) { return c ? [c.lat, c.lng] : [0, 0]; })(map.getCenter && map.getCenter()),',
  '      zoom: (map.getZoom && map.getZoom()) || 0,',
  '      bearing: (map.getBearing && map.getBearing()) || 0,',
  '      pitch: (map.getPitch && map.getPitch()) || 0,',
  '    };',
  '  }',
  '  if (typeof map.on === "function") {',
  '    map.whenReady(function () { send({ type: "load", id: `l${Date.now()}` }); });',
  '    map.on("move", function () { send({ type: "move", id: `mv${Date.now()}`, payload: camera() }); });',
  '    map.on("click", function (e) {',
  '      const ll = e && e.latlng ? [e.latlng.lng, e.latlng.lat] : [0, 0];',
  '      const pt = e && e.containerPoint ? [e.containerPoint.x, e.containerPoint.y] : [0, 0];',
  '      send({ type: "click", id: `ck${Date.now()}`, payload: { lngLat: ll, point: pt } });',
  '    });',
  '    map.on("error", function (e) { fail((e && e.message) || "map error"); });',
  '  }',
  '  let markerLayers = [];',
  '  function applyMarkers(list) {',
  '    markerLayers.forEach(function (m) { if (m && m.remove) m.remove(); });',
  '    markerLayers = [];',
  '    if (!Array.isArray(list)) return;',
  '    const ns = window.tsMaps || window;',
  '    list.forEach(function (spec, index) {',
  '      if (!spec || !Array.isArray(spec.coordinate)) return;',
  '      const opts = {};',
  '      if (spec.title != null) opts.title = spec.title;',
  '      if (spec.draggable != null) opts.draggable = spec.draggable;',
  '      if (spec.opacity != null) opts.opacity = spec.opacity;',
  '      if (spec.zIndexOffset != null) opts.zIndexOffset = spec.zIndexOffset;',
  '      if (spec.html != null && ns.divIcon) {',
  '        const icon = { html: spec.html };',
  '        if (spec.iconSize) icon.iconSize = spec.iconSize;',
  '        if (spec.iconAnchor) icon.iconAnchor = spec.iconAnchor;',
  '        if (spec.iconClass) icon.className = spec.iconClass;',
  '        opts.icon = ns.divIcon(icon);',
  '      }',
  '      let m;',
  '      try { m = ns.marker(spec.coordinate, opts).addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      if (spec.popupHtml != null && ns.popup) {',
  '        const p = ns.popup(spec.popupOptions || {}).setContent(spec.popupHtml);',
  '        m.bindPopup(p);',
  '        if (spec.popupOpen) m.openPopup();',
  '      }',
  '      m.on("click", function () {',
  '        send({',
  '          type: "markerPress",',
  '          id: `mp${Date.now()}`,',
  '          payload: { id: spec.id, index: index, coordinate: spec.coordinate },',
  '        });',
  '      });',
  '      markerLayers.push(m);',
  '    });',
  '  }',
  '  applyMarkers(initial.markers);',
  // The controls below are built from the options that are set, then follow
  // every option through `sync`, which takes a present key as the value to
  // use and an undefined one as the default. JSON drops undefined, so the key
  // is put back here: an option removed from the spec returns to its default.
  '  function given(spec, keys) {',
  '    const opts = {};',
  '    keys.forEach(function (k) { if (spec[k] != null) opts[k] = spec[k]; });',
  '    return opts;',
  '  }',
  '  function follow(spec, keys, target) {',
  '    keys.forEach(function (k) { target[k] = spec[k] == null ? undefined : spec[k]; });',
  '    return target;',
  '  }',
  // Territories and the run trail are drawn by the same layers the other
  // bindings use; only the way they are configured differs, because a store
  // cannot cross the bridge and its geometry can.
  '  let territoryLayer = null;',
  '  let trailLayer = null;',
  '  function applyTerritories(list) {',
  '    const ns = window.tsMaps || window;',
  '    if (!Array.isArray(list) || !ns.TerritoryLayer) return;',
  '    if (!territoryLayer) {',
  '      const styles = {};',
  '      list.forEach(function (t) {',
  '        if (t && t.owner && (t.color || t.fillOpacity != null || t.weight != null)) {',
  '          styles[t.owner] = {};',
  '          if (t.color) styles[t.owner].color = t.color;',
  '          if (t.fillOpacity != null) styles[t.owner].fillOpacity = t.fillOpacity;',
  '          if (t.weight != null) styles[t.owner].weight = t.weight;',
  '        }',
  '      });',
  '      const opts = { styles: styles };',
  '      if (initial.self != null) opts.self = initial.self;',
  '      try { territoryLayer = new ns.TerritoryLayer(opts); map.addLayer(territoryLayer); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '    }',
  '    list.forEach(function (t) {',
  '      if (!t || !t.owner) return;',
  '      if (t.color) territoryLayer.setOwnerStyle(t.owner, { color: t.color });',
  '      territoryLayer.setTerritory(t.owner, t.geometry || []);',
  '    });',
  '  }',
  '  function applyTrail(track) {',
  '    const ns = window.tsMaps || window;',
  '    if (!Array.isArray(track) || !ns.RunTrailLayer) return;',
  '    if (!trailLayer) {',
  '      try { trailLayer = new ns.RunTrailLayer({}); map.addLayer(trailLayer); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '    }',
  '    trailLayer.setTrack(track);',
  '  }',
  // Navigation is the same TurnByTurn the other bindings use. Its events come
  // back over the bridge as plain data, since dates and live objects do not.
  // `directions`, a provider object, cannot cross; the default is used.
  '  const NAV_KEYS = ["profile", "units", "voice", "simulate", "alternatives", "destinationName"];',
  '  let nav = null;',
  '  let navTarget = null;',
  // Transit is planned by OpenTripPlanner at `otpUrl`: one client per URL,
  // so a spec that has not changed does not look like a new provider.
  '  let otp = null;',
  '  function navDirections(spec, ns) {',
  '    if (spec.profile !== "transit" || !spec.otpUrl || !ns.services || !ns.services.OpenTripPlannerDirections) return undefined;',
  '    if (!otp || otp.url !== spec.otpUrl) otp = { url: spec.otpUrl, provider: new ns.services.OpenTripPlannerDirections({ url: spec.otpUrl }) };',
  '    return otp.provider;',
  '  }',
  '  function applyTurnByTurn(spec) {',
  '    const ns = window.tsMaps || window;',
  '    if (!spec) { if (nav) { nav.stop(); nav = null; navTarget = null; } return; }',
  '    if (!ns.TurnByTurn) return;',
  '    if (!nav) {',
  '      try { nav = new ns.TurnByTurn(map, Object.assign(given(spec, NAV_KEYS), { directions: navDirections(spec, ns) })); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      Object.keys(ns.TURN_BY_TURN_EVENTS || {}).forEach(function (type) {',
  '        nav.on(type, function (e) {',
  '          send({ type: "turnByTurn", id: `tb${Date.now()}`, payload: { type: type, data: ns.TurnByTurn.plainEvent(type, e) } });',
  '        });',
  '      });',
  '    }',
  '    navTarget = follow(spec, NAV_KEYS, { from: spec.from, to: spec.to, active: !!spec.active, directions: navDirections(spec, ns) });',
  '    nav.sync(navTarget);',
  '  }',
  // Offline maps are the same control the other bindings use; its events
  // come back over the bridge as plain data. `maps` and `geocoder` cannot
  // cross; the page's own are used.
  '  const OFFLINE_KEYS = ["position", "resources", "showStatus", "title"];',
  '  let offline = null;',
  '  function applyOfflineMaps(spec) {',
  '    const ns = window.tsMaps || window;',
  '    if (!spec) { if (offline) { offline.remove(); offline = null; } return; }',
  '    if (!ns.OfflineMapsControl) return;',
  '    if (!offline) {',
  '      try { offline = new ns.OfflineMapsControl(given(spec, OFFLINE_KEYS)); offline.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      offline.listen(function (type, e) {',
  '        send({ type: "offlineMaps", id: `om${Date.now()}`, payload: { type: type, data: ns.OfflineMapsControl.plainEvent(type, e) } });',
  '      });',
  '    }',
  '    offline.sync(follow(spec, OFFLINE_KEYS, { open: spec.open, onlyOffline: spec.onlyOffline }));',
  '  }',
  // Search is the same control the other bindings use. Directions previews on
  // the navigation above when there is one, reached lazily so it can be set
  // up in either order; the event reaches the app regardless. `provider`,
  // `offline`, `location`, `origin`, `onDirections` and `saved` cannot cross;
  // the defaults are used, Favorites kept in the WebView's `localStorage`.
  // With `lookAround: true`, its place card offers the Look Around below,
  // linked whichever is set up first.
  '  const SEARCH_KEYS = ["position", "placeholder", "categories", "recents", "units", "language", "showSaved"];',
  '  let search = null;',
  '  let searchSpec = null;',
  '  const searchNav = {',
  '    get options() { return nav ? nav.options : {}; },',
  '    preview: function (from, to) { return nav ? nav.preview(from, to) : Promise.resolve([]); },',
  '  };',
  '  function applySearch(spec) {',
  '    const ns = window.tsMaps || window;',
  '    searchSpec = spec || null;',
  '    if (!spec) { if (search) { unlinkIndoor(); search.remove(); search = null; } return; }',
  '    if (!ns.SearchControl) return;',
  '    if (!search) {',
  '      const opts = Object.assign(given(spec, SEARCH_KEYS), { turnByTurn: searchNav });',
  '      try { search = new ns.SearchControl(opts); search.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      search.listen(function (type, e) {',
  '        send({ type: "search", id: `sr${Date.now()}`, payload: { type: type, data: ns.SearchControl.plainEvent(type, e) } });',
  '      });',
  '      linkIndoor();',
  '    }',
  '    linkLookAround();',
  '    search.sync(follow(spec, SEARCH_KEYS, { query: spec.query == null ? undefined : spec.query }));',
  '  }',
  // The map type picker is the same control the other bindings use. A style
  // cannot cross the bridge, so the types are built here with `mapTypes()`
  // from the spec's plain options, and built again only when those change.
  // A traffic layer cannot cross it either: it is built here from the
  // provider and its key, and built again when those change. `value`, `open`
  // and `showTraffic` are followed by the control only when they change.
  '  const MAP_TYPES_KEYS = ["tiles", "imagery", "imageryAttribution", "attribution", "maxzoom", "theme", "labels"];',
  '  const TRAFFIC_KEYS = ["trafficProvider", "trafficKey", "incidents"];',
  '  let picker = null;',
  '  let pickerTypes = null;',
  '  let pickerTraffic = null;',
  '  function trafficFrom(ns, spec) {',
  '    const provider = spec.trafficProvider;',
  '    if (!spec.trafficKey || !ns.TrafficLayer || !ns.trafficSources || (provider !== "mapbox" && provider !== "tomtom")) return undefined;',
  '    const opts = { source: ns.trafficSources[provider](spec.trafficKey) };',
  '    if (spec.incidents && provider === "tomtom" && ns.TomTomIncidents) opts.incidents = new ns.TomTomIncidents({ key: spec.trafficKey });',
  '    return new ns.TrafficLayer(opts);',
  '  }',
  '  function applyMapType(spec) {',
  '    const ns = window.tsMaps || window;',
  '    if (!spec) {',
  '      if (picker) { picker.remove(); if (picker.options.traffic) picker.options.traffic.remove(); picker = null; pickerTypes = null; pickerTraffic = null; }',
  '      return;',
  '    }',
  '    if (!ns.MapTypeControl || !ns.mapTypes) return;',
  '    const plain = given(spec, MAP_TYPES_KEYS);',
  '    const key = JSON.stringify(plain);',
  '    if (!pickerTypes || pickerTypes.key !== key) pickerTypes = { key: key, types: ns.mapTypes(plain) };',
  '    const trafficKey = JSON.stringify(given(spec, TRAFFIC_KEYS));',
  '    if (picker && pickerTraffic !== trafficKey) {',
  '      const was = picker.options.traffic;',
  '      const on = !!(was && was.active);',
  '      if (was) was.remove();',
  '      picker.options.traffic = trafficFrom(ns, spec);',
  '      if (on && picker.options.traffic) picker.options.traffic.addTo(map);',
  '    }',
  '    pickerTraffic = trafficKey;',
  '    if (!picker) {',
  '      const opts = Object.assign(given(spec, ["value", "position"]), { types: pickerTypes.types, traffic: trafficFrom(ns, spec) });',
  '      try { picker = new ns.MapTypeControl(opts); picker.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      picker.listen(function (type, e) {',
  '        send({ type: "mapType", id: `mt${Date.now()}`, payload: { type: type, data: e } });',
  '      });',
  '    }',
  '    picker.sync(follow(spec, ["position", "value", "open", "showTraffic"], { types: pickerTypes.types }));',
  '  }',
  // The indoor map is the same control the other bindings use, its venue
  // loaded here from a URL. Its places are found by the search above, whichever
  // is set up first. A new venue, `minZoom` or `language` loads it again;
  // `level` and `position` are followed by the control, and a new `locale`,
  // the level picker's, makes it again. A venue is reduced to its id, name
  // and levels to cross the bridge.
  '  const INDOOR_KEYS = ["level", "position", "minZoom", "language"];',
  '  let indoor = null;',
  '  let indoorKey = null;',
  '  let indoorLevel;',
  '  let indoorSpec = null;',
  '  let indoorUnlink = null;',
  '  function unlinkIndoor() {',
  '    if (indoorUnlink) { indoorUnlink(); indoorUnlink = null; }',
  '  }',
  '  function linkIndoor() {',
  '    unlinkIndoor();',
  '    if (indoor && search) indoorUnlink = indoor.connect(search);',
  '  }',
  '  function plainIndoor(type, e) {',
  '    if (type !== "load") return e;',
  '    return { venue: { id: e.venue.id, name: e.venue.name, levels: e.venue.levels } };',
  '  }',
  '  function applyIndoor(spec) {',
  '    const ns = window.tsMaps || window;',
  '    indoorSpec = spec || null;',
  '    const key = spec && spec.venue ? JSON.stringify([spec.venue, spec.minZoom, spec.language, locale]) : null;',
  '    if (indoor && key !== indoorKey) { unlinkIndoor(); indoor.remove(); indoor = null; indoorKey = null; }',
  '    if (!key || !ns.IndoorMap) return;',
  '    indoorLevel = spec.level == null ? undefined : spec.level;',
  '    if (!indoor) {',
  '      let made;',
  '      try { made = new ns.IndoorMap(Object.assign(given(spec, INDOOR_KEYS), { venue: spec.venue })); made.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      indoor = made;',
  '      indoorKey = key;',
  '      made.listen(function (type, e) {',
  '        send({ type: "indoor", id: `in${Date.now()}`, payload: { type: type, data: plainIndoor(type, e) } });',
  '      });',
  // A level asked for while the venue was loading is shown once it has.
  '      made.ready().then(function () {',
  '        if (indoor === made) made.sync({ level: indoorLevel });',
  '      }, function (e) {',
  '        if (indoor === made) fail((e && e.message) || e);',
  '      });',
  '      linkIndoor();',
  '    }',
  '    indoor.sync(follow(spec, ["level", "position"], {}));',
  '  }',
  // Look Around is the same control the other bindings use. A provider
  // cannot cross the bridge, so it is built here from its name and its token
  // or endpoint, and built again only when those change. `choosing`, `at`
  // and `heading` are followed by the control only when they change; a new
  // `miniMap`, or the map's `locale`, makes it again. Its pictures are
  // reduced to plain data to cross the bridge.
  '  let look = null;',
  '  let lookKey = null;',
  '  let lookSpec = null;',
  '  let lookImagery = null;',
  '  function linkLookAround() {',
  '    if (search) search.sync({ lookAround: look && searchSpec && searchSpec.lookAround ? look : null });',
  '  }',
  '  function imageryFrom(ns, spec) {',
  '    const key = JSON.stringify([spec.provider || "panoramax", spec.accessToken, spec.endpoint]);',
  '    if (lookImagery && lookImagery.key === key) return lookImagery.provider;',
  '    let provider;',
  '    if (spec.provider === "mapillary" && spec.accessToken && ns.MapillaryImagery) provider = new ns.MapillaryImagery({ accessToken: spec.accessToken });',
  '    else if (ns.PanoramaxImagery) provider = new ns.PanoramaxImagery(given(spec, ["endpoint"]));',
  '    lookImagery = { key: key, provider: provider };',
  '    return provider;',
  '  }',
  '  function applyLookAround(spec) {',
  '    const ns = window.tsMaps || window;',
  '    lookSpec = spec || null;',
  '    const key = spec ? JSON.stringify([spec.miniMap, locale]) : null;',
  '    if (look && key !== lookKey) { look.remove(); look = null; lookKey = null; linkLookAround(); }',
  '    if (!key || !ns.LookAround) return;',
  '    const provider = imageryFrom(ns, spec);',
  '    if (!look) {',
  '      let made;',
  '      try { made = new ns.LookAround(Object.assign(given(spec, ["position", "miniMap"]), { provider: provider })); made.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return; }',
  '      look = made;',
  '      lookKey = key;',
  '      made.listen(function (type, e) {',
  '        send({ type: "lookAround", id: `la${Date.now()}`, payload: { type: type, data: ns.LookAround.plainEvent(type, e) } });',
  '      });',
  '      linkLookAround();',
  '    }',
  // `at: null` closes, so it is kept as it is rather than made undefined.
  '    const target = follow(spec, ["position", "choosing", "heading"], { provider: provider });',
  '    target.at = spec.at === undefined ? undefined : spec.at;',
  '    look.sync(target);',
  '  }',
  // Landmarks and trees are the same ones the other bindings use, a model
  // loaded here from its URL. A landmark is matched across updates by `id`,
  // or by index without one: a new `model`, `replace` or `minZoom` makes it
  // again, and the rest goes to its `sync`.
  '  const LANDMARK_KEYS = ["altitude", "rotation", "scale", "replace", "minZoom", "opacity"];',
  '  let landmarks = [];',
  '  function applyLandmarks(list) {',
  '    const ns = window.tsMaps || window;',
  '    if (!ns.Landmark) return;',
  '    const specs = Array.isArray(list) ? list.filter(function (l) { return l && l.model && l.position; }) : [];',
  '    const keyOf = function (l, i) { return l.id != null ? `id:${l.id}` : `at:${i}`; };',
  '    const was = {};',
  '    landmarks.forEach(function (item) { was[item.key] = item; });',
  '    landmarks = specs.map(function (spec, i) {',
  '      const key = keyOf(spec, i);',
  '      const build = JSON.stringify([spec.model, spec.replace, spec.minZoom]);',
  '      const item = was[key];',
  '      if (item && item.build === build) {',
  '        delete was[key];',
  '        item.landmark.sync({ position: spec.position, rotation: spec.rotation, scale: spec.scale, altitude: spec.altitude, opacity: spec.opacity });',
  '        return item;',
  '      }',
  '      let made;',
  '      try { made = new ns.Landmark(Object.assign(given(spec, LANDMARK_KEYS), { model: spec.model, position: spec.position })); made.addTo(map); }',
  '      catch (e) { fail((e && e.message) || e); return null; }',
  '      made.ready().then(null, function (e) {',
  '        if (made._map) fail((e && e.message) || e);',
  '      });',
  '      return { key: key, build: build, landmark: made };',
  '    }).filter(Boolean);',
  '    Object.keys(was).forEach(function (key) { was[key].landmark.remove(); });',
  '  }',
  '  const TREES_KEYS = ["spacing", "maxPerTile", "minZoom", "minPitch", "colors", "height"];',
  '  let trees = null;',
  '  function applyTrees(spec) {',
  '    const ns = window.tsMaps || window;',
  '    if (!spec) { if (trees) { trees.remove(); trees = null; } return; }',
  '    if (!ns.Trees) return;',
  '    const opts = follow(spec === true ? {} : spec, TREES_KEYS, {});',
  '    if (!trees) {',
  '      try { trees = new ns.Trees(given(opts, TREES_KEYS)); trees.addTo(map); }',
  '      catch (e) { trees = null; fail((e && e.message) || e); }',
  '    }',
  '    else trees.setOptions(opts);',
  '  }',
  // A new language for the map, and for the controls the page holds, which
  // relabel in place. Navigation is given its whole target again, since a
  // `sync` without the trip would end it.
  '  function applyLocale(next) {',
  '    locale = next == null ? undefined : next;',
  '    map.options.locale = locale;',
  '    if (search) search.sync({ locale: locale });',
  '    if (offline) offline.sync({ locale: locale });',
  '    if (picker) picker.sync({ locale: locale });',
  '    if (nav && navTarget) nav.sync(Object.assign({}, navTarget, { locale: locale }));',
  '    if (indoor) applyIndoor(indoorSpec);',
  '    if (look) applyLookAround(lookSpec);',
  '  }',
  '  applyTerritories(initial.territories);',
  '  applyTrail(initial.runTrail);',
  '  applyTurnByTurn(initial.turnByTurn);',
  '  applyOfflineMaps(initial.offlineMaps);',
  '  applySearch(initial.search);',
  '  applyMapType(initial.mapType);',
  '  applyIndoor(initial.indoor);',
  '  applyLookAround(initial.lookAround);',
  '  applyLandmarks(initial.landmarks);',
  '  applyTrees(initial.trees);',
  '  function handle(env) {',
  '    if (!env || typeof env !== "object") return;',
  '    if (env.type === "store:result" || env.type === "store:error") {',
  '      const waiting = storeCalls[env.id];',
  '      if (!waiting) return;',
  '      delete storeCalls[env.id];',
  '      if (env.type === "store:result") waiting.resolve(env.result);',
  '      else waiting.reject(new Error(env.error));',
  '      return;',
  '    }',
  '    if (env.type === "call") {',
  '      const method = env.payload && env.payload.method;',
  '      const args = (env.payload && env.payload.args) || [];',
  '      try {',
  // A dotted name reaches one level in — `offline.download`, `offline.list`
  // — called on the object it belongs to.
  '        const path = String(method || "").split(".");',
  '        let owner = map;',
  '        for (let i = 0; i < path.length - 1 && owner != null; i++) owner = owner[path[i]];',
  '        const fn = owner != null ? owner[path[path.length - 1]] : undefined;',
  '        if (typeof fn !== "function") throw new Error(`no such method: ${method}`);',
  '        const result = fn.apply(owner, args);',
  '        Promise.resolve(result).then(function (r) {',
  '          send({ type: "call:result", id: env.id, result: r });',
  '        }).catch(function (err) {',
  '          send({ type: "call:error", id: env.id, error: String((err && err.message) || err) });',
  '        });',
  '      }',
  '      catch (err) {',
  '        send({ type: "call:error", id: env.id, error: String((err && err.message) || err) });',
  '      }',
  '    }',
  '    else if (env.type === "setCamera") {',
  '      const p = env.payload || {};',
  '      if (p.center != null && p.zoom != null && typeof map.setView === "function")',
  '        map.setView(p.center, p.zoom);',
  '      if (p.bearing != null && typeof map.setBearing === "function") map.setBearing(p.bearing);',
  '      if (p.pitch != null && typeof map.setPitch === "function") map.setPitch(p.pitch);',
  '    }',
  '    else if (env.type === "setStyle") {',
  '      if (typeof map.setStyle === "function") map.setStyle(env.payload && env.payload.styleSpec);',
  '    }',
  '    else if (env.type === "setLocale") {',
  '      applyLocale(env.payload && env.payload.locale);',
  '    }',
  '    else if (env.type === "setMarkers") {',
  '      applyMarkers(env.payload && env.payload.markers);',
  '    }',
  '    else if (env.type === "setTerritories") {',
  '      applyTerritories(env.payload && env.payload.territories);',
  '    }',
  '    else if (env.type === "setRunTrail") {',
  '      applyTrail(env.payload && env.payload.runTrail);',
  '    }',
  '    else if (env.type === "setTurnByTurn") {',
  '      applyTurnByTurn(env.payload && env.payload.turnByTurn);',
  '    }',
  '    else if (env.type === "setOfflineMaps") {',
  '      applyOfflineMaps(env.payload && env.payload.offlineMaps);',
  '    }',
  '    else if (env.type === "setSearch") {',
  '      applySearch(env.payload && env.payload.search);',
  '    }',
  '    else if (env.type === "setMapType") {',
  '      applyMapType(env.payload && env.payload.mapType);',
  '    }',
  '    else if (env.type === "setIndoor") {',
  '      applyIndoor(env.payload && env.payload.indoor);',
  '    }',
  '    else if (env.type === "setLookAround") {',
  '      applyLookAround(env.payload && env.payload.lookAround);',
  '    }',
  '    else if (env.type === "setLandmarks") {',
  '      applyLandmarks(env.payload && env.payload.landmarks);',
  '    }',
  '    else if (env.type === "setTrees") {',
  '      applyTrees(env.payload && env.payload.trees);',
  '    }',
  '  }',
  '  function onMessage(data) {',
  '    let env;',
  '    try { env = typeof data === "string" ? JSON.parse(data) : data; }',
  '    catch (e) { return; }',
  '    handle(env);',
  '  }',
  '  document.addEventListener("message", function (e) { onMessage(e.data); });',
  '  window.addEventListener("message", function (e) { onMessage(e.data); });',
  '  window.__tsMapsBridge__ = { map: map, send: send, pending: pending };',
  '})();',
].join('\n')
