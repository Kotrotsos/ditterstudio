/**
 * Ditter - Effects Layer
 *
 * Post-processing effects applied after dithering.
 * Effect order: Color -> Distort -> Glitch -> Texture
 */

const DitterEffects = (() => {

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

    // Check glitch
    if (params.scanlineShiftEnabled || params.blockShiftEnabled ||
        params.rgbSplitEnabled || params.interlaceEnabled ||
        params.corruptionEnabled) return true;

    // Check color (non-neutral values)
    if (params.hueRotate !== 0 || params.saturation !== 100 ||
        params.temperature !== 0 || params.channelR !== 100 ||
        params.channelG !== 100 || params.channelB !== 100) return true;

    // Check texture
    if (params.grainEnabled || params.vignetteEnabled ||
        params.scanlinesEnabled) return true;

    // Check distort
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

    // Order: Color -> Distort -> Glitch -> Texture

    // --- Color ---
    if (params.hueRotate !== 0 || params.saturation !== 100 ||
        params.temperature !== 0 || params.channelR !== 100 ||
        params.channelG !== 100 || params.channelB !== 100) {
      applyColor(data, w, h, params);
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

  // --- Seeded random (deterministic per pixel position) ---
  function seedHash(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
  }

  // --- Color Effects (in-place) ---
  function applyColor(data, w, h, params) {
    const hueShift = params.hueRotate;
    const sat = params.saturation / 100;
    const temp = params.temperature;
    const rMul = params.channelR / 100;
    const gMul = params.channelG / 100;
    const bMul = params.channelB / 100;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Channel mixer
      r = r * rMul;
      g = g * gMul;
      b = b * bMul;

      // Temperature shift
      if (temp !== 0) {
        const t = temp / 100;
        if (t > 0) {
          r = r + (255 - r) * t * 0.3;
          b = b - b * t * 0.3;
        } else {
          b = b + (255 - b) * (-t) * 0.3;
          r = r - r * (-t) * 0.3;
        }
      }

      // Hue rotation and saturation
      if (hueShift !== 0 || sat !== 1) {
        const [hue, s, l] = rgbToHsl(r, g, b);
        const newHue = (hue + hueShift / 360) % 1;
        const newSat = Math.min(1, s * sat);
        const rgb = hslToRgb(newHue < 0 ? newHue + 1 : newHue, newSat, l);
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      }

      data[i] = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    if (s === 0) {
      const v = Math.round(l * 255);
      return [v, v, v];
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1/3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1/3) * 255)
    ];
  }

  // --- Glitch: Scanline Shift (in-place) ---
  function applyScanlineShift(data, w, h, params) {
    const amount = params.scanlineShiftAmount;
    const density = params.scanlineShiftDensity / 100;
    const rowBytes = w * 4;

    for (let y = 0; y < h; y++) {
      if (seedHash(0, y, 42) > density) continue;
      const shift = Math.round((seedHash(1, y, 77) - 0.5) * 2 * amount);
      if (shift === 0) continue;

      const rowStart = y * rowBytes;
      const row = data.slice(rowStart, rowStart + rowBytes);

      for (let x = 0; x < w; x++) {
        const srcX = x - shift;
        const di = rowStart + x * 4;
        if (srcX >= 0 && srcX < w) {
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
      const shift = Math.round((seedHash(3, by, 123) - 0.5) * 2 * amount);
      if (shift === 0) continue;

      const endY = Math.min(by + blockH, h);
      for (let y = by; y < endY; y++) {
        const rowStart = y * rowBytes;
        const row = data.slice(rowStart, rowStart + rowBytes);

        for (let x = 0; x < w; x++) {
          const srcX = x - shift;
          const di = rowStart + x * 4;
          if (srcX >= 0 && srcX < w) {
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

  // --- Glitch: RGB Split (new buffer) ---
  function applyRGBSplit(data, w, h, params) {
    const amount = params.rgbSplitAmount;
    const angle = params.rgbSplitAngle * Math.PI / 180;
    const dx = Math.round(Math.cos(angle) * amount);
    const dy = Math.round(Math.sin(angle) * amount);
    const out = new Uint8ClampedArray(data.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;

        // Red channel: shift in positive direction
        const rxSrc = Math.min(w - 1, Math.max(0, x + dx));
        const rySrc = Math.min(h - 1, Math.max(0, y + dy));
        out[i] = data[(rySrc * w + rxSrc) * 4];

        // Green channel: no shift
        out[i + 1] = data[i + 1];

        // Blue channel: shift in negative direction
        const bxSrc = Math.min(w - 1, Math.max(0, x - dx));
        const bySrc = Math.min(h - 1, Math.max(0, y - dy));
        out[i + 2] = data[(bySrc * w + bxSrc) * 4 + 2];

        out[i + 3] = data[i + 3];
      }
    }
    return out;
  }

  // --- Glitch: Interlace (in-place) ---
  function applyInterlace(data, w, h, params) {
    const opacity = params.interlaceOpacity / 100;
    const gap = params.interlaceGap;
    const factor = 1 - opacity;

    for (let y = 0; y < h; y++) {
      if (y % (gap * 2) >= gap) continue;
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const i = rowStart + x * 4;
        data[i] = Math.round(data[i] * factor);
        data[i + 1] = Math.round(data[i + 1] * factor);
        data[i + 2] = Math.round(data[i + 2] * factor);
      }
    }
  }

  // --- Glitch: Data Corruption (in-place) ---
  function applyCorruption(data, w, h, params) {
    const amount = params.corruptionAmount;
    const threshold = 1 - (amount / 100) * 0.15;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (seedHash(x, y, 55) < threshold) continue;
        const i = (y * w + x) * 4;
        // Copy from a nearby pixel
        const ox = Math.min(w - 1, Math.max(0, x + Math.round((seedHash(x, y, 66) - 0.5) * 8)));
        const oy = Math.min(h - 1, Math.max(0, y + Math.round((seedHash(x, y, 77) - 0.5) * 8)));
        const j = (oy * w + ox) * 4;
        data[i] = data[j];
        data[i + 1] = data[j + 1];
        data[i + 2] = data[j + 2];
      }
    }
  }

  // --- Texture: Film Grain (in-place) ---
  function applyGrain(data, w, h, params) {
    const amount = params.grainAmount;
    const size = params.grainSize;
    const intensity = amount / 100 * 80;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = Math.floor(x / size);
        const gy = Math.floor(y / size);
        const noise = (seedHash(gx, gy, 33) - 0.5) * 2 * intensity;
        const i = (y * w + x) * 4;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
      }
    }
  }

  // --- Texture: Vignette (in-place) ---
  function applyVignette(data, w, h, params) {
    const amount = params.vignetteAmount / 100;
    const size = params.vignetteSize / 100;
    const cx = w / 2;
    const cy = h / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x - cx) / cx;
        const dy = (y - cy) / cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const vignette = Math.max(0, 1 - Math.pow(Math.max(0, dist - size) / (1.414 - size), 2) * amount);
        const i = (y * w + x) * 4;
        data[i] = Math.round(data[i] * vignette);
        data[i + 1] = Math.round(data[i + 1] * vignette);
        data[i + 2] = Math.round(data[i + 2] * vignette);
      }
    }
  }

  // --- Texture: Scanlines (in-place) ---
  function applyTextScanlines(data, w, h, params) {
    const opacity = params.scanlinesOpacity / 100;
    const spacing = params.scanlinesSpacing;
    const factor = 1 - opacity;

    for (let y = 0; y < h; y++) {
      if (y % spacing !== 0) continue;
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const i = rowStart + x * 4;
        data[i] = Math.round(data[i] * factor);
        data[i + 1] = Math.round(data[i + 1] * factor);
        data[i + 2] = Math.round(data[i + 2] * factor);
      }
    }
  }

  // --- Distort: Wave (new buffer) ---
  function applyWave(data, w, h, params) {
    const ax = params.waveAmpX;
    const ay = params.waveAmpY;
    const fx = params.waveFreqX;
    const fy = params.waveFreqY;
    const out = new Uint8ClampedArray(data.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.round(x + Math.sin(y / h * fx * Math.PI * 2) * ax);
        const sy = Math.round(y + Math.sin(x / w * fy * Math.PI * 2) * ay);
        const di = (y * w + x) * 4;

        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const si = (sy * w + sx) * 4;
          out[di] = data[si];
          out[di + 1] = data[si + 1];
          out[di + 2] = data[si + 2];
          out[di + 3] = data[si + 3];
        } else {
          out[di] = data[di];
          out[di + 1] = data[di + 1];
          out[di + 2] = data[di + 2];
          out[di + 3] = data[di + 3];
        }
      }
    }
    return out;
  }

  // --- Distort: Pixel Scatter (new buffer) ---
  function applyScatter(data, w, h, params) {
    const radius = params.scatterRadius;
    const out = new Uint8ClampedArray(data.length);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ox = Math.round((seedHash(x, y, 11) - 0.5) * 2 * radius);
        const oy = Math.round((seedHash(x, y, 22) - 0.5) * 2 * radius);
        const sx = Math.min(w - 1, Math.max(0, x + ox));
        const sy = Math.min(h - 1, Math.max(0, y + oy));
        const di = (y * w + x) * 4;
        const si = (sy * w + sx) * 4;
        out[di] = data[si];
        out[di + 1] = data[si + 1];
        out[di + 2] = data[si + 2];
        out[di + 3] = data[si + 3];
      }
    }
    return out;
  }

  // --- Distort: Barrel Distortion (new buffer) ---
  function applyBarrel(data, w, h, params) {
    const k = params.barrelAmount / 100;
    const out = new Uint8ClampedArray(data.length);
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / maxR;
        const ny = (y - cy) / maxR;
        const r = Math.sqrt(nx * nx + ny * ny);
        const rn = r * (1 + k * r * r);
        const sx = Math.round(cx + nx / (r || 1) * rn * maxR);
        const sy = Math.round(cy + ny / (r || 1) * rn * maxR);
        const di = (y * w + x) * 4;

        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const si = (sy * w + sx) * 4;
          out[di] = data[si];
          out[di + 1] = data[si + 1];
          out[di + 2] = data[si + 2];
          out[di + 3] = data[si + 3];
        } else {
          out[di + 3] = 255;
        }
      }
    }
    return out;
  }

  return {
    getDefaults,
    hasActiveEffects,
    apply
  };
})();
