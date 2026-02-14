/**
 * Ditter - WebGL Dither Engine
 *
 * GPU-accelerated dithering for per-pixel independent algorithms.
 * Falls back to CPU (DitherEngine) if WebGL2 is not available.
 *
 * Accelerated algorithm categories:
 *   - ordered (Bayer matrices)
 *   - halftone (dot, line, diamond, cross, ellipse)
 *   - noise (random, white, IGN, checkerboard)
 *   - pattern (horizontal/vertical lines, crosshatch, diagonal, spiral)
 *   - threshold (simple, multi-level)
 *
 * NOT accelerated (inherently sequential):
 *   - error-diffusion (Floyd-Steinberg, etc.)
 *   - artistic (stipple, pointillism - require cell-level accumulation)
 *   - threshold/adaptive (requires integral image)
 */

const WebGLDither = (() => {
  let gl = null;
  let canvas = null;
  let isAvailable = false;

  // Shared resources
  let quadVAO = null;
  let quadVBO = null;
  let sourceTexture = null;
  let paletteTexture = null;
  let framebuffer = null;
  let outputTexture = null;

  // Shader cache
  const shaderCache = {};

  // Current dimensions
  let currentWidth = 0;
  let currentHeight = 0;

  // Vertex shader (shared by all fragment shaders)
  const VERTEX_SHADER = `#version 300 es
    in vec2 a_position;
    out vec2 v_texCoord;
    void main() {
      gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
      v_texCoord = a_position;
    }
  `;

  // Common fragment shader header
  const FRAG_HEADER = `#version 300 es
    precision highp float;
    in vec2 v_texCoord;
    out vec4 fragColor;
    uniform sampler2D u_source;
    uniform sampler2D u_palette;
    uniform int u_paletteSize;
    uniform vec2 u_resolution;
    uniform float u_spread;
    uniform float u_lineScale;
    uniform float u_threshold;

    vec3 getSourceColor() {
      return texture(u_source, v_texCoord).rgb;
    }

    vec3 nearestPaletteColor(vec3 color) {
      float minDist = 1e10;
      vec3 nearest = vec3(0.0);
      for (int i = 0; i < 256; i++) {
        if (i >= u_paletteSize) break;
        vec3 pc = texelFetch(u_palette, ivec2(i, 0), 0).rgb;
        vec3 d = color - pc;
        float dist = dot(d, d);
        if (dist < minDist) {
          minDist = dist;
          nearest = pc;
        }
      }
      return nearest;
    }

    float luminance(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }
  `;

  // Fragment shaders for each algorithm type
  const SHADERS = {

    // --- ORDERED DITHERING ---
    'ordered-bayer2': FRAG_HEADER + `
      void main() {
        vec3 color = getSourceColor();
        ivec2 px = ivec2(gl_FragCoord.xy);
        int bayer[4] = int[4](0, 2, 3, 1);
        int idx = (px.y % 2) * 2 + (px.x % 2);
        float t = ((float(bayer[idx]) + 0.5) / 4.0 - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'ordered-bayer4': FRAG_HEADER + `
      void main() {
        vec3 color = getSourceColor();
        ivec2 px = ivec2(gl_FragCoord.xy);
        int bayer[16] = int[16](
          0, 8, 2, 10,
          12, 4, 14, 6,
          3, 11, 1, 9,
          15, 7, 13, 5
        );
        int idx = (px.y % 4) * 4 + (px.x % 4);
        float t = ((float(bayer[idx]) + 0.5) / 16.0 - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'ordered-bayer8': FRAG_HEADER + `
      // Compute Bayer 8x8 value using bit interleaving
      float bayer8(ivec2 p) {
        ivec2 m = p % 8;
        // Recursive Bayer construction
        int v = 0;
        for (int i = 2; i >= 0; i--) {
          int bit = 1 << i;
          int xb = (m.x & bit) != 0 ? 1 : 0;
          int yb = (m.y & bit) != 0 ? 1 : 0;
          v = v * 4 + (xb ^ yb) * 2 + yb;
        }
        return float(v) / 64.0;
      }
      void main() {
        vec3 color = getSourceColor();
        ivec2 px = ivec2(gl_FragCoord.xy);
        float t = (bayer8(px) + 0.5/64.0 - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- HALFTONE ---
    'halftone-dot': FRAG_HEADER + `
      uniform float u_cellSize;
      uniform float u_angle;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float ca = cos(u_angle), sa = sin(u_angle);
        vec2 rotated = vec2(px.x * ca - px.y * sa, px.x * sa + px.y * ca);
        vec2 cell = mod(rotated, u_cellSize) - u_cellSize * 0.5;
        float dist = length(cell) / (u_cellSize * 0.5);
        float lum = luminance(color);
        float radius = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(dist <= radius ? dark : light, 1.0);
      }
    `,

    'halftone-line': FRAG_HEADER + `
      uniform float u_cellSize;
      uniform float u_angle;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float ca = cos(u_angle), sa = sin(u_angle);
        float ry = px.x * sa + px.y * ca;
        float posInCell = mod(ry, u_cellSize);
        float center = u_cellSize * 0.5;
        float distFromCenter = abs(posInCell - center) / center;
        float lum = luminance(color);
        float thickness = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(distFromCenter <= thickness ? dark : light, 1.0);
      }
    `,

    'halftone-diamond': FRAG_HEADER + `
      uniform float u_cellSize;
      uniform float u_angle;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float ca = cos(u_angle), sa = sin(u_angle);
        vec2 rotated = vec2(px.x * ca - px.y * sa, px.x * sa + px.y * ca);
        vec2 cell = mod(rotated, u_cellSize) - u_cellSize * 0.5;
        float dist = (abs(cell.x) + abs(cell.y)) / (u_cellSize * 0.5);
        float lum = luminance(color);
        float radius = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(dist <= radius ? dark : light, 1.0);
      }
    `,

    'halftone-cross': FRAG_HEADER + `
      uniform float u_cellSize;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        vec2 cell = mod(px, u_cellSize) - u_cellSize * 0.5;
        float dist = min(abs(cell.x), abs(cell.y)) / (u_cellSize * 0.5);
        float lum = luminance(color);
        float thickness = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(dist <= thickness ? dark : light, 1.0);
      }
    `,

    // --- NOISE ---
    'noise-random': FRAG_HEADER + `
      // Simple hash for pseudo-random per-pixel
      float hash(vec2 p) {
        p = fract(p * vec2(443.8975, 397.2973));
        p += dot(p, p.yx + 19.19);
        return fract(p.x * p.y);
      }
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float noise = (hash(px) - 0.5) * 2.0 * u_spread * 0.5;
        vec3 adjusted = clamp(color + noise, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'noise-ign': FRAG_HEADER + `
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float noise = fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
        float t = (noise - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'noise-white': FRAG_HEADER + `
      uniform float u_seed;
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx + u_seed) * vec3(443.897, 441.423, 437.195));
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float t = (hash(px) - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- PATTERN ---
    'pattern-checkerboard': FRAG_HEADER + `
      void main() {
        vec3 color = getSourceColor();
        ivec2 px = ivec2(gl_FragCoord.xy);
        float bias = ((px.x + px.y) & 1) == 0 ? 0.25 : 0.75;
        float t = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'pattern-hlines': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        float y = gl_FragCoord.y;
        float t = mod(y, u_spacing) / u_spacing;
        float bias = abs(t * 2.0 - 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'pattern-vlines': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        float x = gl_FragCoord.x;
        float t = mod(x, u_spacing) / u_spacing;
        float bias = abs(t * 2.0 - 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'pattern-crosshatch': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float s = u_spacing;
        float line1 = abs(mod(px.y, s) / s * 2.0 - 1.0);
        float line2 = abs(mod(px.x, s) / s * 2.0 - 1.0);
        float line3 = abs(mod(px.x + px.y, s) / s * 2.0 - 1.0);
        float line4 = abs(mod(px.x - px.y + s * 100.0, s) / s * 2.0 - 1.0);
        float bias = min(min(line1, line2), min(line3, line4));
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'pattern-diagonal': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float t = mod(px.x + px.y, u_spacing) / u_spacing;
        float bias = abs(t * 2.0 - 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    'pattern-spiral': FRAG_HEADER + `
      uniform float u_spacing;
      uniform float u_tightness;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        vec2 center = u_resolution * 0.5;
        vec2 d = px - center;
        float r = length(d);
        float theta = atan(d.y, d.x);
        float normalizedAngle = (theta + 3.14159265) / (2.0 * 3.14159265);
        float spiralVal = mod(r + normalizedAngle * u_spacing * u_tightness, u_spacing);
        float bias = abs(spiralVal / u_spacing * 2.0 - 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- THRESHOLD ---
    'threshold-simple': FRAG_HEADER + `
      void main() {
        vec3 color = getSourceColor();
        fragColor = vec4(nearestPaletteColor(color), 1.0);
      }
    `,

    'threshold-multi': FRAG_HEADER + `
      uniform float u_levels;
      void main() {
        vec3 color = getSourceColor();
        float step = 1.0 / (u_levels - 1.0);
        vec3 quantized = floor(color / step + 0.5) * step;
        fragColor = vec4(nearestPaletteColor(clamp(quantized, 0.0, 1.0)), 1.0);
      }
    `,

    // --- ADJUSTMENTS (pre-processing pass) ---
    'adjustments': FRAG_HEADER + `
      uniform bool u_invert;
      uniform float u_contrastFactor;
      uniform float u_gamma;
      uniform float u_highlightShift;
      uniform bool u_needContrast;
      uniform bool u_needGamma;
      uniform bool u_needHighlights;
      void main() {
        vec3 c = getSourceColor();
        if (u_invert) c = 1.0 - c;
        if (u_needContrast) c = clamp((c - 0.5) * u_contrastFactor + 0.5, 0.0, 1.0);
        if (u_needGamma) c = pow(clamp(c, 0.0, 1.0), vec3(u_gamma));
        if (u_needHighlights) {
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          if (lum > 0.5) {
            float amount = (lum - 0.5) * 2.0 * u_highlightShift * (60.0 / 255.0);
            c = clamp(c + amount, 0.0, 1.0);
          }
        }
        fragColor = vec4(c, 1.0);
      }
    `,

    // --- BLUR (separable box blur pass) ---
    'blur-h': FRAG_HEADER + `
      uniform float u_radius;
      void main() {
        vec2 texel = 1.0 / u_resolution;
        vec3 sum = vec3(0.0);
        float r = floor(u_radius);
        float count = 0.0;
        for (float dx = -r; dx <= r; dx += 1.0) {
          vec2 offset = vec2(dx * texel.x, 0.0);
          sum += texture(u_source, clamp(v_texCoord + offset, 0.0, 1.0)).rgb;
          count += 1.0;
        }
        fragColor = vec4(sum / count, 1.0);
      }
    `,

    'blur-v': FRAG_HEADER + `
      uniform float u_radius;
      void main() {
        vec2 texel = 1.0 / u_resolution;
        vec3 sum = vec3(0.0);
        float r = floor(u_radius);
        float count = 0.0;
        for (float dy = -r; dy <= r; dy += 1.0) {
          vec2 offset = vec2(0.0, dy * texel.y);
          sum += texture(u_source, clamp(v_texCoord + offset, 0.0, 1.0)).rgb;
          count += 1.0;
        }
        fragColor = vec4(sum / count, 1.0);
      }
    `,

    // --- NEW: HALFTONE SQUARE ---
    'halftone-square': FRAG_HEADER + `
      uniform float u_cellSize;
      uniform float u_angle;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float ca = cos(u_angle), sa = sin(u_angle);
        vec2 rotated = vec2(px.x * ca - px.y * sa, px.x * sa + px.y * ca);
        vec2 cell = mod(rotated, u_cellSize) - u_cellSize * 0.5;
        float dist = max(abs(cell.x), abs(cell.y)) / (u_cellSize * 0.5);
        float lum = luminance(color);
        float radius = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(dist <= radius ? dark : light, 1.0);
      }
    `,

    // --- NEW: HALFTONE STAR ---
    'halftone-star': FRAG_HEADER + `
      uniform float u_cellSize;
      uniform float u_angle;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float ca = cos(u_angle), sa = sin(u_angle);
        vec2 rotated = vec2(px.x * ca - px.y * sa, px.x * sa + px.y * ca);
        vec2 cell = mod(rotated, u_cellSize) - u_cellSize * 0.5;
        float r = length(cell) / (u_cellSize * 0.5);
        float a = atan(cell.y, cell.x);
        float starDist = r * (1.0 + 0.3 * cos(6.0 * a));
        float lum = luminance(color);
        float radius = 1.0 - lum;
        vec3 dark = nearestPaletteColor(vec3(0.0));
        vec3 light = nearestPaletteColor(vec3(1.0));
        fragColor = vec4(starDist <= radius ? dark : light, 1.0);
      }
    `,

    // --- NEW: NOISE PERLIN ---
    'noise-perlin': FRAG_HEADER + `
      vec2 fade2(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
      float hash2d(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.x + p3.y) * p3.z) * 2.0 - 1.0;
      }
      float grad2(vec2 ip, vec2 fp) {
        float h = hash2d(ip);
        float h2 = hash2d(ip + 0.5);
        return fp.x * h + fp.y * h2;
      }
      float perlinNoise(vec2 p) {
        vec2 ip = floor(p);
        vec2 fp = fract(p);
        vec2 u = fade2(fp);
        float a = grad2(ip, fp);
        float b = grad2(ip + vec2(1.0, 0.0), fp - vec2(1.0, 0.0));
        float c = grad2(ip + vec2(0.0, 1.0), fp - vec2(0.0, 1.0));
        float d = grad2(ip + vec2(1.0, 1.0), fp - vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float freq = u_lineScale * 0.05;
        float noise = perlinNoise(px * freq) * 0.5 + 0.5;
        float t = (noise - 0.5) * u_spread;
        vec3 adjusted = clamp(color + t, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- NEW: PATTERN HEX ---
    'pattern-hex': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float s = u_spacing;
        float h = s * 0.866;
        vec2 a = mod(px, vec2(s * 1.5, h * 2.0));
        vec2 b = mod(px - vec2(s * 0.75, h), vec2(s * 1.5, h * 2.0));
        float da = length(a - vec2(s * 0.75, h));
        float db = length(b - vec2(s * 0.75, h));
        float dist = min(da, db) / (s * 0.5);
        float bias = clamp(dist, 0.0, 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- NEW: PATTERN BRICK ---
    'pattern-brick': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float brickW = u_spacing * 2.0;
        float brickH = u_spacing;
        float row = floor(px.y / brickH);
        float offset = mod(row, 2.0) * brickW * 0.5;
        vec2 cell = vec2(mod(px.x + offset, brickW), mod(px.y, brickH));
        vec2 center = vec2(brickW * 0.5, brickH * 0.5);
        float dist = max(abs(cell.x - center.x) / center.x, abs(cell.y - center.y) / center.y);
        float bias = clamp(dist, 0.0, 1.0);
        float threshold = (bias - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `,

    // --- NEW: PATTERN WAVE ---
    'pattern-wave': FRAG_HEADER + `
      uniform float u_spacing;
      void main() {
        vec3 color = getSourceColor();
        vec2 px = gl_FragCoord.xy;
        float freq = 6.28318 / u_spacing;
        float wave = sin(px.y * freq + px.x * 0.1) * 0.5 + 0.5;
        float threshold = (wave - 0.5) * u_spread;
        vec3 adjusted = clamp(color + threshold, 0.0, 1.0);
        fragColor = vec4(nearestPaletteColor(adjusted), 1.0);
      }
    `
  };

  // Map from DitherEngine algorithm IDs to WebGL shader IDs
  const ALGO_MAP = {
    'ordered': {
      'bayer-2x2': 'ordered-bayer2',
      'bayer-4x4': 'ordered-bayer4',
      'bayer-8x8': 'ordered-bayer8',
      'bayer-16x16': 'ordered-bayer8' // Use 8x8 shader (works for any size via modulo)
    },
    'halftone': {
      'dot-halftone': 'halftone-dot',
      'line-halftone': 'halftone-line',
      'diamond-halftone': 'halftone-diamond',
      'cross-halftone': 'halftone-cross',
      'square-halftone': 'halftone-square',
      'star-halftone': 'halftone-star'
    },
    'noise': {
      'random': 'noise-random',
      'white-noise': 'noise-white',
      'interleaved-gradient': 'noise-ign',
      'perlin': 'noise-perlin'
    },
    'pattern': {
      'checkerboard': 'pattern-checkerboard',
      'horizontal-lines': 'pattern-hlines',
      'vertical-lines': 'pattern-vlines',
      'crosshatch': 'pattern-crosshatch',
      'diagonal-lines': 'pattern-diagonal',
      'spiral': 'pattern-spiral',
      'hexagonal': 'pattern-hex',
      'brick': 'pattern-brick',
      'wave-sine': 'pattern-wave'
    },
    'threshold': {
      'simple': 'threshold-simple',
      'multi-level': 'threshold-multi'
    }
  };

  /**
   * Initialize WebGL context.
   */
  function init() {
    try {
      canvas = new OffscreenCanvas(1, 1);
      gl = canvas.getContext('webgl2', {
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true
      });

      if (!gl) {
        console.warn('WebGL2 not available, GPU dithering disabled.');
        return false;
      }

      // Set up fullscreen quad
      const vertices = new Float32Array([0,0, 1,0, 0,1, 1,1]);
      quadVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      quadVAO = gl.createVertexArray();
      gl.bindVertexArray(quadVAO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      // Create textures
      sourceTexture = createTexture();
      paletteTexture = createTexture();
      outputTexture = createTexture();

      // Create framebuffer
      framebuffer = gl.createFramebuffer();

      isAvailable = true;
      return true;
    } catch (e) {
      console.warn('WebGL init failed:', e.message);
      return false;
    }
  }

  /**
   * Create a WebGL texture with nearest filtering.
   */
  function createTexture() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /**
   * Compile and link a shader program. Results are cached.
   */
  function getProgram(shaderId) {
    if (shaderCache[shaderId]) return shaderCache[shaderId];

    const fragSource = SHADERS[shaderId];
    if (!fragSource) return null;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      console.error('Vertex shader error:', gl.getShaderInfoLog(vs));
      return null;
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fragSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error(`Fragment shader error (${shaderId}):`, gl.getShaderInfoLog(fs));
      return null;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return null;
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    shaderCache[shaderId] = program;
    return program;
  }

  /**
   * Upload source image data to GPU texture.
   */
  function uploadSource(imageData) {
    const { width, height, data } = imageData;

    if (width !== currentWidth || height !== currentHeight) {
      currentWidth = width;
      currentHeight = height;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);

      // Resize output texture
      gl.bindTexture(gl.TEXTURE_2D, outputTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /**
   * Upload palette as a 1D texture.
   */
  function uploadPalette(palette) {
    const data = new Uint8Array(palette.length * 4);
    for (let i = 0; i < palette.length; i++) {
      data[i * 4] = palette[i][0];
      data[i * 4 + 1] = palette[i][1];
      data[i * 4 + 2] = palette[i][2];
      data[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, palette.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /**
   * Read pixels back from the GPU.
   * @returns {Uint8ClampedArray}
   */
  function readPixels() {
    const pixels = new Uint8ClampedArray(currentWidth * currentHeight * 4);
    gl.readPixels(0, 0, currentWidth, currentHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // WebGL Y is flipped, so flip the rows
    const rowSize = currentWidth * 4;
    const halfHeight = currentHeight >> 1;
    const temp = new Uint8ClampedArray(rowSize);
    for (let y = 0; y < halfHeight; y++) {
      const top = y * rowSize;
      const bottom = (currentHeight - 1 - y) * rowSize;
      temp.set(pixels.subarray(top, top + rowSize));
      pixels.copyWithin(top, bottom, bottom + rowSize);
      pixels.set(temp, bottom);
    }

    return pixels;
  }

  /**
   * Run a shader program with the given uniforms.
   * Renders to the output framebuffer by default, or to screen if toScreen is true.
   */
  function runShader(shaderId, uniforms, inputTex, toScreen) {
    const program = getProgram(shaderId);
    if (!program) return false;

    if (!toScreen) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.useProgram(program);
    gl.bindVertexArray(quadVAO);

    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, inputTex || sourceTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_source'), 0);

    // Bind palette texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), 1);

    // Set common uniforms
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), currentWidth, currentHeight);

    // Set custom uniforms
    for (const [name, value] of Object.entries(uniforms || {})) {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) continue;
      if (typeof value === 'boolean') {
        gl.uniform1i(loc, value ? 1 : 0);
      } else if (typeof value === 'number') {
        if (Number.isInteger(value) && name.startsWith('u_palette')) {
          gl.uniform1i(loc, value);
        } else {
          gl.uniform1f(loc, value);
        }
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }

  /**
   * Check if a given algorithm can be GPU-accelerated.
   */
  function canAccelerate(category, algorithm) {
    if (!isAvailable) return false;
    return !!(ALGO_MAP[category] && ALGO_MAP[category][algorithm]);
  }

  /**
   * Process image data using WebGL.
   * This replaces the dither step only (step 4 in the pipeline).
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {object} params - Same params as DitherEngine.process
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }|null}
   */
  function processDither(imageData, palette, category, algorithm, options) {
    if (!isAvailable) return null;

    const shaderId = ALGO_MAP[category] && ALGO_MAP[category][algorithm];
    if (!shaderId) return null;

    uploadSource(imageData);
    uploadPalette(palette);

    const lineScale = options.lineScale || 1;
    const spread = options.spread || 1;

    const uniforms = {
      u_paletteSize: palette.length,
      u_spread: spread,
      u_lineScale: lineScale,
      u_threshold: options.threshold || 0.5
    };

    // Algorithm-specific uniforms
    if (shaderId.startsWith('halftone-')) {
      uniforms.u_cellSize = options.cellSize || 8;
      uniforms.u_angle = (options.angle || 45) * Math.PI / 180;
    }
    if (shaderId === 'noise-white') {
      uniforms.u_seed = options.seed || 12345;
    }
    if (shaderId.includes('lines') || shaderId === 'pattern-crosshatch' || shaderId === 'pattern-diagonal') {
      uniforms.u_spacing = options.lineSpacing || 4;
    }
    if (shaderId === 'pattern-spiral') {
      uniforms.u_spacing = options.spacing || 8;
      uniforms.u_tightness = options.tightness || 1;
    }
    if (shaderId === 'threshold-multi') {
      uniforms.u_levels = options.levels || 4;
    }

    const ok = runShader(shaderId, uniforms, sourceTexture, false);
    if (!ok) return null;

    // Read back to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const pixels = readPixels();

    return {
      data: pixels,
      width: imageData.width,
      height: imageData.height
    };
  }

  /**
   * Process adjustments on GPU.
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }|null}
   */
  function processAdjustments(imageData, adjustments) {
    if (!isAvailable) return null;

    uploadSource(imageData);

    const contrastVal = adjustments.contrast ?? 50;
    const midVal = adjustments.midtones ?? 50;
    const highVal = adjustments.highlights ?? 50;

    const needContrast = contrastVal !== 50;
    const needGamma = midVal !== 50;
    const needHighlights = highVal !== 50;
    const doInvert = adjustments.invert || false;

    if (!needContrast && !needGamma && !needHighlights && !doInvert) {
      return null; // No adjustments needed
    }

    const factor = needContrast
      ? Math.tan(((contrastVal / 100) * 0.98 + 0.01) * Math.PI / 2)
      : 1;
    const gamma = needGamma
      ? (midVal < 50 ? 1 + (50 - midVal) / 50 * 2 : 1 / (1 + (midVal - 50) / 50 * 2))
      : 1;
    const highlightShift = needHighlights ? (highVal - 50) / 50 : 0;

    // Dummy palette (adjustments shader doesn't use palette lookup)
    uploadPalette([[0,0,0]]);

    const uniforms = {
      u_paletteSize: 1,
      u_invert: doInvert,
      u_contrastFactor: factor,
      u_gamma: gamma,
      u_highlightShift: highlightShift,
      u_needContrast: needContrast,
      u_needGamma: needGamma,
      u_needHighlights: needHighlights
    };

    const ok = runShader('adjustments', uniforms, sourceTexture, false);
    if (!ok) return null;

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const pixels = readPixels();

    return {
      data: pixels,
      width: imageData.width,
      height: imageData.height
    };
  }

  /**
   * Check availability.
   */
  function available() {
    return isAvailable;
  }

  return {
    init,
    available,
    canAccelerate,
    processDither,
    processAdjustments
  };
})();
