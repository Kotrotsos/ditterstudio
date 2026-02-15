"""Take screenshots of the Ditter app for the manual."""
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

    # 1. Landing page (drop zone visible)
    page.screenshot(path=f'{OUTDIR}/01-landing.png')
    print('1/9 landing')

    # 2. Load the example image
    page.set_input_files('#file-input', IMAGE)
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTDIR}/02-gradient-loaded.png')
    print('2/9 image loaded')

    # 3. Show the control panel with algorithm dropdowns
    page.screenshot(path=f'{OUTDIR}/03-control-panel.png')
    print('3/9 control panel')

    # 4. Switch to a halftone algorithm
    page.select_option('#style-category', 'halftone')
    page.wait_for_timeout(500)
    page.select_option('#style-algorithm', 'dot-halftone')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/04-halftone.png')
    print('4/9 halftone')

    # 5. Switch to creative category
    page.select_option('#style-category', 'creative')
    page.wait_for_timeout(500)
    page.select_option('#style-algorithm', 'reaction-diffusion')
    page.wait_for_timeout(2000)
    page.screenshot(path=f'{OUTDIR}/05-creative.png')
    print('5/9 creative')

    # 6. Switch to ordered with a retro palette
    page.select_option('#style-category', 'ordered')
    page.wait_for_timeout(500)
    page.select_option('#style-algorithm', 'bayer-4x4')
    page.wait_for_timeout(500)
    page.select_option('#palette-category', 'retro')
    page.wait_for_timeout(500)
    page.select_option('#palette-select', 'gameboy')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/06-retro-gameboy.png')
    print('6/9 retro gameboy')

    # 7. Open Studio modal
    page.click('#btn-studio')
    page.wait_for_timeout(1500)
    page.screenshot(path=f'{OUTDIR}/07-studio.png')
    print('7/9 studio')

    # 8. Close studio, show export modal
    page.keyboard.press('Escape')
    page.wait_for_timeout(500)
    page.click('#btn-export')
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUTDIR}/08-export.png')
    print('8/9 export')

    # 9. Close export, show light theme
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    page.evaluate("document.documentElement.setAttribute('data-theme', 'light')")
    page.wait_for_timeout(500)
    page.screenshot(path=f'{OUTDIR}/09-light-theme.png')
    print('9/9 light theme')

    browser.close()
    print('All screenshots captured.')
