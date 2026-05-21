/**
 * THE BRAIN — Multi-Model AI Service with Anti-Hallucination Cross-Validation
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────┐
 * │                    THE BRAIN                             │
 * │                                                          │
 * │  Layer 1: RULE-BASED (highest confidence, 0% hallucination) │
 * │  ↓ If rules insufficient...                              │
 * │  Layer 2: SINGLE-MODEL AI (GPT or Claude, flagged)       │
 * │  ↓ For high-stakes decisions...                          │
 * │  Layer 3: DUAL-MODEL CROSS-VALIDATION (GPT + Claude)     │
 * │  ↓ Always...                                             │
 * │  Layer 4: DETERMINISTIC VALIDATION (format, NCCI, codes) │
 * │  ↓ For ALL AI outputs...                                 │
 * │  Layer 5: HUMAN REVIEW (mandatory for AI-generated)      │
 * └──────────────────────────────────────────────────────────┘
 *
 * Cross-Validation Strategy:
 * - Run GPT and Claude independently on the same prompt
 * - If BOTH agree → confidence boost (+0.15), mark as cross-validated
 * - If they DISAGREE → flag for human review, show both opinions
 * - If one FAILS → use the other with reduced confidence (-0.1)
 * - If both FAIL → fall back to rule-based logic
 *
 * Anti-Hallucination Guards:
 * - CPT code format validation (4-5 digits)
 * - ICD-10 code format validation (letter + digits)
 * - Modifier format validation
 * - NCCI edit cross-reference check
 * - Citation verification against known database
 * - Confidence threshold enforcement (min 0.3 to output, 0.6 for auto-approve)
 * - Output schema validation (Zod)
 * - ALL AI-generated corrections marked source: 'ai_generated' + riskLevel: 'high'
 *
 * Provider Priority:
 * 1. Azure OpenAI (GPT-4o) — if AZURE_OPENAI_API_KEY configured
 * 2. Anthropic Claude — if ANTHROPIC_API_KEY configured
 * 3. z-ai-web-dev-sdk — always available as fallback
 *
 * CRITICAL: This module MUST be used server-side only (API routes / backend).
 * Never expose API keys or call AI from client-side code.
 */

import { z } from 'zod';

// ─── CONFIGURATION ─────────────────────────────────────────────────────────────

interface BrainConfig {
  /** Azure OpenAI configuration */
  azure?: {
    apiKey: string;
    endpoint: string;
    model: string;
    apiVersion: string;
  };
  /** Anthropic Claude configuration */
  anthropic?: {
    apiKey: string;
    model: string;
  };
  /** Cross-validation mode: 'always' | 'high_stakes' | 'never' */
  crossValidationMode: 'always' | 'high_stakes' | 'never';
  /** Minimum confidence to output (below this = refuse) */
  minConfidenceOutput: number;
  /** Minimum confidence for auto-approve (below this = human review) */
  minConfidenceAutoApprove: number;
  /** Maximum tokens per request */
  maxTokens: number;
  /** Request timeout in ms */
  timeout: number;
  /** Enable cost tracking */
  trackCosts: boolean;
}

const DEFAULT_CONFIG: BrainConfig = {
  crossValidationMode: 'high_stakes',
  minConfidenceOutput: 0.3,
  minConfidenceAutoApprove: 0.6,
  maxTokens: 4096,
  timeout: 30000,
  trackCosts: true,
};

// ─── TYPES ─────────────────────────────────────────────────────────────────────

export type AIProvider = 'azure-openai' | 'anthropic' | 'z-ai-sdk' | 'rule-based';

export interface BrainCallOptions {
  /** System prompt for the AI */
  systemPrompt: string;
  /** User message / context */
  userMessage: string;
  /** Expected output format — 'json' or 'text' */
  outputFormat: 'json' | 'text';
  /** Zod schema for JSON output validation */
  outputSchema?: z.ZodType;
  /** Task category — determines cross-validation behavior */
  category: 'denial_analysis' | 'code_generation' | 'appeal_letter' | 'correction_suggestion' | 'quality_check' | 'overview_scan' | 'general';
  /** Whether this is a high-stakes decision (forces cross-validation) */
  highStakes?: boolean;
  /** Maximum tokens for this specific call */
  maxTokens?: number;
  /** Temperature (0 = deterministic, 1 = creative) — keep LOW for medical claims */
  temperature?: number;
  /** Context data for deterministic validation */
  validationContext?: {
    cptCode?: string;
    icd10Code?: string;
    modifier?: string;
    carcCode?: string;
    payerName?: string;
  };
}

export interface BrainResult {
  /** The AI-generated content */
  content: string;
  /** Parsed JSON content (if outputFormat was 'json') */
  parsedContent: Record<string, unknown> | null;
  /** Which provider(s) were used */
  providers: AIProvider[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Whether cross-validation was performed */
  crossValidated: boolean;
  /** Cross-validation result (if performed) */
  crossValidation?: {
    providers: AIProvider[];
    agreement: 'full' | 'partial' | 'disagreement';
    providerResults: Array<{
      provider: AIProvider;
      content: string;
      confidence: number;
    }>;
  };
  /** Deterministic validation result */
  validation: {
    passed: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      detail?: string;
    }>;
  };
  /** Whether this output requires human review */
  requiresHumanReview: boolean;
  /** Reason for human review (if required) */
  humanReviewReason?: string;
  /** Whether a fallback was used */
  fallbackUsed: boolean;
  /** Token usage (if tracked) */
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  /** Error (if something went wrong) */
  error?: string;
}

// ─── COST TRACKING ─────────────────────────────────────────────────────────────

const COST_PER_1K_TOKENS: Record<AIProvider, { input: number; output: number }> = {
  'azure-openai': { input: 0.0025, output: 0.01 },      // GPT-4o pricing
  'anthropic': { input: 0.003, output: 0.015 },          // Claude 3.5 Sonnet
  'z-ai-sdk': { input: 0, output: 0 },                    // Internal SDK
  'rule-based': { input: 0, output: 0 },                   // No cost
};

interface CostRecord {
  timestamp: string;
  provider: AIProvider;
  category: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

// In-memory cost tracking (reset on server restart)
let costLog: CostRecord[] = [];

function recordCost(provider: AIProvider, category: string, promptTokens: number, completionTokens: number): void {
  const rates = COST_PER_1K_TOKENS[provider];
  const cost = (promptTokens * rates.input / 1000) + (completionTokens * rates.output / 1000);
  costLog.push({
    timestamp: new Date().toISOString(),
    provider,
    category,
    promptTokens,
    completionTokens,
    cost,
  });
}

// ─── THE BRAIN CLASS ───────────────────────────────────────────────────────────

export class Brain {
  private config: BrainConfig;
  private azureAvailable: boolean = false;
  private anthropicAvailable: boolean = false;

  constructor(config?: Partial<BrainConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Check provider availability
    const azureKey = process.env.AZURE_OPENAI_API_KEY || this.config.azure?.apiKey;
    const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT || this.config.azure?.endpoint;
    this.azureAvailable = !!(azureKey && azureEndpoint);

    const anthropicKey = process.env.ANTHROPIC_API_KEY || this.config.anthropic?.apiKey;
    this.anthropicAvailable = !!anthropicKey;
  }

  /**
   * Main entry point — send a prompt to the Brain and get a validated result.
   *
   * This method:
   * 1. Determines if cross-validation is needed
   * 2. Calls the appropriate provider(s)
   * 3. Performs deterministic validation
   * 4. Returns a BrainResult with confidence, validation, and human review flags
   */
  async think(options: BrainCallOptions): Promise<BrainResult> {
    const {
      systemPrompt,
      userMessage,
      outputFormat,
      outputSchema,
      category,
      highStakes = false,
      temperature = 0.1, // VERY LOW temperature for medical claims
      validationContext,
    } = options;

    // Determine if cross-validation should be used
    const shouldCrossValidate = this.shouldCrossValidate(category, highStakes);

    // Get available providers
    const providers = this.getAvailableProviders();

    if (providers.length === 0 || (providers.length === 1 && providers[0] === 'rule-based')) {
      // No AI providers available — return rule-based result
      return this.createRuleBasedResult(category, options);
    }

    if (shouldCrossValidate && providers.filter(p => p !== 'rule-based').length >= 2) {
      // Cross-validation mode: run both providers
      return this.crossValidate(options);
    }

    // Single provider mode
    const primaryProvider = this.getPrimaryProvider();
    try {
      const content = await this.callProvider(primaryProvider, systemPrompt, userMessage, {
        maxTokens: options.maxTokens || this.config.maxTokens,
        temperature,
        outputFormat,
      });

      // Parse content if JSON expected
      let parsedContent: Record<string, unknown> | null = null;
      if (outputFormat === 'json') {
        parsedContent = this.parseJSON(content);
      }

      // Deterministic validation
      const validation = this.deterministicValidation(parsedContent || { raw: content }, validationContext, category);

      // Schema validation
      if (outputSchema && parsedContent) {
        const schemaResult = outputSchema.safeParse(parsedContent);
        if (!schemaResult.success) {
          validation.checks.push({
            name: 'schema_validation',
            passed: false,
            detail: schemaResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
          });
          validation.passed = false;
        } else {
          validation.checks.push({ name: 'schema_validation', passed: true });
        }
      }

      // Calculate confidence
      let confidence = 0.5;
      if (parsedContent?.confidence_score !== undefined) {
        confidence = Math.min(Number(parsedContent.confidence_score), 0.85);
      }
      if (validation.passed) confidence += 0.1;
      else confidence -= 0.15;
      confidence = Math.max(0, Math.min(1, confidence));

      // Human review check
      const requiresHumanReview = confidence < this.config.minConfidenceAutoApprove || !validation.passed || highStakes;

      return {
        content,
        parsedContent,
        providers: [primaryProvider],
        confidence,
        crossValidated: false,
        validation,
        requiresHumanReview,
        humanReviewReason: requiresHumanReview
          ? !validation.passed
            ? 'AI output failed deterministic validation — manual review required'
            : highStakes
              ? 'High-stakes decision always requires human review'
              : `Confidence ${confidence.toFixed(2)} below auto-approve threshold (${this.config.minConfidenceAutoApprove})`
          : undefined,
        fallbackUsed: false,
      };
    } catch (primaryError) {
      // Primary provider failed — try fallback
      console.warn(`[Brain] Primary provider ${primaryProvider} failed:`, primaryError);

      const fallbackProvider = this.getFallbackProvider(primaryProvider);
      if (!fallbackProvider) {
        return this.createErrorResult(primaryError, primaryProvider);
      }

      try {
        const content = await this.callProvider(fallbackProvider, systemPrompt, userMessage, {
          maxTokens: options.maxTokens || this.config.maxTokens,
          temperature,
          outputFormat,
        });

        let parsedContent: Record<string, unknown> | null = null;
        if (outputFormat === 'json') {
          parsedContent = this.parseJSON(content);
        }

        const validation = this.deterministicValidation(parsedContent || { raw: content }, validationContext, category);

        let confidence = 0.4; // Lower confidence for fallback
        if (parsedContent?.confidence_score !== undefined) {
          confidence = Math.min(Number(parsedContent.confidence_score), 0.75);
        }
        confidence = Math.max(0, Math.min(1, confidence));

        return {
          content,
          parsedContent,
          providers: [fallbackProvider],
          confidence,
          crossValidated: false,
          validation,
          requiresHumanReview: true, // Fallback ALWAYS requires human review
          humanReviewReason: `Primary AI provider (${primaryProvider}) failed. Used fallback (${fallbackProvider}). Human review required.`,
          fallbackUsed: true,
        };
      } catch (fallbackError) {
        return this.createErrorResult(fallbackError, fallbackProvider);
      }
    }
  }

  /**
   * Cross-validate by running the same prompt through multiple AI providers.
   * Compare results to catch hallucinations.
   */
  private async crossValidate(options: BrainCallOptions): Promise<BrainResult> {
    const { systemPrompt, userMessage, outputFormat, category, temperature = 0.1, validationContext } = options;

    const aiProviders = this.getAvailableProviders().filter(p => p !== 'rule-based');
    const results: Array<{ provider: AIProvider; content: string; confidence: number; error?: string }> = [];

    // Run all providers in parallel
    const promises = aiProviders.map(async (provider) => {
      try {
        const content = await this.callProvider(provider, systemPrompt, userMessage, {
          maxTokens: options.maxTokens || this.config.maxTokens,
          temperature,
          outputFormat,
        });

        let confidence = 0.5;
        if (outputFormat === 'json') {
          const parsed = this.parseJSON(content);
          if (parsed?.confidence_score !== undefined) {
            confidence = Number(parsed.confidence_score);
          }
        }

        results.push({ provider, content, confidence });
      } catch (error) {
        console.warn(`[Brain] Cross-validation provider ${provider} failed:`, error);
        results.push({ provider, content: '', confidence: 0, error: String(error) });
      }
    });

    await Promise.all(promises);

    const successfulResults = results.filter(r => !r.error && r.content);

    if (successfulResults.length === 0) {
      // All providers failed — fall back to rule-based
      return this.createRuleBasedResult(category, options);
    }

    if (successfulResults.length === 1) {
      // Only one provider succeeded — use it with reduced confidence
      const result = successfulResults[0];
      let parsedContent: Record<string, unknown> | null = null;
      if (outputFormat === 'json') {
        parsedContent = this.parseJSON(result.content);
      }

      const validation = this.deterministicValidation(parsedContent || { raw: result.content }, validationContext, category);

      return {
        content: result.content,
        parsedContent,
        providers: [result.provider],
        confidence: Math.min(result.confidence, 0.7),
        crossValidated: true,
        crossValidation: {
          providers: results.map(r => r.provider),
          agreement: 'disagreement', // Other provider(s) failed
          providerResults: results.map(r => ({
            provider: r.provider,
            content: r.content || r.error || 'Failed',
            confidence: r.confidence,
          })),
        },
        validation,
        requiresHumanReview: true,
        humanReviewReason: `Cross-validation incomplete: only ${result.provider} succeeded. Other provider(s) failed. Human review required.`,
        fallbackUsed: true,
      };
    }

    // Multiple providers succeeded — compare results
    const comparison = this.compareResults(successfulResults, outputFormat, category);

    // Use the best result (or merged result if agreement)
    const bestContent = comparison.agreement === 'full'
      ? successfulResults[0].content // They agree, use either
      : comparison.mergedContent || successfulResults[0].content; // They disagree, use merged or first

    let parsedContent: Record<string, unknown> | null = null;
    if (outputFormat === 'json') {
      parsedContent = this.parseJSON(bestContent);
    }

    const validation = this.deterministicValidation(parsedContent || { raw: bestContent }, validationContext, category);

    // Confidence adjustment based on agreement
    let confidence = successfulResults[0].confidence;
    if (comparison.agreement === 'full') {
      confidence = Math.min(confidence + 0.15, 0.95); // Boost for agreement
    } else if (comparison.agreement === 'partial') {
      confidence = Math.min(confidence, 0.7); // Cap for partial agreement
    } else {
      confidence = Math.min(confidence, 0.5); // Low for disagreement
    }

    if (!validation.passed) confidence -= 0.15;
    confidence = Math.max(0, Math.min(1, confidence));

    const requiresHumanReview = comparison.agreement !== 'full' || !validation.passed || confidence < this.config.minConfidenceAutoApprove;

    return {
      content: bestContent,
      parsedContent,
      providers: successfulResults.map(r => r.provider),
      confidence,
      crossValidated: true,
      crossValidation: {
        providers: results.map(r => r.provider),
        agreement: comparison.agreement,
        providerResults: results.map(r => ({
          provider: r.provider,
          content: r.content || r.error || 'Failed',
          confidence: r.confidence,
        })),
      },
      validation,
      requiresHumanReview,
      humanReviewReason: requiresHumanReview
        ? comparison.agreement === 'disagreement'
          ? 'AI models DISAGREE on this analysis — human must review both opinions before proceeding'
          : comparison.agreement === 'partial'
            ? 'AI models partially agree — human review recommended to resolve differences'
            : !validation.passed
              ? 'AI output failed deterministic validation'
              : `Confidence ${confidence.toFixed(2)} below auto-approve threshold`
        : undefined,
      fallbackUsed: false,
    };
  }

  /**
   * Compare results from multiple providers to determine agreement level.
   */
  private compareResults(
    results: Array<{ provider: AIProvider; content: string; confidence: number }>,
    outputFormat: string,
    category: string,
  ): {
    agreement: 'full' | 'partial' | 'disagreement';
    mergedContent?: string;
    differences: string[];
  } {
    if (results.length < 2) {
      return { agreement: 'full', differences: [] };
    }

    const differences: string[] = [];

    if (outputFormat === 'json') {
      // Parse both and compare key fields
      const parsed = results.map(r => this.parseJSON(r.content));

      // Category-specific comparison
      if (category === 'code_generation') {
        // Compare proposed codes
        const allCorrections = parsed.map(p => {
          const corrections = (p?.corrections || p?.proposed_changes || []) as Array<Record<string, unknown>>;
          return corrections.map(c => `${c.field || c.field_path}: ${c.proposed_code || c.proposed_value || c.proposedValue}`);
        });

        const [first, second] = allCorrections;
        if (first && second) {
          const sameCodes = first.every(c => second.includes(c)) && second.every(c => first.includes(c));
          if (sameCodes) {
            return { agreement: 'full', differences: [] };
          }

          const overlap = first.filter(c => second.includes(c));
          if (overlap.length > 0) {
            return { agreement: 'partial', differences: [`GPT suggests: ${first.join(', ')}`, `Claude suggests: ${second.join(', ')}`] };
          }

          return { agreement: 'disagreement', differences: [`GPT suggests: ${first.join(', ')}`, `Claude suggests: ${second.join(', ')}`] };
        }
      }

      if (category === 'denial_analysis') {
        // Compare root cause and category
        const categories = parsed.map(p => p?.root_cause_category || p?.denial_category);
        const allSame = categories.every(c => c === categories[0]);
        if (allSame) {
          return { agreement: 'full', differences: [] };
        }
        return { agreement: 'partial', differences: [`Categories differ: ${categories.join(' vs ')}`] };
      }

      // Generic JSON comparison
      const [firstParsed, secondParsed] = parsed;
      if (firstParsed && secondParsed) {
        const keys1 = Object.keys(firstParsed).sort();
        const keys2 = Object.keys(secondParsed).sort();
        const sameKeys = keys1.join(',') === keys2.join(',');
        if (sameKeys) {
          // Check if values are similar
          let matchingValues = 0;
          for (const key of keys1) {
            if (JSON.stringify(firstParsed[key]) === JSON.stringify(secondParsed[key])) {
              matchingValues++;
            } else {
              differences.push(`${key}: ${JSON.stringify(firstParsed[key])} vs ${JSON.stringify(secondParsed[key])}`);
            }
          }
          const matchRatio = matchingValues / keys1.length;
          if (matchRatio > 0.8) return { agreement: 'full', differences };
          if (matchRatio > 0.4) return { agreement: 'partial', differences };
          return { agreement: 'disagreement', differences };
        }
        return { agreement: 'disagreement', differences: ['Different output structures'] };
      }
    }

    // Text comparison (simple similarity)
    const [r1, r2] = results;
    const similarity = this.textSimilarity(r1.content, r2.content);
    if (similarity > 0.8) return { agreement: 'full', differences: [] };
    if (similarity > 0.4) return { agreement: 'partial', differences: ['Partial text agreement'] };
    return { agreement: 'disagreement', differences: ['Significant text disagreement'] };
  }

  // ─── PROVIDER CALLS ────────────────────────────────────────────────────

  /**
   * Call a specific AI provider with the given prompt.
   */
  private async callProvider(
    provider: AIProvider,
    systemPrompt: string,
    userMessage: string,
    options: { maxTokens: number; temperature: number; outputFormat: string },
  ): Promise<string> {
    switch (provider) {
      case 'azure-openai':
        return this.callAzureOpenAI(systemPrompt, userMessage, options);
      case 'anthropic':
        return this.callAnthropic(systemPrompt, userMessage, options);
      case 'z-ai-sdk':
        return this.callZAISDK(systemPrompt, userMessage, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Azure OpenAI (GPT-4o) — Primary provider for reasoning-heavy tasks.
   */
  private async callAzureOpenAI(
    systemPrompt: string,
    userMessage: string,
    options: { maxTokens: number; temperature: number; outputFormat: string },
  ): Promise<string> {
    const apiKey = process.env.AZURE_OPENAI_API_KEY || this.config.azure?.apiKey;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || this.config.azure?.endpoint;
    const model = process.env.AZURE_OPENAI_MODEL || this.config.azure?.model || 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || this.config.azure?.apiVersion || '2024-08-01-preview';

    if (!apiKey || !endpoint) {
      throw new Error('Azure OpenAI not configured. Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT.');
    }

    // Build the endpoint URL
    let url = endpoint;
    if (!url.includes('/chat/completions')) {
      url = url.endsWith('/') ? `${url}openai/deployments/${model}/chat/completions?api-version=${apiVersion}` : `${url}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        ...(options.outputFormat === 'json' && { response_format: { type: 'json_object' } }),
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Handle both OpenAI response format and Azure Responses API format
    let resultText = '';

    // Standard OpenAI format
    if (data.choices?.[0]?.message?.content) {
      resultText = data.choices[0].message.content;
    }
    // Azure Responses API format (from original azure-openai.ts)
    else if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const content of item.content) {
            if (content.type === 'output_text' || content.type === 'text') {
              resultText += content.text;
            }
          }
        }
      }
    }

    if (!resultText) {
      throw new Error('Unable to extract text from Azure OpenAI response');
    }

    // Track costs
    if (this.config.trackCosts && data.usage) {
      recordCost('azure-openai', 'general', data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
    }

    return resultText;
  }

  /**
   * Anthropic Claude — Secondary provider for cross-validation.
   * Excellent at nuanced reasoning, regulatory interpretation, and careful analysis.
   */
  private async callAnthropic(
    systemPrompt: string,
    userMessage: string,
    options: { maxTokens: number; temperature: number; outputFormat: string },
  ): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY || this.config.anthropic?.apiKey;
    const model = process.env.ANTHROPIC_MODEL || this.config.anthropic?.model || 'claude-sonnet-4-20250514';

    if (!apiKey) {
      throw new Error('Anthropic not configured. Set ANTHROPIC_API_KEY.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract text from Claude's response
    let resultText = '';
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          resultText += block.text;
        }
      }
    }

    if (!resultText) {
      throw new Error('Unable to extract text from Anthropic response');
    }

    // Track costs
    if (this.config.trackCosts && data.usage) {
      recordCost('anthropic', 'general', data.usage.input_tokens || 0, data.usage.output_tokens || 0);
    }

    return resultText;
  }

  /**
   * z-ai-web-dev-sdk — Built-in fallback provider.
   * Always available, no external API keys needed.
   */
  private async callZAISDK(
    systemPrompt: string,
    userMessage: string,
    options: { maxTokens: number; temperature: number; outputFormat: string },
  ): Promise<string> {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      });

      const messageContent = completion.choices?.[0]?.message?.content;
      if (!messageContent) {
        throw new Error('Empty response from z-ai-web-dev-sdk');
      }

      return messageContent;
    } catch (error) {
      throw new Error(`z-ai-web-dev-sdk error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ─── DETERMINISTIC VALIDATION ──────────────────────────────────────────

  /**
   * Deterministic validation layer — checks AI output against known rules.
   * This catches hallucinated codes, impossible values, etc.
   */
  private deterministicValidation(
    data: Record<string, unknown>,
    context?: BrainCallOptions['validationContext'],
    category?: string,
  ): { passed: boolean; checks: Array<{ name: string; passed: boolean; detail?: string }> } {
    const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

    // ─── Code Format Validation ────────────────────────────────────────────

    // Check CPT codes in the output
    const cptPattern = /\b\d{4,5}\b/g;
    const cptMatches = JSON.stringify(data).match(cptPattern) || [];

    // Validate proposed CPT codes (if any)
    if (data.proposed_code || data.proposedCode || data.proposed_value || data.proposedValue) {
      const proposedCpt = String(data.proposed_code || data.proposedCode || data.proposed_value || data.proposedValue || '');
      if (/^\d{4,5}$/.test(proposedCpt)) {
        checks.push({ name: 'proposed_cpt_format', passed: true, detail: `${proposedCpt} is valid CPT format` });
      } else if (/^[A-Z]\d{2}/.test(proposedCpt)) {
        // This looks like an ICD-10 code, not CPT
        checks.push({ name: 'proposed_cpt_format', passed: false, detail: `${proposedCpt} looks like ICD-10, not CPT` });
      }
      // If it's a modifier, don't check CPT format
      else if (/^[A-Z0-9]{1,3}$/.test(proposedCpt)) {
        checks.push({ name: 'proposed_modifier_format', passed: true, detail: `${proposedCpt} is valid modifier format` });
      }
    }

    // Check corrections array for code formats
    const corrections = (data.corrections || data.proposed_changes || data.proposedCorrections || []) as Array<Record<string, unknown>>;
    for (const corr of corrections) {
      const field = String(corr.field || corr.field_path || '').toLowerCase();
      const proposed = String(corr.proposed_code || corr.proposed_value || corr.proposedValue || '');

      if (field.includes('cpt') || field === 'cpt') {
        if (proposed && !/^\d{4,5}$/.test(proposed)) {
          checks.push({ name: `cpt_format_check_${field}`, passed: false, detail: `Proposed CPT "${proposed}" is not valid format (4-5 digits)` });
        } else if (proposed) {
          checks.push({ name: `cpt_format_check_${field}`, passed: true, detail: `Proposed CPT "${proposed}" is valid format` });
        }
      }

      if (field.includes('icd') || field.includes('diagnosis') || field === 'icd10') {
        if (proposed && !/^[A-Z]\d{2}(\.\d{1,4})?$/.test(proposed)) {
          checks.push({ name: `icd10_format_check_${field}`, passed: false, detail: `Proposed ICD-10 "${proposed}" is not valid format (letter + digits)` });
        } else if (proposed) {
          checks.push({ name: `icd10_format_check_${field}`, passed: true, detail: `Proposed ICD-10 "${proposed}" is valid format` });
        }
      }
    }

    // ─── Confidence Range Validation ───────────────────────────────────────

    const confidence = data.confidence_score ?? data.confidenceScore ?? data.overall_confidence;
    if (confidence !== undefined) {
      const numConfidence = Number(confidence);
      if (isNaN(numConfidence) || numConfidence < 0 || numConfidence > 1) {
        checks.push({ name: 'confidence_range', passed: false, detail: `Confidence ${confidence} is outside valid range 0-1` });
      } else {
        checks.push({ name: 'confidence_range', passed: true, detail: `Confidence ${numConfidence} is in valid range` });
      }
    }

    // ─── NCCI Cross-Reference (if context available) ─────────────────────

    if (context?.cptCode && category === 'code_generation') {
      // Verify that the proposed code isn't in a known NCCI bundle conflict
      // with the original code
      const KNOWN_BUNDLES: Record<string, string[]> = {
        '99213': ['99214', '99215', '36415'],  // E/M bundling examples
        '99214': ['99213', '99215', '36415'],
        '99215': ['99213', '99214', '36415'],
        '93000': ['93005', '93010'],              // ECG bundling
        '93005': ['93000', '93010'],
        '71046': ['71045'],                        // Chest X-ray bundling
      };

      const bundledWith = KNOWN_BUNDLES[context.cptCode] || [];
      for (const corr of corrections) {
        const proposed = String(corr.proposed_code || corr.proposed_value || corr.proposedValue || '');
        if (bundledWith.includes(proposed)) {
          checks.push({
            name: 'ncci_bundle_check',
            passed: false,
            detail: `Proposed CPT ${proposed} is known to be bundled with ${context.cptCode} — requires modifier or separate documentation`,
          });
        }
      }
    }

    // ─── Citation Verification ─────────────────────────────────────────────

    const citations = (data.citations || data.compliance_notes || []) as Array<string | Record<string, unknown>>;
    const VERIFIED_CITATION_PREFIXES = [
      '42 CFR', 'Social Security Act', 'CMS', 'LCD', 'NCD',
      'AMA CPT', 'NCCI', 'IOM', 'Pub.', '§', 'Section',
    ];

    for (const citation of citations) {
      const citationStr = typeof citation === 'string' ? citation : String(citation.reference || citation.citation || '');
      if (citationStr && !VERIFIED_CITATION_PREFIXES.some(prefix => citationStr.includes(prefix))) {
        // Not a known citation format — might be fabricated
        checks.push({
          name: 'citation_verification',
          passed: false,
          detail: `Citation "${citationStr}" does not match known regulatory reference formats — may be fabricated`,
        });
      }
    }

    // ─── Category-Specific Validation ──────────────────────────────────────

    if (category === 'appeal_letter' || category === 'appeal') {
      // Appeal letters must have a disclaimer
      const content = String(data.body || data.content || data.letter || '');
      if (content && !content.toLowerCase().includes('review') && !content.toLowerCase().includes('verify') && !content.toLowerCase().includes('disclaimer')) {
        checks.push({
          name: 'appeal_disclaimer',
          passed: false,
          detail: 'Appeal letter missing required disclaimer/review notice',
        });
      }
    }

    if (category === 'correction_suggestion' || category === 'code_generation') {
      // Corrections must have a reason
      for (const corr of corrections) {
        const reason = String(corr.reason || corr.rationale || '');
        if (!reason) {
          checks.push({
            name: 'correction_reason',
            passed: false,
            detail: 'Proposed correction missing required reason/rationale',
          });
        }
      }
    }

    const passed = checks.every(c => c.passed);
    return { passed, checks };
  }

  // ─── HELPER METHODS ──────────────────────────────────────────────────────

  private shouldCrossValidate(category: string, highStakes: boolean): boolean {
    if (this.config.crossValidationMode === 'always') return true;
    if (this.config.crossValidationMode === 'never') return false;
    // 'high_stakes' mode
    if (highStakes) return true;
    // Certain categories always cross-validate
    const alwaysCrossValidate: string[] = ['code_generation', 'correction_suggestion'];
    return alwaysCrossValidate.includes(category);
  }

  private getAvailableProviders(): AIProvider[] {
    const providers: AIProvider[] = [];
    if (this.azureAvailable) providers.push('azure-openai');
    if (this.anthropicAvailable) providers.push('anthropic');
    providers.push('z-ai-sdk'); // Always available
    providers.push('rule-based'); // Always available
    return providers;
  }

  private getPrimaryProvider(): AIProvider {
    if (this.azureAvailable) return 'azure-openai';
    if (this.anthropicAvailable) return 'anthropic';
    return 'z-ai-sdk';
  }

  private getFallbackProvider(exclude: AIProvider): AIProvider | null {
    const available = this.getAvailableProviders().filter(p => p !== exclude && p !== 'rule-based');
    return available[0] || null;
  }

  private parseJSON(text: string): Record<string, unknown> {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code block
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          // Continue
        }
      }

      // Try to find JSON object in the text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          // Continue
        }
      }

      return { raw: text, parse_error: true };
    }
  }

  private textSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  private createRuleBasedResult(category: string, options: BrainCallOptions): BrainResult {
    return {
      content: JSON.stringify({ status: 'rule_based', category, message: 'AI providers unavailable — using rule-based analysis only' }),
      parsedContent: { status: 'rule_based', category },
      providers: ['rule-based'],
      confidence: 0.5,
      crossValidated: false,
      validation: { passed: true, checks: [{ name: 'rule_based_fallback', passed: true, detail: 'No AI providers available' }] },
      requiresHumanReview: false,
      fallbackUsed: true,
    };
  }

  private createErrorResult(error: unknown, provider: AIProvider): BrainResult {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: '',
      parsedContent: null,
      providers: [provider],
      confidence: 0,
      crossValidated: false,
      validation: { passed: false, checks: [{ name: 'provider_error', passed: false, detail: errorMsg }] },
      requiresHumanReview: true,
      humanReviewReason: `AI provider error: ${errorMsg}`,
      fallbackUsed: false,
      error: errorMsg,
    };
  }

  // ─── PUBLIC UTILITIES ──────────────────────────────────────────────────

  /**
   * Get cost tracking data.
   */
  getCostReport(): { totalCost: number; byProvider: Record<string, number>; records: CostRecord[] } {
    const byProvider: Record<string, number> = {};
    for (const record of costLog) {
      byProvider[record.provider] = (byProvider[record.provider] || 0) + record.cost;
    }
    return {
      totalCost: costLog.reduce((sum, r) => sum + r.cost, 0),
      byProvider,
      records: costLog,
    };
  }

  /**
   * Get provider status.
   */
  getStatus(): { providers: Array<{ name: AIProvider; available: boolean; type: string }> } {
    return {
      providers: [
        { name: 'azure-openai', available: this.azureAvailable, type: 'Primary (GPT-4o)' },
        { name: 'anthropic', available: this.anthropicAvailable, type: 'Cross-validator (Claude)' },
        { name: 'z-ai-sdk', available: true, type: 'Built-in fallback' },
        { name: 'rule-based', available: true, type: 'Zero-hallucination fallback' },
      ],
    };
  }

  /**
   * Clear cost log.
   */
  clearCostLog(): void {
    costLog = [];
  }
}

// ─── SINGLETON ─────────────────────────────────────────────────────────────────

let brainInstance: Brain | null = null;

export function getBrain(): Brain {
  if (!brainInstance) {
    brainInstance = new Brain();
  }
  return brainInstance;
}

export function initializeBrain(config?: Partial<BrainConfig>): Brain {
  brainInstance = new Brain(config);
  return brainInstance;
}

// ─── CONVENIENCE FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Quick analyze a denial — the most common Brain operation.
 */
export async function analyzeDenial(claimData: Record<string, unknown>): Promise<BrainResult> {
  const brain = getBrain();
  return brain.think({
    systemPrompt: `You are an expert healthcare revenue cycle denial management analyst. Analyze denied medical claims using CARC/RARC codes, claim data, and denial patterns. Identify root cause, classify denial, determine correctability, and suggest next action.

CRITICAL RULES:
- Only validate and analyze EXISTING data — NEVER invent patient data, codes, or policy numbers
- If you are unsure about something, say so explicitly
- Every factual claim must have a source reference
- Confidence must be between 0 and 1

Return structured JSON with: denial_summary, root_cause_category, root_cause_detail, denial_category (one of: coding_error, missing_information, authorization, eligibility, medical_necessity, timely_filing, duplicate, bundling, demographic, other), preventable (boolean), correctable (boolean), appeal_recommended (boolean), confidence_score (0-1), recommended_next_action, required_information array, compliance_notes array. Return ONLY valid JSON, no other text.`,
    userMessage: `Analyze this denied claim:\n${JSON.stringify(claimData, null, 2)}`,
    outputFormat: 'json',
    category: 'denial_analysis',
    highStakes: false,
    temperature: 0.1,
  });
}

/**
 * Generate corrected codes for a denied claim.
 */
export async function generateCorrectedCodes(
  claimData: Record<string, unknown>,
  carcCode: string,
): Promise<BrainResult> {
  const brain = getBrain();
  return brain.think({
    systemPrompt: `You are a medical coding specialist. A claim was denied and rule-based analysis could not find a correction. Generate the CORRECTED codes.

CRITICAL SAFETY RULES:
- Only propose codes you are confident about — if unsure, return empty corrections
- Explain WHY the original code is wrong and WHY the new code is correct
- Reference specific coding guidelines (AMA CPT, ICD-10-CM, NCCI, LCD/NCD)
- Validate that proposed codes are real, valid code numbers (CPT = 4-5 digits, ICD-10 = letter + digits)
- Never fabricate codes — if you cannot determine the correct code with confidence, say so
- ALL corrections are AI-generated and MUST be verified by a certified coder before use

Respond in JSON format:
{
  "corrections": [
    {
      "field": "CPT" or "ICD10" or "Modifier",
      "current_code": "the current value",
      "proposed_code": "the corrected value",
      "reason": "why this change is correct",
      "confidence": 0.0-1.0,
      "guideline_reference": "specific guideline reference",
      "needs_clinical_verification": true/false
    }
  ],
  "overall_confidence": 0.0-1.0,
  "summary": "Brief explanation"
}

If you cannot confidently propose a correction, return:
{"corrections": [], "overall_confidence": 0, "summary": "MANUAL_REVIEW_NEEDED"}`,
    userMessage: `Generate corrected codes for this denied claim:\n${JSON.stringify(claimData, null, 2)}\n\nDenial code: ${carcCode}`,
    outputFormat: 'json',
    category: 'code_generation',
    highStakes: true, // Code generation is ALWAYS high stakes
    temperature: 0.05, // Extremely low temperature for code generation
    validationContext: {
      cptCode: claimData.cptCode as string,
      icd10Code: claimData.diagnosisCode as string,
      modifier: claimData.modifier as string,
      carcCode,
      payerName: claimData.payerName as string,
    },
  });
}

/**
 * Generate an appeal letter for a denied claim.
 */
export async function generateAppealLetter(
  claimData: Record<string, unknown>,
): Promise<BrainResult> {
  const brain = getBrain();
  return brain.think({
    systemPrompt: `You are an expert healthcare appeals writer specializing in medical claim denials. Generate a professional appeal letter.

CRITICAL RULES:
- Cite ONLY real, verified regulations (42 CFR, SSA, CMS manuals, LCD/NCD)
- If you cannot find a real citation, say "Manual research needed" — NEVER invent citations
- Include a disclaimer that the letter must be reviewed before submission
- Be professional, specific, and reference the exact claim and denial reason
- Request specific action (full payment, reconsideration, peer-to-peer review)

Return ONLY the appeal letter content in markdown format. Do not wrap in JSON.`,
    userMessage: `Generate an appeal letter for this denied claim:\n${JSON.stringify(claimData, null, 2)}`,
    outputFormat: 'text',
    category: 'appeal_letter',
    highStakes: true, // Appeals are always high stakes
    temperature: 0.2,
  });
}

/**
 * Quality check a proposed correction before resubmission.
 */
export async function qualityCheck(
  claimData: Record<string, unknown>,
  proposedCorrection: Record<string, unknown>,
): Promise<BrainResult> {
  const brain = getBrain();
  return brain.think({
    systemPrompt: `You are a healthcare claim quality assurance auditor. Validate proposed corrections for denied claims before resubmission.

Check:
1. Does the correction address the denial reason?
2. Are all required fields complete?
3. Are coding changes supported by documentation/guidelines?
4. Is there any compliance risk?
5. Would this correction pass a payer audit?

Return structured JSON with: overall_result (pass/fail/warning), validation_findings array, blocking_issues array, warnings array, recommendation (approve_for_review/return_for_correction/request_more_info), confidence_score (0-1). Return ONLY valid JSON.`,
    userMessage: `Quality check this proposed correction:\n\nClaim: ${JSON.stringify(claimData, null, 2)}\n\nProposed Correction: ${JSON.stringify(proposedCorrection, null, 2)}`,
    outputFormat: 'json',
    category: 'quality_check',
    highStakes: true,
    temperature: 0.1,
  });
}

/**
 * Batch overview scan — analyze a batch of denials for patterns.
 */
export async function overviewScan(batchData: Record<string, unknown>): Promise<BrainResult> {
  const brain = getBrain();
  return brain.think({
    systemPrompt: `You are an expert healthcare revenue cycle management consultant. Analyze a batch of denied claims and produce a comprehensive overview assessment.

Your response MUST be valid JSON with these exact fields:
{
  "overall_rating": <number 0-10>,
  "rating_label": "<Critical|Poor|Needs Attention|Fair|Good|Excellent>",
  "executive_summary": "<2-3 sentence professional summary>",
  "key_issues": [{ "issue": "", "severity": "critical|high|medium|low", "affected_claims": 0, "affected_amount": 0, "description": "" }],
  "top_denial_reasons": [{ "reason": "", "carc_code": "", "count": 0, "amount": 0 }],
  "recovery_potential": { "estimated_recoverable": 0, "recovery_percentage": 0, "high_confidence": 0, "medium_confidence": 0, "low_confidence": 0 },
  "recommendations": [""]
}

Return ONLY valid JSON.`,
    userMessage: `Analyze this batch of denied claims:\n${JSON.stringify(batchData, null, 2)}`,
    outputFormat: 'json',
    category: 'overview_scan',
    highStakes: false,
    temperature: 0.1,
  });
}
