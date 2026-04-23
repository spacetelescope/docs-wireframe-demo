/**
 * Auto-discovery of wireframe demos in documentation sources.
 *
 * Scans a docs root for:
 * - RST files with `.. wireframe-demo::` directives
 * - HTML/Jinja files with `data-wireframe-demo` attributes
 *
 * Returns structured demo descriptors with resolved file paths.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredDemo {
  /** File where the demo was found */
  sourceFile: string;
  /** Resolved path to the wireframe HTML file (may be null if unresolvable) */
  htmlPath: string | null;
  /** Resolved path to custom CSS file, if any */
  cssPath: string | null;
  /** Resolved path to custom JS file, if any */
  jsPath: string | null;
  /** Step definitions extracted from the source */
  steps: string | null;
  /** Raw config JSON (for HTML/Jinja demos) */
  rawConfig: string | null;
  /** Demo type: 'rst-directive' or 'html-attribute' */
  type: 'rst-directive' | 'html-attribute';
}

/**
 * Recursively find all files matching given extensions under a directory.
 */
function findFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories and common non-doc dirs
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__') {
        results.push(...findFiles(fullPath, extensions));
      }
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Try to resolve a wireframe file path from a reference found in docs.
 *
 * Searches:
 * 1. Relative to the source file's directory
 * 2. In docs/_static/
 * 3. By filename anywhere in the repo
 */
function resolveFilePath(
  ref: string,
  sourceFile: string,
  docsRoot: string,
  repoRoot: string
): string | null {
  // Strip Jinja template expressions: {{ pathto('_static/foo.html', 1) }} → _static/foo.html
  const jinjaMatch = ref.match(/\{\{\s*pathto\(\s*['"]([^'"]+)['"]/);
  if (jinjaMatch) {
    ref = jinjaMatch[1];
  }

  // Strip leading _static/ for resolution
  const basename = ref.replace(/^_static\//, '');

  // 1. Relative to source file
  const relPath = path.resolve(path.dirname(sourceFile), ref);
  if (fs.existsSync(relPath)) return relPath;

  // 2. In docs/_static/
  const staticPath = path.join(docsRoot, '_static', basename);
  if (fs.existsSync(staticPath)) return staticPath;

  // 3. Search common Sphinx extension static dirs (package/ext/*/static/)
  // Look for the file by name anywhere in the repo
  const filename = path.basename(basename);
  const found = findFileByName(repoRoot, filename);
  if (found) return found;

  return null;
}

/**
 * Search for a file by name in the repo, skipping hidden/vendor dirs.
 * Returns the first match.
 */
function findFileByName(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' ||
          entry.name === '__pycache__' || entry.name === '.git' ||
          entry.name === 'dist' || entry.name === '_build') {
        continue;
      }
      const found = findFileByName(fullPath, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

// ── RST directive parsing ──────────────────────────────────────────────

/**
 * Parse RST files for `.. wireframe-demo::` directives.
 */
function parseRstFile(
  filePath: string,
  docsRoot: string,
  repoRoot: string
): DiscoveredDemo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const demos: DiscoveredDemo[] = [];

  // Match directive with its argument and indented options block
  const directiveRegex = /^\.\.\s+wireframe-demo::\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  while ((match = directiveRegex.exec(content)) !== null) {
    const htmlRef = match[1].trim();
    const directiveStart = match.index + match[0].length;

    // Extract the indented options block following the directive
    const restOfFile = content.slice(directiveStart);
    const optionsBlock = extractIndentedBlock(restOfFile);

    const options = parseRstOptions(optionsBlock);

    const htmlPath = resolveFilePath(htmlRef, filePath, docsRoot, repoRoot);
    const cssRef = options['css'];
    const jsRef = options['js'];

    let steps: string | null = null;
    if (options['steps-json']) {
      steps = options['steps-json'];
    } else if (options['steps']) {
      steps = options['steps'];
    }

    demos.push({
      sourceFile: filePath,
      htmlPath,
      cssPath: cssRef ? resolveFilePath(cssRef, filePath, docsRoot, repoRoot) : null,
      jsPath: jsRef ? resolveFilePath(jsRef, filePath, docsRoot, repoRoot) : null,
      steps,
      rawConfig: null,
      type: 'rst-directive',
    });
  }

  return demos;
}

/**
 * Extract the indented block following an RST directive (options + content).
 */
function extractIndentedBlock(text: string): string {
  const lines = text.split('\n');
  const blockLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (!started) {
      // Skip empty lines before the block
      if (line.trim() === '') continue;
      // First non-empty line must be indented
      if (/^\s+/.test(line)) {
        started = true;
        blockLines.push(line);
      } else {
        break; // Not indented → no options block
      }
    } else {
      // Continue while indented or blank
      if (/^\s+/.test(line) || line.trim() === '') {
        blockLines.push(line);
      } else {
        break;
      }
    }
  }

  return blockLines.join('\n');
}

/**
 * Parse RST field-list style options from an indented block.
 * E.g. `:steps: #btn@1500:click, ...` → { steps: '#btn@1500:click, ...' }
 */
function parseRstOptions(block: string): Record<string, string> {
  const options: Record<string, string> = {};
  const lines = block.split('\n');
  let currentKey: string | null = null;
  let currentValue = '';

  for (const line of lines) {
    const optMatch = line.match(/^\s+:([a-z-]+):\s*(.*)/);
    if (optMatch) {
      if (currentKey) {
        options[currentKey] = currentValue.trim();
      }
      currentKey = optMatch[1];
      currentValue = optMatch[2];
    } else if (currentKey && /^\s+/.test(line)) {
      // Continuation line
      currentValue += ' ' + line.trim();
    }
  }

  if (currentKey) {
    options[currentKey] = currentValue.trim();
  }

  return options;
}

// ── HTML/Jinja attribute parsing ───────────────────────────────────────

/**
 * Parse HTML/Jinja files for `data-wireframe-demo` attributes.
 */
function parseHtmlFile(
  filePath: string,
  docsRoot: string,
  repoRoot: string
): DiscoveredDemo[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const demos: DiscoveredDemo[] = [];

  // Find elements with data-wireframe-demo attribute
  // We look for data-wireframe-config that follows it
  const attrRegex = /data-wireframe-demo[\s\S]*?data-wireframe-config\s*=\s*'([\s\S]*?)'/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(content)) !== null) {
    let configStr = match[1].trim();

    // Store the raw config (with Jinja expressions intact) for context
    const rawConfig = configStr;

    // Strip Jinja expressions for JSON parsing: replace {{ ... }} with placeholder strings
    const jinjaRefs: string[] = [];
    configStr = configStr.replace(/\{\{[^}]+\}\}/g, (m) => {
      jinjaRefs.push(m);
      return `"__jinja_${jinjaRefs.length - 1}__"`;
    });

    let htmlRef: string | null = null;
    let steps: string | null = null;

    try {
      const config = JSON.parse(configStr);
      const htmlSrc = config.htmlSrc;
      if (typeof htmlSrc === 'string') {
        // May be a Jinja placeholder → resolve from the original
        const jinjaIdx = htmlSrc.match(/__jinja_(\d+)__/);
        htmlRef = jinjaIdx ? jinjaRefs[parseInt(jinjaIdx[1], 10)] : htmlSrc;
      }
      if (config.steps) {
        // Re-serialize steps from the original raw config to preserve Jinja refs
        steps = extractStepsFromRawConfig(rawConfig);
      }
    } catch {
      // JSON parse failed — try to extract htmlSrc from raw config
      const htmlSrcMatch = rawConfig.match(/"htmlSrc"\s*:\s*"([^"]+)"/);
      if (htmlSrcMatch) {
        htmlRef = htmlSrcMatch[1];
      }
      const jinjaHtmlMatch = rawConfig.match(/"htmlSrc"\s*:\s*"?\{\{\s*pathto\(\s*['"]([^'"]+)['"]/);
      if (jinjaHtmlMatch) {
        htmlRef = `{{ pathto('${jinjaHtmlMatch[1]}', 1) }}`;
      }
    }

    const htmlPath = htmlRef ? resolveFilePath(htmlRef, filePath, docsRoot, repoRoot) : null;

    demos.push({
      sourceFile: filePath,
      htmlPath,
      cssPath: null, // HTML demos load CSS via extension setup, discovered separately
      jsPath: null,
      steps: steps || rawConfig,
      rawConfig,
      type: 'html-attribute',
    });
  }

  return demos;
}

/**
 * Extract the "steps" array from raw config JSON string, preserving Jinja expressions.
 */
function extractStepsFromRawConfig(rawConfig: string): string | null {
  // Find the steps array in the raw JSON-like string.
  // This is a rough extraction — find "steps": [ ... ] accounting for nested brackets.
  const stepsStart = rawConfig.indexOf('"steps"');
  if (stepsStart === -1) return null;

  const arrayStart = rawConfig.indexOf('[', stepsStart);
  if (arrayStart === -1) return null;

  let depth = 0;
  let i = arrayStart;
  for (; i < rawConfig.length; i++) {
    if (rawConfig[i] === '[') depth++;
    else if (rawConfig[i] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }

  if (depth !== 0) return null;
  return rawConfig.slice(arrayStart, i + 1);
}

// ── Sibling file discovery ─────────────────────────────────────────────

/**
 * For a discovered wireframe HTML file, find sibling CSS and JS files
 * (common pattern: foo.html + foo.css + foo-actions.js in the same directory).
 */
function findSiblingAssets(htmlPath: string): { css: string | null; js: string | null } {
  const dir = path.dirname(htmlPath);
  const base = path.basename(htmlPath, '.html');

  let css: string | null = null;
  let js: string | null = null;

  // Look for matching CSS
  const cssCandidates = [`${base}.css`, `${base}-wireframe.css`];
  for (const candidate of cssCandidates) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p)) { css = p; break; }
  }

  // Look for matching JS (custom actions)
  const jsCandidates = [`${base}-actions.js`, `${base}.js`, `${base}-wireframe-actions.js`];
  for (const candidate of jsCandidates) {
    const p = path.join(dir, candidate);
    if (fs.existsSync(p)) { js = p; break; }
  }

  return { css, js };
}

// ── Main discovery function ────────────────────────────────────────────

export interface DiscoverOptions {
  docsRoot: string;
  repoRoot: string;
}

/**
 * Discover all wireframe demos in the docs root.
 */
export function discoverWireframeDemos(options: DiscoverOptions): DiscoveredDemo[] {
  const { docsRoot, repoRoot } = options;
  const demos: DiscoveredDemo[] = [];

  // Find RST and HTML/Jinja files
  const rstFiles = findFiles(docsRoot, ['.rst']);
  const htmlFiles = findFiles(docsRoot, ['.html']);

  for (const file of rstFiles) {
    demos.push(...parseRstFile(file, docsRoot, repoRoot));
  }

  for (const file of htmlFiles) {
    demos.push(...parseHtmlFile(file, docsRoot, repoRoot));
  }

  // For demos where we found the HTML but not CSS/JS, look for sibling assets
  for (const demo of demos) {
    if (demo.htmlPath) {
      if (!demo.cssPath || !demo.jsPath) {
        const siblings = findSiblingAssets(demo.htmlPath);
        if (!demo.cssPath && siblings.css) demo.cssPath = siblings.css;
        if (!demo.jsPath && siblings.js) demo.jsPath = siblings.js;
      }
    }
  }

  return demos;
}
