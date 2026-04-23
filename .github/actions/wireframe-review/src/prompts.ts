/**
 * Prompt templates for wireframe review analysis.
 */

import { DemoArtifacts } from './artifacts';
import { Message } from './llm';

const SYSTEM_PROMPT = `You are a wireframe demo review assistant. Your job is to analyze source code changes in a pull request and determine whether they affect any wireframe demos used in the project's documentation.

## What are wireframe demos?

Wireframe demos are simplified, interactive HTML representations of an application's UI, embedded in documentation. They show users how the app works through animated step-by-step walkthroughs. Each demo consists of:

1. **Wireframe HTML** — A self-contained HTML file with inline CSS that represents the app's layout (toolbar, sidebar, viewers, panels, etc.). This is a simplified mockup, not the real app.

2. **Step definitions** — A sequence of actions that animate the wireframe to demonstrate workflows. Steps use either shorthand strings or JSON objects:

   Shorthand: \`target@delay:action=value|caption text\`
   JSON: \`{"target": "#selector", "action": "click", "delay": 1500, "caption": "Description"}\`
   Multi-action: \`{"actions": [...], "delay": 1500, "caption": "Description"}\`

3. **Custom actions JS** (optional) — JavaScript that registers app-specific actions via \`WireframeDemo.registerAction(name, handler)\`. These go beyond built-in actions (click, toggle-class, set-value, etc.) to handle app-specific behaviors.

4. **Custom CSS** (optional) — Additional styling for the wireframe.

## Built-in actions

- \`highlight\` — Pulse animation on element
- \`click\` — Trigger click event
- \`add-class\`, \`remove-class\`, \`toggle-class\` — CSS class manipulation
- \`set-attribute\`, \`remove-attribute\` — DOM attribute manipulation
- \`set-value\` — Set form field value
- \`set-text\` — Set element text content
- \`set-html\` — Set element innerHTML
- \`scroll-into-view\` — Smooth scroll to element
- \`dispatch-event\` — Dispatch custom DOM event
- \`pause\` — Wait without acting

## Your task

You will be given:
- The current wireframe HTML, CSS, custom actions JS, and step definitions (as they exist on the PR branch)
- The PR diff (which may include source code changes, wireframe changes, or both)

The PR may fall into one of three scenarios:
1. **Source code changed, wireframe not changed** — Determine if the source changes affect UI layout/behavior in ways the wireframe should reflect. If so, propose wireframe updates.
2. **Wireframe changed, source code not changed** — The wireframe was updated directly. Check whether the changes look correct and consistent (valid HTML structure, steps reference elements that exist, actions are registered, etc.).
3. **Both source and wireframe changed** — The author may have already updated the wireframe to match source changes. Verify the wireframe updates are sufficient and consistent with the source diff. If additional changes are needed, propose them.

Check for these types of impacts:
- **Layout changes**: toolbar items added/removed/reordered, new panels/sidebars, viewer area restructuring
- **Component changes**: new UI elements, renamed elements, changed element hierarchy
- **Styling changes**: theme colors, spacing, fonts that the wireframe should reflect
- **Feature changes**: new plugins, new tools, renamed features that appear in the wireframe
- **Workflow changes**: the demo steps show a workflow that no longer matches the app behavior
- **Configuration changes**: app config files that define toolbar/tray/menu structure

## Output format

Respond with ONLY a JSON object (no markdown fences, no explanation outside the JSON):

{
  "needsUpdate": true/false,
  "summary": "Brief explanation of your analysis",
  "changes": [
    {
      "file": "path/to/file.html",
      "description": "What to change and why",
      "diff": "unified diff showing the change"
    }
  ]
}

If needsUpdate is false, set changes to null.
If needsUpdate is true, provide specific, actionable changes with real diffs.
For the diff field, use unified diff format (--- a/file, +++ b/file, @@ line numbers @@).
Keep wireframe changes consistent with the simplified, mockup style of the existing wireframe.`;

/**
 * Build the analysis prompt for a single wireframe demo.
 */
export function buildAnalysisPrompt(
  artifacts: DemoArtifacts,
  formattedDiff: string,
  options: { sourceChanged: boolean; wireframeChanged: boolean },
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

  parts.push(`# Wireframe Demo: ${artifacts.label}\n`);

  if (artifacts.htmlContent) {
    parts.push(`## Current Wireframe HTML\n\`\`\`html\n${artifacts.htmlContent}\n\`\`\`\n`);
  }

  if (artifacts.cssContent) {
    parts.push(`## Current Wireframe CSS\n\`\`\`css\n${artifacts.cssContent}\n\`\`\`\n`);
  }

  if (artifacts.jsContent) {
    parts.push(`## Custom Actions JavaScript\n\`\`\`javascript\n${artifacts.jsContent}\n\`\`\`\n`);
  }

  if (artifacts.stepsContent) {
    parts.push(`## Current Step Definitions\n\`\`\`json\n${artifacts.stepsContent}\n\`\`\`\n`);
  }

  parts.push(`## Pull Request Diff\n\`\`\`diff\n${formattedDiff}\n\`\`\`\n`);

  parts.push(`Analyze whether this PR diff requires any updates to the wireframe demo above. Remember to respond with ONLY a JSON object.`);

  messages.push({ role: 'user', content: parts.join('\n') });

  return messages;
}
