/**
 * Ditter - Pattern Designer
 *
 * Provides Paint, Shape Lab, and Wave Mixer functionality for the Ditter Studio.
 * Each mode generates custom threshold maps for ordered dithering.
 */

const DitterPatternDesigner = (() => {

  // Active tab: 'classic', 'paint', 'shape', 'wave'
  let activeTab = 'classic';

  // Paint mode state
  let paintGrid = null;
  let paintSize = 8;
  let brushValue = 128;
  let isPainting = false;
  let paintCanvas = null;
  let paintCtx = null;

  // Shape lab state
  let shapeType = 'circle';
  let shapeCellSize = 16;
  let shapeAngle = 0;
  let shapeElongation = 1.0;
  let shapePreviewCanvas = null;
  let shapePreviewCtx = null;
  let angleDial = null;
  let angleDialCtx = null;

  // Wave mixer state
  let waveLayers = [];
  let waveContainer = null;

  // =============================================
  // PAINT MODE
  // =============================================

  /**
   * Create a size x size 2D array filled with 0.
   * @param {number} size
   */
  function initPaintGrid(size) {
    paintSize = size;
    paintGrid = Array.from({ length: size }, () => Array(size).fill(0));
  }

  /**
   * Draw the paint grid to the paint canvas.
   */
  function renderPaintCanvas() {
    if (!paintCanvas || !paintCtx || !paintGrid) return;

    const cellPx = paintCanvas.width / paintSize;
    paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);

    for (let y = 0; y < paintSize; y++) {
      for (let x = 0; x < paintSize; x++) {
        const v = paintGrid[y][x];
        paintCtx.fillStyle = `rgb(${v},${v},${v})`;
        paintCtx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
      }
    }

    // Grid lines
    paintCtx.strokeStyle = 'rgba(255,255,255,0.15)';
    paintCtx.lineWidth = 1;
    for (let i = 0; i <= paintSize; i++) {
      const pos = i * cellPx;
      paintCtx.beginPath();
      paintCtx.moveTo(pos, 0);
      paintCtx.lineTo(pos, paintCanvas.height);
      paintCtx.stroke();
      paintCtx.beginPath();
      paintCtx.moveTo(0, pos);
      paintCtx.lineTo(paintCanvas.width, pos);
      paintCtx.stroke();
    }
  }

  /**
   * Handle mouse/touch interaction on the paint canvas.
   * @param {MouseEvent|TouchEvent} e
   * @param {boolean} isDown - Whether the button is currently pressed
   */
  function handlePaintMouse(e, isDown) {
    if (!isDown && !isPainting) return;

    const rect = paintCanvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = paintCanvas.width / rect.width;
    const scaleY = paintCanvas.height / rect.height;
    const px = (clientX - rect.left) * scaleX;
    const py = (clientY - rect.top) * scaleY;

    const cellPx = paintCanvas.width / paintSize;
    const cx = Math.floor(px / cellPx);
    const cy = Math.floor(py / cellPx);

    if (cx >= 0 && cx < paintSize && cy >= 0 && cy < paintSize) {
      paintGrid[cy][cx] = brushValue;
      renderPaintCanvas();
    }
  }

  /**
   * Convert grayscale grid to rank-ordered threshold map.
   * Sort all values, assign ranks (0 to N*N-1).
   * @returns {number[][]}
   */
  function paintToThresholdMap() {
    if (!paintGrid) return null;
    const n = paintSize;
    const total = n * n;

    // Collect all cells with their positions
    const cells = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        cells.push({ x, y, value: paintGrid[y][x] });
      }
    }

    // Sort by value ascending, with positional tiebreaking
    cells.sort((a, b) => {
      if (a.value !== b.value) return a.value - b.value;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    // Assign ranks
    const result = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < total; i++) {
      result[cells[i].y][cells[i].x] = i;
    }
    return result;
  }

  /**
   * Set up the Paint tab inside the given container.
   * @param {HTMLElement} container
   */
  function setupPaintTab(container) {
    if (!container) return;

    // Grid size selector
    const sizeRow = document.createElement('div');
    sizeRow.className = 'pattern-control-row';
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Grid Size';
    const sizeSelect = document.createElement('select');
    [4, 8, 16, 32].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s + 'x' + s;
      if (s === paintSize) opt.selected = true;
      sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener('change', (e) => {
      initPaintGrid(parseInt(e.target.value));
      renderPaintCanvas();
    });
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(sizeSelect);
    container.appendChild(sizeRow);

    // Brush value slider
    const brushRow = document.createElement('div');
    brushRow.className = 'pattern-control-row';
    const brushLabel = document.createElement('label');
    brushLabel.textContent = 'Brush Value';
    const brushSlider = document.createElement('input');
    brushSlider.type = 'range';
    brushSlider.min = 0;
    brushSlider.max = 255;
    brushSlider.value = brushValue;
    const brushReadout = document.createElement('span');
    brushReadout.className = 'pattern-readout';
    brushReadout.textContent = brushValue;
    brushSlider.addEventListener('input', () => {
      brushValue = parseInt(brushSlider.value);
      brushReadout.textContent = brushValue;
    });
    brushRow.appendChild(brushLabel);
    brushRow.appendChild(brushSlider);
    brushRow.appendChild(brushReadout);
    container.appendChild(brushRow);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-sm';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      initPaintGrid(paintSize);
      renderPaintCanvas();
    });
    container.appendChild(clearBtn);

    // Canvas
    paintCanvas = document.createElement('canvas');
    paintCanvas.width = 256;
    paintCanvas.height = 256;
    paintCanvas.className = 'pattern-paint-canvas';
    paintCtx = paintCanvas.getContext('2d');
    container.appendChild(paintCanvas);

    // Mouse/touch events
    paintCanvas.addEventListener('mousedown', (e) => {
      isPainting = true;
      handlePaintMouse(e, true);
    });
    paintCanvas.addEventListener('mousemove', (e) => {
      handlePaintMouse(e, isPainting);
    });
    paintCanvas.addEventListener('mouseup', () => { isPainting = false; });
    paintCanvas.addEventListener('mouseleave', () => { isPainting = false; });

    paintCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isPainting = true;
      handlePaintMouse(e, true);
    });
    paintCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      handlePaintMouse(e, isPainting);
    });
    paintCanvas.addEventListener('touchend', () => { isPainting = false; });

    // Initialize grid and render
    initPaintGrid(paintSize);
    renderPaintCanvas();
  }

  // =============================================
  // SHAPE LAB
  // =============================================

  const shapeFunctions = {
    circle: (x, y) => Math.sqrt(x * x + y * y),
    diamond: (x, y) => Math.abs(x) + Math.abs(y),
    square: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    cross: (x, y) => Math.min(Math.abs(x), Math.abs(y)),
    star: (x, y) => {
      const r = Math.sqrt(x * x + y * y);
      const a = Math.atan2(y, x);
      return r * (1 + 0.3 * Math.cos(6 * a));
    },
    ring: (x, y) => Math.abs(Math.sqrt(x * x + y * y) - 0.5),
    hexagon: (x, y) => {
      const ax = Math.abs(x), ay = Math.abs(y);
      return Math.max(ax, ax * 0.5 + ay * 0.866);
    }
  };

  /**
   * Apply rotation and elongation transform.
   * @param {number} x
   * @param {number} y
   * @param {number} angle - Radians
   * @param {number} elongation
   * @returns {number[]} [tx, ty]
   */
  function applyTransform(x, y, angle, elongation) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    return [rx * elongation, ry];
  }

  /**
   * Generate size x size distance field based on current shape settings.
   * @param {number} size
   * @returns {number[][]}
   */
  function generateShapeField(size) {
    const fn = shapeFunctions[shapeType] || shapeFunctions.circle;
    const field = Array.from({ length: size }, () => Array(size).fill(0));

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Normalize to -1..1
        const nx = (x / (size - 1)) * 2 - 1;
        const ny = (y / (size - 1)) * 2 - 1;
        const [tx, ty] = applyTransform(nx, ny, shapeAngle, shapeElongation);
        field[y][x] = fn(tx, ty);
      }
    }
    return field;
  }

  /**
   * Convert shape distance field to rank-normalized threshold map.
   * @returns {number[][]}
   */
  function shapeToThresholdMap() {
    const size = shapeCellSize;
    const field = generateShapeField(size);
    const total = size * size;

    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        cells.push({ x, y, value: field[y][x] });
      }
    }

    cells.sort((a, b) => {
      if (a.value !== b.value) return a.value - b.value;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < total; i++) {
      result[cells[i].y][cells[i].x] = i;
    }
    return result;
  }

  /**
   * Draw 128x128 preview showing distance field as grayscale gradient.
   */
  function renderShapePreview() {
    if (!shapePreviewCanvas || !shapePreviewCtx) return;

    const size = 128;
    shapePreviewCanvas.width = size;
    shapePreviewCanvas.height = size;

    const field = generateShapeField(size);

    // Find min/max for normalization
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (field[y][x] < min) min = field[y][x];
        if (field[y][x] > max) max = field[y][x];
      }
    }

    const range = max - min || 1;
    const imgData = shapePreviewCtx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = Math.round(((field[y][x] - min) / range) * 255);
        const idx = (y * size + x) * 4;
        imgData.data[idx] = v;
        imgData.data[idx + 1] = v;
        imgData.data[idx + 2] = v;
        imgData.data[idx + 3] = 255;
      }
    }
    shapePreviewCtx.putImageData(imgData, 0, 0);
  }

  /**
   * Draw 40x40 circular dial with a line showing current angle.
   */
  function renderAngleDial() {
    if (!angleDial || !angleDialCtx) return;

    const size = 40;
    angleDial.width = size;
    angleDial.height = size;

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    angleDialCtx.clearRect(0, 0, size, size);

    // Circle outline
    angleDialCtx.strokeStyle = '#888';
    angleDialCtx.lineWidth = 1;
    angleDialCtx.beginPath();
    angleDialCtx.arc(cx, cy, r, 0, Math.PI * 2);
    angleDialCtx.stroke();

    // Angle line
    const lx = cx + Math.cos(shapeAngle) * r;
    const ly = cy + Math.sin(shapeAngle) * r;
    angleDialCtx.strokeStyle = '#fff';
    angleDialCtx.lineWidth = 2;
    angleDialCtx.beginPath();
    angleDialCtx.moveTo(cx, cy);
    angleDialCtx.lineTo(lx, ly);
    angleDialCtx.stroke();

    // Center dot
    angleDialCtx.fillStyle = '#fff';
    angleDialCtx.beginPath();
    angleDialCtx.arc(cx, cy, 2, 0, Math.PI * 2);
    angleDialCtx.fill();
  }

  /**
   * Set up the Shape Lab tab inside the given container.
   * @param {HTMLElement} container
   */
  function setupShapeTab(container) {
    if (!container) return;

    // Shape type selector
    const shapeRow = document.createElement('div');
    shapeRow.className = 'pattern-control-row';
    const shapeLabel = document.createElement('label');
    shapeLabel.textContent = 'Shape';
    const shapeSelect = document.createElement('select');
    Object.keys(shapeFunctions).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      if (name === shapeType) opt.selected = true;
      shapeSelect.appendChild(opt);
    });
    shapeSelect.addEventListener('change', (e) => {
      shapeType = e.target.value;
      renderShapePreview();
      renderAngleDial();
    });
    shapeRow.appendChild(shapeLabel);
    shapeRow.appendChild(shapeSelect);
    container.appendChild(shapeRow);

    // Cell size slider
    const cellRow = document.createElement('div');
    cellRow.className = 'pattern-control-row';
    const cellLabel = document.createElement('label');
    cellLabel.textContent = 'Cell Size';
    const cellSlider = document.createElement('input');
    cellSlider.type = 'range';
    cellSlider.min = 4;
    cellSlider.max = 64;
    cellSlider.value = shapeCellSize;
    const cellReadout = document.createElement('span');
    cellReadout.className = 'pattern-readout';
    cellReadout.textContent = shapeCellSize;
    cellSlider.addEventListener('input', () => {
      shapeCellSize = parseInt(cellSlider.value);
      cellReadout.textContent = shapeCellSize;
    });
    cellRow.appendChild(cellLabel);
    cellRow.appendChild(cellSlider);
    cellRow.appendChild(cellReadout);
    container.appendChild(cellRow);

    // Angle slider
    const angleRow = document.createElement('div');
    angleRow.className = 'pattern-control-row';
    const angleLabel = document.createElement('label');
    angleLabel.textContent = 'Angle';
    const angleSlider = document.createElement('input');
    angleSlider.type = 'range';
    angleSlider.min = 0;
    angleSlider.max = 360;
    angleSlider.value = 0;
    const angleReadout = document.createElement('span');
    angleReadout.className = 'pattern-readout';
    angleReadout.textContent = '0';

    // Angle dial canvas
    angleDial = document.createElement('canvas');
    angleDial.width = 40;
    angleDial.height = 40;
    angleDial.className = 'pattern-angle-dial';
    angleDialCtx = angleDial.getContext('2d');

    angleSlider.addEventListener('input', () => {
      const deg = parseInt(angleSlider.value);
      shapeAngle = (deg * Math.PI) / 180;
      angleReadout.textContent = deg;
      renderAngleDial();
      renderShapePreview();
    });
    angleRow.appendChild(angleLabel);
    angleRow.appendChild(angleSlider);
    angleRow.appendChild(angleReadout);
    angleRow.appendChild(angleDial);
    container.appendChild(angleRow);

    // Elongation slider
    const elongRow = document.createElement('div');
    elongRow.className = 'pattern-control-row';
    const elongLabel = document.createElement('label');
    elongLabel.textContent = 'Elongation';
    const elongSlider = document.createElement('input');
    elongSlider.type = 'range';
    elongSlider.min = 10;
    elongSlider.max = 300;
    elongSlider.value = 100;
    const elongReadout = document.createElement('span');
    elongReadout.className = 'pattern-readout';
    elongReadout.textContent = '1.0';
    elongSlider.addEventListener('input', () => {
      shapeElongation = parseInt(elongSlider.value) / 100;
      elongReadout.textContent = shapeElongation.toFixed(1);
      renderShapePreview();
    });
    elongRow.appendChild(elongLabel);
    elongRow.appendChild(elongSlider);
    elongRow.appendChild(elongReadout);
    container.appendChild(elongRow);

    // Shape preview canvas
    shapePreviewCanvas = document.createElement('canvas');
    shapePreviewCanvas.width = 128;
    shapePreviewCanvas.height = 128;
    shapePreviewCanvas.className = 'pattern-shape-preview';
    shapePreviewCtx = shapePreviewCanvas.getContext('2d');
    container.appendChild(shapePreviewCanvas);

    // Initial render
    renderShapePreview();
    renderAngleDial();
  }

  // =============================================
  // WAVE MIXER
  // =============================================

  /**
   * Compute wave function value.
   * @param {string} type - 'sine', 'triangle', 'sawtooth', 'square'
   * @param {number} t - Input value
   * @returns {number} 0..1
   */
  function waveFunction(type, t) {
    switch (type) {
      case 'sine':
        return Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      case 'triangle':
        return Math.abs(((t % 1) + 1) % 1 * 2 - 1);
      case 'sawtooth':
        return ((t % 1) + 1) % 1;
      case 'square':
        return Math.sin(t * Math.PI * 2) >= 0 ? 1 : 0;
      default:
        return 0;
    }
  }

  /**
   * Create a default wave layer.
   * @returns {object}
   */
  function createDefaultLayer() {
    return {
      type: 'sine',
      direction: 0,
      frequency: 1,
      amplitude: 1,
      phase: 0,
      blendMode: 'add'
    };
  }

  /**
   * Generate combined wave pattern of given size.
   * @param {number} size
   * @returns {number[][]}
   */
  function generateWavePattern(size) {
    const pattern = Array.from({ length: size }, () => Array(size).fill(0));

    if (waveLayers.length === 0) return pattern;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let combined = 0;

        for (const layer of waveLayers) {
          const dirRad = (layer.direction * Math.PI) / 180;
          const dx = Math.cos(dirRad);
          const dy = Math.sin(dirRad);

          // Normalize coordinates to 0..1
          const nx = x / size;
          const ny = y / size;

          // Project onto direction vector
          const proj = nx * dx + ny * dy;
          const t = proj * layer.frequency + layer.phase / 360;
          const val = waveFunction(layer.type, t) * layer.amplitude;

          switch (layer.blendMode) {
            case 'add':
              combined += val;
              break;
            case 'multiply':
              combined = combined === 0 ? val : combined * val;
              break;
            case 'max':
              combined = Math.max(combined, val);
              break;
            case 'min':
              combined = waveLayers.indexOf(layer) === 0
                ? val
                : Math.min(combined, val);
              break;
            case 'subtract':
              combined -= val;
              break;
          }
        }

        pattern[y][x] = combined;
      }
    }

    return pattern;
  }

  /**
   * Convert wave pattern to rank-normalized threshold map.
   * @returns {number[][]}
   */
  function waveToThresholdMap() {
    // Use a reasonable size for the threshold map
    const size = 16;
    const pattern = generateWavePattern(size);
    const total = size * size;

    const cells = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        cells.push({ x, y, value: pattern[y][x] });
      }
    }

    cells.sort((a, b) => {
      if (a.value !== b.value) return a.value - b.value;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const result = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < total; i++) {
      result[cells[i].y][cells[i].x] = i;
    }
    return result;
  }

  /**
   * Add a new default wave layer.
   */
  function addWaveLayer() {
    waveLayers.push(createDefaultLayer());
    renderWaveLayers();
  }

  /**
   * Remove a wave layer by index.
   * @param {number} index
   */
  function removeWaveLayer(index) {
    waveLayers.splice(index, 1);
    renderWaveLayers();
  }

  /**
   * Render a small inline preview for a single wave layer.
   * @param {object} layer
   * @param {HTMLCanvasElement} canvas - 48x48
   */
  function renderLayerPreview(layer, canvas) {
    const ctx = canvas.getContext('2d');
    const size = 48;
    canvas.width = size;
    canvas.height = size;

    const dirRad = (layer.direction * Math.PI) / 180;
    const dx = Math.cos(dirRad);
    const dy = Math.sin(dirRad);

    const imgData = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size;
        const ny = y / size;
        const proj = nx * dx + ny * dy;
        const t = proj * layer.frequency + layer.phase / 360;
        const val = waveFunction(layer.type, t) * layer.amplitude;
        const v = Math.max(0, Math.min(255, Math.round(val * 255)));
        const idx = (y * size + x) * 4;
        imgData.data[idx] = v;
        imgData.data[idx + 1] = v;
        imgData.data[idx + 2] = v;
        imgData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Render all wave layer UI cards into the wave container.
   */
  function renderWaveLayers() {
    if (!waveContainer) return;

    // Clear existing layer cards (preserve control buttons)
    const cards = waveContainer.querySelectorAll('.wave-layer-card');
    cards.forEach(c => c.remove());

    waveLayers.forEach((layer, index) => {
      const card = document.createElement('div');
      card.className = 'wave-layer-card';

      // Header with remove button
      const header = document.createElement('div');
      header.className = 'wave-layer-header';
      const title = document.createElement('span');
      title.textContent = 'Layer ' + (index + 1);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn-sm';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', () => removeWaveLayer(index));
      header.appendChild(title);
      header.appendChild(removeBtn);
      card.appendChild(header);

      const body = document.createElement('div');
      body.className = 'wave-layer-body';

      // Wave type dropdown
      const typeRow = createWaveControl('Type', () => {
        const sel = document.createElement('select');
        ['sine', 'triangle', 'sawtooth', 'square'].forEach(t => {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
          if (t === layer.type) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          layer.type = sel.value;
          renderLayerPreview(layer, preview);
        });
        return sel;
      });
      body.appendChild(typeRow);

      // Blend mode dropdown
      const blendRow = createWaveControl('Blend', () => {
        const sel = document.createElement('select');
        ['add', 'multiply', 'max', 'min', 'subtract'].forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
          if (m === layer.blendMode) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', () => {
          layer.blendMode = sel.value;
        });
        return sel;
      });
      body.appendChild(blendRow);

      // Direction slider (0-360)
      const dirRow = createWaveSliderControl('Direction', 0, 360, layer.direction, (v) => {
        layer.direction = v;
        renderLayerPreview(layer, preview);
      });
      body.appendChild(dirRow);

      // Frequency slider (0.1-10, step 0.1)
      const freqRow = createWaveSliderControl('Frequency', 0.1, 10, layer.frequency, (v) => {
        layer.frequency = v;
        renderLayerPreview(layer, preview);
      }, 0.1);
      body.appendChild(freqRow);

      // Amplitude slider (0-2, step 0.1)
      const ampRow = createWaveSliderControl('Amplitude', 0, 2, layer.amplitude, (v) => {
        layer.amplitude = v;
        renderLayerPreview(layer, preview);
      }, 0.1);
      body.appendChild(ampRow);

      // Phase slider (0-360)
      const phaseRow = createWaveSliderControl('Phase', 0, 360, layer.phase, (v) => {
        layer.phase = v;
        renderLayerPreview(layer, preview);
      });
      body.appendChild(phaseRow);

      card.appendChild(body);

      // Inline preview canvas
      const preview = document.createElement('canvas');
      preview.width = 48;
      preview.height = 48;
      preview.className = 'wave-layer-preview';
      card.appendChild(preview);

      renderLayerPreview(layer, preview);
      waveContainer.appendChild(card);
    });
  }

  /**
   * Helper: create a wave control row with a label and custom input element.
   * @param {string} label
   * @param {Function} inputFactory - Returns the input element
   * @returns {HTMLElement}
   */
  function createWaveControl(label, inputFactory) {
    const row = document.createElement('div');
    row.className = 'pattern-control-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(inputFactory());
    return row;
  }

  /**
   * Helper: create a wave slider control row.
   * @param {string} label
   * @param {number} min
   * @param {number} max
   * @param {number} value
   * @param {Function} onChange
   * @param {number} [step=1]
   * @returns {HTMLElement}
   */
  function createWaveSliderControl(label, min, max, value, onChange, step = 1) {
    const row = document.createElement('div');
    row.className = 'pattern-control-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    const readout = document.createElement('span');
    readout.className = 'pattern-readout';
    readout.textContent = step < 1 ? parseFloat(value).toFixed(1) : value;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      readout.textContent = step < 1 ? v.toFixed(1) : v;
      onChange(v);
    });
    row.appendChild(lbl);
    row.appendChild(slider);
    row.appendChild(readout);
    return row;
  }

  /**
   * Set up the Wave Mixer tab inside the given container.
   * @param {HTMLElement} container
   */
  function setupWaveTab(container) {
    if (!container) return;

    waveContainer = container;

    // Control buttons row
    const btnRow = document.createElement('div');
    btnRow.className = 'pattern-control-row';

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-sm';
    addBtn.textContent = 'Add Layer';
    addBtn.addEventListener('click', addWaveLayer);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-sm';
    clearBtn.textContent = 'Clear All';
    clearBtn.addEventListener('click', () => {
      waveLayers = [];
      renderWaveLayers();
    });

    btnRow.appendChild(addBtn);
    btnRow.appendChild(clearBtn);
    container.appendChild(btnRow);

    // Start with one default layer
    waveLayers = [createDefaultLayer()];
    renderWaveLayers();
  }

  // =============================================
  // PUBLIC API
  // =============================================

  /**
   * Initialize the pattern designer. Called by Studio.
   */
  function init() {
    // References are stored as tabs are set up via setupPaintTab, etc.
  }

  /**
   * Set the active tab.
   * @param {string} tab - 'classic', 'paint', 'shape', 'wave'
   */
  function setActiveTab(tab) {
    activeTab = tab;
  }

  /**
   * Get the threshold map for the active tab.
   * @returns {number[][]|null} null for 'classic' (Studio handles it)
   */
  function getThresholdMap() {
    switch (activeTab) {
      case 'paint':
        return paintToThresholdMap();
      case 'shape':
        return shapeToThresholdMap();
      case 'wave':
        return waveToThresholdMap();
      case 'classic':
      default:
        return null;
    }
  }

  /**
   * Update the studio preview using the active pattern designer tab.
   * @param {object} sourceData - { data, width, height }
   * @param {number[][]} palette - Array of [r,g,b]
   * @param {HTMLCanvasElement} canvas - The studio preview canvas
   * @returns {boolean} true if handled, false if Studio should handle it
   */
  function updatePreview(sourceData, palette, canvas) {
    if (activeTab === 'classic') return false;

    const thresholdMap = getThresholdMap();
    if (!thresholdMap || !sourceData) return false;

    try {
      const result = DitherEngine.processCustomThreshold(
        sourceData, palette, thresholdMap
      );
      if (result && canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = new ImageData(
          new Uint8ClampedArray(result.data),
          result.width,
          result.height
        );
        const offscreen = new OffscreenCanvas(result.width, result.height);
        const offCtx = offscreen.getContext('2d');
        offCtx.putImageData(imageData, 0, 0);

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
      }
      return true;
    } catch (e) {
      console.warn('PatternDesigner preview error:', e);
      return false;
    }
  }

  return {
    init,
    getActiveTab: () => activeTab,
    setActiveTab,
    getThresholdMap,
    updatePreview,
    setupPaintTab,
    setupShapeTab,
    setupWaveTab
  };
})();
