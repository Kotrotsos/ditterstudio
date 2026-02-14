/**
 * Ditter - Web Worker
 *
 * Runs dithering algorithms off the main thread to keep the UI responsive.
 * Imports the dither engine and palettes, then processes images on demand.
 */

// Import dependencies
importScripts('palettes.js', 'dither-engine.js');

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

      // Run the dithering process
      const result = DitherEngine.process(source, params);

      // Send result back
      self.postMessage({
        type: 'result',
        data: {
          data: result.data,
          width: result.width,
          height: result.height
        }
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: err.message
      });
    }
  }
};
