"""Take additional screenshots showing variety of algorithms."""
from playwright.sync_api import sync_playwright
import time

OUTDIR = '/Users/marcokotrotsos/PERSONAL/ditter/web/screenshots'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1400, 'height': 900})
    page.goto('http://localhost:8000')
    page.wait_for_load_state('networkidle')
    time.sleep(1)

    # Generate gradient source
    page.click('#btn-create-input')
    page.wait_for_timeout(1500)

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
    print('Done.')
