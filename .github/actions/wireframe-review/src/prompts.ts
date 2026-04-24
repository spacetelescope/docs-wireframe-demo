/**
 * Prompt templates for wireframe review analysis.
 */

import { DemoArtifacts } from './artifacts';
import { Message } from './llm';
import { ValidationResult, formatValidationForPrompt } from './validate';
import { compressHtml, compressCss, compressJs } from './compress';

const SYSTEM_PROMPT = `You are a wireframe demo review assistant. Analyze PR diffs to determine if wireframe demos in documentation need updating.

Wireframe demos are interactive HTML mockups of an app's UI embedded in docs. Components:
- **Wireframe HTML**: Self-contained HTML with inline CSS representing the app layout. You receive a compressed version preserving structure, IDs, classes, data attributes, and meaningful styles (colors, layout, borders, dimensions).
- **Custom actions JS** (optional): App-specific actions via WireframeDemo.registerAction(name, handler)
- **Custom CSS** (optional)

Scenarios:
1. Source changed, wireframe not — Do changes affect UI layout/behavior the wireframe should reflect?
2. Wireframe changed, source not — Check wireframe changes for correctness.
3. Both changed — Verify wireframe updates are sufficient.

Check for: layout changes (toolbar items, panels, sidebars), component changes (new/renamed elements), styling changes (colors, themes), feature changes (plugins, tools), workflow changes, config changes.

Respond with ONLY a JSON object:
{"needsUpdate": true/false, "summary": "Brief explanation", "changes": [{"file": "path", "description": "what/why", "diff": "unified diff", "replacements": [{"search": "exact text in file", "replace": "new text"}]}]}
If needsUpdate is false, set changes to null. For replacements, "search" must be exact text matching a unique location.`;

/** Rough token estimation: ~3 chars per token for HTML/code on gpt-4o */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Build the analysis prompt for a single wireframe demo.
 * Applies a token budget to ensure the prompt fits within LLM limits.
 */
export function buildAnalysisPrompt(
  artifacts: DemoArtifacts,
  formattedDiff: string,
  options: { sourceChanged: boolean; wireframeChanged: boolean },
  validationResults?: ValidationResult[],
  maxPromptTokens: number = 100000,
): Message[] {
  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Build the user message with all context
  const parts: string[] = [];

  parts.push(`# Wireframe Demo: ${artifacts.label}\n`);

  // Tell the LLM which scenario this is
  if (options.wireframeChanged && !options.sourceChanged) {
    parts.push(`> **Scenario**: Only wireframe artifacts were changed in this PR (no source code changes). Please review the wireframe changes for correctness and consistency.\n`);
  } else if (options.sourceChanged && !options.wireframeChanged) {
    parts.push(`> **Scenario**: Source code was changed but wireframe artifacts were not. Determine if the source changes require wireframe updates.\n`);
  } else {
    parts.push(`> **Scenario**: Both source code and wireframe artifacts were changed. Verify the wireframe updates are sufficient for the source changes.\n`);
  }

  if (artifacts.htmlContent) {
    const compressedHtml = compressHtml(artifacts.htmlContent);
    parts.push(`## Current Wireframe HTML (compressed)\n\`\`\`html\n${compressedHtml}\n\`\`\`\n`);
  }

  if (artifacts.cssContent) {
    const compressedCss = compressCss(artifacts.cssContent);
    if (compressedCss) {
      parts.push(`## Current Wireframe CSS (compressed)\n\`\`\`css\n${compressedCss}\n\`\`\`\n`);
    }
  }

  if (artifacts.jsContent) {
    const compressedJs = compressJs(artifacts.jsContent);
    if (compressedJs) {
      parts.push(`## Custom Actions\n${compressedJs}\n`);
    }
  }

  // Note: Step definitions are NOT included in the LLM prompt.
  // The deterministic validator (validate.ts) handles step/selector checking.
  // The LLM focuses on whether the wireframe HTML structure needs updating.

  // Apply token budget: max-prompt-tokens limits what we SEND (input tokens only).
  // The model's context window handles the response separately.
  const systemTokens = estimateTokens(SYSTEM_PROMPT);
  const contentSoFar = parts.join('\n');
  const contentTokens = estimateTokens(contentSoFar);
  const diffTokens = estimateTokens(formattedDiff);
  const totalTokens = systemTokens + contentTokens + diffTokens;

  if (totalTokens > maxPromptTokens) {
    throw new Error(
      `Prompt too large for token budget (~${totalTokens} tokens, limit is ${maxPromptTokens}). ` +
      `Use a provider with a larger context window or increase max-prompt-tokens.`
    );
  }

  parts.push(`## Pull Request Diff\n\`\`\`diff\n${formattedDiff}\n\`\`\`\n`);

  // Include deterministic validation results if there are issues
  if (validationResults) {
    const validationSection = formatValidationForPrompt(validationResults);
    if (validationSection) {
      parts.push(validationSection);
    }
  }

  parts.push(`Analyze whether this PR diff requires any updates to the wireframe demo above. Remember to respond with ONLY a JSON object.`);

  messages.push({ role: 'user', content: parts.join('\n') });

  return messages;
}
