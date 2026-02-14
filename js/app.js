/**
 * Ditter - Main Application
 *
 * Entry point. Initializes all modules and wires them together.
 */

const DitterApp = (() => {
  let isInitialized = false;
  let sourceMode = 'none'; // 'none', 'gradient', 'image'
  let lastSourceWidth = 0;
  let lastSourceHeight = 0;

  /**
   * Initialize the application.
   */
  function init() {
    if (isInitialized) return;
    isInitialized = true;

    // Initialize canvas manager
    DitterCanvas.init({
      onProcessingStart: () => {
        const indicator = document.getElementById('processing-indicator');
        if (indicator) indicator.classList.add('visible');
      },
      onProcessingEnd: () => {
        const indicator = document.getElementById('processing-indicator');
        if (indicator) indicator.classList.remove('visible');
        // Update Studio preview if it's open
        if (DitterStudio.isVisible()) {
          DitterStudio.updatePreview();
        }
      },
      onImageLoaded: (info) => {
        // Hide drop zone, show canvas
        const dropZone = document.getElementById('drop-zone');
        dropZone.classList.add('hidden');
        DitterUI.updateImageInfo(info);

        // Trigger initial processing
        const params = DitterUI.getProcessingParams();
        DitterCanvas.processImage(params);
      },
      onZoomChanged: (zoom) => {
        DitterUI.updateZoomDisplay(zoom);
      }
    });

    // Initialize UI
    DitterUI.init({
      onSettingsChanged: (params) => {
        if (DitterCanvas.hasImage()) {
          DitterCanvas.processImage(params);
        }
      },
      onSourceChanged: (sourceParams) => {
        if (sourceMode !== 'gradient') return;
        const { data, width, height } = generateSource(sourceParams);
        const dimsChanged = width !== lastSourceWidth || height !== lastSourceHeight;
        lastSourceWidth = width;
        lastSourceHeight = height;

        if (dimsChanged) {
          DitterCanvas.loadImageData(data, width, height);
        } else {
          DitterCanvas.updateSourceData(data, width, height);
          DitterCanvas.processImage(DitterUI.getProcessingParams());
        }
      }
    });

    // Initialize studio
    DitterStudio.init();

    // Set up file import
    setupFileImport();

    // Set up export
    setupExport();

    // Set up reset
    setupReset();

    // Set up color/gradient input creation
    setupCreateInput();

    // Set up studio button
    setupStudio();

    // Set up theme toggle
    setupTheme();

    // Keyboard shortcuts
    setupKeyboard();
  }

  /**
   * Set up file import (drag-drop and file picker).
   */
  function setupFileImport() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const importBtn = document.getElementById('btn-import');

    // File picker
    importBtn.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target.id === 'btn-create-input') return;
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) loadFile(file);
      fileInput.value = '';
    });

    // Drag and drop
    const container = document.getElementById('canvas-container');

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('active');
      if (dropZone.classList.contains('hidden')) {
        dropZone.classList.remove('hidden');
      }
    });

    container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('active');
      if (DitterCanvas.hasImage()) {
        dropZone.classList.add('hidden');
      }
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('active');

      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type.startsWith('image/')) {
        loadFile(files[0]);
      }
    });
  }

  /**
   * Load a file into the canvas.
   * @param {File} file
   */
  async function loadFile(file) {
    try {
      await DitterCanvas.loadImage(file);
      sourceMode = 'image';
      DitterUI.showSourceImageMode();
    } catch (err) {
      console.error('Failed to load image:', err);
    }
  }

  /**
   * Set up export functionality.
   */
  function setupReset() {
    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!DitterCanvas.hasImage()) return;
      DitterCanvas.resetToOriginal();
      const params = DitterUI.getProcessingParams();
      DitterCanvas.processImage(params);
    });
  }

  function setupExport() {
    const exportBtn = document.getElementById('btn-export');
    const formatSelect = document.getElementById('export-format');
    const qualitySlider = document.getElementById('export-quality');
    const qualityDisplay = document.getElementById('val-export-quality');
    const qualityGroup = document.getElementById('export-quality-group');
    const doExportBtn = document.getElementById('btn-do-export');

    // Hide quality group initially since PNG is default
    qualityGroup.style.display = 'none';

    exportBtn.addEventListener('click', () => {
      if (!DitterCanvas.hasImage()) return;
      DitterUI.showModal('modal-export');
    });

    // Show/hide quality slider based on format
    formatSelect.addEventListener('change', () => {
      if (formatSelect.value === 'png') {
        qualityGroup.style.display = 'none';
      } else {
        qualityGroup.style.display = '';
      }
    });

    qualitySlider.addEventListener('input', () => {
      qualityDisplay.textContent = qualitySlider.value;
    });

    doExportBtn.addEventListener('click', () => {
      const imageData = DitterCanvas.getResultImageData();
      if (!imageData) return;

      DitterExport.exportImage(imageData, {
        format: formatSelect.value,
        quality: parseInt(qualitySlider.value),
        scale: parseInt(document.getElementById('export-scale').value),
        filename: document.getElementById('export-filename').value || 'ditter-export'
      });

      DitterUI.hideModal('modal-export');
    });
  }

  /**
   * Generate source pixel data from parameters.
   * @param {object} params - Source parameters
   * @returns {{ data: Uint8ClampedArray, width: number, height: number }}
   */
  function generateSource(params) {
    const type = params.sourceType;
    const width = Math.max(1, Math.min(4096, params.sourceWidth || 512));
    const height = Math.max(1, Math.min(4096, params.sourceHeight || 512));
    const data = new Uint8ClampedArray(width * height * 4);

    if (type === 'solid') {
      const [r, g, b] = hexToRgb(params.sourceColor || '#808080');
      for (let i = 0; i < data.length; i += 4) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    } else if (type === 'linear-gradient') {
      const c1 = hexToRgb(params.sourceColorStart || '#000000');
      const c2 = hexToRgb(params.sourceColorEnd || '#ffffff');
      const angle = (params.sourceAngle || 0) * Math.PI / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = x / width - 0.5;
          const ny = y / height - 0.5;
          let t = nx * cosA + ny * sinA + 0.5;
          t = Math.max(0, Math.min(1, t));

          const i = (y * width + x) * 4;
          data[i] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
          data[i + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
          data[i + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
          data[i + 3] = 255;
        }
      }
    } else if (type === 'radial-gradient') {
      const c1 = hexToRgb(params.sourceColorStart || '#000000');
      const c2 = hexToRgb(params.sourceColorEnd || '#ffffff');

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = (x / width - 0.5) * 2;
          const ny = (y / height - 0.5) * 2;
          let t = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
          t = Math.max(0, Math.min(1, t));

          const i = (y * width + x) * 4;
          data[i] = Math.round(c1[0] + (c2[0] - c1[0]) * t);
          data[i + 1] = Math.round(c1[1] + (c2[1] - c1[1]) * t);
          data[i + 2] = Math.round(c1[2] + (c2[2] - c1[2]) * t);
          data[i + 3] = 255;
        }
      }
    }

    return { data, width, height };
  }

  /**
   * Activate gradient mode: generate source and show controls.
   */
  function activateGradientMode() {
    sourceMode = 'gradient';
    const sourceParams = DitterUI.getSourceParams();
    const { data, width, height } = generateSource(sourceParams);
    lastSourceWidth = width;
    lastSourceHeight = height;
    DitterCanvas.loadImageData(data, width, height);
    DitterUI.showSourceGradientMode();
  }

  /**
   * Set up gradient/image source creation.
   */
  function setupCreateInput() {
    // Drop zone button
    document.getElementById('btn-create-input').addEventListener('click', (e) => {
      e.stopPropagation();
      activateGradientMode();
    });

    // Source section "Generate Gradient" button
    document.getElementById('btn-generate-gradient').addEventListener('click', () => {
      activateGradientMode();
    });

    // "Switch to Gradient" button (from image mode)
    document.getElementById('btn-switch-gradient').addEventListener('click', () => {
      activateGradientMode();
    });

    // "Upload Image" button (from gradient mode)
    document.getElementById('btn-upload-image').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });
  }

  /**
   * Convert hex color to [r, g, b].
   * @param {string} hex - e.g. "#ff0000"
   * @returns {number[]}
   */
  function hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  /**
   * Set up studio modal.
   */
  function setupStudio() {
    document.getElementById('btn-studio').addEventListener('click', () => {
      DitterUI.showModal('modal-studio');
      DitterStudio.populatePresets();
      DitterStudio.resetView();
      // Slight delay to let the modal render before measuring canvas container
      requestAnimationFrame(() => DitterStudio.updatePreview());
    });

    // Listen for studio's save-as-preset event
    document.addEventListener('studio-save-preset', () => {
      DitterUI.showModal('modal-save-preset');
    });
  }

  /**
   * Set up light/dark theme toggle.
   */
  function setupTheme() {
    const btn = document.getElementById('btn-theme-toggle');
    let theme = localStorage.getItem('ditter-theme') || 'dark';

    function applyTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      btn.textContent = t === 'dark' ? 'Lt' : 'Dk';
      btn.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      DitterCanvas.updateThemeColor();
    }

    applyTheme(theme);

    btn.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('ditter-theme', theme);
      applyTheme(theme);
    });
  }

  /**
   * Set up keyboard shortcuts.
   */
  function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't handle if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Escape: close modals
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
          modal.classList.add('hidden');
        });
        return;
      }

      // Ctrl/Cmd + E: Export
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        if (DitterCanvas.hasImage()) {
          DitterUI.showModal('modal-export');
        }
        return;
      }

      // Ctrl/Cmd + O: Import
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        document.getElementById('file-input').click();
        return;
      }

      // + / -: Zoom
      if (e.key === '=' || e.key === '+') {
        DitterCanvas.zoomIn();
      } else if (e.key === '-') {
        DitterCanvas.zoomOut();
      } else if (e.key === '0') {
        DitterCanvas.zoomReset();
      } else if (e.key === 'f') {
        DitterCanvas.zoomFit();
      }
    });
  }

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    init
  };
})();
