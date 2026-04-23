"""
Fetch remote HTML and sanitize it for safe offline embedding.

The sanitized output is a fully self-contained HTML string with:
- All ``<script>`` tags removed
- All ``on*`` event-handler attributes removed
- External stylesheets fetched and inlined as ``<style>`` blocks
- ``<a>`` links neutralized (no navigation)
- ``<form>`` submissions blocked
- Dangerous embed elements removed (``<iframe>``, ``<object>``, ``<embed>``, etc.)
- ``<base>`` and ``<meta http-equiv="refresh">`` removed
- External images optionally inlined as ``data:`` URIs
- A strict Content-Security-Policy ``<meta>`` tag injected as a safety net
"""

import base64
import logging
import mimetypes
import re
import urllib.parse
from io import BytesIO
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Comment

logger = logging.getLogger(__name__)

#: Maximum size (bytes) for inlining an external image as a data URI.
DEFAULT_IMAGE_SIZE_LIMIT = 512 * 1024  # 512 KB

#: Request timeout in seconds for fetching remote resources.
FETCH_TIMEOUT = 30

#: User-Agent header for outgoing requests.
USER_AGENT = "docs-wireframe-demo/0.1 (sanitizer)"

#: Event-handler attribute pattern (on*)
_EVENT_ATTR_RE = re.compile(r"^on", re.IGNORECASE)

#: CSS url() pattern for resolving relative URLs in stylesheets
_CSS_URL_RE = re.compile(r"""url\(\s*(['"]?)(.+?)\1\s*\)""")

#: CSS @import pattern
_CSS_IMPORT_RE = re.compile(
    r"""@import\s+(?:url\(\s*['"]?(.+?)['"]?\s*\)|['"](.+?)['"])\s*;""",
    re.IGNORECASE,
)

#: CSP meta tag to inject — blocks all network requests from the embedded content
CSP_POLICY = (
    "default-src 'none'; "
    "style-src 'unsafe-inline'; "
    "img-src data: blob:; "
    "font-src data:;"
)

#: Elements that can embed external content and should be removed
_DANGEROUS_TAGS = {"iframe", "object", "embed", "applet", "portal"}


def _fetch(url: str) -> bytes:
    """Fetch a URL and return the response body as bytes."""
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=FETCH_TIMEOUT) as resp:  # noqa: S310
        return resp.read()


def _fetch_text(url: str) -> str:
    return _fetch(url).decode("utf-8", errors="replace")


def _resolve_url(base: str, relative: str) -> str:
    """Resolve a potentially relative URL against a base URL."""
    return urllib.parse.urljoin(base, relative)


def _inline_css_urls(css_text: str, base_url: str, image_limit: int) -> str:
    """Resolve url() references in CSS, optionally inlining images as data URIs."""

    def _replace(match: re.Match) -> str:
        raw = match.group(2)
        # Skip data URIs and blob URIs
        if raw.startswith(("data:", "blob:")):
            return match.group(0)
        absolute = _resolve_url(base_url, raw)
        try:
            data = _fetch(absolute)
            if len(data) <= image_limit:
                mime = mimetypes.guess_type(absolute)[0] or "application/octet-stream"
                b64 = base64.b64encode(data).decode("ascii")
                return f"url(data:{mime};base64,{b64})"
            else:
                logger.warning("Skipping large CSS resource (%d bytes): %s", len(data), absolute)
                return match.group(0)
        except Exception:
            logger.warning("Failed to fetch CSS resource: %s", absolute, exc_info=True)
            return match.group(0)

    return _CSS_URL_RE.sub(_replace, css_text)


def _resolve_css_imports(css_text: str, base_url: str, image_limit: int, depth: int = 0) -> str:
    """Recursively resolve @import directives in CSS."""
    if depth > 5:
        return css_text

    def _replace(match: re.Match) -> str:
        import_url = match.group(1) or match.group(2)
        absolute = _resolve_url(base_url, import_url)
        try:
            imported = _fetch_text(absolute)
            imported = _resolve_css_imports(imported, absolute, image_limit, depth + 1)
            imported = _inline_css_urls(imported, absolute, image_limit)
            return f"/* @import {import_url} (inlined) */\n{imported}"
        except Exception:
            logger.warning("Failed to fetch @import: %s", absolute, exc_info=True)
            return f"/* @import {import_url} (failed) */"

    return _CSS_IMPORT_RE.sub(_replace, css_text)


def fetch_and_sanitize(
    url: str,
    *,
    inline_images: bool = True,
    image_size_limit: int = DEFAULT_IMAGE_SIZE_LIMIT,
) -> str:
    """Fetch a URL and return sanitized, self-contained HTML.

    Parameters
    ----------
    url : str
        The HTTP/HTTPS URL to fetch.
    inline_images : bool
        If True, external ``<img>`` sources are fetched and converted
        to ``data:`` URIs (subject to *image_size_limit*).
    image_size_limit : int
        Maximum size in bytes per image to inline. Larger images are
        left with their original ``src`` (which the CSP will block).

    Returns
    -------
    str
        A fully sanitized, self-contained HTML string.
    """
    logger.info("Fetching %s", url)
    raw_html = _fetch_text(url)
    return sanitize_html(
        raw_html,
        base_url=url,
        inline_images=inline_images,
        image_size_limit=image_size_limit,
    )


def sanitize_html(
    raw_html: str,
    *,
    base_url: str = "",
    inline_images: bool = True,
    image_size_limit: int = DEFAULT_IMAGE_SIZE_LIMIT,
) -> str:
    """Sanitize an HTML string for safe offline embedding.

    Parameters
    ----------
    raw_html : str
        The raw HTML to sanitize.
    base_url : str
        Base URL for resolving relative resource references.
    inline_images : bool
        If True, external ``<img>`` sources are inlined as data URIs.
    image_size_limit : int
        Maximum per-image size in bytes to inline.

    Returns
    -------
    str
        The sanitized HTML string.
    """
    soup = BeautifulSoup(raw_html, "html.parser")

    # 1. Remove all <script> tags
    for tag in soup.find_all("script"):
        tag.decompose()

    # 2. Remove HTML comments (may contain conditional scripts)
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()

    # 3. Remove dangerous embed elements
    for tag_name in _DANGEROUS_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # 4. Remove <base> tags
    for tag in soup.find_all("base"):
        tag.decompose()

    # 5. Remove <meta http-equiv="refresh">
    for tag in soup.find_all("meta"):
        if tag.get("http-equiv", "").lower() == "refresh":
            tag.decompose()

    # 6. Remove all on* event-handler attributes from every element
    for tag in soup.find_all(True):
        attrs_to_remove = [attr for attr in tag.attrs if _EVENT_ATTR_RE.match(attr)]
        for attr in attrs_to_remove:
            del tag[attr]

    # 7. Inline external stylesheets (<link rel="stylesheet">)
    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel", []))
        if "stylesheet" in rel:
            href = link.get("href", "")
            if not href or href.startswith("data:"):
                continue
            absolute = _resolve_url(base_url, href)
            try:
                css_text = _fetch_text(absolute)
                css_text = _resolve_css_imports(css_text, absolute, image_size_limit)
                css_text = _inline_css_urls(css_text, absolute, image_size_limit)
                style_tag = soup.new_tag("style")
                style_tag.string = css_text
                link.replace_with(style_tag)
            except Exception:
                logger.warning("Failed to inline stylesheet: %s", absolute, exc_info=True)
                link.decompose()

    # 8. Resolve url() and @import in existing inline <style> blocks
    for style in soup.find_all("style"):
        if style.string:
            css = style.string
            css = _resolve_css_imports(css, base_url, image_size_limit)
            css = _inline_css_urls(css, base_url, image_size_limit)
            style.string = css

    # 9. Neutralize <a> links
    for a in soup.find_all("a"):
        if a.get("href"):
            a["href"] = "javascript:void(0)"
        a["onclick"] = "return false"

    # 10. Neutralize <form> elements
    for form in soup.find_all("form"):
        if form.get("action"):
            del form["action"]
        form["onsubmit"] = "return false"

    # 11. Inline external images as data URIs
    if inline_images:
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if not src or src.startswith(("data:", "blob:")):
                continue
            absolute = _resolve_url(base_url, src)
            if not absolute.startswith(("http://", "https://")):
                continue
            try:
                data = _fetch(absolute)
                if len(data) <= image_size_limit:
                    mime = mimetypes.guess_type(absolute)[0] or "image/png"
                    b64 = base64.b64encode(data).decode("ascii")
                    img["src"] = f"data:{mime};base64,{b64}"
                else:
                    logger.warning("Skipping large image (%d bytes): %s", len(data), absolute)
            except Exception:
                logger.warning("Failed to inline image: %s", absolute, exc_info=True)

    # 12. Also handle CSS background images in style attributes
    for tag in soup.find_all(True, attrs={"style": True}):
        style_val = tag["style"]
        if "url(" in style_val:
            tag["style"] = _inline_css_urls(style_val, base_url, image_size_limit)

    # 13. Remove prefetch/preload/preconnect link tags
    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel", []))
        if any(kw in rel for kw in ("prefetch", "preload", "preconnect", "dns-prefetch")):
            link.decompose()

    # 14. Inject CSP meta tag into <head>
    head = soup.find("head")
    if not head:
        head = soup.new_tag("head")
        if soup.find("html"):
            soup.find("html").insert(0, head)
        else:
            soup.insert(0, head)

    csp_meta = soup.new_tag(
        "meta",
        attrs={"http-equiv": "Content-Security-Policy", "content": CSP_POLICY},
    )
    head.insert(0, csp_meta)

    return str(soup)
