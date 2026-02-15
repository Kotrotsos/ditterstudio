/**
 * Ditter - Canvas Manager
 *
 * Handles the preview canvas: rendering, zooming, panning.
 */

const DitterCanvas = (() => {
  let canvas = null;
  let ctx = null;
  let container = null;

  // Source image data (original loaded image)
  let sourceImage = null; // HTMLImageElement or ImageBitmap
  let sourceImageData = null; // { data: Uint8ClampedArray, width, height }

  // Dithered result
  let resultImageData = null; // { data: Uint8ClampedArray, width, height }

  // Zoom and pan state
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Processing state
  let isProcessing = false;
  let pendingProcess = null;

  // Web Worker
  let worker = null;

  // Theme background color (cached from CSS variable)
  let bgColor = '#0e0e10';

  // Callbacks
  let onProcessingStart = null;
  let onProcessingEnd = null;
  let onImageLoaded = null;
  let onZoomChanged = null;

  /**
   * Initialize the canvas manager.
   */
  function init(options = {}) {
    canvas = document.getElementById('preview-canvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');

    onProcessingStart = options.onProcessingStart || null;
    onProcessingEnd = options.onProcessingEnd || null;
    onImageLoaded = options.onImageLoaded || null;
    onZoomChanged = options.onZoomChanged || null;

    setupPanZoom();
    initWorker();
    resize();

    window.addEventListener('resize', resize);
  }

  /**
   * Initialize the Web Worker for off-thread processing.
   */
  function initWorker() {
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (e) => {
        console.warn('Worker error, falling back to main thread:', e.message);
        worker = null;
      };
    } catch (e) {
      console.warn('Web Worker not available, processing on main thread.');
      worker = null;
    }
  }

  /**
   * Handle messages from the worker.
   */
  function handleWorkerMessage(e) {
    const { type, data } = e.data;

    if (type === 'gpu-status') {
      // WebGL availability notification from worker, ignore
      return;
    }

    if (type === 'result') {
      // Reconstruct Uint8ClampedArray from transferred ArrayBuffer
      resultImageData = {
        data: new Uint8ClampedArray(data.data),
        width: data.width,
        height: data.height
      };
      render();
      isProcessing = false;
      if (onProcessingEnd) onProcessingEnd();

      // Process any pending request
      if (pendingProcess) {
        const pending = pendingProcess;
        pendingProcess = null;
        processImage(pending);
      }
    } else if (type === 'error') {
      console.error('Worker processing error:', e.data.error);
      isProcessing = false;
      if (onProcessingEnd) onProcessingEnd();

      // Process any pending request even after error
      if (pendingProcess) {
        const pending = pendingProcess;
        pendingProcess = null;
        processImage(pending);
      }
    }
  }

  /**
   * Set up pan and zoom event handlers.
   */
  function setupPanZoom() {
    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(32, zoom * delta));

      // Zoom toward mouse position
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Mouse offset from the image center (accounting for current pan)
      const imgCenterX = centerX + panX;
      const imgCenterY = centerY + panY;
      const offsetX = mouseX - imgCenterX;
      const offsetY = mouseY - imgCenterY;

      // Adjust pan so the point under the mouse stays in place
      const ratio = newZoom / zoom;
      panX = panX - offsetX * (ratio - 1);
      panY = panY - offsetY * (ratio - 1);

      zoom = newZoom;
      render();
      if (onZoomChanged) onZoomChanged(zoom);
    }, { passive: false });

    // Pan
    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!sourceImageData) return;
      isPanning = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      container.classList.add('grabbing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX += e.clientX - lastMouseX;
      panY += e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      render();
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      container.classList.remove('grabbing');
    });
  }

  /**
   * Resize canvas to container size.
   */
  function resize() {
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    render();
  }

  /**
   * Render the current state to the canvas.
   */
  function render() {
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.width / dpr;
    const displayHeight = canvas.height / dpr;

    // Always re-apply DPR transform (canvas state resets when dimensions change)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    const imgData = resultImageData || sourceImageData;
    if (!imgData) return;

    // Create ImageData from our format
    const imageData = new ImageData(
      new Uint8ClampedArray(imgData.data),
      imgData.width,
      imgData.height
    );

    // Create offscreen canvas for the image
    const offscreen = new OffscreenCanvas(imgData.width, imgData.height);
    const offCtx = offscreen.getContext('2d');
    offCtx.putImageData(imageData, 0, 0);

    // Calculate position
    const imgW = imgData.width * zoom;
    const imgH = imgData.height * zoom;
    const x = (displayWidth - imgW) / 2 + panX;
    const y = (displayHeight - imgH) / 2 + panY;

    // Draw with pixelated rendering
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, x, y, imgW, imgH);
  }

  /**
   * Load an image from a File or Blob.
   * @param {File|Blob} file
   */
  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();

    return new Promise((resolve, reject) => {
      img.onload = () => {
        sourceImage = img;

        // Extract pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        const rawData = tempCtx.getImageData(0, 0, img.width, img.height);

        sourceImageData = {
          data: new Uint8ClampedArray(rawData.data),
          width: img.width,
          height: img.height
        };

        resultImageData = null;
        URL.revokeObjectURL(url);

        // Fit to view
        zoomFit();
        render();

        if (onImageLoaded) {
          onImageLoaded({
            width: img.width,
            height: img.height,
            name: file.name || 'image'
          });
        }

        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      img.src = url;
    });
  }

  /**
   * Load image data directly (for color/gradient inputs).
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} height
   */
  function loadImageData(data, width, height) {
    sourceImageData = { data: new Uint8ClampedArray(data), width, height };
    resultImageData = null;
    zoomFit();
    render();

    if (onImageLoaded) {
      onImageLoaded({ width, height, name: 'generated' });
    }
  }

  /**
   * Process the current source image with dithering parameters.
   * @param {object} params - Processing parameters (passed to DitherEngine.process)
   */
  function processImage(params) {
    if (!sourceImageData) return;

    if (isProcessing) {
      // Queue this request, replacing any previous pending
      pendingProcess = params;
      return;
    }

    isProcessing = true;
    if (onProcessingStart) onProcessingStart();

    if (worker) {
      // Process in worker - use transferable for zero-copy
      const buffer = sourceImageData.data.buffer.slice(0);
      worker.postMessage({
        type: 'process',
        imageData: {
          data: buffer,
          width: sourceImageData.width,
          height: sourceImageData.height
        },
        params
      }, [buffer]);
    } else {
      // Fallback: process on main thread
      try {
        resultImageData = DitherEngine.process(sourceImageData, params);
        render();
      } catch (e) {
        console.error('Dither processing error:', e);
      }
      isProcessing = false;
      if (onProcessingEnd) onProcessingEnd();
    }
  }

  /**
   * Get the current processed result image data.
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }|null}
   */
  function getResultImageData() {
    return resultImageData || sourceImageData;
  }

  /**
   * Set the result image data directly (e.g. from Studio).
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} data
   */
  function setResultImageData(data) {
    resultImageData = {
      data: new Uint8ClampedArray(data.data),
      width: data.width,
      height: data.height
    };
    render();
  }

  /**
   * Get the source image data.
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }|null}
   */
  function getSourceImageData() {
    return sourceImageData;
  }

  /**
   * Update source data in-place without triggering zoom fit or callbacks.
   * Used for live source parameter changes (e.g. gradient tweaking).
   * @param {Uint8ClampedArray} data
   * @param {number} width
   * @param {number} height
   */
  function updateSourceData(data, width, height) {
    sourceImageData = { data: new Uint8ClampedArray(data), width, height };
    resultImageData = null;
  }

  /**
   * Check if an image is loaded.
   * @returns {boolean}
   */
  function hasImage() {
    return sourceImageData !== null;
  }

  // --- Image Transforms ---

  function flipHorizontal() {
    if (!sourceImageData) return;
    const { data, width, height } = sourceImageData;
    const flipped = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const dstIdx = (y * width + (width - 1 - x)) * 4;
        flipped[dstIdx] = data[srcIdx];
        flipped[dstIdx + 1] = data[srcIdx + 1];
        flipped[dstIdx + 2] = data[srcIdx + 2];
        flipped[dstIdx + 3] = data[srcIdx + 3];
      }
    }
    sourceImageData = { data: flipped, width, height };
    resultImageData = null;
    render();
  }

  function flipVertical() {
    if (!sourceImageData) return;
    const { data, width, height } = sourceImageData;
    const flipped = new Uint8ClampedArray(data.length);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const srcOff = y * rowSize;
      const dstOff = (height - 1 - y) * rowSize;
      flipped.set(data.subarray(srcOff, srcOff + rowSize), dstOff);
    }
    sourceImageData = { data: flipped, width, height };
    resultImageData = null;
    render();
  }

  function rotateCW() {
    if (!sourceImageData) return;
    const { data, width, height } = sourceImageData;
    const rotated = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const dstIdx = (x * height + (height - 1 - y)) * 4;
        rotated[dstIdx] = data[srcIdx];
        rotated[dstIdx + 1] = data[srcIdx + 1];
        rotated[dstIdx + 2] = data[srcIdx + 2];
        rotated[dstIdx + 3] = data[srcIdx + 3];
      }
    }
    sourceImageData = { data: rotated, width: height, height: width };
    resultImageData = null;
    zoomFit();
    render();
  }

  // --- Zoom Controls ---

  function zoomIn() {
    zoom = Math.min(32, zoom * 1.25);
    render();
    if (onZoomChanged) onZoomChanged(zoom);
  }

  function zoomOut() {
    zoom = Math.max(0.1, zoom / 1.25);
    render();
    if (onZoomChanged) onZoomChanged(zoom);
  }

  function zoomReset() {
    zoom = 1;
    panX = 0;
    panY = 0;
    render();
    if (onZoomChanged) onZoomChanged(zoom);
  }

  function zoomFit() {
    if (!sourceImageData) return;
    const rect = container.getBoundingClientRect();
    const scaleX = (rect.width - 40) / sourceImageData.width;
    const scaleY = (rect.height - 40) / sourceImageData.height;
    zoom = Math.min(scaleX, scaleY, 1);
    panX = 0;
    panY = 0;
    render();
    if (onZoomChanged) onZoomChanged(zoom);
  }

  function getZoom() {
    return zoom;
  }

  /**
   * Update cached background color from CSS variable.
   * Called when theme changes.
   */
  function updateThemeColor() {
    bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0e0e10';
    render();
  }

  /**
   * Reset to the original unprocessed source image.
   */
  function resetToOriginal() {
    resultImageData = null;
    render();
  }

  /**
   * Destroy and clean up.
   */
  function destroy() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    window.removeEventListener('resize', resize);
  }

  return {
    init,
    loadImage,
    loadImageData,
    updateSourceData,
    processImage,
    getResultImageData,
    setResultImageData,
    getSourceImageData,
    hasImage,
    render,
    resize,
    zoomIn,
    zoomOut,
    zoomReset,
    zoomFit,
    getZoom,
    updateThemeColor,
    resetToOriginal,
    flipHorizontal,
    flipVertical,
    rotateCW,
    destroy
  };
})();
