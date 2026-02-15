/**
 * Ditter - Video Module
 *
 * Handles video loading, frame extraction, filmstrip navigation,
 * playback preview, and full video rendering with dithering.
 */

const DitterVideo = (() => {
  // Video element (hidden, used for frame extraction)
  let videoElement = null;
  let videoObjectURL = null;

  // State
  let isVideoMode = false;
  let totalFrames = 0;
  let currentFrameIndex = 0;
  let fps = 24;
  let duration = 0;
  let videoWidth = 0;
  let videoHeight = 0;

  // Extraction canvas (offscreen, video dimensions)
  let extractionCanvas = null;
  let extractionCtx = null;

  // Thumbnail cache: Map<frameIndex, HTMLCanvasElement>
  const thumbnailCache = new Map();
  const THUMB_HEIGHT = 76;

  // Processed frame cache with LRU eviction
  const processedCache = new Map();
  const MAX_CACHED = 50;
  const cacheOrder = [];

  // Playback
  let isPlaying = false;
  let playbackTimer = null;
  const PREVIEW_FPS = 8;

  // Rendering
  let isRendering = false;
  let renderCancelled = false;

  // Callbacks
  let onFrameReady = null;
  let onModeChanged = null;

  // DOM refs
  let filmstripArea = null;
  let filmstripTrack = null;
  let filmstripScroll = null;
  let frameCounter = null;
  let frameScrubber = null;
  let frameTime = null;
  let btnPlay = null;

  /**
   * Remove all children from an element safely.
   */
  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /**
   * Initialize the video module.
   */
  function init(options = {}) {
    onFrameReady = options.onFrameReady || null;
    onModeChanged = options.onModeChanged || null;

    filmstripArea = document.getElementById('filmstrip-area');
    filmstripTrack = document.getElementById('filmstrip-track');
    filmstripScroll = document.getElementById('filmstrip-scroll');
    frameCounter = document.getElementById('frame-counter');
    frameScrubber = document.getElementById('frame-scrubber');
    frameTime = document.getElementById('frame-time');
    btnPlay = document.getElementById('btn-frame-play');

    // Wire filmstrip controls
    document.getElementById('btn-frame-prev').addEventListener('click', prevFrame);
    document.getElementById('btn-frame-next').addEventListener('click', nextFrame);
    btnPlay.addEventListener('click', togglePlayback);

    frameScrubber.addEventListener('input', () => {
      goToFrame(parseInt(frameScrubber.value));
    });
  }

  /**
   * Load a video file and enter video mode.
   */
  async function loadVideo(file) {
    // Clean up previous
    if (videoElement) {
      exitVideoMode();
    }

    videoElement = document.createElement('video');
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.preload = 'auto';
    videoObjectURL = URL.createObjectURL(file);
    videoElement.src = videoObjectURL;

    await new Promise((resolve, reject) => {
      videoElement.onloadedmetadata = resolve;
      videoElement.onerror = () => reject(new Error('Failed to load video'));
    });

    // Ensure we can seek
    await new Promise((resolve) => {
      if (videoElement.readyState >= 2) {
        resolve();
        return;
      }
      videoElement.oncanplay = resolve;
    });

    duration = videoElement.duration;
    videoWidth = videoElement.videoWidth;
    videoHeight = videoElement.videoHeight;

    // Detect source fps (default to 24)
    fps = 24;
    totalFrames = Math.max(1, Math.floor(duration * fps));

    // Set up extraction canvas
    extractionCanvas = document.createElement('canvas');
    extractionCanvas.width = videoWidth;
    extractionCanvas.height = videoHeight;
    extractionCtx = extractionCanvas.getContext('2d', { willReadFrequently: true });

    isVideoMode = true;

    // Update UI
    frameScrubber.max = totalFrames - 1;
    frameScrubber.value = 0;

    // Build filmstrip
    buildFilmstrip();

    // Show filmstrip
    if (filmstripArea) filmstripArea.classList.remove('hidden');
    if (onModeChanged) onModeChanged(true);

    // Navigate to first frame
    await goToFrame(0);
  }

  /**
   * Build the filmstrip with thumbnail placeholders.
   */
  function buildFilmstrip() {
    clearChildren(filmstripTrack);
    thumbnailCache.clear();

    // Determine sampling: if >300 frames, show 1 thumbnail per second
    const sampleInterval = totalFrames > 300 ? Math.round(fps) : 1;
    const thumbFrames = [];
    for (let i = 0; i < totalFrames; i += sampleInterval) {
      thumbFrames.push(i);
    }

    // Create placeholder canvases
    const thumbWidth = Math.round((videoWidth / videoHeight) * THUMB_HEIGHT);
    thumbFrames.forEach((frameIdx) => {
      const c = document.createElement('canvas');
      c.width = thumbWidth;
      c.height = THUMB_HEIGHT;
      c.className = 'filmstrip-frame';
      c.dataset.frame = frameIdx;
      c.title = 'Frame ' + frameIdx;

      // Fill with dark placeholder
      const tctx = c.getContext('2d');
      tctx.fillStyle = '#1a1a1e';
      tctx.fillRect(0, 0, thumbWidth, THUMB_HEIGHT);

      c.addEventListener('click', () => {
        goToFrame(frameIdx);
      });

      filmstripTrack.appendChild(c);
    });

    // Generate thumbnails progressively
    generateThumbnailsBatched(thumbFrames, thumbWidth);
  }

  /**
   * Generate thumbnails in batches to avoid blocking.
   */
  async function generateThumbnailsBatched(frameIndices, thumbWidth) {
    for (let i = 0; i < frameIndices.length; i++) {
      if (!isVideoMode) return;

      const frameIdx = frameIndices[i];
      try {
        const imgData = await extractFrame(frameIdx);
        const c = filmstripTrack.querySelector('[data-frame="' + frameIdx + '"]');
        if (!c) continue;

        const tctx = c.getContext('2d');
        // Draw frame data to a temp canvas then scale
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        const tempCtx = tempCanvas.getContext('2d');
        const id = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height);
        tempCtx.putImageData(id, 0, 0);

        tctx.drawImage(tempCanvas, 0, 0, thumbWidth, THUMB_HEIGHT);
        thumbnailCache.set(frameIdx, c);
      } catch (e) {
        // Skip failed thumbnails
      }

      // Yield to main thread every 5 thumbnails
      if (i % 5 === 4) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  /**
   * Extract a single frame from the video as ImageData.
   * @param {number} frameIndex
   * @returns {Promise<{data: Uint8ClampedArray, width: number, height: number}>}
   */
  function extractFrame(frameIndex) {
    return new Promise((resolve, reject) => {
      const targetTime = frameIndex / fps;

      // If already at the right time (within half-frame tolerance)
      if (Math.abs(videoElement.currentTime - targetTime) < 0.5 / fps) {
        extractionCtx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
        const rawData = extractionCtx.getImageData(0, 0, videoWidth, videoHeight);
        resolve({
          data: new Uint8ClampedArray(rawData.data),
          width: videoWidth,
          height: videoHeight
        });
        return;
      }

      const onSeeked = () => {
        videoElement.removeEventListener('seeked', onSeeked);
        extractionCtx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
        const rawData = extractionCtx.getImageData(0, 0, videoWidth, videoHeight);
        resolve({
          data: new Uint8ClampedArray(rawData.data),
          width: videoWidth,
          height: videoHeight
        });
      };

      videoElement.addEventListener('seeked', onSeeked);
      videoElement.currentTime = targetTime;
    });
  }

  // Track whether first frame has been loaded (to avoid repeated zoomFit)
  let firstFrameLoaded = false;

  /**
   * Navigate to a specific frame.
   */
  async function goToFrame(index) {
    if (!isVideoMode) return;

    // Clamp
    index = Math.max(0, Math.min(totalFrames - 1, index));
    currentFrameIndex = index;

    // Update UI
    updateFrameUI();

    // Highlight filmstrip thumbnail
    highlightThumbnail(index);

    // Check processed cache
    if (processedCache.has(index)) {
      const cached = processedCache.get(index);
      DitterCanvas.setResultImageData(cached);
      return;
    }

    // Extract frame and feed to canvas pipeline
    const frameData = await extractFrame(index);

    if (!firstFrameLoaded) {
      // First frame: use loadImageData to set up zoom/fit and trigger onImageLoaded
      DitterCanvas.loadImageData(frameData.data, frameData.width, frameData.height);
      firstFrameLoaded = true;
    } else {
      // Subsequent frames: update source without resetting zoom, then process
      DitterCanvas.updateSourceData(frameData.data, frameData.width, frameData.height);
      DitterCanvas.processImage(DitterUI.getProcessingParams());
    }
  }

  /**
   * Update frame counter, scrubber, and time display.
   */
  function updateFrameUI() {
    if (frameCounter) {
      frameCounter.textContent = (currentFrameIndex + 1) + ' / ' + totalFrames;
    }
    if (frameScrubber) {
      frameScrubber.value = currentFrameIndex;
    }
    if (frameTime) {
      const secs = currentFrameIndex / fps;
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      frameTime.textContent = m + ':' + s.toString().padStart(2, '0');
    }
  }

  /**
   * Highlight the closest filmstrip thumbnail and scroll into view.
   */
  function highlightThumbnail(frameIndex) {
    // Remove previous active
    const prev = filmstripTrack.querySelector('.filmstrip-frame.active');
    if (prev) prev.classList.remove('active');

    // Find closest thumbnail
    const frames = filmstripTrack.querySelectorAll('.filmstrip-frame');
    let closest = null;
    let closestDist = Infinity;
    frames.forEach(f => {
      const fi = parseInt(f.dataset.frame);
      const dist = Math.abs(fi - frameIndex);
      if (dist < closestDist) {
        closestDist = dist;
        closest = f;
      }
    });

    if (closest) {
      closest.classList.add('active');
      closest.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /**
   * Go to the next frame.
   */
  function nextFrame() {
    if (!isVideoMode) return;
    goToFrame(currentFrameIndex + 1);
  }

  /**
   * Go to the previous frame.
   */
  function prevFrame() {
    if (!isVideoMode) return;
    goToFrame(currentFrameIndex - 1);
  }

  /**
   * Toggle playback preview.
   */
  function togglePlayback() {
    if (!isVideoMode) return;

    if (isPlaying) {
      stopPlayback();
    } else {
      isPlaying = true;
      if (btnPlay) btnPlay.textContent = 'Pause';

      // If at last frame, restart
      if (currentFrameIndex >= totalFrames - 1) {
        currentFrameIndex = 0;
      }

      playbackTimer = setInterval(() => {
        if (currentFrameIndex >= totalFrames - 1) {
          stopPlayback();
          return;
        }
        goToFrame(currentFrameIndex + 1);
      }, 1000 / PREVIEW_FPS);
    }
  }

  /**
   * Stop playback.
   */
  function stopPlayback() {
    isPlaying = false;
    if (playbackTimer) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
    if (btnPlay) btnPlay.textContent = 'Play';
  }

  /**
   * Get the current frame's raw ImageData.
   */
  async function getCurrentFrameData() {
    return extractFrame(currentFrameIndex);
  }

  /**
   * Reprocess the current frame (called when settings change).
   * Clears all cached processed frames since settings are now different.
   */
  function reprocessCurrentFrame() {
    processedCache.clear();
    cacheOrder.length = 0;
    // Re-navigate to current frame to trigger extraction + processing
    goToFrame(currentFrameIndex);
  }

  /**
   * Cache a processed frame result with LRU eviction.
   */
  function cacheCurrentFrame(result) {
    if (!isVideoMode || !result) return;

    const idx = currentFrameIndex;

    // If already cached, move to end
    const existingIdx = cacheOrder.indexOf(idx);
    if (existingIdx !== -1) {
      cacheOrder.splice(existingIdx, 1);
    }
    cacheOrder.push(idx);

    processedCache.set(idx, {
      data: new Uint8ClampedArray(result.data),
      width: result.width,
      height: result.height
    });

    // Evict oldest if over limit
    while (cacheOrder.length > MAX_CACHED) {
      const oldest = cacheOrder.shift();
      processedCache.delete(oldest);
    }
  }

  /**
   * Render the full video with dithering applied to every frame.
   * @param {object} options - { fps, quality, onProgress }
   * @returns {Promise<Blob>}
   */
  async function renderVideo(options = {}) {
    if (!isVideoMode || isRendering) return null;

    const renderFps = options.fps || 24;
    const quality = options.quality || 8;
    const onProgress = options.onProgress || (() => {});

    isRendering = true;
    renderCancelled = false;

    const renderTotalFrames = Math.max(1, Math.floor(duration * renderFps));

    // Create render canvas at video dimensions
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = videoWidth;
    renderCanvas.height = videoHeight;
    const renderCtx = renderCanvas.getContext('2d');

    // Create a dedicated worker for rendering
    const renderWorker = new Worker('js/worker.js');

    // Set up MediaRecorder
    const stream = renderCanvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0];

    // Try codec options
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: quality * 1_000_000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.start();

    // Get current dither params
    const params = DitterUI.getProcessingParams();

    // Process each frame
    for (let i = 0; i < renderTotalFrames; i++) {
      if (renderCancelled) break;

      // Extract frame
      const frameData = await extractFrameAtTime(i / renderFps);

      // Process through worker
      const processed = await processInWorker(renderWorker, frameData, params);

      // Draw to render canvas
      const imgData = new ImageData(
        new Uint8ClampedArray(processed.data),
        processed.width,
        processed.height
      );
      renderCtx.putImageData(imgData, 0, 0);

      // Request frame capture
      if (videoTrack.requestFrame) {
        videoTrack.requestFrame();
      }

      // Wait for frame timing
      await new Promise(r => setTimeout(r, 1000 / renderFps));

      // Report progress
      onProgress((i + 1) / renderTotalFrames);
    }

    // Stop recording
    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder.stop();
    });

    // Clean up
    renderWorker.terminate();
    stream.getTracks().forEach(t => t.stop());

    isRendering = false;

    if (renderCancelled) {
      return null;
    }

    return blob;
  }

  /**
   * Extract a frame at a specific time (for rendering at arbitrary fps).
   */
  function extractFrameAtTime(time) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        videoElement.removeEventListener('seeked', onSeeked);
        extractionCtx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
        const rawData = extractionCtx.getImageData(0, 0, videoWidth, videoHeight);
        resolve({
          data: new Uint8ClampedArray(rawData.data),
          width: videoWidth,
          height: videoHeight
        });
      };

      if (Math.abs(videoElement.currentTime - time) < 0.01) {
        extractionCtx.drawImage(videoElement, 0, 0, videoWidth, videoHeight);
        const rawData = extractionCtx.getImageData(0, 0, videoWidth, videoHeight);
        resolve({
          data: new Uint8ClampedArray(rawData.data),
          width: videoWidth,
          height: videoHeight
        });
        return;
      }

      videoElement.addEventListener('seeked', onSeeked);
      videoElement.currentTime = time;
    });
  }

  /**
   * Process a frame through a dedicated worker (promise-wrapped).
   */
  function processInWorker(w, frameData, params) {
    return new Promise((resolve, reject) => {
      const handler = (e) => {
        const { type, data } = e.data;
        if (type === 'result') {
          w.removeEventListener('message', handler);
          resolve({
            data: new Uint8ClampedArray(data.data),
            width: data.width,
            height: data.height
          });
        } else if (type === 'error') {
          w.removeEventListener('message', handler);
          reject(new Error(e.data.error));
        }
      };
      w.addEventListener('message', handler);

      const buffer = frameData.data.buffer.slice(0);
      w.postMessage({
        type: 'process',
        imageData: {
          data: buffer,
          width: frameData.width,
          height: frameData.height
        },
        params
      }, [buffer]);
    });
  }

  /**
   * Cancel an in-progress render.
   */
  function cancelRender() {
    renderCancelled = true;
  }

  /**
   * Exit video mode and clean up.
   */
  function exitVideoMode() {
    stopPlayback();

    if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement = null;
    }
    if (videoObjectURL) {
      URL.revokeObjectURL(videoObjectURL);
      videoObjectURL = null;
    }

    extractionCanvas = null;
    extractionCtx = null;

    thumbnailCache.clear();
    processedCache.clear();
    cacheOrder.length = 0;

    isVideoMode = false;
    totalFrames = 0;
    currentFrameIndex = 0;
    firstFrameLoaded = false;

    clearChildren(filmstripTrack);
    if (filmstripArea) filmstripArea.classList.add('hidden');

    if (onModeChanged) onModeChanged(false);
  }

  /**
   * Check if video mode is active.
   */
  function isActive() {
    return isVideoMode;
  }

  /**
   * Check if currently rendering.
   */
  function isCurrentlyRendering() {
    return isRendering;
  }

  return {
    init,
    loadVideo,
    goToFrame,
    nextFrame,
    prevFrame,
    togglePlayback,
    getCurrentFrameData,
    reprocessCurrentFrame,
    cacheCurrentFrame,
    renderVideo,
    cancelRender,
    exitVideoMode,
    isActive,
    isCurrentlyRendering
  };
})();
