/**
 * Format and post/update a PR comment with wireframe review results.
 */

import * as github from '@actions/github';
import { AnalysisResult } from './analyze';
import { ValidationResult } from './validate';

const COMMENT_MARKER = '<!-- wireframe-review-bot -->';
const DATA_START = '<!-- wireframe-suggestions-data:';
const DATA_END = ':wireframe-suggestions-data -->';

/**
 * Format the analysis results into a PR comment body.
 */
export function formatComment(results: AnalysisResult[], validationResults?: ValidationResult[]): string {
  const parts: string[] = [COMMENT_MARKER];
  parts.push('## 🖼️ Wireframe Demo Review\n');

  // Show validation issues first (deterministic, always reliable)
  const validationIssues = validationResults?.filter(r => !r.valid) ?? [];
  if (validationIssues.length > 0) {
    parts.push('### Step/Selector Validation\n');
    for (const result of validationIssues) {
      parts.push(`**${result.label}**:\n`);
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '❌' : '⚠️';
        const stepRef = issue.step > 0 ? `Step ${issue.step}: ` : '';
        parts.push(`- ${icon} ${stepRef}${issue.message}`);
      }
      parts.push('');
    }
  }

  const needsUpdate = results.filter(r => r.needsUpdate);
  const noUpdate = results.filter(r => !r.needsUpdate && !r.error);
  const errors = results.filter(r => r.error);

  if (needsUpdate.length === 0 && errors.length === 0) {
    parts.push('No wireframe changes needed for this PR.\n');
    for (const r of noUpdate) {
      parts.push(`- **${r.label}**: ${r.summary}`);
    }
    return parts.join('\n');
  }

  // Demos that need updates
  for (const result of needsUpdate) {
    parts.push(`### ${result.label}\n`);
    parts.push(`${result.summary}\n`);

    if (result.changes && result.changes.length > 0) {
      for (const change of result.changes) {
        parts.push(`<details>`);
        parts.push(`<summary>📝 <strong>${change.file}</strong>: ${change.description}</summary>\n`);
        parts.push('```diff');
        parts.push(change.diff);
        parts.push('```\n');
        parts.push('</details>\n');
      }
    }
  }

  // Demos that don't need updates
  if (noUpdate.length > 0) {
    parts.push('<details>');
    parts.push(`<summary>✅ ${noUpdate.length} wireframe${noUpdate.length === 1 ? '' : 's'} need no changes</summary>\n`);
    for (const r of noUpdate) {
      parts.push(`- **${r.label}**: ${r.summary}`);
    }
    parts.push('\n</details>\n');
  }

  // Errors
  if (errors.length > 0) {
    const tokenErrors = errors.filter(r => r.error?.includes('too large') || r.error?.includes('token'));
    const otherErrors = errors.filter(r => !r.error?.includes('too large') && !r.error?.includes('token'));

    if (tokenErrors.length > 0) {
      parts.push(`### ⚠️ LLM Context Limit Exceeded\n`);
      parts.push(`${tokenErrors.length} wireframe(s) could not be analyzed because the prompt exceeded the model's token limit.\n`);
      parts.push(`<details>`);
      parts.push(`<summary>How to fix this</summary>\n`);
      parts.push(`The default provider (\`github-models\` with \`gpt-4o\`) has an 8,000 token limit on the free tier.`);
      parts.push(`You can resolve this by:\n`);
      parts.push(`1. **Use a model with a larger context window** — add an \`api-key\` and switch to the \`openai\` or \`anthropic\` provider:`);
      parts.push(`   \`\`\`yaml`);
      parts.push(`   - uses: spacetelescope/docs-wireframe-demo/.github/actions/wireframe-review@main`);
      parts.push(`     env:`);
      parts.push(`       GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`);
      parts.push(`     with:`);
      parts.push(`       provider: openai`);
      parts.push(`       api-key: \${{ secrets.OPENAI_API_KEY }}`);
      parts.push(`   \`\`\``);
      parts.push(`2. **Lower \`max-prompt-tokens\`** to more aggressively truncate content (may reduce analysis quality):`);
      parts.push(`   \`\`\`yaml`);
      parts.push(`     with:`);
      parts.push(`       max-prompt-tokens: '4000'`);
      parts.push(`   \`\`\``);
      parts.push(`\n</details>\n`);
    }

    if (otherErrors.length > 0) {
      parts.push('<details>');
      parts.push(`<summary>⚠️ ${otherErrors.length} wireframe${otherErrors.length === 1 ? '' : 's'} could not be analyzed</summary>\n`);
      for (const r of otherErrors) {
        parts.push(`- **${r.label}**: ${r.error}`);
      }
      parts.push('\n</details>\n');
    }
  }

  // Embed replacement data for /wireframe-apply
  const allReplacements = results
    .filter(r => r.needsUpdate && r.changes)
    .flatMap(r => r.changes!)
    .filter(c => c.replacements && c.replacements.length > 0);

  if (allReplacements.length > 0) {
    parts.push('\n> 💡 **To apply these suggestions**, reply to this PR with `/wireframe-apply`.');
    parts.push('> A new PR will be created with the proposed changes for you to review and merge.\n');
    // Encode replacements as hidden data in the comment
    const data = JSON.stringify(allReplacements.map(c => ({
      file: c.file,
      replacements: c.replacements,
    })));
    parts.push(`${DATA_START}${Buffer.from(data).toString('base64')}${DATA_END}`);
  }

  parts.push('\n---\n*Automated by [docs-wireframe-demo](https://github.com/spacetelescope/docs-wireframe-demo) wireframe review action*');

  return parts.join('\n');
}

/**
 * Post or update the wireframe review comment on the PR.
 */
export async function postComment(
  token: string,
  body: string,
): Promise<void> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const pullNumber = github.context.payload.pull_request?.number;

  if (!pullNumber) {
    throw new Error('This action must be run on a pull_request event.');
  }

  // Look for an existing comment from this action
  const existingComment = await findExistingComment(octokit, owner, repo, pullNumber);

  if (existingComment) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  }
}

async function findExistingComment(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<{ id: number } | null> {
  let page = 1;
  while (true) {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
      page,
    });

    if (comments.length === 0) break;

    for (const comment of comments) {
      if (comment.body?.includes(COMMENT_MARKER)) {
        return { id: comment.id };
      }
    }

    if (comments.length < 100) break;
    page++;
  }

  return null;
}

export interface StoredReplacement {
  file: string;
  replacements: Array<{ search: string; replace: string }>;
}

/**
 * Extract stored replacement data from an existing wireframe-review comment.
 */
export async function extractReplacements(
  token: string,
  pullNumber: number,
): Promise<StoredReplacement[]> {
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const existing = await findExistingComment(octokit, owner, repo, pullNumber);
  if (!existing) return [];

  const { data: comment } = await octokit.rest.issues.getComment({
    owner,
    repo,
    comment_id: existing.id,
  });

  const body = comment.body || '';
  const startIdx = body.indexOf(DATA_START);
  const endIdx = body.indexOf(DATA_END);
  if (startIdx === -1 || endIdx === -1) return [];

  const encoded = body.slice(startIdx + DATA_START.length, endIdx);
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'));
  } catch {
    return [];
  }
}
