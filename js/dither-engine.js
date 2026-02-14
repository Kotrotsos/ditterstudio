/**
 * Ditter - Dither Engine
 *
 * This file defines the complete API interface for all dithering algorithms.
 * Algorithm implementations are provided as stubs for the math agent to fill in.
 *
 * == ARCHITECTURE ==
 *
 * The engine processes image data as flat Uint8ClampedArray (RGBA, 4 bytes per pixel).
 * All algorithms receive:
 *   - imageData: { data: Uint8ClampedArray, width: number, height: number }
 *   - palette: number[][] (array of [r, g, b] target colors)
 *   - options: object with algorithm-specific parameters
 *
 * All algorithms return:
 *   - { data: Uint8ClampedArray, width: number, height: number }
 *
 * The engine provides helper utilities for common operations like:
 *   - Color distance calculation
 *   - Nearest color lookup in palette
 *   - Luminance conversion
 *   - Image scaling
 *
 * == FOR THE MATH AGENT ==
 *
 * Each algorithm stub is marked with a @stub tag and describes:
 *   1. What the algorithm does
 *   2. The mathematical formula / approach
 *   3. Expected parameters
 *   4. References
 *
 * Implement each function body, replacing the stub placeholder.
 * Do NOT change function signatures or the registry structure.
 */

const DitherEngine = (() => {

  // =============================================
  // UTILITY FUNCTIONS
  // =============================================

  /**
   * Calculate squared Euclidean distance between two RGB colors.
   * Used for finding nearest palette color.
   *
   * @param {number[]} c1 - [r, g, b]
   * @param {number[]} c2 - [r, g, b]
   * @returns {number} Squared distance
   */
  function colorDistanceSq(c1, c2) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return dr * dr + dg * dg + db * db;
  }

  /**
   * Find the nearest color in palette to the given color.
   *
   * @param {number[]} color - [r, g, b]
   * @param {number[][]} palette - Array of [r, g, b]
   * @returns {number[]} Nearest palette color [r, g, b]
   */
  // Cached palette lookup for nearestColor
  let _cachedPalette = null;
  let _cachedLookup = null;

  function nearestColor(color, palette) {
    // Use cached optimized lookup if palette hasn't changed
    if (palette === _cachedPalette && _cachedLookup) {
      return _cachedLookup(color);
    }
    // For small palettes, just do linear search (faster than tree overhead)
    if (palette.length <= 4) {
      let minDist = Infinity;
      let nearest = palette[0];
      for (let i = 0; i < palette.length; i++) {
        const d = colorDistanceSq(color, palette[i]);
        if (d < minDist) {
          minDist = d;
          nearest = palette[i];
        }
      }
      return nearest;
    }
    // Build and cache lookup for larger palettes
    _cachedPalette = palette;
    _cachedLookup = createPaletteLookup(palette);
    return _cachedLookup(color);
  }

  /**
   * Calculate relative luminance of an RGB color.
   * Uses standard Rec. 709 coefficients.
   *
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {number} Luminance 0-255
   */
  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  /**
   * Clamp a value between min and max.
   *
   * @param {number} val
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  /**
   * Create a copy of image data.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function copyImageData(imageData) {
    return {
      data: new Uint8ClampedArray(imageData.data),
      width: imageData.width,
      height: imageData.height
    };
  }

  // =============================================
  // PERFORMANCE: K-D TREE FOR PALETTE SEARCH
  // =============================================

  /**
   * Build a k-d tree from a palette for O(log n) nearest color lookup.
   * For small palettes (<=4), linear search is faster, so we skip the tree.
   */
  function buildKdTree(palette) {
    if (palette.length <= 4) return null;

    function buildNode(points, depth) {
      if (points.length === 0) return null;
      if (points.length === 1) return { color: points[0], left: null, right: null, axis: depth % 3 };

      const axis = depth % 3;
      points.sort((a, b) => a[axis] - b[axis]);
      const mid = points.length >> 1;

      return {
        color: points[mid],
        axis,
        left: buildNode(points.slice(0, mid), depth + 1),
        right: buildNode(points.slice(mid + 1), depth + 1)
      };
    }

    return buildNode(palette.map(c => [c[0], c[1], c[2]]), 0);
  }

  /**
   * Search the k-d tree for nearest color.
   */
  function kdTreeNearest(node, target, best, bestDist) {
    if (!node) return { best, bestDist };

    const d = colorDistanceSq(target, node.color);
    if (d < bestDist) {
      bestDist = d;
      best = node.color;
    }
    if (bestDist === 0) return { best, bestDist };

    const axis = node.axis;
    const diff = target[axis] - node.color[axis];
    const near = diff <= 0 ? node.left : node.right;
    const far = diff <= 0 ? node.right : node.left;

    const result = kdTreeNearest(near, target, best, bestDist);
    best = result.best;
    bestDist = result.bestDist;

    // Check if we need to search the far side
    if (diff * diff < bestDist) {
      const result2 = kdTreeNearest(far, target, best, bestDist);
      best = result2.best;
      bestDist = result2.bestDist;
    }

    return { best, bestDist };
  }

  /**
   * Create a fast nearest-color function for a given palette.
   * Uses k-d tree for large palettes, linear scan for small ones.
   * @param {number[][]} palette
   * @returns {function(number[]): number[]}
   */
  function createPaletteLookup(palette) {
    const tree = buildKdTree(palette);

    if (!tree) {
      // Small palette: use simple linear search (already fast)
      return function(color) {
        let minDist = Infinity;
        let nearest = palette[0];
        for (let i = 0; i < palette.length; i++) {
          const dr = color[0] - palette[i][0];
          const dg = color[1] - palette[i][1];
          const db = color[2] - palette[i][2];
          const d = dr * dr + dg * dg + db * db;
          if (d < minDist) {
            minDist = d;
            nearest = palette[i];
          }
        }
        return nearest;
      };
    }

    // Large palette: use k-d tree
    return function(color) {
      return kdTreeNearest(tree, color, tree.color, Infinity).best;
    };
  }

  // =============================================
  // PERFORMANCE: LUT FOR ADJUSTMENTS
  // =============================================

  /**
   * Build a 256-entry lookup table for adjustment pipeline.
   * Pre-computes the combined effect of contrast, midtones, highlights
   * so we only need a single table lookup per channel instead of
   * multiple floating-point operations.
   */
  function buildAdjustmentLUT(adjustments) {
    const lut = new Uint8Array(256);
    const contrastVal = adjustments.contrast ?? 50;
    const midVal = adjustments.midtones ?? 50;
    const highVal = adjustments.highlights ?? 50;

    const needContrast = contrastVal !== 50;
    const needMid = midVal !== 50;

    const factor = needContrast
      ? Math.tan(((contrastVal / 100) * 0.98 + 0.01) * Math.PI / 2)
      : 1;
    const gamma = needMid
      ? (midVal < 50 ? 1 + (50 - midVal) / 50 * 2 : 1 / (1 + (midVal - 50) / 50 * 2))
      : 1;

    for (let v = 0; v < 256; v++) {
      let val = v / 255;

      // Contrast
      if (needContrast) {
        val = (val - 0.5) * factor + 0.5;
      }

      // Midtones (gamma)
      if (needMid) {
        val = Math.max(0, Math.min(1, val));
        val = Math.pow(val, gamma);
      }

      lut[v] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }

    return lut;
  }

  // =============================================
  // PERFORMANCE: MEMORY POOL
  // =============================================

  const memoryPool = {
    buffers: [],
    get(size) {
      for (let i = 0; i < this.buffers.length; i++) {
        if (this.buffers[i].length >= size) {
          const buf = this.buffers.splice(i, 1)[0];
          if (buf.length === size) return buf;
          return new Uint8ClampedArray(buf.buffer, 0, size);
        }
      }
      return new Uint8ClampedArray(size);
    },
    release(buf) {
      if (this.buffers.length < 8) {
        this.buffers.push(buf);
      }
    }
  };

  // =============================================
  // SHARED ALGORITHM HELPERS
  // =============================================

  /**
   * Generic error diffusion engine.
   * All error diffusion algorithms use this with their specific kernel.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number[][]} palette
   * @param {{ dx: number, dy: number, w: number }[]} kernel - Diffusion offsets and weights
   * @param {number} divisor - Sum of kernel weights
   * @param {boolean} serpentine - Alternate scan direction per row
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function errorDiffuse(imageData, palette, kernel, divisor, serpentine, lookup) {
    const { width, height } = imageData;
    const data = new Uint8ClampedArray(imageData.data);
    const findNearest = lookup || createPaletteLookup(palette);
    // Use float buffer for error accumulation
    const buf = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      buf[j] = data[i];
      buf[j + 1] = data[i + 1];
      buf[j + 2] = data[i + 2];
    }

    // Pre-compute kernel weights divided by divisor
    const kLen = kernel.length;
    const kWeights = new Float32Array(kLen);
    for (let k = 0; k < kLen; k++) {
      kWeights[k] = kernel[k].w / divisor;
    }
    // Temp array to avoid GC
    const colorTmp = [0, 0, 0];

    for (let y = 0; y < height; y++) {
      const leftToRight = !serpentine || (y & 1) === 0;
      const xStart = leftToRight ? 0 : width - 1;
      const xEnd = leftToRight ? width : -1;
      const xStep = leftToRight ? 1 : -1;

      for (let x = xStart; x !== xEnd; x += xStep) {
        const bi = (y * width + x) * 3;
        const oldR = buf[bi];
        const oldG = buf[bi + 1];
        const oldB = buf[bi + 2];

        colorTmp[0] = oldR; colorTmp[1] = oldG; colorTmp[2] = oldB;
        const nc = findNearest(colorTmp);
        const pi = (y * width + x) * 4;
        data[pi] = nc[0];
        data[pi + 1] = nc[1];
        data[pi + 2] = nc[2];

        const errR = oldR - nc[0];
        const errG = oldG - nc[1];
        const errB = oldB - nc[2];

        for (let k = 0; k < kLen; k++) {
          const dx = leftToRight ? kernel[k].dx : -kernel[k].dx;
          const dy = kernel[k].dy;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const w = kWeights[k];
            const ni = (ny * width + nx) * 3;
            buf[ni] += errR * w;
            buf[ni + 1] += errG * w;
            buf[ni + 2] += errB * w;
          }
        }
      }
    }

    return { data, width, height };
  }

  /**
   * Generic ordered dither using a threshold matrix.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number[][]} palette
   * @param {number[][]} matrix - 2D threshold matrix (integer values)
   * @param {number} matSize - Width/height of the matrix
   * @param {number} maxVal - Maximum value in the matrix + 1 (typically matSize * matSize)
   * @param {number} spread - How much the threshold pattern influences output
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function orderedDither(imageData, palette, matrix, matSize, maxVal, spread, lookup) {
    const { width, height } = imageData;
    const data = new Uint8ClampedArray(imageData.data);
    const findNearest = lookup || createPaletteLookup(palette);
    const colorTmp = [0, 0, 0];

    // Pre-compute threshold values for the matrix
    const thresholdLut = new Float32Array(matSize * matSize);
    for (let my = 0; my < matSize; my++) {
      for (let mx = 0; mx < matSize; mx++) {
        thresholdLut[my * matSize + mx] = ((matrix[my][mx] + 0.5) / maxVal - 0.5) * spread * 255;
      }
    }

    for (let y = 0; y < height; y++) {
      const matRow = y % matSize;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const threshold = thresholdLut[matRow * matSize + (x % matSize)];
        colorTmp[0] = clamp(Math.round(data[i] + threshold), 0, 255);
        colorTmp[1] = clamp(Math.round(data[i + 1] + threshold), 0, 255);
        colorTmp[2] = clamp(Math.round(data[i + 2] + threshold), 0, 255);
        const nc = findNearest(colorTmp);
        data[i] = nc[0];
        data[i + 1] = nc[1];
        data[i + 2] = nc[2];
      }
    }

    return { data, width, height };
  }

  /**
   * Generate a Bayer matrix of given order (size = 2^order).
   * @param {number} order
   * @returns {number[][]}
   */
  function generateBayerMatrix(order) {
    if (order === 0) return [[0]];
    const smaller = generateBayerMatrix(order - 1);
    const size = smaller.length;
    const result = [];
    for (let y = 0; y < size * 2; y++) {
      result[y] = new Array(size * 2);
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = smaller[y][x];
        result[y][x] = 4 * v;
        result[y][x + size] = 4 * v + 2;
        result[y + size][x] = 4 * v + 3;
        result[y + size][x + size] = 4 * v + 1;
      }
    }
    return result;
  }

  /**
   * Seeded PRNG (mulberry32).
   * @param {number} seed
   * @returns {function(): number} Returns 0..1
   */
  function mulberry32(seed) {
    return function() {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Get pixel color at (x, y).
   *
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} x
   * @param {number} y
   * @returns {number[]} [r, g, b, a]
   */
  function getPixel(data, width, x, y) {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  /**
   * Set pixel color at (x, y).
   *
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} x
   * @param {number} y
   * @param {number[]} color - [r, g, b] or [r, g, b, a]
   */
  function setPixel(data, width, x, y, color) {
    const i = (y * width + x) * 4;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    if (color.length > 3) {
      data[i + 3] = color[3];
    }
  }

  /**
   * Apply pre-processing adjustments to image data.
   * This runs BEFORE the dither algorithm.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {object} adjustments
   * @param {number} adjustments.contrast - 0-100 (50 = no change)
   * @param {number} adjustments.midtones - 0-100 (50 = no change)
   * @param {number} adjustments.highlights - 0-100 (50 = no change)
   * @param {number} adjustments.blur - 0-10
   * @param {boolean} adjustments.invert
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function applyAdjustments(imageData, adjustments) {
    const result = copyImageData(imageData);
    const data = result.data;
    const len = data.length;
    const doInvert = adjustments.invert;
    const contrastVal = adjustments.contrast ?? 50;
    const midVal = adjustments.midtones ?? 50;
    const highVal = adjustments.highlights ?? 50;

    const needLut = contrastVal !== 50 || midVal !== 50;
    const needHighlights = highVal !== 50;

    // Fast path: use LUT for contrast + midtones (single pass instead of two)
    if (needLut || doInvert) {
      const lut = needLut ? buildAdjustmentLUT(adjustments) : null;
      const highlightShift = needHighlights ? (highVal - 50) / 50 : 0;

      for (let i = 0; i < len; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];

        // Invert
        if (doInvert) { r = 255 - r; g = 255 - g; b = 255 - b; }

        // Contrast + Midtones via LUT
        if (lut) { r = lut[r]; g = lut[g]; b = lut[b]; }

        // Highlights (needs per-pixel luminance check)
        if (needHighlights) {
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (lum > 0.5) {
            const amount = (lum - 0.5) * 2 * highlightShift * 60;
            r = clamp(Math.round(r + amount), 0, 255);
            g = clamp(Math.round(g + amount), 0, 255);
            b = clamp(Math.round(b + amount), 0, 255);
          }
        }

        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    } else if (needHighlights) {
      // Only highlights, no LUT needed
      const highlightShift = (highVal - 50) / 50;
      for (let i = 0; i < len; i += 4) {
        const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        if (lum > 0.5) {
          const amount = (lum - 0.5) * 2 * highlightShift * 60;
          data[i] = clamp(Math.round(data[i] + amount), 0, 255);
          data[i + 1] = clamp(Math.round(data[i + 1] + amount), 0, 255);
          data[i + 2] = clamp(Math.round(data[i + 2] + amount), 0, 255);
        }
      }
    }

    return result;
  }

  /**
   * Apply fast separable box blur to image data.
   * Uses horizontal then vertical pass for O(w*h) performance regardless of radius.
   * Multiple passes approximate a Gaussian blur.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number} radius - Blur radius (0 = no blur)
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function applyBlur(imageData, radius) {
    if (radius <= 0) return imageData;

    const { width, height } = imageData;
    let src = new Uint8ClampedArray(imageData.data);
    let dst = new Uint8ClampedArray(src.length);
    const r = Math.max(1, Math.round(radius));
    const passes = 3; // 3-pass box blur approximates Gaussian

    for (let pass = 0; pass < passes; pass++) {
      const passRadius = Math.max(1, Math.round(r / passes + (pass === 0 ? 1 : 0)));

      // Horizontal pass
      for (let y = 0; y < height; y++) {
        let sumR = 0, sumG = 0, sumB = 0;
        const rowStart = y * width * 4;

        // Initialize window for first pixel
        for (let dx = 0; dx <= passRadius; dx++) {
          const px = Math.min(dx, width - 1);
          const i = rowStart + px * 4;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
        }
        // Add left padding (mirror)
        for (let dx = 1; dx <= passRadius; dx++) {
          const px = Math.min(dx, width - 1);
          const i = rowStart + px * 4;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
        }

        const windowSize = passRadius * 2 + 1;

        for (let x = 0; x < width; x++) {
          const i = rowStart + x * 4;
          dst[i] = Math.round(sumR / windowSize);
          dst[i + 1] = Math.round(sumG / windowSize);
          dst[i + 2] = Math.round(sumB / windowSize);
          dst[i + 3] = src[i + 3];

          // Slide window: remove left, add right
          const removeX = Math.max(0, Math.min(x - passRadius, width - 1));
          const addX = Math.max(0, Math.min(x + passRadius + 1, width - 1));
          const ri = rowStart + removeX * 4;
          const ai = rowStart + addX * 4;
          sumR += src[ai] - src[ri];
          sumG += src[ai + 1] - src[ri + 1];
          sumB += src[ai + 2] - src[ri + 2];
        }
      }

      // Swap for vertical pass
      const temp = src;
      src = dst;
      dst = temp;

      // Vertical pass
      for (let x = 0; x < width; x++) {
        let sumR = 0, sumG = 0, sumB = 0;

        // Initialize window for first pixel
        for (let dy = 0; dy <= passRadius; dy++) {
          const py = Math.min(dy, height - 1);
          const i = (py * width + x) * 4;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
        }
        for (let dy = 1; dy <= passRadius; dy++) {
          const py = Math.min(dy, height - 1);
          const i = (py * width + x) * 4;
          sumR += src[i];
          sumG += src[i + 1];
          sumB += src[i + 2];
        }

        const windowSize = passRadius * 2 + 1;

        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          dst[i] = Math.round(sumR / windowSize);
          dst[i + 1] = Math.round(sumG / windowSize);
          dst[i + 2] = Math.round(sumB / windowSize);
          dst[i + 3] = src[i + 3];

          const removeY = Math.max(0, Math.min(y - passRadius, height - 1));
          const addY = Math.max(0, Math.min(y + passRadius + 1, height - 1));
          const ri = (removeY * width + x) * 4;
          const ai = (addY * width + x) * 4;
          sumR += src[ai] - src[ri];
          sumG += src[ai + 1] - src[ri + 1];
          sumB += src[ai + 2] - src[ri + 2];
        }
      }

      // Swap back for next pass
      const temp2 = src;
      src = dst;
      dst = temp2;
    }

    return { data: src, width, height };
  }

  /**
   * Downscale image by a factor, then upscale back (pixelation effect).
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number} scale - Scale factor (1 = no change)
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function applyScale(imageData, scale) {
    if (scale <= 1) return imageData;

    const { data, width, height } = imageData;
    const sw = Math.max(1, Math.floor(width / scale));
    const sh = Math.max(1, Math.floor(height / scale));

    // Downscale
    const small = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const sx = Math.floor(x * scale);
        const sy = Math.floor(y * scale);
        const si = (sy * width + sx) * 4;
        const di = (y * sw + x) * 4;
        small[di] = data[si];
        small[di + 1] = data[si + 1];
        small[di + 2] = data[si + 2];
        small[di + 3] = data[si + 3];
      }
    }

    return { data: small, width: sw, height: sh };
  }

  /**
   * Upscale image back to original dimensions using nearest-neighbor.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number} targetWidth
   * @param {number} targetHeight
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function upscaleNearest(imageData, targetWidth, targetHeight) {
    const { data, width, height } = imageData;
    if (width === targetWidth && height === targetHeight) return imageData;

    const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const xRatio = width / targetWidth;
    const yRatio = height / targetHeight;

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const sx = Math.floor(x * xRatio);
        const sy = Math.floor(y * yRatio);
        const si = (sy * width + sx) * 4;
        const di = (y * targetWidth + x) * 4;
        result[di] = data[si];
        result[di + 1] = data[si + 1];
        result[di + 2] = data[si + 2];
        result[di + 3] = data[si + 3];
      }
    }

    return { data: result, width: targetWidth, height: targetHeight };
  }


  // =============================================
  // ALGORITHM REGISTRY
  // =============================================

  /**
   * Algorithm categories and their algorithms.
   * Each algorithm has:
   *   - name: Display name
   *   - fn: The dither function
   *   - description: What it does
   *   - params: Additional parameters it supports (beyond the standard ones)
   */
  const algorithms = {

    // -----------------------------------------
    // ERROR DIFFUSION
    // -----------------------------------------
    'error-diffusion': {

      'floyd-steinberg': {
        name: 'Floyd-Steinberg',
        description: 'Classic error diffusion. Distributes quantization error to neighboring pixels using a 2x3 matrix.',
        /**
         * @stub MATH AGENT: Implement Floyd-Steinberg error diffusion
         *
         * Matrix (pixel marked with *):
         *       * 7/16
         * 3/16 5/16 1/16
         *
         * For each pixel left-to-right, top-to-bottom:
         *   1. Find nearest palette color
         *   2. Calculate error = old_pixel - new_pixel (per channel)
         *   3. Distribute error to neighbors using the matrix weights
         *
         * Serpentine scanning (alternating L-R and R-L per row) reduces artifacts.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette - Array of [r,g,b]
         * @param {object} options
         * @param {boolean} [options.serpentine=true] - Use serpentine scanning
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 7 },
            { dx: -1, dy: 1, w: 3 },
            { dx: 0, dy: 1, w: 5 },
            { dx: 1, dy: 1, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 16, serpentine, options._paletteLookup);
        }
      },

      'jarvis-judice-ninke': {
        name: 'Jarvis-Judice-Ninke',
        description: 'Wider error diffusion using a 3x5 matrix. Smoother than Floyd-Steinberg but slower.',
        /**
         * @stub MATH AGENT: Implement Jarvis-Judice-Ninke error diffusion
         *
         * Matrix (divide by 48):
         *         *  7  5
         *  3  5  7  5  3
         *  1  3  5  3  1
         *
         * Same scanning approach as Floyd-Steinberg but with wider error spread.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 7 }, { dx: 2, dy: 0, w: 5 },
            { dx: -2, dy: 1, w: 3 }, { dx: -1, dy: 1, w: 5 }, { dx: 0, dy: 1, w: 7 }, { dx: 1, dy: 1, w: 5 }, { dx: 2, dy: 1, w: 3 },
            { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 3 }, { dx: 0, dy: 2, w: 5 }, { dx: 1, dy: 2, w: 3 }, { dx: 2, dy: 2, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 48, serpentine, options._paletteLookup);
        }
      },

      'stucki': {
        name: 'Stucki',
        description: 'Similar to Jarvis but with different weights. Good balance of speed and quality.',
        /**
         * @stub MATH AGENT: Implement Stucki error diffusion
         *
         * Matrix (divide by 42):
         *         *  8  4
         *  2  4  8  4  2
         *  1  2  4  2  1
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
            { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
            { dx: -2, dy: 2, w: 1 }, { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 4 }, { dx: 1, dy: 2, w: 2 }, { dx: 2, dy: 2, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 42, serpentine, options._paletteLookup);
        }
      },

      'burkes': {
        name: 'Burkes',
        description: 'Simplified Stucki. Only diffuses to 2 rows. Faster with similar quality.',
        /**
         * @stub MATH AGENT: Implement Burkes error diffusion
         *
         * Matrix (divide by 32):
         *         *  8  4
         *  2  4  8  4  2
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 8 }, { dx: 2, dy: 0, w: 4 },
            { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 8 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 }
          ];
          return errorDiffuse(imageData, palette, kernel, 32, serpentine, options._paletteLookup);
        }
      },

      'sierra': {
        name: 'Sierra (Full)',
        description: 'Sierra full filter. 3-row error diffusion.',
        /**
         * @stub MATH AGENT: Implement Sierra (full) error diffusion
         *
         * Matrix (divide by 32):
         *         *  5  3
         *  2  4  5  4  2
         *  0  2  3  2  0
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 5 }, { dx: 2, dy: 0, w: 3 },
            { dx: -2, dy: 1, w: 2 }, { dx: -1, dy: 1, w: 4 }, { dx: 0, dy: 1, w: 5 }, { dx: 1, dy: 1, w: 4 }, { dx: 2, dy: 1, w: 2 },
            { dx: -1, dy: 2, w: 2 }, { dx: 0, dy: 2, w: 3 }, { dx: 1, dy: 2, w: 2 }
          ];
          return errorDiffuse(imageData, palette, kernel, 32, serpentine, options._paletteLookup);
        }
      },

      'sierra-two-row': {
        name: 'Sierra Two-Row',
        description: 'Sierra lite, 2-row variant. Faster than full Sierra.',
        /**
         * @stub MATH AGENT: Implement Sierra Two-Row error diffusion
         *
         * Matrix (divide by 16):
         *         *  4  3
         *  1  2  3  2  1
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 4 }, { dx: 2, dy: 0, w: 3 },
            { dx: -2, dy: 1, w: 1 }, { dx: -1, dy: 1, w: 2 }, { dx: 0, dy: 1, w: 3 }, { dx: 1, dy: 1, w: 2 }, { dx: 2, dy: 1, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 16, serpentine, options._paletteLookup);
        }
      },

      'sierra-lite': {
        name: 'Sierra Lite',
        description: 'Minimal Sierra variant. Very fast, lightweight dithering.',
        /**
         * @stub MATH AGENT: Implement Sierra Lite error diffusion
         *
         * Matrix (divide by 4):
         *    * 2
         *  1 1
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          const kernel = [
            { dx: 1, dy: 0, w: 2 },
            { dx: -1, dy: 1, w: 1 }, { dx: 0, dy: 1, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 4, serpentine, options._paletteLookup);
        }
      },

      'atkinson': {
        name: 'Atkinson',
        description: 'Used in early Macintosh. Diffuses only 6/8 of error, creating higher contrast.',
        /**
         * @stub MATH AGENT: Implement Atkinson error diffusion
         *
         * Matrix (each weight is 1/8, total = 6/8, 2/8 is lost):
         *      *  1  1
         *  1   1  1
         *      1
         *
         * The intentional loss of 2/8 error creates a more contrasty result.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {boolean} [options.serpentine=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const serpentine = options.serpentine !== false;
          // Atkinson: each weight = 1/8, only 6 entries = 6/8 distributed (75%)
          const kernel = [
            { dx: 1, dy: 0, w: 1 }, { dx: 2, dy: 0, w: 1 },
            { dx: -1, dy: 1, w: 1 }, { dx: 0, dy: 1, w: 1 }, { dx: 1, dy: 1, w: 1 },
            { dx: 0, dy: 2, w: 1 }
          ];
          return errorDiffuse(imageData, palette, kernel, 8, serpentine, options._paletteLookup);
        }
      },

      'stevenson-arce': {
        name: 'Stevenson-Arce',
        description: 'Hexagonal grid error diffusion. Works on a shifted grid for more uniform results.',
        /**
         * @stub MATH AGENT: Implement Stevenson-Arce error diffusion
         *
         * Uses a hexagonal-offset error diffusion matrix (divide by 200):
         *              *      32
         *  12    26   30   16
         *      12    26    12
         *
         * Processes every other pixel in a hex pattern.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          // Stevenson-Arce uses a wider kernel with divisor 200
          const kernel = [
            { dx: 2, dy: 0, w: 32 },
            { dx: -3, dy: 1, w: 12 }, { dx: -1, dy: 1, w: 26 }, { dx: 1, dy: 1, w: 30 }, { dx: 3, dy: 1, w: 16 },
            { dx: -2, dy: 2, w: 12 }, { dx: 0, dy: 2, w: 26 }, { dx: 2, dy: 2, w: 12 }
          ];
          return errorDiffuse(imageData, palette, kernel, 200, false, options._paletteLookup);
        }
      }
    },

    // -----------------------------------------
    // ORDERED DITHERING
    // -----------------------------------------
    'ordered': {

      'bayer-2x2': {
        name: 'Bayer 2x2',
        description: 'Ordered dithering with a 2x2 Bayer matrix.',
        /**
         * @stub MATH AGENT: Implement Bayer 2x2 ordered dithering
         *
         * Bayer matrix B2:
         *  0 2
         *  3 1
         * Normalized: divide by 4, subtract 0.5 to center around 0
         *
         * For each pixel:
         *   threshold = (B[x % n][y % n] / n^2 - 0.5) * scale
         *   adjusted_pixel = pixel + threshold * spread
         *   output = nearestColor(adjusted_pixel, palette)
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1] - How much to spread the threshold pattern
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const matrix = [[0, 2], [3, 1]];
          return orderedDither(imageData, palette, matrix, 2, 4, spread, options._paletteLookup);
        }
      },

      'bayer-4x4': {
        name: 'Bayer 4x4',
        description: 'Ordered dithering with a 4x4 Bayer matrix. Classic retro look.',
        /**
         * @stub MATH AGENT: Implement Bayer 4x4 ordered dithering
         *
         * Bayer matrix B4 (generated recursively from B2):
         *   0  8  2 10
         *  12  4 14  6
         *   3 11  1  9
         *  15  7 13  5
         *
         * Same approach as 2x2 but with 4x4 matrix.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const matrix = generateBayerMatrix(2);
          return orderedDither(imageData, palette, matrix, 4, 16, spread, options._paletteLookup);
        }
      },

      'bayer-8x8': {
        name: 'Bayer 8x8',
        description: 'Ordered dithering with an 8x8 Bayer matrix. Smoother gradients.',
        /**
         * @stub MATH AGENT: Implement Bayer 8x8 ordered dithering
         *
         * 8x8 Bayer matrix generated recursively. 64 threshold levels.
         * Formula for Bayer matrix generation:
         *   B(2n) = [[4*B(n), 4*B(n)+2*U(n)], [4*B(n)+3*U(n), 4*B(n)+U(n)]]
         * where U(n) is the n x n unit matrix filled with 1s.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const matrix = generateBayerMatrix(3);
          return orderedDither(imageData, palette, matrix, 8, 64, spread, options._paletteLookup);
        }
      },

      'bayer-16x16': {
        name: 'Bayer 16x16',
        description: 'Ordered dithering with a 16x16 Bayer matrix. Very smooth.',
        /**
         * @stub MATH AGENT: Implement 16x16 Bayer ordered dithering
         * Same recursive generation as 8x8, one more level.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const matrix = generateBayerMatrix(4);
          return orderedDither(imageData, palette, matrix, 16, 256, spread, options._paletteLookup);
        }
      },

      'clustered-dot-4x4': {
        name: 'Clustered Dot 4x4',
        description: 'Clustered-dot ordered dithering. Creates dot-like patterns.',
        /**
         * @stub MATH AGENT: Implement clustered dot ordered dithering
         *
         * Uses a clustered-dot threshold matrix instead of dispersed Bayer:
         *  12  5  6 13
         *   4  0  1  7
         *  11  3  2  8
         *  15 10  9 14
         *
         * This creates a halftone-like clustered dot pattern.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const matrix = [
            [12, 5, 6, 13],
            [4, 0, 1, 7],
            [11, 3, 2, 8],
            [15, 10, 9, 14]
          ];
          return orderedDither(imageData, palette, matrix, 4, 16, spread, options._paletteLookup);
        }
      },

      'clustered-dot-8x8': {
        name: 'Clustered Dot 8x8',
        description: 'Larger clustered-dot pattern. More halftone-like.',
        /**
         * @stub MATH AGENT: Implement 8x8 clustered dot dithering
         * Larger clustered-dot threshold map for smoother halftone effect.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spread=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          // 8x8 clustered dot matrix (radial distance from center)
          const size = 8;
          const center = (size - 1) / 2;
          const entries = [];
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const dx = x - center;
              const dy = y - center;
              entries.push({ x, y, dist: Math.sqrt(dx * dx + dy * dy) });
            }
          }
          entries.sort((a, b) => a.dist - b.dist);
          const matrix = [];
          for (let y = 0; y < size; y++) matrix[y] = new Array(size);
          for (let i = 0; i < entries.length; i++) {
            matrix[entries[i].y][entries[i].x] = i;
          }
          return orderedDither(imageData, palette, matrix, size, size * size, spread, options._paletteLookup);
        }
      }
    },

    // -----------------------------------------
    // HALFTONE
    // -----------------------------------------
    'halftone': {

      'dot-halftone': {
        name: 'Dot Halftone',
        description: 'Classic circular dot halftone pattern, like newspaper printing.',
        /**
         * @stub MATH AGENT: Implement dot halftone
         *
         * Divide image into cells of size cellSize x cellSize.
         * For each cell:
         *   1. Calculate average luminance
         *   2. Draw a circle with radius proportional to darkness
         *      radius = (1 - luminance/255) * cellSize/2
         *   3. Pixels inside circle get dark palette color, outside get light
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.cellSize=8] - Halftone cell size in pixels
         * @param {number} [options.angle=45] - Rotation angle in degrees
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const cellSize = options.cellSize ?? 8;
          const angle = (options.angle ?? 45) * Math.PI / 180;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          // Sort palette by luminance to find darkest and lightest
          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              // Rotate coordinates for angled halftone
              const rx = x * cosA - y * sinA;
              const ry = x * sinA + y * cosA;

              // Cell coordinates
              const cx = ((rx % cellSize) + cellSize) % cellSize - cellSize / 2;
              const cy = ((ry % cellSize) + cellSize) % cellSize - cellSize / 2;
              const dist = Math.sqrt(cx * cx + cy * cy);
              const maxRadius = cellSize / 2;

              // Get source pixel luminance
              const si = (y * width + x) * 4;
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;

              // Radius proportional to darkness
              const radius = (1 - lum) * maxRadius;
              const color = dist <= radius ? darkColor : lightColor;
              data[si] = color[0];
              data[si + 1] = color[1];
              data[si + 2] = color[2];
              data[si + 3] = src[si + 3];
            }
          }
          return { data, width, height };
        }
      },

      'line-halftone': {
        name: 'Line Halftone',
        description: 'Halftone using horizontal lines of varying thickness.',
        /**
         * @stub MATH AGENT: Implement line halftone
         *
         * Divide image into horizontal strips of height lineSpacing.
         * For each strip:
         *   Line thickness = proportional to average darkness of that strip
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=6]
         * @param {number} [options.angle=0]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const lineSpacing = options.lineSpacing ?? 6;
          const angle = (options.angle ?? 0) * Math.PI / 180;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              // Rotate for angled lines
              const ry = x * sinA + y * cosA;

              // Position within line cell (0..1)
              const posInCell = ((ry % lineSpacing) + lineSpacing) % lineSpacing;
              const center = lineSpacing / 2;
              const distFromCenter = Math.abs(posInCell - center) / center; // 0 at center, 1 at edge

              const si = (y * width + x) * 4;
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;

              // Line thickness proportional to darkness
              const thickness = 1 - lum; // 0 = no line (white), 1 = full line (black)
              const color = distFromCenter <= thickness ? darkColor : lightColor;
              data[si] = color[0];
              data[si + 1] = color[1];
              data[si + 2] = color[2];
              data[si + 3] = src[si + 3];
            }
          }
          return { data, width, height };
        }
      },

      'diamond-halftone': {
        name: 'Diamond Halftone',
        description: 'Halftone using diamond shapes instead of circles.',
        /**
         * @stub MATH AGENT: Implement diamond halftone
         *
         * Same as dot halftone but using diamond shapes (Manhattan distance).
         * dist = |dx| + |dy| instead of sqrt(dx^2 + dy^2)
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.cellSize=8]
         * @param {number} [options.angle=45]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const cellSize = options.cellSize ?? 8;
          const angle = (options.angle ?? 45) * Math.PI / 180;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const rx = x * cosA - y * sinA;
              const ry = x * sinA + y * cosA;

              const cx = ((rx % cellSize) + cellSize) % cellSize - cellSize / 2;
              const cy = ((ry % cellSize) + cellSize) % cellSize - cellSize / 2;
              // Manhattan distance for diamond shape
              const dist = (Math.abs(cx) + Math.abs(cy)) / (cellSize / 2);

              const si = (y * width + x) * 4;
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;
              const radius = 1 - lum;
              const color = dist <= radius ? darkColor : lightColor;
              data[si] = color[0];
              data[si + 1] = color[1];
              data[si + 2] = color[2];
              data[si + 3] = src[si + 3];
            }
          }
          return { data, width, height };
        }
      },

      'cross-halftone': {
        name: 'Cross Halftone',
        description: 'Halftone using plus/cross shapes.',
        /**
         * @stub MATH AGENT: Implement cross halftone
         *
         * Draw cross shapes (+) in each cell.
         * Cross arm length proportional to darkness.
         * dist = min(|dx|, |dy|) for cross shape.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.cellSize=8]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const cellSize = options.cellSize ?? 8;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const cx = ((x % cellSize) + cellSize) % cellSize - cellSize / 2;
              const cy = ((y % cellSize) + cellSize) % cellSize - cellSize / 2;
              // Cross shape: min of |dx| and |dy| gives cross pattern
              const dist = Math.min(Math.abs(cx), Math.abs(cy)) / (cellSize / 2);

              const si = (y * width + x) * 4;
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;
              const thickness = 1 - lum;
              const color = dist <= thickness ? darkColor : lightColor;
              data[si] = color[0];
              data[si + 1] = color[1];
              data[si + 2] = color[2];
              data[si + 3] = src[si + 3];
            }
          }
          return { data, width, height };
        }
      },

      'ellipse-halftone': {
        name: 'Ellipse Halftone',
        description: 'Halftone using elliptical dots for a more print-like look.',
        /**
         * @stub MATH AGENT: Implement ellipse halftone
         *
         * Same as dot halftone but with elongated ellipses.
         * Uses anisotropic distance function.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.cellSize=8]
         * @param {number} [options.angle=45]
         * @param {number} [options.elongation=2] - Ellipse aspect ratio
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const cellSize = options.cellSize ?? 8;
          const angle = (options.angle ?? 45) * Math.PI / 180;
          const elongation = options.elongation ?? 2;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const rx = x * cosA - y * sinA;
              const ry = x * sinA + y * cosA;

              const cx = ((rx % cellSize) + cellSize) % cellSize - cellSize / 2;
              const cy = ((ry % cellSize) + cellSize) % cellSize - cellSize / 2;
              // Elliptical distance: stretch one axis
              const dist = Math.sqrt((cx * cx) / (elongation * elongation) + cy * cy) / (cellSize / 2);

              const si = (y * width + x) * 4;
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;
              const radius = 1 - lum;
              const color = dist <= radius ? darkColor : lightColor;
              data[si] = color[0];
              data[si + 1] = color[1];
              data[si + 2] = color[2];
              data[si + 3] = src[si + 3];
            }
          }
          return { data, width, height };
        }
      }
    },

    // -----------------------------------------
    // NOISE / STOCHASTIC
    // -----------------------------------------
    'noise': {

      'random': {
        name: 'Random Noise',
        description: 'Simple random threshold dithering. Fast but noisy.',
        /**
         * @stub MATH AGENT: Implement random noise dithering
         *
         * For each pixel:
         *   threshold = random() * 255
         *   if luminance > threshold: light palette color, else dark
         *
         * For multi-color palettes, add random noise to each channel
         * and find nearest palette color.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.amount=1.0] - Noise intensity 0-1
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const amount = options.amount ?? 1.0;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const noise = (Math.random() - 0.5) * 2 * amount * 128;
              const r = clamp(Math.round(data[i] + noise), 0, 255);
              const g = clamp(Math.round(data[i + 1] + noise), 0, 255);
              const b = clamp(Math.round(data[i + 2] + noise), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'blue-noise': {
        name: 'Blue Noise',
        description: 'Void-and-cluster blue noise dithering. Visually pleasing, no obvious pattern.',
        /**
         * @stub MATH AGENT: Implement blue noise dithering
         *
         * Uses a pre-computed blue noise texture (void-and-cluster method).
         * Blue noise has energy concentrated at high frequencies,
         * creating a visually uniform random pattern.
         *
         * Generate a 64x64 blue noise texture using void-and-cluster:
         *   1. Start with random initial binary pattern
         *   2. Iteratively move pixels from tightest cluster to largest void
         *   3. Rank pixels to create threshold map
         *
         * Then apply as ordered dither with this texture.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          // Generate a 64x64 blue noise texture using void-and-cluster approximation
          const texSize = 64;
          const tex = [];
          const rng = mulberry32(42);

          // Phase 1: Create initial binary pattern with ~10% density
          const totalPixels = texSize * texSize;
          const initialOnes = Math.floor(totalPixels * 0.1);
          const binary = new Uint8Array(totalPixels);
          let placed = 0;
          while (placed < initialOnes) {
            const pos = Math.floor(rng() * totalPixels);
            if (!binary[pos]) { binary[pos] = 1; placed++; }
          }

          // Phase 2: Gaussian energy for toroidal wrapping
          const sigma = 1.5;
          const filterRadius = Math.ceil(sigma * 3);
          function energy(binArr, px, py) {
            let e = 0;
            for (let dy = -filterRadius; dy <= filterRadius; dy++) {
              for (let dx = -filterRadius; dx <= filterRadius; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = ((px + dx) % texSize + texSize) % texSize;
                const ny = ((py + dy) % texSize + texSize) % texSize;
                if (binArr[ny * texSize + nx]) {
                  e += Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
                }
              }
            }
            return e;
          }

          // Phase 3: Rank all pixels. Remove from tightest cluster, rank descending.
          // Then insert into largest void, rank ascending.
          const rank = new Float32Array(totalPixels);
          const binaryCopy = new Uint8Array(binary);
          let currentRank = initialOnes - 1;

          // Remove phase: remove from tightest cluster
          for (let rem = 0; rem < initialOnes; rem++) {
            let maxE = -Infinity, maxIdx = -1;
            for (let idx = 0; idx < totalPixels; idx++) {
              if (!binaryCopy[idx]) continue;
              const e = energy(binaryCopy, idx % texSize, Math.floor(idx / texSize));
              if (e > maxE) { maxE = e; maxIdx = idx; }
            }
            binaryCopy[maxIdx] = 0;
            rank[maxIdx] = currentRank--;
          }

          // Insert phase: insert into largest void
          const binaryInsert = new Uint8Array(binary);
          currentRank = initialOnes;
          for (let ins = initialOnes; ins < totalPixels; ins++) {
            let minE = Infinity, minIdx = -1;
            for (let idx = 0; idx < totalPixels; idx++) {
              if (binaryInsert[idx]) continue;
              const e = energy(binaryInsert, idx % texSize, Math.floor(idx / texSize));
              if (e < minE) { minE = e; minIdx = idx; }
            }
            binaryInsert[minIdx] = 1;
            rank[minIdx] = currentRank++;
          }

          // Build 2D matrix
          for (let y = 0; y < texSize; y++) {
            tex[y] = new Array(texSize);
            for (let x = 0; x < texSize; x++) {
              tex[y][x] = rank[y * texSize + x];
            }
          }

          return orderedDither(imageData, palette, tex, texSize, totalPixels, spread, options._paletteLookup);
        }
      },

      'white-noise': {
        name: 'White Noise',
        description: 'White noise dithering with deterministic seed. Reproducible random pattern.',
        /**
         * @stub MATH AGENT: Implement white noise dithering
         *
         * Like random but uses a seeded PRNG for reproducibility.
         * Use a simple PRNG like xorshift32.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.seed=12345]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const seed = options.seed ?? 12345;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);
          const rng = mulberry32(seed);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const threshold = (rng() - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'interleaved-gradient': {
        name: 'Interleaved Gradient Noise',
        description: 'Jorge Jimenez IGN. Low-discrepancy noise that looks great for dithering.',
        /**
         * @stub MATH AGENT: Implement interleaved gradient noise dithering
         *
         * IGN formula:
         *   noise(x, y) = fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y))
         *
         * Use as threshold for ordered-style dithering.
         * Reference: Jorge Jimenez, "Next Generation Post Processing in Call of Duty"
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          function fract(x) { return x - Math.floor(x); }

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              // IGN formula
              const noise = fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y));
              const threshold = (noise - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      }
    },

    // -----------------------------------------
    // PATTERN
    // -----------------------------------------
    'pattern': {

      'checkerboard': {
        name: 'Checkerboard',
        description: 'Simple 2x2 checkerboard pattern dithering.',
        /**
         * @stub MATH AGENT: Implement checkerboard pattern dithering
         *
         * Simple alternating pattern:
         *   if (x + y) % 2 == 0: apply threshold bias up
         *   else: apply threshold bias down
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const bias = ((x + y) & 1) === 0 ? 0.25 : 0.75;
              const threshold = (bias - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'horizontal-lines': {
        name: 'Horizontal Lines',
        description: 'Dithering with horizontal line patterns of varying density.',
        /**
         * @stub MATH AGENT: Implement horizontal line pattern dithering
         *
         * For each pixel:
         *   threshold = y % lineSpacing < lineThickness ? dark : light
         *   Modulate lineThickness by pixel luminance
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=4]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spacing = options.lineSpacing ?? 4;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              // Triangle wave based on y position
              const t = (y % spacing) / spacing;
              const bias = Math.abs(t * 2.0 - 1.0);
              const threshold = (bias - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'vertical-lines': {
        name: 'Vertical Lines',
        description: 'Dithering with vertical line patterns.',
        /**
         * @stub MATH AGENT: Implement vertical line pattern dithering
         * Same as horizontal but using x-coordinate.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=4]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spacing = options.lineSpacing ?? 4;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              // Triangle wave based on x position
              const t = (x % spacing) / spacing;
              const bias = Math.abs(t * 2.0 - 1.0);
              const threshold = (bias - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'crosshatch': {
        name: 'Crosshatch',
        description: 'Cross-hatching pattern. Combines horizontal and vertical lines.',
        /**
         * @stub MATH AGENT: Implement crosshatch dithering
         *
         * Multiple layers of line patterns at different angles.
         * Darker areas get more hatch layers:
         *   Layer 1 (lightest dark): horizontal lines
         *   Layer 2: vertical lines
         *   Layer 3: 45-degree lines
         *   Layer 4 (darkest): -45-degree lines
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=4]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spacing = options.lineSpacing ?? 4;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              // Multiple hatch layers
              const s = spacing;
              const line1 = Math.abs(((y % s) / s) * 2.0 - 1.0); // horizontal
              const line2 = Math.abs(((x % s) / s) * 2.0 - 1.0); // vertical
              const line3 = Math.abs((((x + y) % s) / s) * 2.0 - 1.0); // 45 deg
              const line4 = Math.abs((((x - y + s * 100) % s) / s) * 2.0 - 1.0); // -45 deg
              const bias = Math.min(line1, line2, line3, line4);
              const threshold = (bias - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'diagonal-lines': {
        name: 'Diagonal Lines',
        description: 'Dithering with 45-degree diagonal lines.',
        /**
         * @stub MATH AGENT: Implement diagonal line dithering
         * Uses (x + y) % spacing for 45-degree lines.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=4]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spacing = options.lineSpacing ?? 4;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              // Diagonal line: triangle wave along (x+y)
              const t = ((x + y) % spacing) / spacing;
              const bias = Math.abs(t * 2.0 - 1.0);
              const threshold = (bias - 0.5) * spread * 255;
              const r = clamp(Math.round(data[i] + threshold), 0, 255);
              const g = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const b = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'spiral': {
        name: 'Spiral',
        description: 'Dithering following a spiral pattern from center.',
        /**
         * @stub MATH AGENT: Implement spiral dithering
         *
         * Use polar coordinates from image center:
         *   r = sqrt((x-cx)^2 + (y-cy)^2)
         *   theta = atan2(y-cy, x-cx)
         * Pattern value = (r + theta * k) % spacing
         * Use as threshold for dithering.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.spacing=8]
         * @param {number} [options.tightness=1]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const spacing = options.spacing ?? 8;
          const tightness = options.tightness ?? 1;
          const spread = options.spread ?? 1;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);
          const cx = width / 2;
          const cy = height / 2;

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const dx = x - cx;
              const dy = y - cy;
              const r = Math.sqrt(dx * dx + dy * dy);
              const theta = Math.atan2(dy, dx);
              // Combine angle and radius into spiral
              const normalizedAngle = (theta + Math.PI) / (2 * Math.PI);
              const spiralVal = (r + normalizedAngle * spacing * tightness) % spacing;
              const bias = Math.abs(spiralVal / spacing * 2.0 - 1.0);
              const threshold = (bias - 0.5) * spread * 255;
              const cr = clamp(Math.round(data[i] + threshold), 0, 255);
              const cg = clamp(Math.round(data[i + 1] + threshold), 0, 255);
              const cb = clamp(Math.round(data[i + 2] + threshold), 0, 255);
              const nc = nearestColor([cr, cg, cb], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      }
    },

    // -----------------------------------------
    // ARTISTIC
    // -----------------------------------------
    'artistic': {

      'stipple': {
        name: 'Stippling',
        description: 'Weighted Voronoi stippling effect. Places dots based on darkness.',
        /**
         * @stub MATH AGENT: Implement stippling
         *
         * Approximation of Weighted Voronoi Stippling:
         *   1. Divide image into grid cells
         *   2. For each cell, probability of placing a dot = average darkness
         *   3. Use seeded random to decide dot placement
         *   4. Draw dots at cell centers where placed
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.dotSize=2]
         * @param {number} [options.density=1.0]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const dotSize = options.dotSize ?? 2;
          const density = options.density ?? 1.0;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          // Sort palette to find lightest color for background
          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const bgColor = sorted[sorted.length - 1];
          const darkColor = sorted[0];

          // Fill background
          for (let i = 0; i < data.length; i += 4) {
            data[i] = bgColor[0];
            data[i + 1] = bgColor[1];
            data[i + 2] = bgColor[2];
            data[i + 3] = src[i + 3];
          }

          // Grid-based stippling
          const cellSize = Math.max(2, Math.round(dotSize * 2));
          const rng = mulberry32(options.seed ?? 42);

          for (let cy = 0; cy < height; cy += cellSize) {
            for (let cx = 0; cx < width; cx += cellSize) {
              // Calculate average darkness of this cell
              let totalLum = 0, count = 0;
              for (let dy = 0; dy < cellSize && cy + dy < height; dy++) {
                for (let dx = 0; dx < cellSize && cx + dx < width; dx++) {
                  const si = ((cy + dy) * width + (cx + dx)) * 4;
                  totalLum += luminance(src[si], src[si + 1], src[si + 2]);
                  count++;
                }
              }
              const avgLum = totalLum / count / 255;
              const darkness = (1 - avgLum) * density;

              // Place dot based on darkness probability
              if (rng() < darkness) {
                const dotCx = cx + Math.floor(cellSize / 2);
                const dotCy = cy + Math.floor(cellSize / 2);
                const radius = dotSize * (0.5 + darkness * 0.5);
                const r2 = radius * radius;
                const minY = Math.max(0, Math.floor(dotCy - radius));
                const maxY = Math.min(height - 1, Math.ceil(dotCy + radius));
                const minX = Math.max(0, Math.floor(dotCx - radius));
                const maxX = Math.min(width - 1, Math.ceil(dotCx + radius));
                for (let py = minY; py <= maxY; py++) {
                  for (let px = minX; px <= maxX; px++) {
                    const ddx = px - dotCx;
                    const ddy = py - dotCy;
                    if (ddx * ddx + ddy * ddy <= r2) {
                      const pi = (py * width + px) * 4;
                      data[pi] = darkColor[0];
                      data[pi + 1] = darkColor[1];
                      data[pi + 2] = darkColor[2];
                    }
                  }
                }
              }
            }
          }
          return { data, width, height };
        }
      },

      'pixel-art': {
        name: 'Pixel Art',
        description: 'Downscale with palette quantization for a pixel art effect.',
        /**
         * @stub MATH AGENT: Implement pixel art effect
         *
         * 1. Downscale image by pixelSize factor (average colors in each block)
         * 2. Quantize each pixel to nearest palette color
         * 3. Upscale back with nearest-neighbor
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.pixelSize=8]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const pixelSize = options.pixelSize ?? 8;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          // For each block, average the colors, quantize to palette, then fill
          for (let by = 0; by < height; by += pixelSize) {
            for (let bx = 0; bx < width; bx += pixelSize) {
              let sumR = 0, sumG = 0, sumB = 0, count = 0;
              const endY = Math.min(by + pixelSize, height);
              const endX = Math.min(bx + pixelSize, width);

              for (let y = by; y < endY; y++) {
                for (let x = bx; x < endX; x++) {
                  const si = (y * width + x) * 4;
                  sumR += src[si];
                  sumG += src[si + 1];
                  sumB += src[si + 2];
                  count++;
                }
              }

              const avgColor = [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)];
              const nc = nearestColor(avgColor, palette);

              for (let y = by; y < endY; y++) {
                for (let x = bx; x < endX; x++) {
                  const di = (y * width + x) * 4;
                  data[di] = nc[0];
                  data[di + 1] = nc[1];
                  data[di + 2] = nc[2];
                  data[di + 3] = src[di + 3];
                }
              }
            }
          }
          return { data, width, height };
        }
      },

      'lichtenstein': {
        name: 'Lichtenstein (Pop Art)',
        description: 'Bold pop-art style with large halftone dots and high contrast.',
        /**
         * @stub MATH AGENT: Implement Lichtenstein pop-art effect
         *
         * 1. Boost contrast significantly
         * 2. Quantize to 4-6 bold colors
         * 3. Apply large dot halftone pattern
         * 4. Add black outlines using edge detection (Sobel)
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.dotSize=12]
         * @param {boolean} [options.outlines=true]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const dotSize = options.dotSize ?? 12;
          const showOutlines = options.outlines !== false;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          // Sort palette by luminance
          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          // Step 1: Boost contrast
          const boosted = new Float32Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const si = (y * width + x) * 4;
              let lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;
              // Aggressive contrast curve
              lum = lum < 0.5 ? 2 * lum * lum : 1 - 2 * (1 - lum) * (1 - lum);
              boosted[y * width + x] = lum;
            }
          }

          // Step 2: Halftone dots
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const cx = ((x % dotSize) + dotSize) % dotSize - dotSize / 2;
              const cy = ((y % dotSize) + dotSize) % dotSize - dotSize / 2;
              const dist = Math.sqrt(cx * cx + cy * cy) / (dotSize / 2);
              const lum = boosted[y * width + x];
              const radius = 1 - lum;
              const nc = dist <= radius ? darkColor : lightColor;
              const di = (y * width + x) * 4;
              data[di] = nc[0];
              data[di + 1] = nc[1];
              data[di + 2] = nc[2];
              data[di + 3] = src[di + 3];
            }
          }

          // Step 3: Sobel edge detection for outlines
          if (showOutlines) {
            for (let y = 1; y < height - 1; y++) {
              for (let x = 1; x < width - 1; x++) {
                const tl = boosted[(y - 1) * width + (x - 1)];
                const t  = boosted[(y - 1) * width + x];
                const tr = boosted[(y - 1) * width + (x + 1)];
                const l  = boosted[y * width + (x - 1)];
                const r  = boosted[y * width + (x + 1)];
                const bl = boosted[(y + 1) * width + (x - 1)];
                const b  = boosted[(y + 1) * width + x];
                const br = boosted[(y + 1) * width + (x + 1)];

                const gx = -tl - 2*l - bl + tr + 2*r + br;
                const gy = -tl - 2*t - tr + bl + 2*b + br;
                const mag = Math.sqrt(gx * gx + gy * gy);

                if (mag > 0.3) {
                  const di = (y * width + x) * 4;
                  data[di] = darkColor[0];
                  data[di + 1] = darkColor[1];
                  data[di + 2] = darkColor[2];
                }
              }
            }
          }
          return { data, width, height };
        }
      },

      'engraving': {
        name: 'Engraving',
        description: 'Simulates line engraving with varying line weight.',
        /**
         * @stub MATH AGENT: Implement engraving effect
         *
         * Draw horizontal lines across the image.
         * Line weight varies with local luminance:
         *   - Dark areas: thick lines
         *   - Light areas: thin or no lines
         * Optionally add contour-following by shifting line y-position
         * based on luminance gradient.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.lineSpacing=4]
         * @param {boolean} [options.contour=false]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const lineSpacing = options.lineSpacing ?? 4;
          const contour = options.contour ?? false;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          // Pre-compute luminance map
          const lumMap = new Float32Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const si = (y * width + x) * 4;
              lumMap[y * width + x] = luminance(src[si], src[si + 1], src[si + 2]) / 255;
            }
          }

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const lum = lumMap[y * width + x];
              // Determine effective y position (with optional contour shift)
              let effectiveY = y;
              if (contour && x > 0 && x < width - 1) {
                // Shift based on horizontal luminance gradient
                const gradX = lumMap[y * width + (x + 1)] - lumMap[y * width + (x - 1)];
                effectiveY += gradX * lineSpacing;
              }

              // Position within engraving line cell
              const posInLine = ((effectiveY % lineSpacing) + lineSpacing) % lineSpacing;
              const center = lineSpacing / 2;
              const distFromCenter = Math.abs(posInLine - center) / center;

              // Line weight varies with darkness
              const lineWeight = 1 - lum; // darker = thicker line
              const isLine = distFromCenter <= lineWeight;
              const nc = isLine ? darkColor : lightColor;
              const di = (y * width + x) * 4;
              data[di] = nc[0];
              data[di + 1] = nc[1];
              data[di + 2] = nc[2];
              data[di + 3] = src[di + 3];
            }
          }
          return { data, width, height };
        }
      },

      'pointillism': {
        name: 'Pointillism',
        description: 'Impressionist pointillism effect with colored dots.',
        /**
         * @stub MATH AGENT: Implement pointillism effect
         *
         * Place circular dots of varying size and color:
         *   1. Sample image in a grid pattern (with jitter)
         *   2. For each sample, find nearest palette color
         *   3. Draw circle at that position with palette color
         *   4. Dot radius varies: larger dots in darker areas
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.dotSize=6]
         * @param {number} [options.jitter=0.5]
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const dotSize = options.dotSize ?? 6;
          const jitter = options.jitter ?? 0.5;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          // Sort palette for background
          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const bgColor = sorted[sorted.length - 1];

          // Fill with lightest background
          for (let i = 0; i < data.length; i += 4) {
            data[i] = bgColor[0];
            data[i + 1] = bgColor[1];
            data[i + 2] = bgColor[2];
            data[i + 3] = src[i + 3];
          }

          const rng = mulberry32(options.seed ?? 99);
          const spacing = Math.max(2, Math.round(dotSize));

          // Place dots in a grid with jitter
          for (let gy = 0; gy < height; gy += spacing) {
            for (let gx = 0; gx < width; gx += spacing) {
              // Add jitter
              const jx = gx + Math.round((rng() - 0.5) * spacing * jitter);
              const jy = gy + Math.round((rng() - 0.5) * spacing * jitter);
              const sx = clamp(jx, 0, width - 1);
              const sy = clamp(jy, 0, height - 1);

              // Sample source at this position
              const si = (sy * width + sx) * 4;
              const nc = nearestColor([src[si], src[si + 1], src[si + 2]], palette);
              const lum = luminance(src[si], src[si + 1], src[si + 2]) / 255;

              // Dot radius: larger in darker areas
              const radius = dotSize * (0.3 + (1 - lum) * 0.7) / 2;
              const r2 = radius * radius;

              const minY = Math.max(0, Math.floor(jy - radius));
              const maxY = Math.min(height - 1, Math.ceil(jy + radius));
              const minX = Math.max(0, Math.floor(jx - radius));
              const maxX = Math.min(width - 1, Math.ceil(jx + radius));

              for (let py = minY; py <= maxY; py++) {
                for (let px = minX; px <= maxX; px++) {
                  const ddx = px - jx;
                  const ddy = py - jy;
                  if (ddx * ddx + ddy * ddy <= r2) {
                    const di = (py * width + px) * 4;
                    data[di] = nc[0];
                    data[di + 1] = nc[1];
                    data[di + 2] = nc[2];
                  }
                }
              }
            }
          }
          return { data, width, height };
        }
      }
    },

    // -----------------------------------------
    // THRESHOLD
    // -----------------------------------------
    'threshold': {

      'simple': {
        name: 'Simple Threshold',
        description: 'Binary threshold. Pixels above threshold become white, below become black.',
        /**
         * @stub MATH AGENT: Implement simple threshold
         *
         * For each pixel:
         *   lum = luminance(r, g, b)
         *   if lum > threshold * 255: nearest_light_color else nearest_dark_color
         *
         * For multi-color palettes, quantize to nearest color (no dithering).
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.threshold=0.5] - Threshold 0-1
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const threshold = options.threshold ?? 0.5;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const nc = nearestColor([data[i], data[i + 1], data[i + 2]], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      },

      'adaptive': {
        name: 'Adaptive Threshold',
        description: 'Local adaptive threshold. Threshold varies based on local neighborhood.',
        /**
         * @stub MATH AGENT: Implement adaptive threshold
         *
         * For each pixel:
         *   local_mean = average luminance in windowSize x windowSize neighborhood
         *   if pixel_luminance > local_mean - C: light else dark
         *
         * C is a constant offset (bias parameter).
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.windowSize=15] - Neighborhood size
         * @param {number} [options.bias=5] - Threshold bias
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const windowSize = options.windowSize ?? 15;
          const bias = options.bias ?? 5;
          const { width, height } = imageData;
          const src = imageData.data;
          const data = new Uint8ClampedArray(src.length);

          const sorted = palette.slice().sort((a, b) => luminance(a[0], a[1], a[2]) - luminance(b[0], b[1], b[2]));
          const darkColor = sorted[0];
          const lightColor = sorted[sorted.length - 1];

          // Pre-compute luminance
          const lumArr = new Float32Array(width * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const si = (y * width + x) * 4;
              lumArr[y * width + x] = luminance(src[si], src[si + 1], src[si + 2]);
            }
          }

          // Compute integral image for fast local mean
          const integral = new Float64Array((width + 1) * (height + 1));
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              integral[(y + 1) * (width + 1) + (x + 1)] =
                lumArr[y * width + x]
                + integral[y * (width + 1) + (x + 1)]
                + integral[(y + 1) * (width + 1) + x]
                - integral[y * (width + 1) + x];
            }
          }

          const half = Math.floor(windowSize / 2);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const x1 = Math.max(0, x - half);
              const y1 = Math.max(0, y - half);
              const x2 = Math.min(width - 1, x + half);
              const y2 = Math.min(height - 1, y + half);
              const area = (x2 - x1 + 1) * (y2 - y1 + 1);
              const sum =
                integral[(y2 + 1) * (width + 1) + (x2 + 1)]
                - integral[y1 * (width + 1) + (x2 + 1)]
                - integral[(y2 + 1) * (width + 1) + x1]
                + integral[y1 * (width + 1) + x1];
              const localMean = sum / area;
              const lum = lumArr[y * width + x];
              const nc = lum > localMean - bias ? lightColor : darkColor;
              const di = (y * width + x) * 4;
              data[di] = nc[0];
              data[di + 1] = nc[1];
              data[di + 2] = nc[2];
              data[di + 3] = src[di + 3];
            }
          }
          return { data, width, height };
        }
      },

      'multi-level': {
        name: 'Multi-Level Threshold',
        description: 'Threshold with multiple levels, creating a posterization effect.',
        /**
         * @stub MATH AGENT: Implement multi-level threshold
         *
         * Quantize each channel to N levels:
         *   quantized = round(pixel / 255 * (levels - 1)) * (255 / (levels - 1))
         * Then find nearest palette color.
         *
         * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
         * @param {number[][]} palette
         * @param {object} options
         * @param {number} [options.levels=4] - Number of quantization levels
         * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
         */
        fn: function(imageData, palette, options = {}) {
          const levels = options.levels ?? 4;
          const { width, height } = imageData;
          const data = new Uint8ClampedArray(imageData.data);

          const step = 255 / (levels - 1);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const i = (y * width + x) * 4;
              const r = Math.round(Math.round(data[i] / step) * step);
              const g = Math.round(Math.round(data[i + 1] / step) * step);
              const b = Math.round(Math.round(data[i + 2] / step) * step);
              const nc = nearestColor([r, g, b], palette);
              data[i] = nc[0];
              data[i + 1] = nc[1];
              data[i + 2] = nc[2];
            }
          }
          return { data, width, height };
        }
      }
    }
  };


  // =============================================
  // PUBLIC API
  // =============================================

  /**
   * Get all algorithm categories.
   * @returns {string[]} Category IDs
   */
  function getCategories() {
    return Object.keys(algorithms);
  }

  /**
   * Get display name for a category.
   * @param {string} categoryId
   * @returns {string}
   */
  function getCategoryName(categoryId) {
    const names = {
      'error-diffusion': 'Error Diffusion',
      'ordered': 'Ordered Dithering',
      'halftone': 'Halftone',
      'noise': 'Noise / Stochastic',
      'pattern': 'Pattern',
      'artistic': 'Artistic',
      'threshold': 'Threshold'
    };
    return names[categoryId] || categoryId;
  }

  /**
   * Get all algorithms in a category.
   * @param {string} categoryId
   * @returns {{ id: string, name: string, description: string }[]}
   */
  function getAlgorithmsInCategory(categoryId) {
    const cat = algorithms[categoryId];
    if (!cat) return [];
    return Object.entries(cat).map(([id, algo]) => ({
      id,
      name: algo.name,
      description: algo.description
    }));
  }

  /**
   * Get a specific algorithm by category and ID.
   * @param {string} categoryId
   * @param {string} algorithmId
   * @returns {{ name: string, description: string, fn: Function }|null}
   */
  function getAlgorithm(categoryId, algorithmId) {
    if (algorithms[categoryId] && algorithms[categoryId][algorithmId]) {
      return algorithms[categoryId][algorithmId];
    }
    return null;
  }

  /**
   * Run a dithering algorithm on image data.
   *
   * This is the main entry point used by the application.
   * It handles pre-processing (adjustments, blur, scale) then runs the algorithm,
   * then handles post-processing (blend, upscale).
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} sourceImageData
   *   The original image pixel data
   * @param {object} params
   * @param {string} params.category - Algorithm category ID
   * @param {string} params.algorithm - Algorithm ID
   * @param {number[][]} params.palette - Color palette as [[r,g,b], ...]
   * @param {number} [params.scale=1] - Pixel scale (1-32)
   * @param {number} [params.lineScale=1] - Line scale
   * @param {number} [params.smoothing=0] - Smoothing amount (0-100)
   * @param {number} [params.blend=100] - Blend amount (0-100, 100 = full dither)
   * @param {number} [params.contrast=50] - Contrast (0-100)
   * @param {number} [params.midtones=50] - Midtones (0-100)
   * @param {number} [params.highlights=50] - Highlights (0-100)
   * @param {number} [params.threshold=50] - Luminance threshold (0-100)
   * @param {number} [params.blur=0] - Blur amount (0-10)
   * @param {number} [params.depth=0] - Depth effect (0-10)
   * @param {boolean} [params.invert=false] - Invert image
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function process(sourceImageData, params) {
    const algo = getAlgorithm(params.category, params.algorithm);
    if (!algo) {
      console.warn(`Algorithm not found: ${params.category}/${params.algorithm}`);
      return copyImageData(sourceImageData);
    }

    const originalWidth = sourceImageData.width;
    const originalHeight = sourceImageData.height;

    // Build optimized palette lookup once (k-d tree for large palettes)
    const paletteLookup = createPaletteLookup(params.palette);

    // 1. Apply adjustments (contrast, midtones, highlights, invert)
    let processed = applyAdjustments(sourceImageData, {
      contrast: params.contrast ?? 50,
      midtones: params.midtones ?? 50,
      highlights: params.highlights ?? 50,
      invert: params.invert ?? false
    });

    // 2. Apply blur
    if (params.blur > 0) {
      processed = applyBlur(processed, params.blur);
    }

    // 2b. Apply smoothing (pre-blur before dithering, reduces noise in dither output)
    const smoothing = (params.smoothing ?? 0) / 100;
    if (smoothing > 0) {
      processed = applyBlur(processed, smoothing * 8);
    }

    // 2c. Apply depth (unsharp mask, enhances edges and detail before dithering)
    const depth = params.depth ?? 0;
    if (depth > 0) {
      const blurred = applyBlur(processed, 2 + depth * 0.5);
      const amount = depth / 5;
      const pData = processed.data;
      const bData = blurred.data;
      for (let i = 0; i < pData.length; i += 4) {
        pData[i] = clamp(Math.round(pData[i] + (pData[i] - bData[i]) * amount), 0, 255);
        pData[i + 1] = clamp(Math.round(pData[i + 1] + (pData[i + 1] - bData[i + 1]) * amount), 0, 255);
        pData[i + 2] = clamp(Math.round(pData[i + 2] + (pData[i + 2] - bData[i + 2]) * amount), 0, 255);
      }
    }

    // 3. Apply scale (downscale for pixelation)
    const scale = params.scale ?? 1;
    const scaledDown = applyScale(processed, scale);

    // 4. Run dither algorithm
    const lineScale = params.lineScale ?? 1;
    const algoOptions = {
      threshold: (params.threshold ?? 50) / 100,
      lineScale: lineScale,
      smoothing: smoothing,
      depth: depth,
      cellSize: Math.max(2, Math.round(8 * lineScale)),
      lineSpacing: Math.max(2, Math.round(4 * lineScale)),
      dotSize: Math.max(2, Math.round(6 * lineScale)),
      pixelSize: Math.max(2, Math.round(8 * lineScale)),
      spacing: Math.max(2, Math.round(8 * lineScale)),
      spread: Math.max(0.2, lineScale),
      // Pass optimized lookup to algorithms
      _paletteLookup: paletteLookup
    };

    let dithered = algo.fn(scaledDown, params.palette, algoOptions);

    // 5. Upscale back to original size
    if (scale > 1) {
      dithered = upscaleNearest(dithered, originalWidth, originalHeight);
    }

    // 6. Blend with original (adjusted) image
    const blendAmount = (params.blend ?? 100) / 100;
    if (blendAmount < 1) {
      const src = processed.data;
      const dst = dithered.data;
      const len = dst.length;
      for (let i = 0; i < len; i += 4) {
        dst[i] = Math.round(src[i] * (1 - blendAmount) + dst[i] * blendAmount);
        dst[i + 1] = Math.round(src[i + 1] * (1 - blendAmount) + dst[i + 1] * blendAmount);
        dst[i + 2] = Math.round(src[i + 2] * (1 - blendAmount) + dst[i + 2] * blendAmount);
      }
    }

    return {
      data: dithered.data,
      width: originalWidth,
      height: originalHeight
    };
  }

  /**
   * Process image data using a custom error diffusion matrix.
   * Used by the Dither Studio for user-defined matrices.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number[][]} palette
   * @param {number[][]} matrix - Error diffusion matrix (2D array)
   * @param {number} originX - X position of current pixel in matrix
   * @param {number} originY - Y position of current pixel in matrix
   * @param {number} divisor - Sum of all weights
   * @param {object} options
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function processCustomMatrix(imageData, palette, matrix, originX, originY, divisor, options = {}) {
    const serpentine = options.serpentine !== false;
    // Convert 2D matrix to kernel format
    const kernel = [];
    for (let my = 0; my < matrix.length; my++) {
      for (let mx = 0; mx < matrix[my].length; mx++) {
        const w = matrix[my][mx];
        if (w === 0) continue;
        const dx = mx - originX;
        const dy = my - originY;
        // Only distribute to future pixels (same row after current, or later rows)
        if (dy > 0 || (dy === 0 && dx > 0)) {
          kernel.push({ dx, dy, w });
        }
      }
    }
    return errorDiffuse(imageData, palette, kernel, divisor, serpentine);
  }

  /**
   * Process image data using a custom threshold map.
   * Used by the Dither Studio for user-defined threshold maps.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {number[][]} palette
   * @param {number[][]} thresholdMap - 2D threshold map
   * @param {object} options
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function processCustomThreshold(imageData, palette, thresholdMap, options = {}) {
    const spread = options.spread ?? 1;
    const matSize = thresholdMap.length;
    // Find max value in the map for normalization
    let maxVal = 0;
    for (let y = 0; y < matSize; y++) {
      for (let x = 0; x < thresholdMap[y].length; x++) {
        if (thresholdMap[y][x] > maxVal) maxVal = thresholdMap[y][x];
      }
    }
    maxVal = maxVal + 1;
    return orderedDither(imageData, palette, thresholdMap, matSize, maxVal, spread);
  }

  // Export public API
  return {
    // Utilities (also available to math agent)
    colorDistanceSq,
    nearestColor,
    luminance,
    clamp,
    copyImageData,
    getPixel,
    setPixel,

    // Pre/post processing
    applyAdjustments,
    applyBlur,
    applyScale,
    upscaleNearest,

    // Algorithm registry
    getCategories,
    getCategoryName,
    getAlgorithmsInCategory,
    getAlgorithm,

    // Performance
    createPaletteLookup,

    // Main processing
    process,
    processCustomMatrix,
    processCustomThreshold
  };
})();
