/**
 * Orchestrate LLM analysis for each discovered wireframe demo.
 */

import * as core from '@actions/core';
import { DemoArtifacts } from './artifacts';
import { LLMClient } from './llm';
import { buildAnalysisPrompt } from './prompts';
import { ValidationResult } from './validate';

export interface FileChange {
  file: string;
  description: string;
  diff: string;
}

export interface AnalysisResult {
  /** The demo that was analyzed */
  label: string;
  /** Whether the LLM thinks the wireframe needs updating */
  needsUpdate: boolean;
  /** Summary of the analysis */
  summary: string;
  /** Specific file changes proposed, if any */
  changes: FileChange[] | null;
  /** If the analysis failed, the error message */
  error: string | null;
}

/**
 * Parse the LLM response into a structured result.
 * Handles JSON wrapped in markdown fences or bare.
 */
function parseResponse(raw: string, label: string): Omit<AnalysisResult, 'label' | 'error'> {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  return {
    needsUpdate: Boolean(parsed.needsUpdate),
    summary: String(parsed.summary || ''),
    changes: parsed.changes ? (parsed.changes as FileChange[]) : null,
  };
}

/**
 * Analyze a single wireframe demo against the PR diff.
 */
async function analyzeOne(
  client: LLMClient,
  artifacts: DemoArtifacts,
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; wireframeChanged: boolean },
  validationResults?: ValidationResult[],
): Promise<AnalysisResult> {
  const label = artifacts.label;

  try {
    const messages = buildAnalysisPrompt(artifacts, formattedDiff, scenarioFlags, validationResults);
    const response = await client.chat(messages);

    try {
      const result = parseResponse(response, label);
      return { ...result, label, error: null };
    } catch (parseErr) {
      // Retry once with a nudge to fix JSON
      core.warning(`Failed to parse LLM response for ${label}, retrying with format nudge`);
      const retryMessages = [
        ...messages,
        { role: 'assistant' as const, content: response },
        { role: 'user' as const, content: 'Your response was not valid JSON. Please respond with ONLY a JSON object, no markdown fences or other text.' },
      ];
      const retryResponse = await client.chat(retryMessages);
      try {
        const result = parseResponse(retryResponse, label);
        return { ...result, label, error: null };
      } catch {
        return {
          label,
          needsUpdate: false,
          summary: '',
          changes: null,
          error: `Failed to parse LLM response after retry: ${parseErr}`,
        };
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    core.error(`LLM analysis failed for ${label}: ${errorMsg}`);
    return {
      label,
      needsUpdate: false,
      summary: '',
      changes: null,
      error: errorMsg,
    };
  }
}

/**
 * Analyze all wireframe demos against the PR diff.
 */
export async function analyzeAll(
  client: LLMClient,
  allArtifacts: DemoArtifacts[],
  formattedDiff: string,
  scenarioFlags: { sourceChanged: boolean; wireframeChanged: boolean },  validationResults?: ValidationResult[],): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const artifacts of allArtifacts) {
    core.info(`Analyzing wireframe: ${artifacts.label}`);
    const result = await analyzeOne(client, artifacts, formattedDiff, scenarioFlags);
    results.push(result);

    if (result.error) {
      core.warning(`Analysis error for ${result.label}: ${result.error}`);
    } else if (result.needsUpdate) {
      core.info(`  → Changes suggested: ${result.summary}`);
    } else {
      core.info(`  → No changes needed: ${result.summary}`);
    }
  }

  return results;
}
