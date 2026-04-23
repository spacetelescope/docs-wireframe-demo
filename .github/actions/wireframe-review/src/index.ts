/**
 * Wireframe Review Action — Entry Point
 *
 * Orchestrates: discover → read artifacts → collect diff → analyze → comment
 */

import * as core from '@actions/core';
import * as path from 'path';
import * as fs from 'fs';
import { parse as parseYaml } from 'yaml';
import { discoverWireframeDemos, DiscoveredDemo } from './discover';
import { readAllArtifacts } from './artifacts';
import { collectDiff } from './diff';
import { createLLMClient } from './llm';
import { analyzeAll } from './analyze';
import { formatComment, postComment } from './comment';
import { validateDemo, ValidationResult } from './validate';

interface ExplicitConfig {
  wireframes: Array<{
    html: string;
    css?: string;
    'actions-js'?: string;
    'steps-source'?: string;
    context?: string;
    watch?: string[];
  }>;
}

async function run(): Promise<void> {
  try {
    // ── Read inputs ────────────────────────────────────────────────
    const docsRoot = path.resolve(core.getInput('docs-root') || 'docs/');
    const sourceRoot = core.getInput('source-root') || '.';
    const configPath = core.getInput('config-path') || '';
    const provider = core.getInput('provider') || 'github-models';
    const model = core.getInput('model') || '';
    const apiKey = core.getInput('api-key') || '';
    const maxDiffSize = parseInt(core.getInput('max-diff-size') || '50000', 10);
    const githubToken = process.env.GITHUB_TOKEN || '';

    if (!githubToken) {
      core.setFailed('GITHUB_TOKEN environment variable is required.');
      return;
    }

    const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd();

    // ── Discover or load config ────────────────────────────────────
    let demos: DiscoveredDemo[];
    let watchPatterns: string[] | undefined;

    if (configPath && fs.existsSync(path.resolve(repoRoot, configPath))) {
      core.info(`Using explicit config: ${configPath}`);
      const configContent = fs.readFileSync(path.resolve(repoRoot, configPath), 'utf-8');
      const config = parseYaml(configContent) as ExplicitConfig;
      demos = [];
      const watches: string[] = [];

      for (const entry of config.wireframes || []) {
        const htmlPath = path.resolve(repoRoot, entry.html);
        if (!htmlPath.startsWith(repoRoot + path.sep) && htmlPath !== repoRoot) {
          core.warning(`Skipping wireframe with path outside repo root: ${entry.html}`);
          continue;
        }
        const cssResolved = entry.css ? path.resolve(repoRoot, entry.css) : null;
        if (cssResolved && !cssResolved.startsWith(repoRoot + path.sep)) {
          core.warning(`Skipping CSS path outside repo root: ${entry.css}`);
          continue;
        }
        const jsResolved = entry['actions-js'] ? path.resolve(repoRoot, entry['actions-js']) : null;
        if (jsResolved && !jsResolved.startsWith(repoRoot + path.sep)) {
          core.warning(`Skipping JS path outside repo root: ${entry['actions-js']}`);
          continue;
        }
        demos.push({
          sourceFile: configPath,
          htmlPath: fs.existsSync(htmlPath) ? htmlPath : null,
          cssPath: cssResolved,
          jsPath: jsResolved,
          steps: null,
          rawConfig: entry.context || null,
          type: 'html-attribute',
        });
        if (entry.watch) {
          watches.push(...entry.watch);
        }
      }

      if (watches.length > 0) {
        watchPatterns = watches;
      }
    } else {
      core.info(`Auto-discovering wireframe demos in: ${docsRoot}`);
      demos = discoverWireframeDemos({ docsRoot, repoRoot });
    }

    if (demos.length === 0) {
      core.info('No wireframe demos found. Nothing to review.');
      return;
    }

    core.info(`Found ${demos.length} wireframe demo(s)`);
    for (const demo of demos) {
      core.info(`  - ${demo.htmlPath || 'unresolved'} (from ${demo.sourceFile})`);
    }

    // ── Read artifacts ─────────────────────────────────────────────
    const allArtifacts = readAllArtifacts(demos);

    if (allArtifacts.length === 0) {
      core.warning('No wireframe HTML files could be read. Nothing to analyze.');
      return;
    }

    core.info(`Read artifacts for ${allArtifacts.length} demo(s)`);

    // ── Validate steps against wireframe HTML ──────────────────────
    const validationResults: ValidationResult[] = allArtifacts.map(a => validateDemo(a));
    const validationIssues = validationResults.filter(r => !r.valid);
    if (validationIssues.length > 0) {
      core.warning(`Found ${validationIssues.reduce((n, r) => n + r.issues.length, 0)} validation issue(s) across ${validationIssues.length} demo(s)`);
      for (const r of validationIssues) {
        for (const issue of r.issues) {
          const stepRef = issue.step > 0 ? `step ${issue.step}: ` : '';
          core.warning(`  ${r.label} — ${stepRef}${issue.message}`);
        }
      }
    } else {
      core.info('All step definitions pass validation against wireframe HTML.');
    }

    // ── Collect diff ───────────────────────────────────────────────
    const wireframeArtifactPaths = allArtifacts.flatMap(a => {
      const paths: string[] = [];
      if (a.demo.htmlPath) paths.push(path.relative(repoRoot, a.demo.htmlPath));
      if (a.demo.cssPath) paths.push(path.relative(repoRoot, a.demo.cssPath));
      if (a.demo.jsPath) paths.push(path.relative(repoRoot, a.demo.jsPath));
      return paths;
    });

    const diff = await collectDiff({
      token: githubToken,
      sourceRoot,
      wireframeArtifactPaths,
      watchPatterns,
      maxDiffSize,
    });

    if (diff.relevantFiles.length === 0 && diff.wireframeFiles.length === 0) {
      core.info('No relevant source files or wireframe artifacts changed. Skipping analysis.');
      return;
    }

    // Log which scenario we're in for clarity
    if (diff.wireframeFiles.length > 0 && diff.relevantFiles.length === 0) {
      core.info('Only wireframe artifacts changed — will check for consistency.');
    } else if (diff.wireframeFiles.length > 0 && diff.relevantFiles.length > 0) {
      core.info('Both source and wireframe artifacts changed — will check if wireframe updates are sufficient.');
    } else {
      core.info('Source code changed — will check if wireframes need updating.');
    }

    // ── Create LLM client ──────────────────────────────────────────
    const client = createLLMClient(provider, model, apiKey, githubToken);

    // ── Analyze ────────────────────────────────────────────────────
    const scenarioFlags = {
      sourceChanged: diff.relevantFiles.length > 0,
      wireframeChanged: diff.wireframeFiles.length > 0,
    };
    const results = await analyzeAll(client, allArtifacts, diff.formattedDiff, scenarioFlags, validationResults);

    // ── Post comment ───────────────────────────────────────────────
    const commentBody = formatComment(results, validationResults);
    await postComment(githubToken, commentBody);

    core.info('Wireframe review comment posted.');

    // Set outputs
    const anyUpdates = results.some(r => r.needsUpdate);
    core.setOutput('needs-update', anyUpdates.toString());
    core.setOutput('demo-count', demos.length.toString());

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(`Wireframe review failed: ${message}`);
  }
}

run();
