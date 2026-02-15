/**
 * Ditter - Preset Manager
 *
 * Manages saving, loading, and applying presets.
 * Presets store all control panel settings.
 */

const DitterPresets = (() => {
  const STORAGE_KEY = 'ditter-presets';

  // Built-in presets
  const builtIn = {
    'retro-gameboy': {
      name: 'Retro Game Boy',
      settings: {
        category: 'ordered',
        algorithm: 'bayer-4x4',
        paletteCategory: 'retro',
        palette: 'gameboy',
        scale: 2,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'newspaper': {
      name: 'Newspaper',
      settings: {
        category: 'halftone',
        algorithm: 'dot-halftone',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 60,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'classic-dither': {
      name: 'Classic Dither',
      settings: {
        category: 'error-diffusion',
        algorithm: 'floyd-steinberg',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 50,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'vaporwave': {
      name: 'Vapor Wave',
      settings: {
        category: 'ordered',
        algorithm: 'bayer-8x8',
        paletteCategory: 'themed',
        palette: 'vaporwave',
        scale: 2,
        lineScale: 1,
        smoothing: 20,
        blend: 100,
        contrast: 45,
        midtones: 55,
        highlights: 50,
        threshold: 50,
        blur: 1,
        depth: 0,
        invert: false
      }
    },
    'cyberpunk-neon': {
      name: 'Cyberpunk Neon',
      settings: {
        category: 'noise',
        algorithm: 'blue-noise',
        paletteCategory: 'themed',
        palette: 'cyberpunk',
        scale: 1,
        lineScale: 1,
        smoothing: 10,
        blend: 100,
        contrast: 65,
        midtones: 40,
        highlights: 60,
        threshold: 45,
        blur: 0,
        depth: 2,
        invert: false
      }
    },
    'mac-classic': {
      name: 'Mac Classic',
      settings: {
        category: 'error-diffusion',
        algorithm: 'atkinson',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'pixel-art-retro': {
      name: 'Pixel Art',
      settings: {
        category: 'artistic',
        algorithm: 'pixel-art',
        paletteCategory: 'retro',
        palette: 'nes',
        scale: 4,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 50,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'high-contrast': {
      name: 'High Contrast',
      settings: {
        category: 'threshold',
        algorithm: 'simple',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 70,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'vintage-photo': {
      name: 'Vintage Photo',
      settings: {
        category: 'error-diffusion',
        algorithm: 'atkinson',
        paletteCategory: 'themed',
        palette: 'sepia',
        scale: 1,
        lineScale: 1,
        smoothing: 10,
        blend: 100,
        contrast: 60,
        midtones: 45,
        highlights: 55,
        threshold: 50,
        blur: 1,
        depth: 0,
        invert: false
      }
    },
    'comic-book': {
      name: 'Comic Book',
      settings: {
        category: 'halftone',
        algorithm: 'dot-halftone',
        paletteCategory: 'default',
        palette: 'grayscale-4',
        scale: 1,
        lineScale: 1.5,
        smoothing: 0,
        blend: 100,
        contrast: 70,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 3,
        invert: false
      }
    },
    'crt-scanline': {
      name: 'CRT Scanline',
      settings: {
        category: 'pattern',
        algorithm: 'horizontal-lines',
        paletteCategory: 'retro',
        palette: 'ega',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 1,
        depth: 0,
        invert: false
      }
    },
    'thermal-camera': {
      name: 'Thermal Camera',
      settings: {
        category: 'threshold',
        algorithm: 'multi-level',
        paletteCategory: 'modern',
        palette: 'sunset',
        scale: 2,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 3,
        depth: 0,
        invert: false
      }
    },
    'blueprint': {
      name: 'Blueprint',
      settings: {
        category: 'pattern',
        algorithm: 'crosshatch',
        paletteCategory: 'themed',
        palette: 'monochrome-blue',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 2,
        invert: true
      }
    },
    'woodcut': {
      name: 'Woodcut',
      settings: {
        category: 'halftone',
        algorithm: 'line-halftone',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1.2,
        smoothing: 0,
        blend: 100,
        contrast: 75,
        midtones: 40,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 4,
        invert: false
      }
    },
    'matrix-rain': {
      name: 'Matrix Rain',
      settings: {
        category: 'noise',
        algorithm: 'interleaved-gradient',
        paletteCategory: 'themed',
        palette: 'monochrome-green',
        scale: 1,
        lineScale: 0.5,
        smoothing: 0,
        blend: 100,
        contrast: 60,
        midtones: 45,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'pencil-sketch': {
      name: 'Pencil Sketch',
      settings: {
        category: 'artistic',
        algorithm: 'sketch',
        paletteCategory: 'default',
        palette: 'grayscale-8',
        scale: 1,
        lineScale: 1,
        smoothing: 5,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 3,
        invert: false
      }
    },
    'glitch-sort': {
      name: 'Glitch Sort',
      settings: {
        category: 'creative',
        algorithm: 'pixel-sort',
        paletteCategory: 'default',
        palette: 'full-color',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 60,
        midtones: 50,
        highlights: 50,
        threshold: 30,
        blur: 0,
        depth: 0,
        invert: false
      }
    },
    'turing-pattern': {
      name: 'Turing Pattern',
      settings: {
        category: 'creative',
        algorithm: 'reaction-diffusion',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 10,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 1,
        depth: 0,
        invert: false
      }
    },
    'dot-stipple': {
      name: 'Dot Stipple',
      settings: {
        category: 'creative',
        algorithm: 'stipple',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1.5,
        smoothing: 15,
        blend: 100,
        contrast: 50,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 1,
        depth: 0,
        invert: false
      }
    },
    'flow-art': {
      name: 'Flow Art',
      settings: {
        category: 'creative',
        algorithm: 'flow-field',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 10,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 2,
        invert: false
      }
    },
    'ascii-art': {
      name: 'ASCII Art',
      settings: {
        category: 'creative',
        algorithm: 'ascii',
        paletteCategory: 'default',
        palette: 'bw',
        scale: 1,
        lineScale: 1,
        smoothing: 0,
        blend: 100,
        contrast: 55,
        midtones: 50,
        highlights: 50,
        threshold: 50,
        blur: 0,
        depth: 0,
        invert: false
      }
    }
  };

  // User presets (loaded from localStorage)
  let userPresets = {};

  /**
   * Load user presets from localStorage.
   */
  function load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        userPresets = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load presets:', e);
      userPresets = {};
    }
  }

  /**
   * Save user presets to localStorage.
   */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userPresets));
    } catch (e) {
      console.warn('Failed to save presets:', e);
    }
  }

  /**
   * Get all presets (built-in + user).
   * @returns {{ id: string, name: string, isBuiltIn: boolean }[]}
   */
  function getAll() {
    const result = [];
    for (const [id, preset] of Object.entries(builtIn)) {
      result.push({ id, name: preset.name, isBuiltIn: true });
    }
    for (const [id, preset] of Object.entries(userPresets)) {
      result.push({ id, name: preset.name, isBuiltIn: false });
    }
    return result;
  }

  /**
   * Get a preset by ID.
   * @param {string} id
   * @returns {{ name: string, settings: object }|null}
   */
  function get(id) {
    return builtIn[id] || userPresets[id] || null;
  }

  /**
   * Save a new user preset.
   * @param {string} name
   * @param {object} settings
   * @returns {string} Preset ID
   */
  function savePreset(name, settings) {
    const id = 'user-' + Date.now();
    userPresets[id] = { name, settings: { ...settings } };
    save();
    return id;
  }

  /**
   * Delete a user preset.
   * @param {string} id
   */
  function deletePreset(id) {
    if (userPresets[id]) {
      delete userPresets[id];
      save();
    }
  }

  /**
   * Get default settings (used for "Reset All").
   * @returns {object}
   */
  function getDefaults() {
    return {
      category: 'error-diffusion',
      algorithm: 'floyd-steinberg',
      paletteCategory: 'default',
      palette: 'bw',
      scale: 1,
      lineScale: 1,
      smoothing: 0,
      blend: 100,
      contrast: 50,
      midtones: 50,
      highlights: 50,
      threshold: 50,
      blur: 0,
      depth: 0,
      invert: false
    };
  }

  // Init
  load();

  return {
    getAll,
    get,
    savePreset,
    deletePreset,
    getDefaults
  };
})();
