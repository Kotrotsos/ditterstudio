/**
 * Ditter - UI Controller
 *
 * Manages all UI controls, event handlers, and state binding.
 */

const DitterUI = (() => {
  // Current settings state
  let settings = {};

  // Source settings (separate from dither settings)
  let sourceSettings = {
    sourceType: 'linear-gradient',
    sourceColor: '#808080',
    sourceColorStart: '#000000',
    sourceColorEnd: '#ffffff',
    sourceAngle: 0,
    sourceWidth: 512,
    sourceHeight: 512
  };

  // Debounce timer for slider changes
  let processTimer = null;
  let sourceTimer = null;
  const PROCESS_DELAY = 80; // ms debounce for slider changes

  // Callbacks
  let onSettingsChanged = null;
  let onSourceChanged = null;

  /**
   * Initialize the UI.
   * @param {object} options
   * @param {Function} options.onSettingsChanged - Called when any setting changes
   */
  function init(options = {}) {
    onSettingsChanged = options.onSettingsChanged || null;
    onSourceChanged = options.onSourceChanged || null;

    // Load default settings
    settings = DitterPresets.getDefaults();

    // Populate dropdowns
    populateAlgorithmDropdowns();
    populatePaletteDropdowns();
    populatePresetDropdown();

    // Bind all controls
    bindDropdowns();
    bindSliders();
    bindButtons();
    bindCheckboxes();
    bindSourceControls();

    // Set up resizable panel
    setupPanelResize();

    // Apply initial state to UI
    applySettingsToUI(settings);
  }

  /**
   * Populate the algorithm category and algorithm dropdowns.
   */
  function populateAlgorithmDropdowns() {
    const categorySelect = document.getElementById('style-category');
    const algorithmSelect = document.getElementById('style-algorithm');

    clearChildren(categorySelect);

    const categories = DitherEngine.getCategories();
    categories.forEach(catId => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = DitherEngine.getCategoryName(catId);
      categorySelect.appendChild(option);
    });

    updateAlgorithmOptions(settings.category);
  }

  /**
   * Update algorithm dropdown based on selected category.
   * @param {string} categoryId
   */
  function updateAlgorithmOptions(categoryId) {
    const algorithmSelect = document.getElementById('style-algorithm');
    clearChildren(algorithmSelect);

    const algos = DitherEngine.getAlgorithmsInCategory(categoryId);
    algos.forEach(algo => {
      const option = document.createElement('option');
      option.value = algo.id;
      option.textContent = algo.name;
      algorithmSelect.appendChild(option);
    });

    // Select first algorithm if current one isn't in this category
    if (algos.length > 0 && !algos.find(a => a.id === settings.algorithm)) {
      settings.algorithm = algos[0].id;
    }
    algorithmSelect.value = settings.algorithm;
  }

  /**
   * Populate palette category and palette dropdowns.
   */
  function populatePaletteDropdowns() {
    const categorySelect = document.getElementById('palette-category');
    const paletteSelect = document.getElementById('palette-select');

    clearChildren(categorySelect);

    const categories = DitterPalettes.getCategories();
    categories.forEach(catId => {
      const option = document.createElement('option');
      option.value = catId;
      option.textContent = catId.charAt(0).toUpperCase() + catId.slice(1);
      categorySelect.appendChild(option);
    });

    updatePaletteOptions(settings.paletteCategory);
  }

  /**
   * Update palette dropdown based on category.
   * @param {string} categoryId
   */
  function updatePaletteOptions(categoryId) {
    const paletteSelect = document.getElementById('palette-select');
    clearChildren(paletteSelect);

    const palettes = DitterPalettes.getPalettesInCategory(categoryId);
    for (const [id, palette] of Object.entries(palettes)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = palette.name;
      paletteSelect.appendChild(option);
    }

    // Select first if current isn't valid
    const keys = Object.keys(palettes);
    if (keys.length > 0 && !keys.includes(settings.palette)) {
      settings.palette = keys[0];
    }
    paletteSelect.value = settings.palette;

    updatePalettePreview();
  }

  /**
   * Update the palette color preview swatches.
   */
  function updatePalettePreview() {
    const preview = document.getElementById('palette-preview');
    if (!preview) return;

    clearChildren(preview);

    const colors = DitterPalettes.getColors(settings.paletteCategory, settings.palette);
    colors.forEach(([r, g, b]) => {
      const swatch = document.createElement('div');
      swatch.className = 'palette-swatch';
      swatch.style.backgroundColor = `rgb(${r},${g},${b})`;
      preview.appendChild(swatch);
    });
  }

  /**
   * Populate the preset dropdown.
   */
  function populatePresetDropdown() {
    const presetSelect = document.getElementById('preset-select');
    clearChildren(presetSelect);

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select Preset --';
    presetSelect.appendChild(defaultOption);

    const presets = DitterPresets.getAll();
    presets.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.name + (preset.isBuiltIn ? '' : ' (custom)');
      presetSelect.appendChild(option);
    });
  }

  /**
   * Remove all child nodes from an element.
   * @param {HTMLElement} el
   */
  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /**
   * Set up resizable panel handle.
   */
  function setupPanelResize() {
    const handle = document.getElementById('panel-resize-handle');
    if (!handle) return;

    // Restore saved width
    const savedWidth = localStorage.getItem('ditter-panel-width');
    if (savedWidth) {
      const w = parseInt(savedWidth);
      if (w >= 240 && w <= 600) {
        document.documentElement.style.setProperty('--panel-width', w + 'px');
      }
    }

    let startX = 0;
    let startWidth = 0;
    let isDragging = false;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width'));
      handle.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(240, Math.min(600, startWidth + delta));
      document.documentElement.style.setProperty('--panel-width', newWidth + 'px');
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const currentWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width'));
      localStorage.setItem('ditter-panel-width', currentWidth);
      DitterCanvas.resize();
    });
  }

  /**
   * Bind dropdown change handlers.
   */
  function bindDropdowns() {
    // Algorithm category
    document.getElementById('style-category').addEventListener('change', (e) => {
      settings.category = e.target.value;
      updateAlgorithmOptions(settings.category);
      triggerProcess();
    });

    // Algorithm
    document.getElementById('style-algorithm').addEventListener('change', (e) => {
      settings.algorithm = e.target.value;
      triggerProcess();
    });

    // Palette category
    document.getElementById('palette-category').addEventListener('change', (e) => {
      settings.paletteCategory = e.target.value;
      updatePaletteOptions(settings.paletteCategory);
      triggerProcess();
    });

    // Palette
    document.getElementById('palette-select').addEventListener('change', (e) => {
      settings.palette = e.target.value;
      updatePalettePreview();
      triggerProcess();
    });

    // Preset
    document.getElementById('preset-select').addEventListener('change', (e) => {
      const presetId = e.target.value;
      if (!presetId) return;
      const preset = DitterPresets.get(presetId);
      if (preset) {
        settings = { ...preset.settings };
        applySettingsToUI(settings);
        triggerProcess();
      }
    });
  }

  /**
   * Bind slider input handlers.
   */
  function bindSliders() {
    const sliders = [
      { id: 'slider-scale', key: 'scale', display: 'val-scale' },
      { id: 'slider-line-scale', key: 'lineScale', display: 'val-line-scale' },
      { id: 'slider-smoothing', key: 'smoothing', display: 'val-smoothing' },
      { id: 'slider-blend', key: 'blend', display: 'val-blend' },
      { id: 'slider-contrast', key: 'contrast', display: 'val-contrast' },
      { id: 'slider-midtones', key: 'midtones', display: 'val-midtones' },
      { id: 'slider-highlights', key: 'highlights', display: 'val-highlights' },
      { id: 'slider-threshold', key: 'threshold', display: 'val-threshold' },
      { id: 'slider-blur', key: 'blur', display: 'val-blur' },
      { id: 'slider-depth', key: 'depth', display: 'val-depth' }
    ];

    sliders.forEach(({ id, key, display }) => {
      const slider = document.getElementById(id);
      const valueEl = document.getElementById(display);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        settings[key] = val;
        valueEl.textContent = Number.isInteger(val) ? val : val.toFixed(1);
        triggerProcessDebounced();
      });
    });
  }

  /**
   * Bind button click handlers.
   */
  function bindButtons() {
    // Save Preset
    document.getElementById('btn-save-preset').addEventListener('click', () => {
      showModal('modal-save-preset');
    });

    // Do Save Preset
    document.getElementById('btn-do-save-preset').addEventListener('click', () => {
      const nameInput = document.getElementById('preset-name');
      const name = nameInput.value.trim();
      if (!name) return;
      DitterPresets.savePreset(name, settings);
      populatePresetDropdown();
      hideModal('modal-save-preset');
      nameInput.value = '';
    });

    // Reset All
    document.getElementById('btn-reset-all').addEventListener('click', () => {
      settings = DitterPresets.getDefaults();
      applySettingsToUI(settings);
      document.getElementById('preset-select').value = '';
      triggerProcess();
    });

    // Zoom controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => DitterCanvas.zoomIn());
    document.getElementById('btn-zoom-out').addEventListener('click', () => DitterCanvas.zoomOut());
    document.getElementById('btn-zoom-reset').addEventListener('click', () => DitterCanvas.zoomReset());
    document.getElementById('btn-zoom-fit').addEventListener('click', () => DitterCanvas.zoomFit());

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
      });
    });

    // Modal backdrop close
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        const modal = backdrop.closest('.modal');
        if (modal) modal.classList.add('hidden');
      });
    });
  }

  /**
   * Bind checkbox handlers.
   */
  function bindCheckboxes() {
    document.getElementById('toggle-invert').addEventListener('change', (e) => {
      settings.invert = e.target.checked;
      triggerProcess();
    });
  }

  /**
   * Bind source control handlers.
   */
  function bindSourceControls() {
    // Source type dropdown
    document.getElementById('source-type').addEventListener('change', (e) => {
      sourceSettings.sourceType = e.target.value;
      updateSourceTypeControls(sourceSettings.sourceType);
      triggerSourceChanged();
    });

    // Width / Height
    document.getElementById('source-width').addEventListener('change', (e) => {
      sourceSettings.sourceWidth = parseInt(e.target.value) || 512;
      triggerSourceChanged();
    });
    document.getElementById('source-height').addEventListener('change', (e) => {
      sourceSettings.sourceHeight = parseInt(e.target.value) || 512;
      triggerSourceChanged();
    });

    // Solid color
    document.getElementById('source-color').addEventListener('input', (e) => {
      sourceSettings.sourceColor = e.target.value;
      triggerSourceChangedDebounced();
    });

    // Gradient colors
    document.getElementById('source-color-start').addEventListener('input', (e) => {
      sourceSettings.sourceColorStart = e.target.value;
      triggerSourceChangedDebounced();
    });
    document.getElementById('source-color-end').addEventListener('input', (e) => {
      sourceSettings.sourceColorEnd = e.target.value;
      triggerSourceChangedDebounced();
    });

    // Angle slider
    const angleSlider = document.getElementById('source-angle');
    const angleDisplay = document.getElementById('val-source-angle');
    angleSlider.addEventListener('input', () => {
      sourceSettings.sourceAngle = parseInt(angleSlider.value);
      angleDisplay.textContent = angleSlider.value;
      triggerSourceChangedDebounced();
    });
  }

  /**
   * Update visibility of solid vs gradient sub-controls.
   */
  function updateSourceTypeControls(type) {
    const solidControls = document.getElementById('source-solid-controls');
    const gradientColors = document.getElementById('source-gradient-colors');
    const angleGroup = document.getElementById('source-angle-group');

    if (type === 'solid') {
      solidControls.classList.remove('hidden');
      gradientColors.classList.add('hidden');
    } else {
      solidControls.classList.add('hidden');
      gradientColors.classList.remove('hidden');
      angleGroup.style.display = type === 'radial-gradient' ? 'none' : '';
    }
  }

  /**
   * Trigger source changed immediately.
   */
  function triggerSourceChanged() {
    if (sourceTimer) {
      clearTimeout(sourceTimer);
      sourceTimer = null;
    }
    if (onSourceChanged) {
      onSourceChanged(getSourceParams());
    }
  }

  /**
   * Trigger source changed with debounce.
   */
  function triggerSourceChangedDebounced() {
    if (sourceTimer) clearTimeout(sourceTimer);
    sourceTimer = setTimeout(() => {
      sourceTimer = null;
      if (onSourceChanged) {
        onSourceChanged(getSourceParams());
      }
    }, PROCESS_DELAY);
  }

  /**
   * Get current source parameters.
   * @returns {object}
   */
  function getSourceParams() {
    return { ...sourceSettings };
  }

  /**
   * Set the source section to show gradient controls.
   */
  function showSourceGradientMode() {
    document.getElementById('source-empty').classList.add('hidden');
    document.getElementById('source-image-info').classList.add('hidden');
    document.getElementById('source-gradient-mode').classList.remove('hidden');
    updateSourceTypeControls(sourceSettings.sourceType);
  }

  /**
   * Set the source section to show image info.
   */
  function showSourceImageMode() {
    document.getElementById('source-empty').classList.add('hidden');
    document.getElementById('source-image-info').classList.remove('hidden');
    document.getElementById('source-gradient-mode').classList.add('hidden');
  }

  /**
   * Reset source section to empty state.
   */
  function showSourceEmpty() {
    document.getElementById('source-empty').classList.remove('hidden');
    document.getElementById('source-image-info').classList.add('hidden');
    document.getElementById('source-gradient-mode').classList.add('hidden');
  }

  /**
   * Apply source settings to the UI controls.
   */
  function applySourceSettingsToUI() {
    const s = sourceSettings;
    document.getElementById('source-type').value = s.sourceType;
    document.getElementById('source-width').value = s.sourceWidth;
    document.getElementById('source-height').value = s.sourceHeight;
    document.getElementById('source-color').value = s.sourceColor;
    document.getElementById('source-color-start').value = s.sourceColorStart;
    document.getElementById('source-color-end').value = s.sourceColorEnd;
    document.getElementById('source-angle').value = s.sourceAngle;
    document.getElementById('val-source-angle').textContent = s.sourceAngle;
    updateSourceTypeControls(s.sourceType);
  }

  /**
   * Apply settings object to all UI controls.
   * @param {object} s - Settings to apply
   */
  function applySettingsToUI(s) {
    // Dropdowns
    document.getElementById('style-category').value = s.category;
    updateAlgorithmOptions(s.category);
    document.getElementById('style-algorithm').value = s.algorithm;

    document.getElementById('palette-category').value = s.paletteCategory;
    updatePaletteOptions(s.paletteCategory);
    document.getElementById('palette-select').value = s.palette;
    updatePalettePreview();

    // Sliders
    setSlider('slider-scale', 'val-scale', s.scale);
    setSlider('slider-line-scale', 'val-line-scale', s.lineScale);
    setSlider('slider-smoothing', 'val-smoothing', s.smoothing);
    setSlider('slider-blend', 'val-blend', s.blend);
    setSlider('slider-contrast', 'val-contrast', s.contrast);
    setSlider('slider-midtones', 'val-midtones', s.midtones);
    setSlider('slider-highlights', 'val-highlights', s.highlights);
    setSlider('slider-threshold', 'val-threshold', s.threshold);
    setSlider('slider-blur', 'val-blur', s.blur);
    setSlider('slider-depth', 'val-depth', s.depth);

    // Checkboxes
    document.getElementById('toggle-invert').checked = s.invert;
  }

  /**
   * Set a slider value and its display.
   */
  function setSlider(sliderId, displayId, value) {
    const slider = document.getElementById(sliderId);
    const display = document.getElementById(displayId);
    slider.value = value;
    display.textContent = Number.isInteger(value) ? value : value.toFixed(1);
  }

  /**
   * Trigger immediate processing.
   */
  function triggerProcess() {
    if (processTimer) {
      clearTimeout(processTimer);
      processTimer = null;
    }
    if (onSettingsChanged) {
      onSettingsChanged(getProcessingParams());
    }
  }

  /**
   * Trigger processing with debounce (for sliders).
   */
  function triggerProcessDebounced() {
    if (processTimer) clearTimeout(processTimer);
    processTimer = setTimeout(() => {
      processTimer = null;
      if (onSettingsChanged) {
        onSettingsChanged(getProcessingParams());
      }
    }, PROCESS_DELAY);
  }

  /**
   * Build processing parameters from current settings.
   * @returns {object}
   */
  function getProcessingParams() {
    const palette = DitterPalettes.getColors(settings.paletteCategory, settings.palette);
    return {
      category: settings.category,
      algorithm: settings.algorithm,
      palette,
      scale: settings.scale,
      lineScale: settings.lineScale,
      smoothing: settings.smoothing,
      blend: settings.blend,
      contrast: settings.contrast,
      midtones: settings.midtones,
      highlights: settings.highlights,
      threshold: settings.threshold,
      blur: settings.blur,
      depth: settings.depth,
      invert: settings.invert
    };
  }

  /**
   * Apply a preset by ID, updating settings and UI.
   * @param {string} presetId
   */
  function applyPreset(presetId) {
    const preset = DitterPresets.get(presetId);
    if (!preset) return;
    settings = { ...settings, ...preset.settings };
    applySettingsToUI(settings);
    document.getElementById('preset-select').value = presetId;
    triggerProcess();
  }

  /**
   * Get current settings.
   * @returns {object}
   */
  function getSettings() {
    return { ...settings };
  }

  /**
   * Show a modal by ID.
   * @param {string} modalId
   */
  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
  }

  /**
   * Hide a modal by ID.
   * @param {string} modalId
   */
  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Update the zoom level display.
   * @param {number} zoom
   */
  function updateZoomDisplay(zoom) {
    const el = document.getElementById('zoom-level');
    if (el) {
      el.textContent = Math.round(zoom * 100) + '%';
    }
  }

  /**
   * Update image info display.
   * @param {{ width: number, height: number, name: string }} info
   */
  function updateImageInfo(info) {
    const el = document.getElementById('image-info');
    if (el) {
      el.textContent = `${info.name} | ${info.width} x ${info.height}`;
    }
  }

  return {
    init,
    getSettings,
    getProcessingParams,
    getSourceParams,
    applyPreset,
    showModal,
    hideModal,
    updateZoomDisplay,
    updateImageInfo,
    populatePresetDropdown,
    showSourceGradientMode,
    showSourceImageMode,
    showSourceEmpty,
    applySourceSettingsToUI
  };
})();
