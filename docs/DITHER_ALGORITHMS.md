# Dithering Algorithms Reference

Comprehensive reference for all dithering algorithms implemented in Ditter.
Each algorithm includes its mathematical formulation, pseudocode, and tweakable parameters.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Error Diffusion Algorithms](#error-diffusion-algorithms)
3. [Ordered Dithering](#ordered-dithering)
4. [Pattern Dithering](#pattern-dithering)
5. [Modulation Dithers](#modulation-dithers)
6. [Special Effects](#special-effects)

---

## Core Concepts

### Quantization

The fundamental operation in dithering is quantization, mapping a continuous value to one of N discrete levels.

```
quantize(value, levels) = round(value * (levels - 1)) / (levels - 1)
```

For binary (black/white) dithering with threshold T:

```
output(x, y) = 1  if input(x, y) >= T
               0  otherwise
```

### Quantization Error

```
error(x, y) = input(x, y) - output(x, y)
```

### Grayscale Conversion

When converting from RGB to grayscale luminance:

```
L = 0.299 * R + 0.587 * G + 0.114 * B
```

### Color Channel Processing

For color dithering, apply the algorithm independently to each channel (R, G, B), or convert to a suitable color space first. Error diffusion distributes error per-channel.

---

## Error Diffusion Algorithms

Error diffusion algorithms scan the image pixel by pixel (typically left-to-right, top-to-bottom), quantize each pixel, compute the error, and distribute that error to neighboring pixels that have not yet been processed.

### General Error Diffusion Framework

```
for y = 0 to height - 1:
    if serpentine and y is odd:
        scan right-to-left (mirror the kernel horizontally)
    else:
        scan left-to-right

    for each pixel (x, y) in scan direction:
        old_value = pixel[x][y]
        new_value = quantize(old_value, levels)
        pixel[x][y] = new_value
        error = old_value - new_value

        for each (dx, dy, weight) in diffusion_kernel:
            nx = x + dx
            ny = y + dy
            if (nx, ny) is within bounds:
                pixel[nx][ny] += error * weight / divisor
```

**Common tweakable parameters for all error diffusion algorithms:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `threshold` | Quantization threshold (0.0 - 1.0) | 0.5 |
| `levels` | Number of output levels per channel | 2 |
| `serpentine` | Alternate scan direction per row | true |
| `strength` | Error diffusion multiplier (0.0 - 1.0) | 1.0 |

When `strength < 1.0`, the distributed error is `error * strength`, which blends between pure threshold and full diffusion.

---

### Floyd-Steinberg

The most widely used error diffusion algorithm. Distributes error to 4 neighbors.

**Diffusion kernel (divisor = 16):**

```
         *   7
    3    5   1
```

Where `*` is the current pixel.

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 7/16   |
| -1 | +1 | 3/16   |
|  0 | +1 | 5/16   |
| +1 | +1 | 1/16   |

**Sum of weights:** 7 + 3 + 5 + 1 = 16 (100% error distributed)

---

### Jarvis-Judice-Ninke (JJN)

Spreads error over a larger area (12 neighbors), producing smoother results than Floyd-Steinberg.

**Diffusion kernel (divisor = 48):**

```
              *   7   5
    3   5   7   5   3
    1   3   5   3   1
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 7/48   |
| +2 |  0 | 5/48   |
| -2 | +1 | 3/48   |
| -1 | +1 | 5/48   |
|  0 | +1 | 7/48   |
| +1 | +1 | 5/48   |
| +2 | +1 | 3/48   |
| -2 | +2 | 1/48   |
| -1 | +2 | 3/48   |
|  0 | +2 | 5/48   |
| +1 | +2 | 3/48   |
| +2 | +2 | 1/48   |

**Sum of weights:** 7+5+3+5+7+5+3+1+3+5+3+1 = 48 (100%)

---

### Stucki

Similar to JJN but with a different weight distribution that emphasizes the immediate neighbors more.

**Diffusion kernel (divisor = 42):**

```
              *   8   4
    2   4   8   4   2
    1   2   4   2   1
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 8/42   |
| +2 |  0 | 4/42   |
| -2 | +1 | 2/42   |
| -1 | +1 | 4/42   |
|  0 | +1 | 8/42   |
| +1 | +1 | 4/42   |
| +2 | +1 | 2/42   |
| -2 | +2 | 1/42   |
| -1 | +2 | 2/42   |
|  0 | +2 | 4/42   |
| +1 | +2 | 2/42   |
| +2 | +2 | 1/42   |

**Sum of weights:** 8+4+2+4+8+4+2+1+2+4+2+1 = 42 (100%)

---

### Burkes

A compromise between Floyd-Steinberg (small kernel) and Stucki (large kernel). Uses a 2-row kernel.

**Diffusion kernel (divisor = 32):**

```
              *   8   4
    2   4   8   4   2
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 8/32   |
| +2 |  0 | 4/32   |
| -2 | +1 | 2/32   |
| -1 | +1 | 4/32   |
|  0 | +1 | 8/32   |
| +1 | +1 | 4/32   |
| +2 | +1 | 2/32   |

**Sum of weights:** 8+4+2+4+8+4+2 = 32 (100%)

---

### Sierra (Full / Sierra-3)

Three-row error diffusion.

**Diffusion kernel (divisor = 32):**

```
              *   5   3
    2   4   5   4   2
        2   3   2
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 5/32   |
| +2 |  0 | 3/32   |
| -2 | +1 | 2/32   |
| -1 | +1 | 4/32   |
|  0 | +1 | 5/32   |
| +1 | +1 | 4/32   |
| +2 | +1 | 2/32   |
| -1 | +2 | 2/32   |
|  0 | +2 | 3/32   |
| +1 | +2 | 2/32   |

**Sum of weights:** 5+3+2+4+5+4+2+2+3+2 = 32 (100%)

---

### Sierra Two-Row (Sierra-2)

Two-row variant, faster than full Sierra.

**Diffusion kernel (divisor = 16):**

```
              *   4   3
    1   2   3   2   1
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 4/16   |
| +2 |  0 | 3/16   |
| -2 | +1 | 1/16   |
| -1 | +1 | 2/16   |
|  0 | +1 | 3/16   |
| +1 | +1 | 2/16   |
| +2 | +1 | 1/16   |

**Sum of weights:** 4+3+1+2+3+2+1 = 16 (100%)

---

### Sierra Lite

Minimal Sierra variant with only 3 neighbors. Very fast.

**Diffusion kernel (divisor = 4):**

```
    *   2
    1   1
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 2/4    |
|  0 | +1 | 1/4    |
| -1 | +1 | 1/4    |

**Sum of weights:** 2+1+1 = 4 (100%)

---

### Atkinson

Developed at Apple. Only distributes 6/8 (75%) of the error, which produces higher contrast results with more detail in highlights and shadows.

**Diffusion kernel (divisor = 8):**

```
         *   1   1
    1    1   1
         1
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 1/8    |
| +2 |  0 | 1/8    |
| -1 | +1 | 1/8    |
|  0 | +1 | 1/8    |
| +1 | +1 | 1/8    |
|  0 | +2 | 1/8    |

**Sum of weights:** 6/8 = 75% (25% of error is lost, increasing contrast)

**Note:** The intentional loss of 25% error is what gives Atkinson its characteristic high-contrast look. This is not a bug.

---

### Fan (Daniel Fan)

Asymmetric distribution with a strong rightward bias.

**Diffusion kernel (divisor = 16):**

```
              *   7
    1   3   5
```

**Matrix representation:**

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 7/16   |
| -2 | +1 | 1/16   |
| -1 | +1 | 3/16   |
|  0 | +1 | 5/16   |

**Sum of weights:** 7+1+3+5 = 16 (100%)

---

### Shiau-Fan

Two variants with improved visual quality.

**Shiau-Fan 1 (divisor = 8):**

```
              *   4
    1   1   2
```

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 4/8    |
| -2 | +1 | 1/8    |
| -1 | +1 | 1/8    |
|  0 | +1 | 2/8    |

**Shiau-Fan 2 (divisor = 16):**

```
                  *   8
    1   1   2   4
```

| dx | dy | weight |
|----|----|--------|
| +1 |  0 | 8/16   |
| -3 | +1 | 1/16   |
| -2 | +1 | 1/16   |
| -1 | +1 | 2/16   |
|  0 | +1 | 4/16   |

---

## Ordered Dithering

Ordered dithering uses a threshold matrix (also called a Bayer matrix or dither matrix) to determine the threshold for each pixel position. Unlike error diffusion, there is no error propagation between pixels, making ordered dithering parallelizable and fast.

### General Ordered Dithering Framework

```
for y = 0 to height - 1:
    for x = 0 to width - 1:
        // Get threshold from matrix, tiled across image
        i = x % matrix_size
        j = y % matrix_size
        threshold = (matrix[j][i] + 0.5) / (matrix_size * matrix_size)

        // Apply threshold with optional scaling
        old_value = pixel[x][y]  // normalized 0.0 - 1.0
        if old_value > threshold:
            pixel[x][y] = 1.0
        else:
            pixel[x][y] = 0.0
```

For multi-level quantization:

```
threshold = (matrix[j][i] + 0.5) / (matrix_size * matrix_size)
scaled = old_value + (threshold - 0.5) * spread
pixel[x][y] = quantize(scaled, levels)
```

**Common tweakable parameters for ordered dithering:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `matrixSize` | Size of the threshold matrix | 8 |
| `spread` | How much the threshold map influences the output (0.0 - 2.0) | 1.0 |
| `levels` | Number of output levels per channel | 2 |
| `scale` | Pixel scaling factor (for chunky pixels) | 1 |

---

### Bayer Matrix

The Bayer matrix is recursively defined. Given Bayer matrix of order n (size 2^n x 2^n):

**Recursive definition:**

```
M(0) = [0]

M(n+1) = (1 / (4^(n+1))) * | 4*M(n) + 0    4*M(n) + 2 |
                              | 4*M(n) + 3    4*M(n) + 1 |
```

In practice, the unnormalized integer matrices are used and normalized at lookup time.

**Bayer 2x2 (order 1):**

```
| 0  2 |
| 3  1 |
```

Normalized: divide by 4, add 0.5/4 for centering.

**Bayer 4x4 (order 2):**

```
|  0   8   2  10 |
| 12   4  14   6 |
|  3  11   1   9 |
| 15   7  13   5 |
```

Normalized: divide by 16, add 0.5/16 for centering.

**Bayer 8x8 (order 3):**

```
|  0  32   8  40   2  34  10  42 |
| 48  16  56  24  50  18  58  26 |
| 12  44   4  36  14  46   6  38 |
| 60  28  52  20  62  30  54  22 |
|  3  35  11  43   1  33   9  41 |
| 51  19  59  27  49  17  57  25 |
| 15  47   7  39  13  45   5  37 |
| 63  31  55  23  61  29  53  21 |
```

Normalized: divide by 64, add 0.5/64 for centering.

**Pseudocode for generating any Bayer matrix:**

```
function generateBayerMatrix(order):
    size = 2^order
    matrix = new Array[size][size]

    for y = 0 to size - 1:
        for x = 0 to size - 1:
            value = 0
            xc = x XOR y
            yc = y

            for bit = order - 1 downto 0:
                value = value << 2
                // Interleave bits
                value |= ((xc >> bit) & 1) << 1
                value |= ((yc >> bit) & 1)

            matrix[y][x] = value

    return matrix
```

Alternative (simpler recursive generation):

```
function bayerMatrix(n):
    if n == 0:
        return [[0]]
    smaller = bayerMatrix(n - 1)
    size = smaller.length
    result = new Array[size * 2][size * 2]
    for y = 0 to size - 1:
        for x = 0 to size - 1:
            v = smaller[y][x]
            result[y][x]             = 4 * v + 0
            result[y][x + size]      = 4 * v + 2
            result[y + size][x]      = 4 * v + 3
            result[y + size][x + size] = 4 * v + 1
    return result
```

**Bayer 16x16** is generated from the recursive formula with order 4 (256 values, 0..255).

---

### Blue Noise Dithering

Blue noise (also called "void and cluster") has a frequency spectrum concentrated in high frequencies, producing visually pleasing, non-repetitive patterns.

**Approach:** Use a precomputed blue noise texture as the threshold matrix (typically 64x64 or 128x128). Blue noise textures are tileable.

```
for y = 0 to height - 1:
    for x = 0 to width - 1:
        threshold = blueNoiseTexture[y % textureSize][x % textureSize] / 255.0
        old_value = pixel[x][y]
        if old_value > threshold:
            pixel[x][y] = 1.0
        else:
            pixel[x][y] = 0.0
```

**Generating blue noise (void-and-cluster algorithm):**

1. Start with a binary pattern with a small fraction of "ones" (minority pixels).
2. Find the "tightest cluster" (the 1-pixel with the most 1-neighbors) and remove it.
3. Find the "largest void" (the 0-pixel with the fewest 1-neighbors) and insert a 1.
4. Repeat until all pixels are ranked, producing a threshold array.

Neighborhood is measured with a Gaussian filter:

```
G(x, y) = exp(-(x^2 + y^2) / (2 * sigma^2))
```

with toroidal (wrapping) boundary conditions.

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `textureSize` | Size of blue noise texture | 64 |
| `spread` | Threshold influence | 1.0 |

**Practical note:** For the implementation, embed a precomputed blue noise texture as a constant array or generate one at startup using the void-and-cluster method.

---

### White Noise Dithering

The simplest form of dithering. Each pixel gets a random threshold.

```
for y = 0 to height - 1:
    for x = 0 to width - 1:
        threshold = random(0.0, 1.0)
        if pixel[x][y] > threshold:
            pixel[x][y] = 1.0
        else:
            pixel[x][y] = 0.0
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `seed` | Random seed for reproducibility | 0 |
| `spread` | Threshold influence | 1.0 |

**Note:** Use a seeded PRNG (e.g., mulberry32) for deterministic output:

```
function mulberry32(seed):
    return function():
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
```

---

### Halftone Dots (Clustered Dot Ordered Dithering)

Simulates traditional halftone printing by clustering dots. Uses a radial distance-based threshold matrix.

**Generating the threshold matrix:**

```
function halftoneDotsMatrix(size):
    matrix = new Array[size][size]
    center = (size - 1) / 2.0
    maxDist = sqrt(2) * center
    values = []

    for y = 0 to size - 1:
        for x = 0 to size - 1:
            dx = x - center
            dy = y - center
            dist = sqrt(dx * dx + dy * dy)
            values.push({ x, y, dist })

    // Sort by distance from center (closest first)
    values.sort((a, b) => a.dist - b.dist)

    // Assign threshold ranks
    for i = 0 to values.length - 1:
        matrix[values[i].y][values[i].x] = i

    return matrix
```

**Applying:**

Same as ordered dithering with the generated matrix.

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `dotSize` | Size of halftone cell | 8 |
| `angle` | Rotation angle in degrees | 0 |
| `spread` | Threshold influence | 1.0 |

**Rotation:** When angle != 0, rotate the sampling coordinates:

```
rx = x * cos(angle) - y * sin(angle)
ry = x * sin(angle) + y * cos(angle)
i = floor(rx) % matrix_size
j = floor(ry) % matrix_size
// handle negative modulo
```

---

### Halftone Lines

Linear halftone pattern. Threshold varies in one direction only.

**Generating the threshold matrix:**

```
function halftoneLineMatrix(size):
    matrix = new Array[size][size]
    center = (size - 1) / 2.0

    for y = 0 to size - 1:
        dist = abs(y - center)
        for x = 0 to size - 1:
            matrix[y][x] = floor(dist * (size / center))

    // Normalize to 0..size*size-1 range
    // Assign unique ranks based on distance from center line
    return normalizeToRanks(matrix)
```

Alternative (simpler): use a 1D gradient repeated across rows:

```
function halftoneLineMatrix(size):
    matrix = new Array[size][size]
    for y = 0 to size - 1:
        // Triangle wave centered at middle
        normalizedDist = abs(2.0 * y / (size - 1) - 1.0)
        for x = 0 to size - 1:
            matrix[y][x] = normalizedDist
    return matrix  // values 0.0 to 1.0, use directly as threshold
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `lineWidth` | Width of halftone line cell | 8 |
| `angle` | Rotation angle in degrees | 0 |
| `spread` | Threshold influence | 1.0 |

---

### Clustered Dot (6x6 classic)

Traditional clustered dot screen used in printing. Predefined 6x6 matrix:

```
| 34  29  17  21  30  35 |
| 28  14   9  16  20  31 |
| 13   8   4   5  15  19 |
| 12   3   0   1  10  18 |
| 27   7   2   6  23  24 |
| 33  26  11  22  25  32 |
```

Normalized: divide each value by 36.

Use like any ordered dithering threshold matrix.

---

## Pattern Dithering

Pattern dithering uses mathematical functions to generate threshold values based on pixel coordinates, creating recognizable geometric patterns.

### General Pattern Dithering Framework

```
for y = 0 to height - 1:
    for x = 0 to width - 1:
        threshold = patternFunction(x, y, params)  // returns 0.0 - 1.0
        old_value = pixel[x][y]
        scaled = old_value + (threshold - 0.5) * spread
        pixel[x][y] = quantize(scaled, levels)
```

**Common tweakable parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `scale` | Pattern cell size in pixels | 8 |
| `spread` | Threshold influence (0.0 - 2.0) | 1.0 |
| `levels` | Output quantization levels | 2 |
| `angle` | Pattern rotation in degrees | 0 |

---

### Crosshatch

Simulates artistic crosshatching with multiple line directions.

```
function crosshatch(x, y, scale):
    // Normalize coordinates
    nx = (x % scale) / scale  // 0.0 to 1.0
    ny = (y % scale) / scale

    // Multiple hatch directions
    line1 = abs(fract(nx + ny) - 0.5) * 2.0         // 45 degrees
    line2 = abs(fract(nx - ny) - 0.5) * 2.0         // -45 degrees
    line3 = abs(fract(nx * 2.0) - 0.5) * 2.0        // vertical
    line4 = abs(fract(ny * 2.0) - 0.5) * 2.0        // horizontal

    // Layer crosshatches based on darkness:
    // Darker areas get more hatch layers
    threshold = min(line1, line2, line3, line4)
    return threshold

    // Alternative: progressive layering
    // For value v (0=black, 1=white):
    // v < 0.25: all four line sets visible
    // v < 0.50: three line sets
    // v < 0.75: two line sets
    // v < 1.00: one line set
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `scale` | Hatch cell size | 8 |
| `lineWidth` | Width of hatch lines (0.0 - 1.0) | 0.5 |
| `layers` | Number of crosshatch directions (1-4) | 4 |

---

### Diamond

Diamond-shaped threshold pattern.

```
function diamond(x, y, scale):
    nx = (x % scale) / scale - 0.5  // -0.5 to 0.5
    ny = (y % scale) / scale - 0.5
    return (abs(nx) + abs(ny))  // Manhattan distance from center, 0.0 to 1.0
```

The Manhattan distance `|x| + |y|` from the cell center creates a diamond shape.

---

### Spiral

Spiral pattern based on polar coordinates within each cell.

```
function spiral(x, y, scale):
    cx = (x % scale) - scale / 2.0
    cy = (y % scale) - scale / 2.0
    angle = atan2(cy, cx)                    // -PI to PI
    radius = sqrt(cx * cx + cy * cy)
    maxRadius = scale * 0.707                // sqrt(2)/2 * scale

    // Combine angle and radius into a spiral
    normalizedAngle = (angle + PI) / (2 * PI)  // 0.0 to 1.0
    normalizedRadius = radius / maxRadius       // 0.0 to ~1.0

    threshold = fract(normalizedAngle + normalizedRadius * turns)
    return threshold
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `scale` | Spiral cell size | 16 |
| `turns` | Number of spiral turns | 2.0 |

---

### Checkerboard

Simple alternating pattern.

```
function checkerboard(x, y, scale):
    cx = floor(x / scale)
    cy = floor(y / scale)
    return ((cx + cy) % 2 == 0) ? 0.25 : 0.75
```

This provides a binary threshold. For a smoother version:

```
function checkerboardSmooth(x, y, scale):
    nx = (x % scale) / scale
    ny = (y % scale) / scale
    // Smooth interpolation within each cell
    sx = smoothstep(0.0, 1.0, nx)
    sy = smoothstep(0.0, 1.0, ny)
    check = abs(sx - 0.5) + abs(sy - 0.5)
    cx = floor(x / scale)
    cy = floor(y / scale)
    if (cx + cy) % 2 == 1:
        check = 1.0 - check
    return check
```

---

### Diagonal Lines

Threshold based on diagonal position.

```
function diagonalLines(x, y, scale):
    return fract((x + y) / scale)
```

For anti-diagonal:

```
function antiDiagonalLines(x, y, scale):
    return fract((x - y) / scale)
```

For a triangle-wave version (smoother):

```
function diagonalLines(x, y, scale):
    t = ((x + y) % scale) / scale
    return abs(t * 2.0 - 1.0)  // triangle wave 0 to 1 to 0
```

---

### Horizontal Lines

```
function horizontalLines(x, y, scale):
    return abs(fract(y / scale) * 2.0 - 1.0)  // triangle wave
```

---

### Vertical Lines

```
function verticalLines(x, y, scale):
    return abs(fract(x / scale) * 2.0 - 1.0)  // triangle wave
```

---

### Grid

Combination of horizontal and vertical lines.

```
function grid(x, y, scale):
    h = abs(fract(y / scale) * 2.0 - 1.0)
    v = abs(fract(x / scale) * 2.0 - 1.0)
    return min(h, v)  // Closer to line = lower threshold = darker
```

---

### Dots

Circular dot pattern, similar to halftone but as a pattern dither.

```
function dots(x, y, scale):
    cx = (x % scale) - scale / 2.0
    cy = (y % scale) - scale / 2.0
    radius = sqrt(cx * cx + cy * cy)
    maxRadius = scale * 0.707  // sqrt(2)/2
    return clamp(radius / maxRadius, 0.0, 1.0)
```

Center of each cell is darkest (lowest threshold), edges are lightest.

---

## Modulation Dithers

Modulation dithers add a spatially-varying offset to pixel values before quantization, creating wave-like or noise-based patterns.

### General Modulation Framework

```
for y = 0 to height - 1:
    for x = 0 to width - 1:
        modulation = modulationFunction(x, y, params)  // returns -1.0 to 1.0
        old_value = pixel[x][y]
        modulated = old_value + modulation * amplitude
        pixel[x][y] = quantize(clamp(modulated, 0, 1), levels)
```

**Common tweakable parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `amplitude` | Strength of modulation (0.0 - 1.0) | 0.5 |
| `frequency` | Spatial frequency | 0.1 |
| `phase` | Phase offset in radians | 0.0 |
| `levels` | Output quantization levels | 2 |

---

### Uniform Modulation X

Horizontal gradient modulation.

```
function uniformModX(x, y, width, frequency):
    return (x * frequency) % 1.0 * 2.0 - 1.0
```

Triangle wave version for smoother results:

```
function uniformModX(x, y, width, frequency):
    t = fract(x * frequency)
    return abs(t * 2.0 - 1.0) * 2.0 - 1.0  // -1.0 to 1.0
```

---

### Uniform Modulation Y

Vertical gradient modulation.

```
function uniformModY(x, y, height, frequency):
    t = fract(y * frequency)
    return abs(t * 2.0 - 1.0) * 2.0 - 1.0
```

---

### Sine Wave

```
function sineWave(x, y, frequency, phase, direction):
    // direction: 0 = horizontal, PI/2 = vertical, etc.
    coord = x * cos(direction) + y * sin(direction)
    return sin(coord * frequency * 2 * PI + phase)
```

Output range: -1.0 to 1.0, used as modulation offset.

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `frequency` | Wave frequency (cycles per pixel) | 0.05 |
| `phase` | Phase offset (radians) | 0.0 |
| `direction` | Wave direction (radians) | 0.0 |
| `amplitude` | Wave amplitude | 0.5 |

---

### Cosine Wave

```
function cosineWave(x, y, frequency, phase, direction):
    coord = x * cos(direction) + y * sin(direction)
    return cos(coord * frequency * 2 * PI + phase)
```

Identical to sine with a PI/2 phase offset. Included for convenience.

---

### Radial Modulation

Creates concentric circles of modulation.

```
function radial(x, y, centerX, centerY, frequency):
    dx = x - centerX
    dy = y - centerY
    dist = sqrt(dx * dx + dy * dy)
    return sin(dist * frequency * 2 * PI)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `centerX` | X center of radial pattern | width / 2 |
| `centerY` | Y center of radial pattern | height / 2 |
| `frequency` | Ring frequency | 0.05 |
| `amplitude` | Modulation strength | 0.5 |

---

### Angular Modulation

Creates angular/sectored patterns emanating from a center point.

```
function angular(x, y, centerX, centerY, sectors):
    dx = x - centerX
    dy = y - centerY
    angle = atan2(dy, dx)  // -PI to PI
    return sin(angle * sectors)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `centerX` | X center point | width / 2 |
| `centerY` | Y center point | height / 2 |
| `sectors` | Number of angular sectors | 6 |
| `amplitude` | Modulation strength | 0.5 |

---

### Perlin Noise

Perlin noise generates smooth, natural-looking random patterns. Used as a threshold map.

**Simplified 2D Perlin noise:**

```
function perlinNoise(x, y, frequency, octaves, persistence):
    total = 0
    amplitude = 1.0
    maxValue = 0
    freq = frequency

    for i = 0 to octaves - 1:
        total += noise2D(x * freq, y * freq) * amplitude
        maxValue += amplitude
        amplitude *= persistence
        freq *= 2.0

    return total / maxValue  // normalized to -1.0 to 1.0
```

**Core noise2D function (value noise approximation):**

```
function noise2D(x, y):
    // Grid cell coordinates
    x0 = floor(x)
    y0 = floor(y)
    x1 = x0 + 1
    y1 = y0 + 1

    // Interpolation weights with smoothstep
    sx = smoothstep(x - x0)
    sy = smoothstep(y - y0)

    // Hash grid corners to get gradient values
    n00 = hash(x0, y0)
    n10 = hash(x1, y0)
    n01 = hash(x0, y1)
    n11 = hash(x1, y1)

    // Bilinear interpolation
    nx0 = lerp(n00, n10, sx)
    nx1 = lerp(n01, n11, sx)
    return lerp(nx0, nx1, sy)

function smoothstep(t):
    return t * t * (3 - 2 * t)

function hash(x, y):
    // Simple hash returning 0.0 to 1.0
    h = seed
    h = h ^ (x * 374761393)
    h = h ^ (y * 668265263)
    h = (h * h * h * 60493) >>> 0
    return (h & 0x7FFFFFFF) / 2147483647.0
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `frequency` | Base noise frequency | 0.01 |
| `octaves` | Number of noise layers | 4 |
| `persistence` | Amplitude decay per octave (0.0 - 1.0) | 0.5 |
| `seed` | Random seed | 0 |
| `amplitude` | Overall modulation strength | 0.5 |

---

## Special Effects

These algorithms go beyond traditional dithering to create stylized or glitch effects.

---

### Glitch Dither

Randomly displaces rows or blocks of pixels before dithering.

```
function glitchDither(imageData, params):
    // Phase 1: Apply glitch distortion
    for y = 0 to height - 1:
        if random(seed + y) < glitchProbability:
            // Shift this row by a random amount
            shift = floor(random(seed + y + 1000) * maxShift * 2) - maxShift
            shiftRow(imageData, y, shift)

            // Optionally: copy a block from another row
            if random(seed + y + 2000) < blockProbability:
                sourceY = floor(random(seed + y + 3000) * height)
                blockWidth = floor(random(seed + y + 4000) * width * 0.3)
                startX = floor(random(seed + y + 5000) * width)
                copyBlock(imageData, sourceY, y, startX, blockWidth)

    // Phase 2: Apply a base dither (e.g., ordered or Floyd-Steinberg)
    applyBaseDither(imageData, baseDitherType)

    // Phase 3: Optional color channel separation
    if channelShift:
        shiftChannel(imageData, 'R', channelOffsetX, 0)
        shiftChannel(imageData, 'B', -channelOffsetX, 0)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `glitchProbability` | Chance each row is glitched (0.0 - 1.0) | 0.1 |
| `maxShift` | Maximum pixel shift per row | 20 |
| `blockProbability` | Chance of block copy per glitch row | 0.3 |
| `channelShift` | Enable RGB channel separation | false |
| `channelOffsetX` | Channel separation distance in pixels | 3 |
| `baseDither` | Underlying dither algorithm | "ordered" |
| `seed` | Random seed | 0 |

---

### Scanline

Simulates CRT/monitor scanlines by darkening alternating rows.

```
function scanlineDither(imageData, params):
    for y = 0 to height - 1:
        // Scanline darkening
        scanlineValue = 1.0
        if y % lineSpacing < lineWidth:
            scanlineValue = 1.0 - darkness

        // Optional: phosphor simulation (slight brightness variation)
        if phosphorEffect:
            scanlineValue *= 0.95 + 0.05 * sin(y * PI / lineSpacing)

        for x = 0 to width - 1:
            pixel[x][y] *= scanlineValue

    // Apply base dither
    applyBaseDither(imageData, baseDitherType)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `lineSpacing` | Pixels between scanlines | 2 |
| `lineWidth` | Scanline width in pixels | 1 |
| `darkness` | Scanline darkness (0.0 - 1.0) | 0.5 |
| `phosphorEffect` | Simulate phosphor brightness variation | false |
| `baseDither` | Underlying dither algorithm | "none" |

---

### CRT Simulation

Full CRT monitor simulation with phosphor grid, curvature, and bloom.

```
function crtDither(imageData, width, height, params):
    // Step 1: Apply barrel distortion (curvature)
    for y = 0 to height - 1:
        for x = 0 to width - 1:
            // Normalize to -1..1
            nx = (2.0 * x / width) - 1.0
            ny = (2.0 * y / height) - 1.0

            // Barrel distortion
            r2 = nx * nx + ny * ny
            distortedX = nx * (1.0 + curvature * r2)
            distortedY = ny * (1.0 + curvature * r2)

            // Map back to pixel coordinates
            srcX = (distortedX + 1.0) * width / 2.0
            srcY = (distortedY + 1.0) * height / 2.0

            // Sample with bilinear interpolation
            outputPixel[x][y] = bilinearSample(imageData, srcX, srcY)

    // Step 2: Apply RGB phosphor pattern
    for y = 0 to height - 1:
        for x = 0 to width - 1:
            subpixel = x % 3
            if subpixel == 0:
                // Red phosphor
                pixel[x][y].G *= phosphorDim
                pixel[x][y].B *= phosphorDim
            else if subpixel == 1:
                // Green phosphor
                pixel[x][y].R *= phosphorDim
                pixel[x][y].B *= phosphorDim
            else:
                // Blue phosphor
                pixel[x][y].R *= phosphorDim
                pixel[x][y].G *= phosphorDim

    // Step 3: Apply scanlines
    applyScanlines(imageData, scanlineParams)

    // Step 4: Apply bloom (bleed bright pixels)
    if bloom > 0:
        blurred = gaussianBlur(imageData, bloomRadius)
        for each pixel:
            pixel = pixel + blurred * bloom

    // Step 5: Dither the result
    applyBaseDither(imageData, baseDitherType)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `curvature` | Barrel distortion strength (0.0 - 0.5) | 0.1 |
| `phosphorDim` | Non-active phosphor brightness (0.0 - 1.0) | 0.3 |
| `scanlineDarkness` | Scanline intensity (0.0 - 1.0) | 0.3 |
| `bloom` | Bloom intensity (0.0 - 1.0) | 0.1 |
| `bloomRadius` | Bloom blur radius in pixels | 2 |
| `baseDither` | Underlying dither algorithm | "ordered" |

---

### Pixel Sort Dither

Sorts pixels within rows or columns based on brightness, creating glitch art-style streaks.

```
function pixelSortDither(imageData, params):
    for y = 0 to height - 1:
        // Find sortable segments (pixels within threshold range)
        segments = []
        currentSegment = []

        for x = 0 to width - 1:
            brightness = luminance(pixel[x][y])
            if brightness >= lowerThreshold and brightness <= upperThreshold:
                currentSegment.push({ x, pixel: pixel[x][y] })
            else:
                if currentSegment.length > 0:
                    segments.push(currentSegment)
                currentSegment = []
        if currentSegment.length > 0:
            segments.push(currentSegment)

        // Sort each segment by brightness
        for segment in segments:
            if direction == "ascending":
                segment.sort((a, b) => luminance(a.pixel) - luminance(b.pixel))
            else:
                segment.sort((a, b) => luminance(b.pixel) - luminance(a.pixel))

            // Write sorted pixels back
            for i, entry in segment:
                pixel[entry.x][y] = segment[i].pixel

    // Apply base dither
    applyBaseDither(imageData, baseDitherType)
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `lowerThreshold` | Minimum brightness to include in sort (0.0 - 1.0) | 0.25 |
| `upperThreshold` | Maximum brightness to include in sort (0.0 - 1.0) | 0.75 |
| `direction` | Sort direction ("ascending" or "descending") | "ascending" |
| `orientation` | Sort along "horizontal" or "vertical" | "horizontal" |
| `baseDither` | Underlying dither algorithm | "ordered" |

---

### Voronoi Dither

Uses Voronoi tessellation to create cell-based dithering.

```
function voronoiDither(imageData, width, height, params):
    // Generate seed points
    points = []
    rng = seedRandom(seed)
    for i = 0 to numPoints - 1:
        points.push({
            x: rng() * width,
            y: rng() * height
        })

    // For each pixel, find nearest seed point
    for y = 0 to height - 1:
        for x = 0 to width - 1:
            minDist = Infinity
            closestPoint = -1

            for i, point in points:
                dx = x - point.x
                dy = y - point.y
                dist = dx * dx + dy * dy  // squared distance is fine for comparison
                if dist < minDist:
                    minDist = dist
                    closestPoint = i

            // Option 1: Average the cell, then threshold
            // (requires two passes: first accumulate, then assign)
            cellAccumulator[closestPoint] += luminance(pixel[x][y])
            cellCount[closestPoint] += 1
            cellMap[x][y] = closestPoint

    // Second pass: assign averaged values
    for y = 0 to height - 1:
        for x = 0 to width - 1:
            cellId = cellMap[x][y]
            avgValue = cellAccumulator[cellId] / cellCount[cellId]
            pixel[x][y] = quantize(avgValue, levels)

    // Option 2: Edge-based
    // Use distance to nearest edge as threshold modulation
    // threshold = minDist / secondMinDist creates edge highlights
```

**Optimization:** Use a grid-based spatial lookup instead of checking all points.

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `numPoints` | Number of Voronoi seed points | 500 |
| `seed` | Random seed for point generation | 0 |
| `levels` | Quantization levels | 2 |
| `edgeMode` | Show cell edges ("none", "thin", "thick") | "none" |
| `edgeColor` | Color of edges if shown | 0 (black) |

---

### Stippling

Simulates hand-drawn stipple illustration using weighted random dot placement.

```
function stipplingDither(imageData, width, height, params):
    output = new ImageData(width, height)  // start white
    fill(output, 255)

    // Method: Weighted probability sampling
    totalDarkness = 0
    for each pixel:
        totalDarkness += (1.0 - luminance(pixel))

    for i = 0 to numDots - 1:
        // Pick random position, weighted by darkness
        // Rejection sampling:
        while true:
            x = floor(random() * width)
            y = floor(random() * height)
            darkness = 1.0 - luminance(pixel[x][y])
            if random() < darkness:
                break

        // Place a dot
        dotRadius = minDotSize + (1.0 - luminance(pixel[x][y])) * (maxDotSize - minDotSize)
        drawCircle(output, x, y, dotRadius, 0)  // black dot
```

**Advanced: Lloyd relaxation for better distribution:**

```
for iteration = 0 to relaxIterations - 1:
    // Compute Voronoi diagram for current dot positions
    voronoi = computeVoronoi(dots, width, height)

    // Move each dot toward the weighted centroid of its cell
    for each dot:
        cell = voronoi.cellPixels(dot)
        weightedX = 0, weightedY = 0, totalWeight = 0
        for (px, py) in cell:
            w = 1.0 - luminance(pixel[px][py])  // darkness as weight
            weightedX += px * w
            weightedY += py * w
            totalWeight += w
        if totalWeight > 0:
            dot.x = weightedX / totalWeight
            dot.y = weightedY / totalWeight
```

**Parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `numDots` | Total number of stipple dots | 10000 |
| `minDotSize` | Minimum dot radius in pixels | 0.5 |
| `maxDotSize` | Maximum dot radius in pixels | 2.0 |
| `relaxIterations` | Lloyd relaxation iterations (0 = no relaxation) | 0 |
| `seed` | Random seed | 0 |

---

## Utility Functions

Common helper functions used across multiple algorithms.

### clamp

```
function clamp(value, min, max):
    if value < min: return min
    if value > max: return max
    return value
```

### lerp

```
function lerp(a, b, t):
    return a + (b - a) * t
```

### fract

```
function fract(x):
    return x - floor(x)
```

### smoothstep

```
function smoothstep(edge0, edge1, x):
    t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)
```

### luminance

```
function luminance(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b
```

---

## Implementation Notes

### Processing Order for Color Images

For color dithering, process each channel (R, G, B) independently through the chosen algorithm. Error diffusion should track and distribute error per-channel.

### Serpentine Scanning

For error diffusion algorithms, serpentine (boustrophedon) scanning alternates scan direction each row. This prevents directional artifacts. When scanning right-to-left, mirror the diffusion kernel horizontally.

### Pixel Scaling

For "chunky pixel" effects, downscale the image before dithering, then upscale with nearest-neighbor interpolation:

```
scaledWidth = ceil(width / scale)
scaledHeight = ceil(height / scale)
downscaled = nearestNeighborDownscale(image, scaledWidth, scaledHeight)
dithered = applyDither(downscaled)
output = nearestNeighborUpscale(dithered, width, height)
```

### Performance Considerations

- Ordered dithering is trivially parallelizable (each pixel is independent).
- Error diffusion is inherently sequential per-row but rows can partially overlap if you process them in the correct order.
- For large images, consider processing in tiles with boundary overlap for error diffusion.
- Use typed arrays (Uint8ClampedArray, Float32Array) for pixel data in JavaScript.
- Avoid creating new arrays in inner loops; preallocate buffers.

### Threshold vs Spread

Two common approaches for ordered/pattern dithering:

1. **Threshold comparison:** `output = input > threshold ? 1 : 0`
2. **Spread addition:** `output = quantize(input + (threshold - 0.5) * spread, levels)`

The spread approach allows multi-level quantization and controllable dithering intensity.
