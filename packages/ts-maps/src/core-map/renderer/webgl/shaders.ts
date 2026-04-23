// Inline GLSL sources for the WebGL renderer's fill, line, and circle
// programs. Each shader pair is kept intentionally small — no preprocessor
// tricks, no shared includes — so the entire surface area is visible in one
// file.
//
// All programs project from tile-local coordinates (0..tileSize in x/y) to
// clip space via a single `u_matrix` uniform supplied by the renderer.

export const FILL_VERT: string = `#version 300 es
precision highp float;
in vec2 a_position;
uniform mat4 u_matrix;
void main() {
  gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
}
`

export const FILL_FRAG: string = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  fragColor = u_color;
}
`

// Line vertex shader: each segment vertex carries an extrusion normal and a
// progress value. Miter joints only — bevel/round will follow.
export const LINE_VERT: string = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_normal;
in float a_progress;
uniform mat4 u_matrix;
uniform float u_width;
out float v_edge;
void main() {
  vec2 offset = a_normal * (u_width * 0.5);
  vec4 pos = u_matrix * vec4(a_position + offset, 0.0, 1.0);
  gl_Position = pos;
  v_edge = a_progress;
}
`

// Fragment shader uses a 1-px feather on the extrusion edge for anti-alias.
export const LINE_FRAG: string = `#version 300 es
precision highp float;
uniform vec4 u_color;
in float v_edge;
out vec4 fragColor;
void main() {
  float d = abs(v_edge);
  float alpha = 1.0 - smoothstep(0.95, 1.0, d);
  fragColor = vec4(u_color.rgb, u_color.a * alpha);
}
`

// Circle vertex shader: quad vertices expand around each center by radius in
// tile-local units. `a_offset` is a unit-quad coordinate in [-1, 1]^2; the
// fragment shader computes distance to decide inside/outside and stroke.
export const CIRCLE_VERT: string = `#version 300 es
precision highp float;
in vec2 a_center;
in vec2 a_offset;
uniform mat4 u_matrix;
uniform float u_radius;
uniform float u_stroke_width;
out vec2 v_offset;
void main() {
  float r = u_radius + u_stroke_width;
  vec2 pos = a_center + a_offset * r;
  gl_Position = u_matrix * vec4(pos, 0.0, 1.0);
  v_offset = a_offset * (r / max(u_radius, 0.0001));
}
`

export const CIRCLE_FRAG: string = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform vec4 u_stroke_color;
uniform float u_stroke_width;
uniform float u_radius;
in vec2 v_offset;
out vec4 fragColor;
void main() {
  float d = length(v_offset);
  // edge fades over ~1/radius units so circles remain crisp at small radii.
  float feather = max(1.0 / max(u_radius, 1.0), 0.02);
  float innerEdge = 1.0 - (u_stroke_width / max(u_radius, 0.0001));
  float fillAlpha = 1.0 - smoothstep(innerEdge - feather, innerEdge, d);
  float outerAlpha = 1.0 - smoothstep(1.0 - feather, 1.0, d);
  vec4 inner = vec4(u_color.rgb, u_color.a * fillAlpha);
  vec4 ring = vec4(u_stroke_color.rgb, u_stroke_color.a * (outerAlpha - fillAlpha));
  fragColor = inner + ring;
}
`

// Fill-extrusion vertex shader. Input layout per vertex:
//   [x, y, z, nx, ny, nz]
// Normals are precomputed per-face by the renderer (up-facing for caps,
// outward-horizontal for walls) so the shader doesn't need adjacent geometry.
// The fragment shader does a cheap directional-lighting dot product with a
// fixed sun vector — sufficient to convey depth without PBR overhead.
export const FILL_EXTRUSION_VERT: string = `#version 300 es
precision highp float;
in vec3 a_position;
in vec3 a_normal;
uniform mat4 u_matrix;
out vec3 v_normal;
void main() {
  gl_Position = u_matrix * vec4(a_position, 1.0);
  v_normal = a_normal;
}
`

export const FILL_EXTRUSION_FRAG: string = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform float u_opacity;
in vec3 v_normal;
out vec4 fragColor;
void main() {
  // Fixed sun direction — vaguely north-east, elevated. Already-normalised
  // (length 1.0 within float precision) so the shader stays branch-free.
  vec3 sun = vec3(0.5, 0.5, 0.7071);
  float n = max(dot(normalize(v_normal), sun), 0.0);
  // Ambient + diffuse — guarantees the unlit sides still show colour.
  float light = 0.45 + 0.55 * n;
  fragColor = vec4(u_color.rgb * light, u_color.a * u_opacity);
}
`

// Sky vertex shader — draws a full-screen quad. `a_position` is already in
// NDC so we pass it through untouched. `v_uv` runs in [0,1] for the fragment
// shader to compute a vertical gradient.
export const SKY_VERT: string = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Sky fragment shader — blends `u_sky_color` (top) to `u_horizon_color`
// (bottom). `u_pitch_t` in [0,1] attenuates visibility as pitch drops so
// the horizon vanishes when looking straight down.
export const SKY_FRAG: string = `#version 300 es
precision highp float;
uniform vec4 u_sky_color;
uniform vec4 u_horizon_color;
uniform float u_pitch_t;
uniform float u_horizon_blend;
in vec2 v_uv;
out vec4 fragColor;
void main() {
  // v_uv.y == 1 at top, 0 at bottom. Horizon is at y = 1 - u_horizon_blend.
  float t = smoothstep(1.0 - u_horizon_blend, 1.0, v_uv.y);
  vec4 color = mix(u_horizon_color, u_sky_color, t);
  fragColor = vec4(color.rgb, color.a * u_pitch_t);
}
`
