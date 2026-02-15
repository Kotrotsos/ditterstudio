"""Take additional screenshots showing variety of algorithms and video mode."""
from playwright.sync_api import sync_playwright
import time

OUTDIR = '/Users/marcokotrotsos/PERSONAL/ditter/web/screenshots'
IMAGE = '/Users/marcokotrotsos/Downloads/example.JPEG'
VIDEO = '/Users/marcokotrotsos/Downloads/bb.mp4'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.goto('http://localhost:8000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)

    # Load the example image
    page.set_input_files('#file-input', IMAGE)
    page.wait_for_timeout(2000)

    # 10. Crosshatch pattern
    page.select_option('#style-category', 'pattern')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'crosshatch')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/10-crosshatch.png')
    print('10 crosshatch')

    # 11. Blue noise with Cyberpunk palette
    page.select_option('#style-category', 'noise')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'blue-noise')
    page.wait_for_timeout(300)
    page.select_option('#palette-category', 'themed')
    page.wait_for_timeout(300)
    page.select_option('#palette-select', 'cyberpunk')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/11-blue-noise-cyberpunk.png')
    print('11 blue noise cyberpunk')

    # 12. Sketch with Grayscale 8
    page.select_option('#style-category', 'artistic')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'sketch')
    page.wait_for_timeout(300)
    page.select_option('#palette-category', 'default')
    page.wait_for_timeout(300)
    page.select_option('#palette-select', 'grayscale-8')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/12-sketch.png')
    print('12 sketch')

    # 13. Atkinson with Sepia palette
    page.select_option('#style-category', 'error-diffusion')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'atkinson')
    page.wait_for_timeout(300)
    page.select_option('#palette-category', 'themed')
    page.wait_for_timeout(300)
    page.select_option('#palette-select', 'sepia')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/13-atkinson-sepia.png')
    print('13 atkinson sepia')

    # 14. Creative - pixel sort with grayscale-16
    page.select_option('#style-category', 'creative')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'pixel-sort')
    page.wait_for_timeout(300)
    page.select_option('#palette-category', 'default')
    page.wait_for_timeout(300)
    page.select_option('#palette-select', 'grayscale-16')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/14-pixel-sort.png')
    print('14 pixel sort')

    # 15. Threshold - Otsu
    page.select_option('#style-category', 'threshold')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'otsu')
    page.wait_for_timeout(300)
    page.select_option('#palette-select', 'bw')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/15-otsu.png')
    print('15 otsu')

    browser.close()

    # -- Video screenshots in a separate session --
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.goto('http://localhost:8000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)

    # Load the video file
    page.set_input_files('#file-input', VIDEO)
    page.wait_for_timeout(3000)

    # 16. Video mode - filmstrip visible
    page.screenshot(path=f'{OUTDIR}/16-video-mode.png')
    print('16 video mode')

    # 17. Video with halftone dithering
    page.select_option('#style-category', 'halftone')
    page.wait_for_timeout(300)
    page.select_option('#style-algorithm', 'dot-halftone')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/17-video-halftone.png')
    print('17 video halftone')

    browser.close()
    print('Done.')
