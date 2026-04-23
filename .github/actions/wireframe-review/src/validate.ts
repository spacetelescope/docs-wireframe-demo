/**
 * Deterministic validation of step definitions against wireframe HTML.
 *
 * Checks that CSS selectors referenced in steps actually match elements
 * in the wireframe, and that actions used are either built-in or registered
 * in the custom actions JS.
 */

import { DemoArtifacts } from './artifacts';

export interface ValidationIssue {
  step: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  label: string;
  issues: ValidationIssue[];
  valid: boolean;
}

// ── HTML element extraction ────────────────────────────────────────────

/** Extract all id values from HTML. */
function extractIds(html: string): Set<string> {
  const ids = new Set<string>();
  const regex = /\bid\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/** Extract all class names from HTML. */
function extractClasses(html: string): Set<string> {
  const classes = new Set<string>();
  const regex = /\bclass\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    for (const cls of m[1].split(/\s+/)) {
      if (cls) classes.add(cls);
    }
  }
  return classes;
}

/** Extract all data-* attribute names and values from HTML. */
function extractDataAttrs(html: string): Map<string, Set<string>> {
  const attrs = new Map<string, Set<string>>();
  const regex = /\b(data-[\w-]+)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, new Set());
    attrs.get(name)!.add(m[2]);
  }
  return attrs;
}

/** Extract HTML tag names present in the document. */
function extractTags(html: string): Set<string> {
  const tags = new Set<string>();
  const regex = /<([a-z][a-z0-9-]*)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return tags;
}

// ── Selector validation ────────────────────────────────────────────────

interface HtmlIndex {
  ids: Set<string>;
  classes: Set<string>;
  dataAttrs: Map<string, Set<string>>;
  tags: Set<string>;
}

function buildHtmlIndex(html: string): HtmlIndex {
  return {
    ids: extractIds(html),
    classes: extractClasses(html),
    dataAttrs: extractDataAttrs(html),
    tags: extractTags(html),
  };
}

/**
 * Check if a CSS selector could plausibly match an element in the HTML.
 *
 * This is a lightweight heuristic check, not a full CSS selector engine.
 * It validates individual selector parts (IDs, classes, tags, data attributes).
 */
function selectorCouldMatch(selector: string, index: HtmlIndex): boolean {
  // Skip pseudo-selectors and complex combinators for basic validation
  const cleaned = selector.replace(/::?[\w-]+(\([^)]*\))?/g, '').trim();
  if (!cleaned) return true; // Can't validate → assume ok

  // Split compound selectors (e.g., "div.foo#bar") into parts
  // Check each atomic part
  const idMatches = cleaned.match(/#([\w-]+)/g);
  if (idMatches) {
    for (const idMatch of idMatches) {
      const id = idMatch.slice(1);
      if (!index.ids.has(id)) return false;
    }
  }

  const classMatches = cleaned.match(/\.([\w-]+)/g);
  if (classMatches) {
    for (const classMatch of classMatches) {
      const cls = classMatch.slice(1);
      if (!index.classes.has(cls)) return false;
    }
  }

  const attrMatches = cleaned.match(/\[([\w-]+)(?:([~|^$*]?=)"?([^"\]]*)"?)?\]/g);
  if (attrMatches) {
    for (const attrMatch of attrMatches) {
      const inner = attrMatch.slice(1, -1);
      const attrName = inner.split(/[~|^$*]?=/)[0].toLowerCase();
      if (attrName.startsWith('data-') && !index.dataAttrs.has(attrName)) {
        return false;
      }
    }
  }

  // Tag name check (only if the selector starts with or is just a tag)
  const tagMatch = cleaned.match(/^([a-z][a-z0-9-]*)/i);
  if (tagMatch && !idMatches && !classMatches) {
    // Only fail if the selector is purely a tag name
    if (!index.tags.has(tagMatch[1].toLowerCase())) return false;
  }

  return true;
}

// ── Action validation ──────────────────────────────────────────────────

const BUILT_IN_ACTIONS = new Set([
  'highlight', 'click', 'add-class', 'remove-class', 'toggle-class',
  'set-attribute', 'remove-attribute', 'set-value', 'set-text', 'set-html',
  'scroll-into-view', 'dispatch-event', 'pause',
]);

/** Extract custom registered action names from JS source. */
function extractRegisteredActions(jsContent: string): Set<string> {
  const actions = new Set<string>();
  // Match: WireframeDemo.registerAction('name', ...) or registerAction("name", ...)
  const regex = /registerAction\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(jsContent)) !== null) {
    actions.add(m[1]);
  }
  return actions;
}

// ── Step parsing ───────────────────────────────────────────────────────

interface ParsedStep {
  targets: string[];   // CSS selectors
  actions: string[];   // Action names
}

/** Parse shorthand step string: target@delay!:action=value|caption */
function parseShorthand(step: string): ParsedStep {
  const parts = step.split('|')[0]; // Strip caption
  const targetMatch = parts.match(/^([^@:]+)/);
  const target = targetMatch ? targetMatch[1].trim() : '';
  const actionMatch = parts.match(/:([a-z-]+)/);
  const action = actionMatch ? actionMatch[1] : 'highlight';

  if (target === 'pause') return { targets: [], actions: ['pause'] };
  return { targets: target ? [target] : [], actions: [action] };
}

/** Parse a step (shorthand string or JSON object) into targets and actions. */
function parseStep(step: unknown): ParsedStep {
  if (typeof step === 'string') {
    return parseShorthand(step);
  }

  if (typeof step === 'object' && step !== null) {
    const obj = step as Record<string, unknown>;

    // Multi-action step
    if (Array.isArray(obj.actions)) {
      const targets: string[] = [];
      const actions: string[] = [];
      for (const sub of obj.actions) {
        if (typeof sub === 'object' && sub !== null) {
          const s = sub as Record<string, unknown>;
          if (typeof s.target === 'string' && s.target !== 'pause') targets.push(s.target);
          if (typeof s.action === 'string') actions.push(s.action);
        }
      }
      return { targets, actions };
    }

    // Single-action step
    const targets: string[] = [];
    const actions: string[] = [];
    if (typeof obj.target === 'string' && obj.target !== 'pause') targets.push(obj.target);
    if (typeof obj.action === 'string') actions.push(obj.action);
    return { targets, actions };
  }

  return { targets: [], actions: [] };
}

/** Try to parse step definitions from their string representation. */
function parseSteps(stepsContent: string): unknown[] {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(stepsContent);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* not JSON */ }

  // Try comma-separated shorthand strings
  // But be careful: shorthand steps contain commas in multi-step strings
  // Split on commas that aren't inside braces
  const steps: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of stepsContent) {
    if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      if (current.trim()) steps.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) steps.push(current.trim());

  return steps;
}

// ── Main validation ────────────────────────────────────────────────────

/**
 * Validate step definitions against wireframe HTML.
 */
export function validateDemo(artifacts: DemoArtifacts): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!artifacts.htmlContent) {
    issues.push({ step: -1, severity: 'error', message: 'Wireframe HTML could not be read' });
    return { label: artifacts.label, issues, valid: false };
  }

  const index = buildHtmlIndex(artifacts.htmlContent);

  // Build the set of known actions
  const knownActions = new Set(BUILT_IN_ACTIONS);
  if (artifacts.jsContent) {
    for (const action of extractRegisteredActions(artifacts.jsContent)) {
      knownActions.add(action);
    }
  }

  if (!artifacts.stepsContent) {
    // No steps to validate — not an error, just nothing to check
    return { label: artifacts.label, issues, valid: true };
  }

  const steps = parseSteps(artifacts.stepsContent);

  for (let i = 0; i < steps.length; i++) {
    const stepNum = i + 1;
    const parsed = parseStep(steps[i]);

    // Validate targets
    for (const target of parsed.targets) {
      // Skip targets that are dynamic or use Jinja expressions
      if (target.includes('{{') || target.includes('__jinja')) continue;

      if (!selectorCouldMatch(target, index)) {
        issues.push({
          step: stepNum,
          severity: 'error',
          message: `Selector \`${target}\` does not match any element in the wireframe HTML`,
        });
      }
    }

    // Validate actions
    for (const action of parsed.actions) {
      if (!knownActions.has(action)) {
        const suggestion = artifacts.jsContent
          ? `not found in built-in actions or custom actions JS`
          : `not a built-in action (no custom actions JS found)`;
        issues.push({
          step: stepNum,
          severity: 'error',
          message: `Action \`${action}\` is unknown — ${suggestion}`,
        });
      }
    }
  }

  return {
    label: artifacts.label,
    issues,
    valid: issues.length === 0,
  };
}

/**
 * Format validation results as a human-readable string.
 */
export function formatValidationResults(results: ValidationResult[]): string {
  const parts: string[] = [];

  for (const result of results) {
    if (result.valid) continue;

    parts.push(`**${result.label}** — ${result.issues.length} issue(s):\n`);
    for (const issue of result.issues) {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      const stepRef = issue.step > 0 ? `Step ${issue.step}: ` : '';
      parts.push(`- ${icon} ${stepRef}${issue.message}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * Format validation issues for inclusion in the LLM prompt.
 */
export function formatValidationForPrompt(results: ValidationResult[]): string {
  const issueResults = results.filter(r => !r.valid);
  if (issueResults.length === 0) return '';

  const parts: string[] = [
    '## Validation Issues (detected automatically)\n',
    'The following issues were found by static analysis of the step definitions against the wireframe HTML. Please address these in your suggested changes:\n',
  ];

  for (const result of issueResults) {
    for (const issue of result.issues) {
      const stepRef = issue.step > 0 ? `Step ${issue.step}: ` : '';
      parts.push(`- ${stepRef}${issue.message}`);
    }
  }

  parts.push('');
  return parts.join('\n');
}
