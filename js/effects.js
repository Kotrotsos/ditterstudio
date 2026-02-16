/**
 * Ditter - Effects Layer
 *
 * Post-processing effects applied after dithering.
 * Effect order: Color -> Chromatic -> Distort -> Glitch -> Texture
 *
 * Performance notes:
 * - Uint32Array views for 4-byte pixel copies in displacement effects
 * - Pre-computed sine LUT for wave distortion
 * - Fused color matrix for channel/temperature in single pass
 * - Inlined hash for hot loops
 */

const DitterEffects = (() => {

  // Pre-computed sine lookup table (1024 entries)
  const SINE_LUT_SIZE = 1024;
  const SINE_LUT = new Float32Array(SINE_LUT_SIZE);
  for (let i = 0; i < SINE_LUT_SIZE; i++) {
    SINE_LUT[i] = Math.sin((i / SINE_LUT_SIZE) * Math.PI * 2);
  }

  function sinLut(radians) {
    const idx = ((radians / (Math.PI * 2)) * SINE_LUT_SIZE) | 0;
    return SINE_LUT[((idx % SINE_LUT_SIZE) + SINE_LUT_SIZE) % SINE_LUT_SIZE];
  }

  /**
   * Return default effect settings (all neutral/off).
   */
  function getDefaults() {
    return {
      enabled: false,

      // Glitch
      scanlineShiftEnabled: false,
      scanlineShiftAmount: 10,
      scanlineShiftDensity: 50,

      blockShiftEnabled: false,
      blockShiftAmount: 10,
      blockShiftHeight: 16,

      rgbSplitEnabled: false,
      rgbSplitAmount: 4,
      rgbSplitAngle: 0,

      interlaceEnabled: false,
      interlaceOpacity: 50,
      interlaceGap: 2,

      corruptionEnabled: false,
      corruptionAmount: 20,

      // Color
      hueRotate: 0,
      saturation: 100,
      temperature: 0,
      channelR: 100,
      channelG: 100,
      channelB: 100,

      // Chromatic Aberration
      chromaticEnabled: false,
      chromaticMaxDisplace: 20,
      chromaticRed: 10,
      chromaticGreen: 90,
      chromaticBlue: 50,

      // Texture
      grainEnabled: false,
      grainAmount: 30,
      grainSize: 1,

      vignetteEnabled: false,
      vignetteAmount: 50,
      vignetteSize: 50,

      scanlinesEnabled: false,
      scanlinesOpacity: 40,
      scanlinesSpacing: 2,

      // Distort
      waveEnabled: false,
      waveAmpX: 5,
      waveAmpY: 5,
      waveFreqX: 8,
      waveFreqY: 8,

      scatterEnabled: false,
      scatterRadius: 4,

      barrelEnabled: false,
      barrelAmount: 0
    };
  }

  /**
   * Check if any effects are active.
   */
  function hasActiveEffects(params) {
    if (!params || !params.enabled) return false;

    if (params.scanlineShiftEnabled || params.blockShiftEnabled ||
        params.rgbSplitEnabled || params.interlaceEnabled ||
        params.corruptionEnabled) return true;

    if (params.hueRotate !== 0 || params.saturation !== 100 ||
        params.temperature !== 0 || params.channelR !== 100 ||
        params.channelG !== 100 || params.channelB !== 100) return true;

    if (params.chromaticEnabled) return true;

    if (params.grainEnabled || params.vignetteEnabled ||
        params.scanlinesEnabled) return true;

    if (params.waveEnabled || params.scatterEnabled ||
        params.barrelEnabled) return true;

    return false;
  }

  /**
   * Apply all active effects to imageData.
   * Returns a new imageData object (never mutates input).
   */
  function apply(imageData, params) {
    if (!hasActiveEffects(params)) return imageData;

    const w = imageData.width;
    const h = imageData.height;
    let data = new Uint8ClampedArray(imageData.data);

    // Order: Color -> Chromatic -> Distort -> Glitch -> Texture

    // --- Color ---
    if (params.hueRotate !== 0 || params.saturation !== 100 ||
        params.temperature !== 0 || params.channelR !== 100 ||
        params.channelG !== 100 || params.channelB !== 100) {
      applyColor(data, w, h, params);
    }

    // --- Chromatic Aberration ---
    if (params.chromaticEnabled && params.chromaticMaxDisplace > 0) {
      data = applyChromatic(data, w, h, params);
    }

    // --- Distort ---
    if (params.waveEnabled && (params.waveAmpX > 0 || params.waveAmpY > 0)) {
      data = applyWave(data, w, h, params);
    }
    if (params.scatterEnabled && params.scatterRadius > 0) {
      data = applyScatter(data, w, h, params);
    }
    if (params.barrelEnabled && params.barrelAmount !== 0) {
      data = applyBarrel(data, w, h, params);
    }

    // --- Glitch ---
    if (params.rgbSplitEnabled && params.rgbSplitAmount > 0) {
      data = applyRGBSplit(data, w, h, params);
    }
    if (params.scanlineShiftEnabled && params.scanlineShiftAmount > 0) {
      applyScanlineShift(data, w, h, params);
    }
    if (params.blockShiftEnabled && params.blockShiftAmount > 0) {
      applyBlockShift(data, w, h, params);
    }
    if (params.interlaceEnabled && params.interlaceOpacity > 0) {
      applyInterlace(data, w, h, params);
    }
    if (params.corruptionEnabled && params.corruptionAmount > 0) {
      applyCorruption(data, w, h, params);
    }

    // --- Texture ---
    if (params.grainEnabled && params.grainAmount > 0) {
      applyGrain(data, w, h, params);
    }
    if (params.scanlinesEnabled && params.scanlinesOpacity > 0) {
      applyTextScanlines(data, w, h, params);
    }
    if (params.vignetteEnabled && params.vignetteAmount > 0) {
      applyVignette(data, w, h, params);
    }

    return { data, width: w, height: h };
  }

  // --- Inlined seeded hash (deterministic per pixel position) ---
  // Inlined in hot loops for performance, standalone version for lighter use
  function seedHash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
  }

  // --- Color Effects (in-place, fused matrix) ---
  function applyColor(data, w, h, params) {
    const hueShift = params.hueRotate;
    const sat = params.saturation / 100;
    const needsHSL = hueShift !== 0 || sat !== 1;

    // Pre-compute fused channel + temperature coefficients
    let rMul = params.channelR / 100;
    let gMul = params.channelG / 100;
    let bMul = params.channelB / 100;
    let rAdd = 0, bAdd = 0;
    const temp = params.temperature;

    if (temp !== 0) {
      const t = temp / 100;
      if (t > 0) {
        // r = r * rMul + (255 - r * rMul) * t * 0.3
        // r = r * rMul * (1 - t*0.3) + 255 * t * 0.3
        const warmFactor = t * 0.3;
        rAdd = 255 * warmFactor;
        rMul = rMul * (1 - warmFactor);
        bMul = bMul * (1 - warmFactor);
      } else {
        const coolFactor = (-t) * 0.3;
        bAdd = 255 * coolFactor;
        bMul = bMul * (1 - coolFactor);
        rMul = rMul * (1 - coolFactor);
      }
    }

    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      let r = data[i] * rMul + rAdd;
      let g = data[i + 1] * gMul;
      let b = data[i + 2] * bMul + bAdd;

      if (needsHSL) {
        // Clamp before HSL
        if (r > 255) r = 255; else if (r < 0) r = 0;
        if (g > 255) g = 255; else if (g < 0) g = 0;
        if (b > 255) b = 255; else if (b < 0) b = 0;

        // Inline HSL conversion for speed
        const rn = r / 255, gn = g / 255, bn = b / 255;
        const max = rn > gn ? (rn > bn ? rn : bn) : (gn > bn ? gn : bn);
        const min = rn < gn ? (rn < bn ? rn : bn) : (gn < bn ? gn : bn);
        const l = (max + min) * 0.5;

        if (max === min) {
          // Achromatic, hue rotation has no effect
          const v = l * 255;
          data[i] = v; data[i + 1] = v; data[i + 2] = v;
          continue;
        }

        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let hue;
        if (max === rn) hue = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        else if (max === gn) hue = ((bn - rn) / d + 2) / 6;
        else hue = ((rn - gn) / d + 4) / 6;

        let newHue = hue + hueShift / 360;
        if (newHue < 0) newHue += 1; else if (newHue >= 1) newHue -= 1;
        let newSat = s * sat;
        if (newSat > 1) newSat = 1;

        // HSL to RGB inline
        const q = l < 0.5 ? l * (1 + newSat) : l + newSat - l * newSat;
        const p = 2 * l - q;
        let tr = newHue + 1/3, tg = newHue, tb = newHue - 1/3;
        if (tr > 1) tr -= 1; if (tb < 0) tb += 1;

        r = (tr < 1/6 ? p + (q - p) * 6 * tr : tr < 0.5 ? q : tr < 2/3 ? p + (q - p) * (2/3 - tr) * 6 : p) * 255;
        g = (tg < 1/6 ? p + (q - p) * 6 * tg : tg < 0.5 ? q : tg < 2/3 ? p + (q - p) * (2/3 - tg) * 6 : p) * 255;
        b = (tb < 1/6 ? p + (q - p) * 6 * tb : tb < 0.5 ? q : tb < 2/3 ? p + (q - p) * (2/3 - tb) * 6 : p) * 255;
      }

      data[i] = r > 255 ? 255 : r < 0 ? 0 : (r + 0.5) | 0;
      data[i + 1] = g > 255 ? 255 : g < 0 ? 0 : (g + 0.5) | 0;
      data[i + 2] = b > 255 ? 255 : b < 0 ? 0 : (b + 0.5) | 0;
    }
  }

  // --- Chromatic Aberration (new buffer) ---
  // Displaces R/G/B channels radially from center with independent per-channel control
  function applyChromatic(data, w, h, params) {
    const maxD = params.chromaticMaxDisplace;
    const rFrac = params.chromaticRed / 100;
    const gFrac = params.chromaticGreen / 100;
    const bFrac = params.chromaticBlue / 100;
    const out = new Uint8ClampedArray(data.length);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const invMaxR = 1 / (maxR || 1);

    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const normDist = dist * invMaxR;
        const dirX = dist > 0 ? dx / dist : 0;
        const dirY = dist > 0 ? dy / dist : 0;
        const di = (y * w + x) * 4;

        // Red channel displacement
        const rDisp = maxD * rFrac * normDist;
        const rsx = (x - dirX * rDisp + 0.5) | 0;
        const rsy = (y - dirY * rDisp + 0.5) | 0;
        if (rsx >= 0 && rsx < w && rsy >= 0 && rsy < h) {
          out[di] = data[(rsy * w + rsx) * 4];
        } else {
          out[di] = data[di];
        }

        // Green channel displacement
        const gDisp = maxD * gFrac * normDist;
        const gsx = (x - dirX * gDisp + 0.5) | 0;
        const gsy = (y - dirY * gDisp + 0.5) | 0;
        if (gsx >= 0 && gsx < w && gsy >= 0 && gsy < h) {
          out[di + 1] = data[(gsy * w + gsx) * 4 + 1];
        } else {
          out[di + 1] = data[di + 1];
        }

        // Blue channel displacement
        const bDisp = maxD * bFrac * normDist;
        const bsx = (x - dirX * bDisp + 0.5) | 0;
        const bsy = (y - dirY * bDisp + 0.5) | 0;
        if (bsx >= 0 && bsx < w && bsy >= 0 && bsy < h) {
          out[di + 2] = data[(bsy * w + bsx) * 4 + 2];
        } else {
          out[di + 2] = data[di + 2];
        }

        out[di + 3] = data[di + 3];
      }
    }
    return out;
  }

  // --- Glitch: Scanline Shift (in-place) ---
  function applyScanlineShift(data, w, h, params) {
    const amount = params.scanlineShiftAmount;
    const density = params.scanlineShiftDensity / 100;
    const rowBytes = w * 4;

    for (let y = 0; y < h; y++) {
      if (seedHash(0, y, 42) > density) continue;
      const shift = ((seedHash(1, y, 77) - 0.5) * 2 * amount + 0.5) | 0;
      if (shift === 0) continue;

      const rowStart = y * rowBytes;
      const row = data.slice(rowStart, rowStart + rowBytes);

      for (let x = 0; x < w; x++) {
        const srcX = x - shift;
        if (srcX >= 0 && srcX < w) {
          const di = rowStart + x * 4;
          const si = srcX * 4;
          data[di] = row[si];
          data[di + 1] = row[si + 1];
          data[di + 2] = row[si + 2];
          data[di + 3] = row[si + 3];
        }
      }
    }
  }

  // --- Glitch: Block Shift (in-place) ---
  function applyBlockShift(data, w, h, params) {
    const amount = params.blockShiftAmount;
    const blockH = params.blockShiftHeight;
    const rowBytes = w * 4;

    for (let by = 0; by < h; by += blockH) {
      if (seedHash(2, by, 99) > 0.6) continue;
      const shift = ((seedHash(3, by, 123) - 0.5) * 2 * amount + 0.5) | 0;
      if (shift === 0) continue;

      const endY = Math.min(by + blockH, h);
      for (let y = by; y < endY; y++) {
        const rowStart = y * rowBytes;
        const row = data.slice(rowStart, rowStart + rowBytes);

        for (let x = 0; x < w; x++) {
          const srcX = x - shift;
          if (srcX >= 0 && srcX < w) {
            const di = rowStart + x * 4;
            const si = srcX * 4;
            data[di] = row[si];
            data[di + 1] = row[si + 1];
            data[di + 2] = row[si + 2];
            data[di + 3] = row[si + 3];
          }
        }
      }
    }
  }

  // --- Glitch: RGB Split (new buffer, Uint32 copy for green/alpha) ---
  function applyRGBSplit(data, w, h, params) {
    const amount = params.rgbSplitAmount;
    const angle = params.rgbSplitAngle * Math.PI / 180;
    const dx = (Math.cos(angle) * amount + 0.5) | 0;
    const dy = (Math.sin(angle) * amount + 0.5) | 0;
    const out = new Uint8ClampedArray(data.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;

        const rxSrc = x + dx; const rySrc = y + dy;
        out[i] = (rxSrc >= 0 && rxSrc < w && rySrc >= 0 && rySrc < h)
          ? data[(rySrc * w + rxSrc) * 4] : data[i];

        out[i + 1] = data[i + 1];

        const bxSrc = x - dx; const bySrc = y - dy;
        out[i + 2] = (bxSrc >= 0 && bxSrc < w && bySrc >= 0 && bySrc < h)
          ? data[(bySrc * w + bxSrc) * 4 + 2] : data[i + 2];

        out[i + 3] = data[i + 3];
      }
    }
    return out;
  }

  // --- Glitch: Interlace (in-place) ---
  function applyInterlace(data, w, h, params) {
    const factor = 1 - params.interlaceOpacity / 100;
    const gap = params.interlaceGap;
    const doubleGap = gap * 2;

    for (let y = 0; y < h; y++) {
      if (y % doubleGap >= gap) continue;
      const rowStart = y * w * 4;
      const rowEnd = rowStart + w * 4;
      for (let i = rowStart; i < rowEnd; i += 4) {
        data[i] = (data[i] * factor + 0.5) | 0;
        data[i + 1] = (data[i + 1] * factor + 0.5) | 0;
        data[i + 2] = (data[i + 2] * factor + 0.5) | 0;
      }
    }
  }

  // --- Glitch: Data Corruption (in-place, inlined hash) ---
  function applyCorruption(data, w, h, params) {
    const threshold = 1 - (params.corruptionAmount / 100) * 0.15;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Inline hash for threshold test
        let h1 = (x * 374761393 + y * 668265263 + 72009741885) | 0;
        h1 = ((h1 ^ (h1 >> 13)) * 1103515245) | 0;
        if (((h1 ^ (h1 >> 16)) & 0x7fffffff) / 0x7fffffff < threshold) continue;

        const i = (y * w + x) * 4;
        let h2 = (x * 374761393 + y * 668265263 + 83935306382) | 0;
        h2 = ((h2 ^ (h2 >> 13)) * 1103515245) | 0;
        const ox = ((((h2 ^ (h2 >> 16)) & 0x7fffffff) / 0x7fffffff) - 0.5) * 8;
        let h3 = (x * 374761393 + y * 668265263 + 97921447939) | 0;
        h3 = ((h3 ^ (h3 >> 13)) * 1103515245) | 0;
        const oy = ((((h3 ^ (h3 >> 16)) & 0x7fffffff) / 0x7fffffff) - 0.5) * 8;

        let sx = x + ((ox + 0.5) | 0); if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
        let sy = y + ((oy + 0.5) | 0); if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        const j = (sy * w + sx) * 4;
        data[i] = data[j]; data[i + 1] = data[j + 1]; data[i + 2] = data[j + 2];
      }
    }
  }

  // --- Texture: Film Grain (in-place, inlined hash) ---
  function applyGrain(data, w, h, params) {
    const intensity = params.grainAmount / 100 * 80;
    const size = params.grainSize;
    const useSize = size > 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = useSize ? (x / size) | 0 : x;
        const gy = useSize ? (y / size) | 0 : y;
        let hv = (gx * 374761393 + gy * 668265263 + 41942946741) | 0;
        hv = ((hv ^ (hv >> 13)) * 1103515245) | 0;
        const noise = (((hv ^ (hv >> 16)) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * intensity;
        const i = (y * w + x) * 4;
        let r = data[i] + noise; if (r > 255) r = 255; else if (r < 0) r = 0;
        let g = data[i + 1] + noise; if (g > 255) g = 255; else if (g < 0) g = 0;
        let b = data[i + 2] + noise; if (b > 255) b = 255; else if (b < 0) b = 0;
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
      }
    }
  }

  // --- Texture: Vignette (in-place, pre-computed row factor) ---
  function applyVignette(data, w, h, params) {
    const amount = params.vignetteAmount / 100;
    const size = params.vignetteSize / 100;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const invCx = 1 / (cx || 1);
    const invCy = 1 / (cy || 1);
    const edgeRange = 1.414 - size;
    const invEdge = 1 / (edgeRange || 1);

    for (let y = 0; y < h; y++) {
      const dyNorm = (y - cy) * invCy;
      const dySq = dyNorm * dyNorm;
      for (let x = 0; x < w; x++) {
        const dxNorm = (x - cx) * invCx;
        const dist = Math.sqrt(dxNorm * dxNorm + dySq);
        const edge = dist - size;
        let v;
        if (edge <= 0) {
          v = 1;
        } else {
          const t = edge * invEdge;
          v = 1 - t * t * amount;
          if (v < 0) v = 0;
        }
        const i = (y * w + x) * 4;
        data[i] = (data[i] * v + 0.5) | 0;
        data[i + 1] = (data[i + 1] * v + 0.5) | 0;
        data[i + 2] = (data[i + 2] * v + 0.5) | 0;
      }
    }
  }

  // --- Texture: Scanlines (in-place) ---
  function applyTextScanlines(data, w, h, params) {
    const factor = 1 - params.scanlinesOpacity / 100;
    const spacing = params.scanlinesSpacing;

    for (let y = 0; y < h; y++) {
      if (y % spacing !== 0) continue;
      const rowStart = y * w * 4;
      const rowEnd = rowStart + w * 4;
      for (let i = rowStart; i < rowEnd; i += 4) {
        data[i] = (data[i] * factor + 0.5) | 0;
        data[i + 1] = (data[i + 1] * factor + 0.5) | 0;
        data[i + 2] = (data[i + 2] * factor + 0.5) | 0;
      }
    }
  }

  // --- Distort: Wave (new buffer, sine LUT) ---
  function applyWave(data, w, h, params) {
    const ax = params.waveAmpX;
    const ay = params.waveAmpY;
    const freqXRad = params.waveFreqX * Math.PI * 2;
    const freqYRad = params.waveFreqY * Math.PI * 2;
    const out = new Uint8ClampedArray(data.length);
    const src32 = new Uint32Array(data.buffer);
    const dst32 = new Uint32Array(out.buffer);
    const invH = 1 / h;
    const invW = 1 / w;

    // Pre-compute row X-offsets
    const rowOffX = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      rowOffX[y] = (sinLut(y * invH * freqXRad) * ax + 0.5) | 0;
    }

    for (let y = 0; y < h; y++) {
      const xOff = rowOffX[y];
      for (let x = 0; x < w; x++) {
        const yOff = (sinLut(x * invW * freqYRad) * ay + 0.5) | 0;
        const sx = x + xOff;
        const sy = y + yOff;
        const di = y * w + x;

        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          dst32[di] = src32[sy * w + sx];
        } else {
          dst32[di] = src32[di];
        }
      }
    }
    return new Uint8ClampedArray(out.buffer);
  }

  // --- Distort: Pixel Scatter (new buffer, Uint32 copy) ---
  function applyScatter(data, w, h, params) {
    const radius = params.scatterRadius;
    const out = new Uint8ClampedArray(data.length);
    const src32 = new Uint32Array(data.buffer);
    const dst32 = new Uint32Array(out.buffer);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let h1 = (x * 374761393 + y * 668265263 + 13986263397) | 0;
        h1 = ((h1 ^ (h1 >> 13)) * 1103515245) | 0;
        const ox = ((((h1 ^ (h1 >> 16)) & 0x7fffffff) / 0x7fffffff) - 0.5) * 2 * radius;
        let h2 = (x * 374761393 + y * 668265263 + 27972526794) | 0;
        h2 = ((h2 ^ (h2 >> 13)) * 1103515245) | 0;
        const oy = ((((h2 ^ (h2 >> 16)) & 0x7fffffff) / 0x7fffffff) - 0.5) * 2 * radius;

        let sx = x + ((ox + 0.5) | 0); if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
        let sy = y + ((oy + 0.5) | 0); if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
        dst32[y * w + x] = src32[sy * w + sx];
      }
    }
    return new Uint8ClampedArray(out.buffer);
  }

  // --- Distort: Barrel Distortion (new buffer, Uint32 copy) ---
  function applyBarrel(data, w, h, params) {
    const k = params.barrelAmount / 100;
    const out = new Uint8ClampedArray(data.length);
    const src32 = new Uint32Array(data.buffer);
    const dst32 = new Uint32Array(out.buffer);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.sqrt(cx * cx + cy * cy);
    const invMaxR = 1 / (maxR || 1);

    for (let y = 0; y < h; y++) {
      const ny = (y - cy) * invMaxR;
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) * invMaxR;
        const r = Math.sqrt(nx * nx + ny * ny);
        if (r === 0) {
          dst32[y * w + x] = src32[y * w + x];
          continue;
        }
        const rn = r * (1 + k * r * r);
        const ratio = rn / r;
        const sx = (cx + nx * ratio * maxR + 0.5) | 0;
        const sy = (cy + ny * ratio * maxR + 0.5) | 0;

        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          dst32[y * w + x] = src32[sy * w + sx];
        } else {
          dst32[y * w + x] = 0xFF000000; // opaque black
        }
      }
    }
    return new Uint8ClampedArray(out.buffer);
  }

  return {
    getDefaults,
    hasActiveEffects,
    apply
  };
})();
