import type { ControlSpec, MapRuntime, MarkerSpec } from './types'

export interface BuildHtmlOptions {
  runtime: MapRuntime
  initial: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
    styleSpec?: unknown
    controls?: ControlSpec[]
    markers?: MarkerSpec[]
  }
}

/**
 * Build the HTML document loaded by the WebView. The inner script wires up
 * ts-maps, forwards `load`/`move`/`click`/`error` events back to the RN side,
 * and handles inbound `call`/`setCamera`/`setStyle` envelopes.
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
  '  const Ctor = (window.tsMaps && window.tsMaps.TsMap) || window.TsMap;',
  '  if (!Ctor) { fail("ts-maps runtime not found on window"); return; }',
  '  const opts = {};',
  '  if (initial.center) opts.center = initial.center;',
  '  if (initial.zoom != null) opts.zoom = initial.zoom;',
  '  if (initial.bearing != null) opts.bearing = initial.bearing;',
  '  if (initial.pitch != null) opts.pitch = initial.pitch;',
  '  if (initial.styleSpec) opts.style = initial.styleSpec;',
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
  '      center: (map.getCenter && map.getCenter()) || [0, 0],',
  '      zoom: (map.getZoom && map.getZoom()) || 0,',
  '      bearing: (map.getBearing && map.getBearing()) || 0,',
  '      pitch: (map.getPitch && map.getPitch()) || 0,',
  '    };',
  '  }',
  '  if (typeof map.on === "function") {',
  '    map.on("load", function () { send({ type: "load", id: `l${Date.now()}` }); });',
  '    map.on("move", function () { send({ type: "move", id: `mv${Date.now()}`, payload: camera() }); });',
  '    map.on("click", function (e) {',
  '      const ll = (e && e.lngLat) || [0, 0];',
  '      const pt = (e && e.point) || [0, 0];',
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
  '  function handle(env) {',
  '    if (!env || typeof env !== "object") return;',
  '    if (env.type === "call") {',
  '      const method = env.payload && env.payload.method;',
  '      const args = (env.payload && env.payload.args) || [];',
  '      try {',
  '        const fn = method && map[method];',
  '        if (typeof fn !== "function") throw new Error(`no such method: ${method}`);',
  '        const result = fn.apply(map, args);',
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
  '    else if (env.type === "setMarkers") {',
  '      applyMarkers(env.payload && env.payload.markers);',
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
