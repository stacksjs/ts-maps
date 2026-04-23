import type { MapRuntime } from './types'

export interface BuildHtmlOptions {
  runtime: MapRuntime
  initial: {
    center?: [number, number]
    zoom?: number
    bearing?: number
    pitch?: number
    styleSpec?: unknown
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
