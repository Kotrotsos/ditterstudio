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
