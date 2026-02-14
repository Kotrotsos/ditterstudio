/**
 * Ditter - Web Worker
 *
 * Runs dithering algorithms off the main thread to keep the UI responsive.
 * Uses WebGL for GPU-accelerated per-pixel algorithms when available,
 * falls back to CPU DitherEngine for sequential algorithms (error diffusion).
 */

// Import dependencies
importScripts('palettes.js', 'dither-engine.js', 'webgl-dither.js');

// Try to initialize WebGL in the worker
let gpuAvailable = false;
try {
  gpuAvailable = WebGLDither.init();
  if (gpuAvailable) {
    self.postMessage({ type: 'gpu-status', available: true });
  }
} catch (e) {
  // WebGL not available in worker, fall through to CPU
}

/**
 * Handle messages from the main thread.
 */
self.onmessage = function(e) {
  const { type, imageData, params } = e.data;

  if (type === 'process') {
    try {
      // Reconstruct image data from transferred buffer
      const source = {
        data: new Uint8ClampedArray(imageData.data),
        width: imageData.width,
        height: imageData.height
      };

      let result;

      // Try GPU-accelerated path for supported algorithms
      if (gpuAvailable && WebGLDither.canAccelerate(params.category, params.algorithm)) {
        result = processWithGPU(source, params);
      }

      // Fall back to CPU
      if (!result) {
        result = DitherEngine.process(source, params);
      }

      // Send result back with transferable for zero-copy
      const resultBuffer = result.data.buffer;
      self.postMessage({
        type: 'result',
        data: {
          data: resultBuffer,
          width: result.width,
          height: result.height
        }
      }, [resultBuffer]);
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: err.message
      });
    }
  }
};

/**
 * GPU-accelerated processing pipeline.
 * Handles adjustments on CPU (LUT is fast enough), dithering on GPU.
 */
function processWithGPU(sourceImageData, params) {
  const originalWidth = sourceImageData.width;
  const originalHeight = sourceImageData.height;

  // 1. Adjustments (CPU with LUT - fast enough, avoids GPU round-trip)
  let processed = DitherEngine.applyAdjustments(sourceImageData, {
    contrast: params.contrast ?? 50,
    midtones: params.midtones ?? 50,
    highlights: params.highlights ?? 50,
    invert: params.invert ?? false
  });

  // 2. Blur (CPU - separable box blur is already O(n))
  if (params.blur > 0) {
    processed = DitherEngine.applyBlur(processed, params.blur);
  }

  const smoothing = (params.smoothing ?? 0) / 100;
  if (smoothing > 0) {
    processed = DitherEngine.applyBlur(processed, smoothing * 8);
  }

  // 2c. Depth (unsharp mask)
  const depth = params.depth ?? 0;
  if (depth > 0) {
    const blurred = DitherEngine.applyBlur(processed, 2 + depth * 0.5);
    const amount = depth / 5;
    const pData = processed.data;
    const bData = blurred.data;
    for (let i = 0; i < pData.length; i += 4) {
      pData[i] = DitherEngine.clamp(Math.round(pData[i] + (pData[i] - bData[i]) * amount), 0, 255);
      pData[i + 1] = DitherEngine.clamp(Math.round(pData[i + 1] + (pData[i + 1] - bData[i + 1]) * amount), 0, 255);
      pData[i + 2] = DitherEngine.clamp(Math.round(pData[i + 2] + (pData[i + 2] - bData[i + 2]) * amount), 0, 255);
    }
  }

  // 3. Scale
  const scale = params.scale ?? 1;
  const scaledDown = DitherEngine.applyScale(processed, scale);

  // 4. GPU dithering
  const lineScale = params.lineScale ?? 1;
  const algoOptions = {
    threshold: (params.threshold ?? 50) / 100,
    lineScale: lineScale,
    spread: Math.max(0.2, lineScale),
    cellSize: Math.max(2, Math.round(8 * lineScale)),
    lineSpacing: Math.max(2, Math.round(4 * lineScale)),
    dotSize: Math.max(2, Math.round(6 * lineScale)),
    spacing: Math.max(2, Math.round(8 * lineScale))
  };

  let dithered = WebGLDither.processDither(
    scaledDown, params.palette,
    params.category, params.algorithm,
    algoOptions
  );

  if (!dithered) return null; // GPU failed, fall back to CPU

  // 5. Upscale
  if (scale > 1) {
    dithered = DitherEngine.upscaleNearest(dithered, originalWidth, originalHeight);
  }

  // 6. Blend
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
