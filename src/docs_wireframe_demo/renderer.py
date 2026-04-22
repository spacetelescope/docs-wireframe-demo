"""
Render a URL in a headless browser and capture the fully-rendered DOM.

Uses Playwright to load SPAs and JavaScript-heavy pages, waits for
rendering to complete, then extracts the full HTML including computed
styles.  The result is passed through :func:`sanitizer.sanitize_html`
to produce a self-contained, offline-safe HTML string.

Requires the ``playwright`` package and Chromium browser::

    pip install playwright
    playwright install chromium
"""

from __future__ import annotations

import logging

from .sanitizer import sanitize_html, DEFAULT_IMAGE_SIZE_LIMIT

logger = logging.getLogger(__name__)

#: Default timeout (ms) for page navigation + rendering.
PAGE_TIMEOUT = 60_000

#: Default extra wait (ms) after network idle to let late JS finish.
SETTLE_DELAY = 2_000


def fetch_rendered_html(
    url: str,
    *,
    wait_until: str = "networkidle",
    settle_ms: int = SETTLE_DELAY,
    timeout_ms: int = PAGE_TIMEOUT,
    viewport: dict | None = None,
) -> str:
    """Load *url* in headless Chromium and return the rendered DOM as HTML.

    Parameters
    ----------
    url : str
        The page to load.
    wait_until : str
        Playwright load-state to wait for (``"networkidle"``, ``"load"``,
        ``"domcontentloaded"``).
    settle_ms : int
        Extra milliseconds to wait after the load-state fires, giving
        late JavaScript a chance to finish rendering.
    timeout_ms : int
        Navigation timeout in milliseconds.
    viewport : dict or None
        ``{"width": int, "height": int}`` for the virtual viewport.
        Defaults to 1280 x 900.

    Returns
    -------
    str
        The full outer-HTML of the rendered page (``document.documentElement.outerHTML``).
    """
    from playwright.sync_api import sync_playwright

    vp = viewport or {"width": 1280, "height": 900}

    logger.info("Launching headless Chromium for %s", url)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=vp,
            java_script_enabled=True,
            # Block unnecessary media to speed things up
            bypass_csp=True,
        )
        page = context.new_page()

        logger.info("Navigating to %s (wait_until=%s)", url, wait_until)
        page.goto(url, wait_until=wait_until, timeout=timeout_ms)

        if settle_ms > 0:
            logger.info("Settling for %d ms...", settle_ms)
            page.wait_for_timeout(settle_ms)

        # Capture the fully-rendered DOM, including <head> styles that
        # were injected by JavaScript frameworks.
        rendered = page.evaluate("() => document.documentElement.outerHTML")

        # Also grab the base URL as the browser resolved it (handles redirects)
        final_url = page.url

        browser.close()

    # Wrap in a proper document if needed
    if not rendered.strip().lower().startswith("<!doctype"):
        rendered = "<!DOCTYPE html>\n" + rendered

    logger.info("Captured %d bytes of rendered HTML from %s", len(rendered), final_url)
    return rendered, final_url


def fetch_rendered_and_sanitize(
    url: str,
    *,
    inline_images: bool = True,
    image_size_limit: int = DEFAULT_IMAGE_SIZE_LIMIT,
    wait_until: str = "networkidle",
    settle_ms: int = SETTLE_DELAY,
    timeout_ms: int = PAGE_TIMEOUT,
    viewport: dict | None = None,
) -> str:
    """Render a URL in a headless browser, then sanitize for offline embedding.

    This is the main entry point for URL-sourced wireframes that are
    JavaScript-rendered (SPAs).  It combines :func:`fetch_rendered_html`
    with :func:`sanitizer.sanitize_html`.

    Parameters
    ----------
    url : str
        The page to render.
    inline_images : bool
        Inline ``<img>`` sources as data URIs.
    image_size_limit : int
        Maximum per-image size to inline (bytes).
    wait_until, settle_ms, timeout_ms, viewport
        Passed through to :func:`fetch_rendered_html`.

    Returns
    -------
    str
        Sanitized, self-contained HTML string.
    """
    rendered_html, final_url = fetch_rendered_html(
        url,
        wait_until=wait_until,
        settle_ms=settle_ms,
        timeout_ms=timeout_ms,
        viewport=viewport,
    )

    return sanitize_html(
        rendered_html,
        base_url=final_url,
        inline_images=inline_images,
        image_size_limit=image_size_limit,
    )
