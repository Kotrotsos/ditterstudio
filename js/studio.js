/**
 * Ditter - Dither Studio
 *
 * Custom dither creation tool. Allows users to:
 * - Define custom error diffusion matrices
 * - Create custom threshold maps
 * - Combine multiple dither effects in a stack
 * - Paint custom threshold patterns
 * - Design shapes and wave patterns
 * - Preview and apply results
 */

const DitterStudio = (() => {
  let matrixSize = 3;
  let matrixData = [];
  let matrixOriginX = 1;
  let matrixOriginY = 0;

  let thresholdSize = 8;
  let thresholdData = [];

  let effectStack = [];

  let studioCanvas = null;
  let studioCtx = null;

  // Active tab
  let activeTab = 'classic';

  // Preview debounce
  let previewTimer = null;
  const PREVIEW_DELAY = 150;

  /**
   * Initialize the studio.
   */
  function init() {
    studioCanvas = document.getElementById('studio-canvas');
    if (studioCanvas) {
      studioCtx = studioCanvas.getContext('2d');
    }

    initMatrixGrid(3);
    initThresholdGrid(8);
    setupEventListeners();
    setupTabs();

    // Initialize pattern designer if available
    if (typeof DitterPatternDesigner !== 'undefined') {
      DitterPatternDesigner.init();
      DitterPatternDesigner.setupPaintTab(document.getElementById('studio-tab-paint'));
      DitterPatternDesigner.setupShapeTab(document.getElementById('studio-tab-shape'));
      DitterPatternDesigner.setupWaveTab(document.getElementById('studio-tab-wave'));
    }
  }

  /**
   * Set up tab switching.
   */
  function setupTabs() {
    const tabs = document.querySelectorAll('.studio-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        if (tabId === activeTab) return;

        // Update tab buttons
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update tab panels
        document.querySelectorAll('.studio-tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('studio-tab-' + tabId);
        if (panel) panel.classList.add('active');

        activeTab = tabId;

        // Notify pattern designer
        if (typeof DitterPatternDesigner !== 'undefined') {
          DitterPatternDesigner.setActiveTab(tabId);
        }

        // Update preview for the new tab
        schedulePreviewForActiveTab();
      });
    });
  }

  /**
   * Schedule a preview update appropriate for the active tab.
   */
  function schedulePreviewForActiveTab() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (activeTab === 'classic') {
        updateCustomPreview();
      } else if (typeof DitterPatternDesigner !== 'undefined') {
        const sourceData = DitterCanvas.getSourceImageData();
        if (!sourceData) return;
        const uiSettings = DitterUI.getSettings();
        const palette = DitterPalettes.getColors(uiSettings.paletteCategory, uiSettings.palette);
        DitterPatternDesigner.updatePreview(sourceData, palette, studioCanvas, studioCtx, renderToCanvas);
      }
    }, PREVIEW_DELAY);
  }

  /**
   * Set up event listeners for studio controls.
   */
  function setupEventListeners() {
    const matrixSizeSelect = document.getElementById('studio-matrix-size');
    if (matrixSizeSelect) {
      matrixSizeSelect.addEventListener('change', (e) => {
        initMatrixGrid(parseInt(e.target.value));
        scheduleCustomPreview();
      });
    }

    const thresholdSizeSelect = document.getElementById('studio-threshold-size');
    if (thresholdSizeSelect) {
      thresholdSizeSelect.addEventListener('change', (e) => {
        initThresholdGrid(parseInt(e.target.value));
        scheduleCustomPreview();
      });
    }

    const addEffectBtn = document.getElementById('btn-studio-add-effect');
    if (addEffectBtn) {
      addEffectBtn.addEventListener('click', addEffect);
    }

    const clearEffectsBtn = document.getElementById('btn-studio-clear-effects');
    if (clearEffectsBtn) {
      clearEffectsBtn.addEventListener('click', clearEffects);
    }

    const applyBtn = document.getElementById('btn-studio-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyToMain);
    }

    const saveBtn = document.getElementById('btn-studio-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveAsPreset);
    }

    // Preset selector in Studio
    const presetSelect = document.getElementById('studio-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const presetId = e.target.value;
        if (presetId) {
          DitterUI.applyPreset(presetId);
        }
      });
    }
  }

  /**
   * Populate the Studio presets dropdown.
   */
  function populatePresets() {
    const select = document.getElementById('studio-preset-select');
    if (!select) return;

    const current = select.value;

    while (select.firstChild) select.removeChild(select.firstChild);

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = '-- Current Settings --';
    select.appendChild(defaultOpt);

    const presets = DitterPresets.getAll();
    presets.forEach(preset => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name + (preset.isBuiltIn ? '' : ' (custom)');
      select.appendChild(opt);
    });

    select.value = current || '';
  }

  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function initMatrixGrid(size) {
    matrixSize = size;
    matrixOriginX = Math.floor(size / 2);
    matrixOriginY = 0;

    matrixData = Array.from({ length: size }, () => Array(size).fill(0));

    if (size === 3) {
      matrixData[0][2] = 7;
      matrixData[1][0] = 3;
      matrixData[1][1] = 5;
      matrixData[1][2] = 1;
    }

    renderMatrixGrid();
    updateDivisor();
  }

  function renderMatrixGrid() {
    const container = document.getElementById('studio-matrix-grid');
    if (!container) return;

    clearChildren(container);
    container.style.gridTemplateColumns = `repeat(${matrixSize}, 40px)`;

    for (let y = 0; y < matrixSize; y++) {
      for (let x = 0; x < matrixSize; x++) {
        const cell = document.createElement('input');
        cell.type = 'number';
        cell.className = 'matrix-cell';
        cell.value = matrixData[y][x];
        cell.min = 0;
        cell.max = 99;

        if (x === matrixOriginX && y === matrixOriginY) {
          cell.classList.add('origin');
          cell.disabled = true;
          cell.value = '*';
        }

        if (y < matrixOriginY || (y === matrixOriginY && x <= matrixOriginX)) {
          if (!(x === matrixOriginX && y === matrixOriginY)) {
            cell.disabled = true;
            cell.value = 0;
            cell.style.opacity = '0.3';
          }
        }

        const cx = x;
        const cy = y;
        cell.addEventListener('input', () => {
          matrixData[cy][cx] = parseInt(cell.value) || 0;
          updateDivisor();
          scheduleCustomPreview();
        });

        container.appendChild(cell);
      }
    }
  }

  function updateDivisor() {
    let sum = 0;
    for (let y = 0; y < matrixSize; y++) {
      for (let x = 0; x < matrixSize; x++) {
        if (x === matrixOriginX && y === matrixOriginY) continue;
        sum += matrixData[y][x] || 0;
      }
    }
    const divisorEl = document.getElementById('studio-divisor');
    if (divisorEl) {
      divisorEl.textContent = sum || 'auto';
    }
  }

  function initThresholdGrid(size) {
    thresholdSize = size;
    thresholdData = generateBayerMatrix(size);
    renderThresholdGrid();
  }

  function generateBayerMatrix(n) {
    if (n === 2) {
      return [[0, 2], [3, 1]];
    }
    const half = n / 2;
    const smaller = generateBayerMatrix(half);
    const result = Array.from({ length: n }, () => Array(n).fill(0));

    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const base = smaller[y][x] * 4;
        result[y][x] = base;
        result[y][x + half] = base + 2;
        result[y + half][x] = base + 3;
        result[y + half][x + half] = base + 1;
      }
    }
    return result;
  }

  function renderThresholdGrid() {
    const container = document.getElementById('studio-threshold-grid');
    if (!container) return;

    clearChildren(container);
    container.style.gridTemplateColumns = `repeat(${thresholdSize}, 28px)`;

    const maxVal = thresholdSize * thresholdSize - 1;

    for (let y = 0; y < thresholdSize; y++) {
      for (let x = 0; x < thresholdSize; x++) {
        const cell = document.createElement('input');
        cell.type = 'number';
        cell.className = 'threshold-cell';
        cell.value = thresholdData[y][x];
        cell.min = 0;
        cell.max = maxVal;

        const cx = x;
        const cy = y;
        cell.addEventListener('input', () => {
          thresholdData[cy][cx] = parseInt(cell.value) || 0;
          scheduleCustomPreview();
        });

        container.appendChild(cell);
      }
    }
  }

  function addEffect() {
    const categories = DitherEngine.getCategories();
    const firstCat = categories[0];
    const algos = DitherEngine.getAlgorithmsInCategory(firstCat);
    const firstAlgo = algos[0];

    effectStack.push({
      type: 'algorithm',
      category: firstCat,
      algorithm: firstAlgo.id,
      name: firstAlgo.name,
      opacity: 1.0
    });

    renderEffectStack();
  }

  function clearEffects() {
    effectStack = [];
    renderEffectStack();
  }

  function removeEffect(index) {
    effectStack.splice(index, 1);
    renderEffectStack();
  }

  function renderEffectStack() {
    const container = document.getElementById('studio-effect-stack');
    if (!container) return;

    clearChildren(container);

    if (effectStack.length === 0) {
      const p = document.createElement('p');
      p.className = 'placeholder-text';
      p.textContent = 'No effects added yet. Add dither effects below.';
      container.appendChild(p);
      return;
    }

    effectStack.forEach((effect, index) => {
      const item = document.createElement('div');
      item.className = 'effect-item';

      const name = document.createElement('span');
      name.className = 'effect-item-name';
      name.textContent = effect.name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'effect-item-remove';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', () => removeEffect(index));

      item.appendChild(name);
      item.appendChild(removeBtn);
      container.appendChild(item);
    });
  }

  // --- Preview ---

  function renderToCanvas(imgData) {
    if (!studioCanvas || !studioCtx || !imgData) return;

    const container = studioCanvas.parentElement;
    const rect = container.getBoundingClientRect();
    const availW = rect.width || 320;
    const availH = Math.max(200, (rect.height || 400) - 60);

    const scaleX = availW / imgData.width;
    const scaleY = availH / imgData.height;
    const scale = Math.min(scaleX, scaleY, 2);

    const displayW = Math.round(imgData.width * scale);
    const displayH = Math.round(imgData.height * scale);

    const dpr = window.devicePixelRatio || 1;
    studioCanvas.width = displayW * dpr;
    studioCanvas.height = displayH * dpr;
    studioCanvas.style.width = displayW + 'px';
    studioCanvas.style.height = displayH + 'px';
    studioCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const imageData = new ImageData(
      new Uint8ClampedArray(imgData.data),
      imgData.width,
      imgData.height
    );

    const offscreen = new OffscreenCanvas(imgData.width, imgData.height);
    const offCtx = offscreen.getContext('2d');
    offCtx.putImageData(imageData, 0, 0);

    studioCtx.imageSmoothingEnabled = false;
    studioCtx.drawImage(offscreen, 0, 0, displayW, displayH);
  }

  function updatePreview() {
    if (activeTab !== 'classic') {
      schedulePreviewForActiveTab();
      return;
    }
    const resultData = DitterCanvas.getResultImageData();
    if (resultData) {
      renderToCanvas(resultData);
    }
  }

  function updateCustomPreview() {
    const sourceData = DitterCanvas.getSourceImageData();
    if (!sourceData) return;

    const customMatrix = getMatrixData();
    const customThreshold = getThresholdData();

    const uiSettings = DitterUI.getSettings();
    const palette = DitterPalettes.getColors(uiSettings.paletteCategory, uiSettings.palette);

    let result;
    try {
      if (customMatrix.hasWeights) {
        result = DitherEngine.processCustomMatrix(
          sourceData, palette,
          customMatrix.matrix, customMatrix.originX, customMatrix.originY,
          customMatrix.divisor || 1
        );
      } else {
        result = DitherEngine.processCustomThreshold(
          sourceData, palette, customThreshold
        );
      }
      if (result) renderToCanvas(result);
    } catch (e) {
      console.warn('Studio preview error:', e);
    }
  }

  function scheduleCustomPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      updateCustomPreview();
    }, PREVIEW_DELAY);
  }

  function isVisible() {
    const modal = document.getElementById('modal-studio');
    return modal && !modal.classList.contains('hidden');
  }

  function applyToMain() {
    const sourceData = DitterCanvas.getSourceImageData();
    if (!sourceData) return;

    const uiSettings = DitterUI.getSettings();
    const palette = DitterPalettes.getColors(uiSettings.paletteCategory, uiSettings.palette);

    // If a designer tab is active, use its threshold map
    if (activeTab !== 'classic' && typeof DitterPatternDesigner !== 'undefined') {
      const thresholdMap = DitterPatternDesigner.getThresholdMap();
      if (thresholdMap) {
        const result = DitherEngine.processCustomThreshold(sourceData, palette, thresholdMap);
        if (result) DitterCanvas.setResultImageData(result);
        return;
      }
    }

    // Classic mode
    const customMatrix = getMatrixData();
    const customThreshold = getThresholdData();

    let result;
    if (customMatrix.hasWeights) {
      result = DitherEngine.processCustomMatrix(
        sourceData, palette,
        customMatrix.matrix, customMatrix.originX, customMatrix.originY,
        customMatrix.divisor || 1
      );
    } else {
      result = DitherEngine.processCustomThreshold(
        sourceData, palette, customThreshold
      );
    }

    DitterCanvas.setResultImageData(result);
  }

  function saveAsPreset() {
    const event = new CustomEvent('studio-save-preset', {
      detail: {
        matrix: getMatrixData(),
        threshold: getThresholdData(),
        effectStack: [...effectStack]
      }
    });
    document.dispatchEvent(event);
  }

  function getMatrixData() {
    let divisor = 0;
    for (let y = 0; y < matrixSize; y++) {
      for (let x = 0; x < matrixSize; x++) {
        if (x === matrixOriginX && y === matrixOriginY) continue;
        divisor += matrixData[y][x] || 0;
      }
    }
    return {
      matrix: matrixData.map(row => [...row]),
      originX: matrixOriginX,
      originY: matrixOriginY,
      divisor: divisor,
      hasWeights: divisor > 0
    };
  }

  function getThresholdData() {
    return thresholdData.map(row => [...row]);
  }

  return {
    init,
    getMatrixData,
    getThresholdData,
    updatePreview,
    updateCustomPreview,
    populatePresets,
    isVisible,
    renderToCanvas
  };
})();
