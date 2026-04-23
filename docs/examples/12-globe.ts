/**
 * Example 12 — Globe projection preview.
 *
 * A Canvas2D preview of the orthographic sphere projection. We spin the
 * globe, convert a graticule of lat/lng lines to 3D unit-sphere coords via
 * the library's `Projection.Globe.toSphere`, then back-project to 2D with a
 * simple orthographic camera.
 *
 * The full WebGL sphere renderer wraps this same math in a vertex shader;
 * here we use the 2D helpers so the demo runs anywhere.
 */

import { Projection } from '../../packages/ts-maps/src/core-map'

const canvas = document.getElementById('globe') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const W = 520
const H = 520
canvas.width = W
canvas.height = H
const R = 220
const cx = W / 2
const cy = H / 2

interface V3 { x: number, y: number, z: number }

function rotY(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: c * v.x + s * v.z, y: v.y, z: -s * v.x + c * v.z }
}
function rotX(v: V3, a: number): V3 {
  const c = Math.cos(a), s = Math.sin(a)
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z }
}

function project(v: V3): { x: number, y: number, visible: boolean } {
  // Orthographic — camera on +Z.
  return { x: cx + v.x * R, y: cy - v.y * R, visible: v.z >= 0 }
}

function drawGreatCircleArc(a: V3, b: V3, yaw: number, pitch: number): void {
  const steps = 32
  ctx.beginPath()
  let started = false
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // slerp
    const dot = a.x * b.x + a.y * b.y + a.z * b.z
    const omega = Math.acos(Math.max(-1, Math.min(1, dot)))
    const sin = Math.sin(omega) || 1
    const k1 = Math.sin((1 - t) * omega) / sin
    const k2 = Math.sin(t * omega) / sin
    const p: V3 = { x: k1 * a.x + k2 * b.x, y: k1 * a.y + k2 * b.y, z: k1 * a.z + k2 * b.z }
    let r = rotY(p, yaw)
    r = rotX(r, pitch)
    const q = project(r)
    if (!q.visible) { started = false; continue }
    if (!started) { ctx.moveTo(q.x, q.y); started = true }
    else ctx.lineTo(q.x, q.y)
  }
  ctx.stroke()
}

let yaw = 0
const pitch = 0.2

function frame(): void {
  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, W, H)

  // Globe disk.
  const grad = ctx.createRadialGradient(cx - R / 3, cy - R / 3, R / 4, cx, cy, R)
  grad.addColorStop(0, '#1e3a8a')
  grad.addColorStop(1, '#0c1a33')
  ctx.fillStyle = grad
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

  // Graticule.
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)'
  ctx.lineWidth = 1
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lng = -180; lng < 180; lng += 10) {
      const a = Projection.Globe.toSphere({ lat, lng })
      const b = Projection.Globe.toSphere({ lat, lng: lng + 10 })
      drawGreatCircleArc(a, b, yaw, pitch)
    }
  }
  for (let lng = -180; lng <= 180; lng += 30) {
    for (let lat = -80; lat < 80; lat += 10) {
      const a = Projection.Globe.toSphere({ lat, lng })
      const b = Projection.Globe.toSphere({ lat: lat + 10, lng })
      drawGreatCircleArc(a, b, yaw, pitch)
    }
  }

  // A few city dots.
  const cities: [number, number, string][] = [
    [40.7128, -74.0060, 'NYC'],
    [51.5074, -0.1278, 'LDN'],
    [35.6762, 139.6503, 'TYO'],
    [-33.8688, 151.2093, 'SYD'],
    [48.8566, 2.3522, 'PAR'],
    [1.3521, 103.8198, 'SGP'],
  ]
  ctx.fillStyle = '#f59e0b'
  for (const [lat, lng, _name] of cities) {
    const p0 = Projection.Globe.toSphere({ lat, lng })
    let p = rotY(p0, yaw)
    p = rotX(p, pitch)
    const q = project(p)
    if (!q.visible) continue
    ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, Math.PI * 2); ctx.fill()
  }

  yaw += 0.004
  requestAnimationFrame(frame)
}

frame()

const info = document.getElementById('info')
if (info) {
  const mix = Projection.Globe.globeToMercatorMix(3)
  info.textContent = `Projection.Globe.globeToMercatorMix(3) → ${mix.toFixed(3)} (1 = full sphere, 0 = flat)`
}
