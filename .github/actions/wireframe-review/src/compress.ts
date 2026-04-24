/**
 * Compress wireframe HTML for LLM prompts.
 *
 * Produces a compact structural summary that retains:
 * - Element hierarchy (tags, IDs, classes, data-* attributes, title)
 * - Meaningful inline styles (colors, backgrounds, display, flex/grid, borders,
 *   dimensions, visibility, opacity, position, z-index)
 * - <style> blocks compressed to just selectors + meaningful properties
 * - Text content (trimmed)
 *
 * Strips:
 * - Verbose CSS properties (font-family fallback stacks, vendor prefixes,
 *   transitions, animations, cursor, outline, box-shadow, text-rendering)
 * - Excessive whitespace
 * - HTML comments
 */

/** CSS properties meaningful for wireframe review */
const MEANINGFUL_PROPS = new Set([
  'color', 'background', 'background-color', 'background-image',
  'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink',
  'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-area',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'border', 'border-color', 'border-width', 'border-radius',
  'visibility', 'opacity', 'overflow', 'overflow-x', 'overflow-y',
  'gap', 'row-gap', 'column-gap',
  'align-items', 'justify-content', 'align-self', 'justify-self',
  'order', 'float', 'clear',
  'margin', 'padding',
]);

/** Compress inline style attribute to only meaningful properties */
function compressInlineStyle(style: string): string {
  const parts: string[] = [];
  // Split on semicolons, keeping property: value pairs
  for (const decl of style.split(';')) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
    if (MEANINGFUL_PROPS.has(prop)) {
      parts.push(trimmed);
    }
  }
  return parts.join('; ');
}

/** Compress a <style> block's CSS to only meaningful selectors + properties */
function compressStyleBlock(css: string): string {
  const rules: string[] = [];

  // Simple regex-based rule extraction (handles single-level nesting)
  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const body = match[2];

    const compressed: string[] = [];
    for (const decl of body.split(';')) {
      const trimmed = decl.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;
      const prop = trimmed.slice(0, colonIdx).trim().toLowerCase();
      if (MEANINGFUL_PROPS.has(prop)) {
        compressed.push(trimmed);
      }
    }

    if (compressed.length > 0) {
      rules.push(`${selector} { ${compressed.join('; ')} }`);
    }
  }

  return rules.join('\n');
}

/**
 * Compress wireframe HTML for LLM prompt inclusion.
 *
 * Returns a compact but structurally complete representation that preserves
 * element hierarchy, IDs/classes/data attributes, and meaningful styles.
 */
export function compressHtml(html: string): string {
  let result = html;

  // Remove HTML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  // Compress <style> blocks
  result = result.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    const compressed = compressStyleBlock(css);
    return compressed ? `<style>${compressed}</style>` : '';
  });

  // Compress inline styles
  result = result.replace(/\bstyle\s*=\s*"([^"]*)"/gi, (_match, style: string) => {
    const compressed = compressInlineStyle(style);
    return compressed ? `style="${compressed}"` : '';
  });
  result = result.replace(/\bstyle\s*=\s*'([^']*)'/gi, (_match, style: string) => {
    const compressed = compressInlineStyle(style);
    return compressed ? `style="${compressed}"` : '';
  });

  // Collapse whitespace: multiple spaces/newlines → single space
  result = result.replace(/\s+/g, ' ');

  // Add newlines before opening tags for readability
  result = result.replace(/>\s*</g, '>\n<');

  // Remove empty lines
  result = result.split('\n').filter(line => line.trim()).join('\n');

  return result.trim();
}

/** Compress CSS content (standalone file, not inline) */
export function compressCss(css: string): string {
  return compressStyleBlock(css);
}
