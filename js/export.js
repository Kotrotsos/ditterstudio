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

    // Convert to blob and save
    const qualityFloat = format === 'png' ? undefined : quality / 100;
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create export blob');
        return;
      }
      saveBlobAs(blob, filename + '.' + ext, [
        { name: ext.toUpperCase() + ' Image', extensions: [ext] }
      ]);
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
   * Save a blob with a native "Save As" dialog (Tauri) or browser fallback.
   * @param {Blob} blob
   * @param {string} defaultFilename - Suggested filename
   * @param {Array<{name: string, extensions: string[]}>} [filters] - File type filters
   * @returns {Promise<boolean>} true if saved, false if cancelled
   */
  async function saveBlobAs(blob, defaultFilename, filters) {
    // Try Tauri native save dialog
    if (window.__TAURI__ && window.__TAURI__.dialog && window.__TAURI__.fs) {
      try {
        const path = await window.__TAURI__.dialog.save({
          defaultPath: defaultFilename,
          filters: filters || []
        });
        if (!path) return false; // User cancelled

        const bytes = new Uint8Array(await blob.arrayBuffer());
        await window.__TAURI__.fs.writeFile(path, bytes);
        return true;
      } catch (e) {
        console.warn('Tauri save dialog failed, falling back to download:', e);
      }
    }

    // Fallback: browser download
    downloadBlob(blob, defaultFilename);
    return true;
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

  /**
   * Detect the effective cell size of a dithered image by scanning for uniform blocks.
   * Starts from the top-left and tests block sizes from large to small.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @returns {number} Detected cell size (1 if no uniform blocks found)
   */
  function detectCellSize(imageData) {
    const { data, width, height } = imageData;
    const maxTest = Math.min(32, Math.min(width, height));

    for (let size = maxTest; size >= 2; size--) {
      if (width % size !== 0 || height % size !== 0) continue;

      let uniform = true;
      // Test a sample of blocks
      const testCount = Math.min(50, (width / size) * (height / size));
      const colsPerRow = width / size;
      const totalBlocks = colsPerRow * (height / size);
      const step = Math.max(1, Math.floor(totalBlocks / testCount));

      for (let bi = 0; bi < totalBlocks && uniform; bi += step) {
        const bx = (bi % colsPerRow) * size;
        const by = Math.floor(bi / colsPerRow) * size;
        const idx = (by * width + bx) * 4;
        const r0 = data[idx], g0 = data[idx + 1], b0 = data[idx + 2];

        for (let dy = 0; dy < size && uniform; dy++) {
          for (let dx = 0; dx < size && uniform; dx++) {
            if (dx === 0 && dy === 0) continue;
            const pi = ((by + dy) * width + (bx + dx)) * 4;
            if (data[pi] !== r0 || data[pi + 1] !== g0 || data[pi + 2] !== b0) {
              uniform = false;
            }
          }
        }
      }

      if (uniform) return size;
    }
    return 1;
  }

  /**
   * Get SVG export info (cell count, estimated size).
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @returns {{ cellSize: number, cellCount: number, cols: number, rows: number }}
   */
  function getSVGInfo(imageData) {
    const cellSize = detectCellSize(imageData);
    const cols = Math.ceil(imageData.width / cellSize);
    const rows = Math.ceil(imageData.height / cellSize);
    return { cellSize, cellCount: cols * rows, cols, rows };
  }

  /**
   * Export the current result as an SVG file.
   * Each dithered pixel/cell becomes an SVG rect.
   *
   * @param {{ data: Uint8ClampedArray, width: number, height: number }} imageData
   * @param {object} options
   * @param {string} options.filename - File name without extension
   */
  function exportSVG(imageData, options) {
    if (!imageData) return;

    const { filename = 'ditter-export' } = options;
    const { data, width, height } = imageData;
    const { cellSize, cols, rows } = getSVGInfo(imageData);

    // Build color map: group cells by color for efficiency
    const colorCells = new Map();

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const px = col * cellSize;
        const py = row * cellSize;
        const idx = (py * width + px) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const hex = '#' +
          ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

        if (!colorCells.has(hex)) {
          colorCells.set(hex, []);
        }
        colorCells.get(hex).push([col, row]);
      }
    }

    // Build SVG string
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">\n`);

    // Find the most common color and use it as background
    let bgColor = null;
    let bgCount = 0;
    for (const [hex, cells] of colorCells) {
      if (cells.length > bgCount) {
        bgCount = cells.length;
        bgColor = hex;
      }
    }

    // Background rect
    if (bgColor) {
      parts.push(`<rect width="${width}" height="${height}" fill="${bgColor}"/>\n`);
    }

    // Output cells grouped by color, skipping background
    for (const [hex, cells] of colorCells) {
      if (hex === bgColor) continue;
      if (cells.length === 0) continue;

      // Group into horizontal runs for compression
      parts.push(`<g fill="${hex}">\n`);

      let i = 0;
      while (i < cells.length) {
        const [startCol, row] = cells[i];
        let endCol = startCol;

        // Merge consecutive cells on the same row
        while (i + 1 < cells.length &&
               cells[i + 1][1] === row &&
               cells[i + 1][0] === endCol + 1) {
          endCol = cells[i + 1][0];
          i++;
        }

        const x = startCol * cellSize;
        const y = row * cellSize;
        const w = (endCol - startCol + 1) * cellSize;
        parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${cellSize}"/>\n`);
        i++;
      }

      parts.push(`</g>\n`);
    }

    parts.push(`</svg>`);

    const svgString = parts.join('');
    const blob = new Blob([svgString], { type: 'image/svg+xml' });

    saveBlobAs(blob, filename + '.svg', [
      { name: 'SVG Image', extensions: ['svg'] }
    ]);
  }

  return {
    exportImage,
    exportSVG,
    getSVGInfo,
    toDataURL,
    downloadBlob,
    saveBlobAs
  };
})();
