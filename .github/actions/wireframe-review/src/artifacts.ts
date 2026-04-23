/**
 * Read wireframe artifact files (HTML, CSS, JS) and bundle their contents
 * for inclusion in LLM prompts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { DiscoveredDemo } from './discover';

export interface DemoArtifacts {
  /** Original discovered demo descriptor */
  demo: DiscoveredDemo;
  /** Wireframe HTML content */
  htmlContent: string | null;
  /** Custom CSS content */
  cssContent: string | null;
  /** Custom actions JS content */
  jsContent: string | null;
  /** Step definitions (string representation) */
  stepsContent: string | null;
  /** Human-readable label for this demo */
  label: string;
}

function safeRead(filePath: string | null, label: string): string | null {
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    core.warning(`Could not read ${label}: ${filePath} — ${err}`);
    return null;
  }
}

/**
 * Read all artifact files for a discovered demo.
 */
export function readArtifacts(demo: DiscoveredDemo): DemoArtifacts {
  const htmlContent = safeRead(demo.htmlPath, 'wireframe HTML');
  const cssContent = safeRead(demo.cssPath, 'wireframe CSS');
  const jsContent = safeRead(demo.jsPath, 'wireframe JS');

  // Build a human-readable label
  const sourceBase = path.basename(demo.sourceFile);
  const htmlBase = demo.htmlPath ? path.basename(demo.htmlPath) : 'unknown';
  const label = `${htmlBase} (found in ${sourceBase})`;

  return {
    demo,
    htmlContent,
    cssContent,
    jsContent,
    stepsContent: demo.steps,
    label,
  };
}

/**
 * Read artifacts for all discovered demos.
 */
export function readAllArtifacts(demos: DiscoveredDemo[]): DemoArtifacts[] {
  return demos
    .map(readArtifacts)
    .filter(a => a.htmlContent !== null); // Skip demos where we couldn't find the HTML
}
