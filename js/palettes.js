/**
 * Ditter - Color Palette Definitions
 *
 * Each palette is an array of [r, g, b] color values.
 * Palettes are organized by category.
 */

const DitterPalettes = (() => {
  const palettes = {
    // --- Default ---
    default: {
      'bw': {
        name: 'Black & White',
        colors: [[0, 0, 0], [255, 255, 255]]
      },
      'bw-mid': {
        name: 'Black, Gray, White',
        colors: [[0, 0, 0], [128, 128, 128], [255, 255, 255]]
      },
      'grayscale-4': {
        name: 'Grayscale 4',
        colors: [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]]
      },
      'grayscale-8': {
        name: 'Grayscale 8',
        colors: [[0, 0, 0], [36, 36, 36], [73, 73, 73], [109, 109, 109],
                 [146, 146, 146], [182, 182, 182], [219, 219, 219], [255, 255, 255]]
      },
      'grayscale-16': {
        name: 'Grayscale 16',
        colors: Array.from({ length: 16 }, (_, i) => {
          const v = Math.round(i * 255 / 15);
          return [v, v, v];
        })
      }
    },

    // --- Retro ---
    retro: {
      'gameboy': {
        name: 'Game Boy',
        colors: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]]
      },
      'gameboy-pocket': {
        name: 'Game Boy Pocket',
        colors: [[0, 0, 0], [85, 85, 85], [170, 170, 170], [255, 255, 255]]
      },
      'cga-0': {
        name: 'CGA Palette 0',
        colors: [[0, 0, 0], [0, 170, 170], [170, 0, 170], [170, 170, 170]]
      },
      'cga-1': {
        name: 'CGA Palette 1',
        colors: [[0, 0, 0], [0, 170, 0], [170, 0, 0], [170, 85, 0]]
      },
      'ega': {
        name: 'EGA',
        colors: [
          [0, 0, 0], [0, 0, 170], [0, 170, 0], [0, 170, 170],
          [170, 0, 0], [170, 0, 170], [170, 85, 0], [170, 170, 170],
          [85, 85, 85], [85, 85, 255], [85, 255, 85], [85, 255, 255],
          [255, 85, 85], [255, 85, 255], [255, 255, 85], [255, 255, 255]
        ]
      },
      'c64': {
        name: 'Commodore 64',
        colors: [
          [0, 0, 0], [255, 255, 255], [136, 0, 0], [170, 255, 238],
          [204, 68, 204], [0, 204, 85], [0, 0, 170], [238, 238, 119],
          [221, 136, 85], [102, 68, 0], [255, 119, 119], [51, 51, 51],
          [119, 119, 119], [170, 255, 102], [0, 136, 255], [187, 187, 187]
        ]
      },
      'zx-spectrum': {
        name: 'ZX Spectrum',
        colors: [
          [0, 0, 0], [0, 0, 215], [215, 0, 0], [215, 0, 215],
          [0, 215, 0], [0, 215, 215], [215, 215, 0], [215, 215, 215],
          [0, 0, 255], [255, 0, 0], [255, 0, 255],
          [0, 255, 0], [0, 255, 255], [255, 255, 0], [255, 255, 255]
        ]
      },
      'nes': {
        name: 'NES',
        colors: [
          [124, 124, 124], [0, 0, 252], [0, 0, 188], [68, 40, 188],
          [148, 0, 132], [168, 0, 32], [168, 16, 0], [136, 20, 0],
          [80, 48, 0], [0, 120, 0], [0, 104, 0], [0, 88, 0],
          [0, 64, 88], [0, 0, 0], [188, 188, 188], [0, 120, 248],
          [0, 88, 248], [104, 68, 252], [216, 0, 204], [228, 0, 88],
          [248, 56, 0], [228, 92, 16], [172, 124, 0], [0, 184, 0],
          [0, 168, 0], [0, 168, 68], [0, 136, 136], [248, 248, 248],
          [60, 188, 252], [104, 136, 252], [152, 120, 248], [248, 120, 248],
          [248, 88, 152], [248, 120, 88], [252, 160, 68], [248, 184, 0],
          [184, 248, 24], [88, 216, 84], [88, 248, 152], [0, 232, 216],
          [120, 120, 120], [252, 252, 252], [164, 228, 252], [184, 184, 248],
          [216, 184, 248], [248, 184, 248], [248, 164, 192], [240, 208, 176],
          [252, 224, 168], [248, 216, 120], [216, 248, 120], [184, 248, 184],
          [184, 248, 216], [0, 252, 252], [216, 216, 216]
        ]
      },
      'snes': {
        name: 'SNES',
        colors: [
          [0, 0, 0], [32, 32, 32], [64, 64, 64], [96, 96, 96],
          [128, 128, 128], [160, 160, 160], [192, 192, 192], [224, 224, 224],
          [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0],
          [255, 0, 255], [0, 255, 255], [255, 128, 0], [255, 255, 255]
        ]
      },
      'sega-genesis': {
        name: 'Sega Genesis',
        colors: (() => {
          const colors = [];
          for (let r = 0; r < 8; r++) {
            for (let g = 0; g < 8; g++) {
              for (let b = 0; b < 8; b++) {
                if (colors.length < 64) {
                  colors.push([r * 36, g * 36, b * 36]);
                }
              }
            }
          }
          return colors;
        })()
      }
    },

    // --- Modern ---
    modern: {
      'pastel': {
        name: 'Pastel',
        colors: [
          [255, 179, 186], [255, 223, 186], [255, 255, 186], [186, 255, 201],
          [186, 225, 255], [219, 186, 255], [255, 186, 243], [255, 255, 255]
        ]
      },
      'neon': {
        name: 'Neon',
        colors: [
          [0, 0, 0], [255, 0, 110], [0, 255, 136], [0, 184, 255],
          [255, 238, 0], [190, 0, 255], [255, 94, 0], [255, 255, 255]
        ]
      },
      'earth': {
        name: 'Earth Tones',
        colors: [
          [59, 36, 20], [101, 67, 33], [139, 90, 43], [181, 137, 82],
          [205, 170, 109], [228, 210, 165], [107, 142, 35], [85, 107, 47]
        ]
      },
      'ocean': {
        name: 'Ocean',
        colors: [
          [0, 19, 39], [0, 49, 83], [0, 82, 136], [0, 119, 182],
          [0, 150, 199], [0, 180, 216], [144, 224, 239], [202, 240, 248]
        ]
      },
      'sunset': {
        name: 'Sunset',
        colors: [
          [25, 25, 50], [60, 20, 80], [130, 30, 70], [190, 50, 50],
          [230, 100, 50], [250, 160, 50], [255, 210, 90], [255, 245, 170]
        ]
      },
      'forest': {
        name: 'Forest',
        colors: [
          [15, 30, 15], [30, 60, 25], [50, 90, 35], [75, 120, 50],
          [100, 150, 70], [140, 180, 90], [180, 210, 120], [220, 240, 170]
        ]
      }
    },

    // --- Themed ---
    themed: {
      'bubblegum': {
        name: 'Bubblegum',
        colors: [
          [255, 105, 180], [255, 182, 193], [255, 218, 233], [255, 240, 245],
          [199, 21, 133], [219, 112, 147], [255, 20, 147], [255, 255, 255]
        ]
      },
      'vaporwave': {
        name: 'Vapor Wave',
        colors: [
          [15, 0, 36], [72, 0, 120], [143, 0, 195], [192, 50, 255],
          [255, 100, 200], [255, 180, 220], [0, 255, 255], [255, 255, 255]
        ]
      },
      'cyberpunk': {
        name: 'Cyberpunk',
        colors: [
          [10, 0, 20], [30, 0, 50], [80, 0, 120], [0, 255, 157],
          [255, 0, 110], [255, 230, 0], [0, 210, 255], [255, 255, 255]
        ]
      },
      'retrowave': {
        name: 'Retrowave',
        colors: [
          [20, 4, 40], [50, 10, 80], [120, 20, 120], [200, 40, 140],
          [255, 90, 120], [255, 160, 100], [255, 220, 80], [255, 255, 200]
        ]
      },
      'monochrome-blue': {
        name: 'Monochrome Blue',
        colors: [
          [0, 0, 20], [0, 10, 50], [0, 30, 90], [0, 60, 140],
          [30, 100, 180], [80, 150, 210], [150, 200, 235], [220, 240, 255]
        ]
      },
      'monochrome-red': {
        name: 'Monochrome Red',
        colors: [
          [20, 0, 0], [50, 0, 0], [90, 0, 0], [140, 0, 0],
          [190, 30, 30], [220, 80, 80], [240, 150, 150], [255, 220, 220]
        ]
      },
      'monochrome-green': {
        name: 'Monochrome Green',
        colors: [
          [0, 20, 0], [0, 50, 0], [0, 90, 10], [0, 140, 20],
          [30, 190, 50], [80, 220, 100], [150, 240, 160], [220, 255, 225]
        ]
      },
      'sepia': {
        name: 'Sepia',
        colors: [
          [30, 20, 10], [60, 45, 25], [100, 75, 45], [140, 110, 70],
          [175, 145, 100], [210, 180, 135], [235, 215, 175], [255, 245, 220]
        ]
      }
    },

    // --- Custom (user-defined, starts empty) ---
    custom: {}
  };

  /**
   * Get all palette categories
   * @returns {string[]}
   */
  function getCategories() {
    return Object.keys(palettes);
  }

  /**
   * Get all palettes in a category
   * @param {string} category
   * @returns {Object.<string, {name: string, colors: number[][]}>}
   */
  function getPalettesInCategory(category) {
    return palettes[category] || {};
  }

  /**
   * Get a specific palette by category and id
   * @param {string} category
   * @param {string} id
   * @returns {{name: string, colors: number[][]}|null}
   */
  function getPalette(category, id) {
    if (palettes[category] && palettes[category][id]) {
      return palettes[category][id];
    }
    return null;
  }

  /**
   * Get the color array for a palette
   * @param {string} category
   * @param {string} id
   * @returns {number[][]} Array of [r, g, b] colors
   */
  function getColors(category, id) {
    const palette = getPalette(category, id);
    return palette ? palette.colors : [[0, 0, 0], [255, 255, 255]];
  }

  /**
   * Add a custom palette
   * @param {string} id
   * @param {string} name
   * @param {number[][]} colors
   */
  function addCustomPalette(id, name, colors) {
    palettes.custom[id] = { name, colors };
    saveCustomPalettes();
  }

  /**
   * Remove a custom palette
   * @param {string} id
   */
  function removeCustomPalette(id) {
    delete palettes.custom[id];
    saveCustomPalettes();
  }

  /**
   * Save custom palettes to localStorage
   */
  function saveCustomPalettes() {
    try {
      localStorage.setItem('ditter-custom-palettes', JSON.stringify(palettes.custom));
    } catch (e) {
      console.warn('Failed to save custom palettes:', e);
    }
  }

  /**
   * Load custom palettes from localStorage
   */
  function loadCustomPalettes() {
    try {
      const stored = localStorage.getItem('ditter-custom-palettes');
      if (stored) {
        palettes.custom = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load custom palettes:', e);
    }
  }

  // Init
  loadCustomPalettes();

  return {
    getCategories,
    getPalettesInCategory,
    getPalette,
    getColors,
    addCustomPalette,
    removeCustomPalette
  };
})();
