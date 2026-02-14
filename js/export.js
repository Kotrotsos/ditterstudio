/**
 * Ditter - Export Manager
 *
 * Handles exporting the dithered image in various formats.
 */

const DitterExport = (() => {

  /**
   * Export the current result as a downloadable file.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {object} options
   * @param {string} options.format - 'png', 'jpg', or 'webp'
   * @param {number} options.quality - 1-100 (only for jpg/webp)
   * @param {number} options.scale - Output scale multiplier (1, 2, 4)
   * @param {string} options.filename - File name without extension
   */
  function exportImage(imageData, options) {
    if (!imageData) return;

    const { format = 'png', quality = 92, scale = 1, filename = 'ditter-export' } = options;

    const outWidth = imageData.width * scale;
    const outHeight = imageData.height * scale;

    // Create canvas at output size
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = outWidth;
    exportCanvas.height = outHeight;
    const ctx = exportCanvas.getContext('2d');

    // Create source canvas with image data
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = imageData.width;
    srcCanvas.height = imageData.height;
    const srcCtx = srcCanvas.getContext('2d');
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    srcCtx.putImageData(imgData, 0, 0);

    // Draw scaled (nearest-neighbor for pixel-perfect scaling)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, 0, 0, outWidth, outHeight);

    // Determine MIME type and extension
    let mimeType, ext;
    switch (format) {
      case 'jpg':
        mimeType = 'image/jpeg';
        ext = 'jpg';
        break;
      case 'webp':
        mimeType = 'image/webp';
        ext = 'webp';
        break;
      case 'png':
      default:
        mimeType = 'image/png';
        ext = 'png';
        break;
    }

    // Convert to blob and download
    const qualityFloat = format === 'png' ? undefined : quality / 100;
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create export blob');
        return;
      }
      downloadBlob(blob, `${filename}.${ext}`);
    }, mimeType, qualityFloat);
  }

  /**
   * Download a blob as a file.
   * @param {Blob} blob
   * @param {string} filename
   */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get a data URL for the current result (for clipboard, etc.).
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {string} [format='png']
   * @returns {string} Data URL
   */
  function toDataURL(imageData, format = 'png') {
    if (!imageData) return '';

    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData.data),
      imageData.width,
      imageData.height
    );
    ctx.putImageData(imgData, 0, 0);

    const mimeType = format === 'jpg' ? 'image/jpeg'
      : format === 'webp' ? 'image/webp'
      : 'image/png';

    return canvas.toDataURL(mimeType);
  }

  return {
    exportImage,
    toDataURL
  };
})();
