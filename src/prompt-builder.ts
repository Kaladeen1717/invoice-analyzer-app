/**
 * Builds dynamic Gemini prompts based on configuration
 */

import { validateAllFormats } from './format-validator.js';
import { VALID_FIELD_FORMATS, FORMAT_NONE } from './constants.js';

import type {
    AppConfig,
    FieldDefinition,
    TagDefinition,
    PromptTemplate,
    FieldFormatKey,
    InvoiceAnalysis
} from './types/index.js';

interface FieldFilter {
    fields?: string[];
    tags?: string[];
    includeSummary?: boolean;
}

interface BuildOptions {
    fieldFilter?: FieldFilter;
}

/**
 * Resolve parameter templates in a tag instruction
 * Replaces {{paramName}} with the parameter value
 * @param tag - The tag definition
 * @param paramOverrides - Optional parameter value overrides
 * @returns Resolved instruction string
 */
export function resolveTagInstruction(tag: TagDefinition, paramOverrides?: Record<string, unknown>): string {
    let instruction = tag.instruction;
    if (!tag.parameters) return instruction;

    for (const [paramKey, paramDef] of Object.entries(tag.parameters)) {
        const value =
            paramOverrides && paramOverrides[paramKey] !== undefined ? paramOverrides[paramKey] : paramDef.default;
        instruction = instruction.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value));
    }
    return instruction;
}

/**
 * Build the invoice analysis prompt from configuration
 * @param config - The configuration object
 * @param options - Optional parameters
 * @returns The Gemini prompt
 */
export function buildExtractionPrompt(config: AppConfig, options: BuildOptions = {}): string {
    const fieldDefinitions = config.fieldDefinitions as FieldDefinition[];
    const tagDefinitions = config.tagDefinitions;
    const { fieldFilter } = options;
    const includeSummary =
        fieldFilter && 'includeSummary' in fieldFilter
            ? fieldFilter.includeSummary
            : config.output && config.output.includeSummary;

    // Build the JSON structure dynamically
    const jsonStructure: Record<string, unknown> = {};
    const instructions: string[] = [];

    let enabledFields = fieldDefinitions.filter((f) => f.enabled);
    if (fieldFilter && fieldFilter.fields) {
        const fieldSet = new Set(fieldFilter.fields);
        enabledFields = enabledFields.filter((f) => fieldSet.has(f.key));
    }

    for (const field of enabledFields) {
        let schemaHint = field.schemaHint;
        if (field.format && field.format !== FORMAT_NONE) {
            const formatDef = VALID_FIELD_FORMATS[field.format as FieldFormatKey];
            if (formatDef) {
                schemaHint += ` (${formatDef.standard}: ${formatDef.pattern})`;
            }
        }
        jsonStructure[field.key] = schemaHint;
        instructions.push(`- For ${field.key}, ${field.instruction}`);
    }

    if (includeSummary) {
        jsonStructure.summary = 'Brief summary of the invoice including key items, services, or products';
        instructions.push(
            '- For summary, provide a concise description of what this invoice is for (2-3 sentences max)'
        );
    }

    // Build tags section from tagDefinitions
    const tagInstructions: string[] = [];
    if (tagDefinitions) {
        let enabledTags = tagDefinitions.filter((t) => t.enabled);
        if (fieldFilter && fieldFilter.tags) {
            const tagSet = new Set(fieldFilter.tags);
            enabledTags = enabledTags.filter((t) => tagSet.has(t.id));
        }
        if (enabledTags.length > 0) {
            const tagsSchema: Record<string, string> = {};
            for (const tag of enabledTags) {
                tagsSchema[tag.id] = 'boolean';
                const resolved = resolveTagInstruction(tag);
                tagInstructions.push(`- For tags.${tag.id} (${tag.label}): ${resolved}`);
            }
            jsonStructure.tags = tagsSchema;
        }
    }

    const jsonExample = JSON.stringify(jsonStructure, null, 2);

    let rulesText = instructions.join('\n');
    if (tagInstructions.length > 0) {
        rulesText += '\n\nFor each tag below, set to true if the condition applies, false otherwise:\n';
        rulesText += tagInstructions.join('\n');
    }

    // If rawPrompt is set, use it directly
    if (config.rawPrompt) {
        return config.rawPrompt;
    }

    // Use promptTemplate from config, or hardcoded defaults for backward compatibility
    const template = config.promptTemplate || ({} as Partial<PromptTemplate>);
    const preamble =
        template.preamble || 'Analyze this invoice PDF and extract the following information in JSON format:';
    const generalRules =
        template.generalRules ||
        'If any field cannot be determined, use "Unknown" for text fields, "0" for amounts, false for booleans, or [] for arrays.';
    const suffix = template.suffix || 'Always return valid JSON that can be parsed directly.';

    const prompt = `${preamble}
${jsonExample}

Important extraction rules:
${rulesText}

${generalRules}
${suffix}`;

    return prompt;
}

/**
 * Parse the Gemini response and extract JSON
 * @param responseText - The raw response from Gemini
 * @param options - Parse options
 * @returns The parsed analysis object
 */
export function parseGeminiResponse(
    responseText: string,
    { useJsonMode = false }: { useJsonMode?: boolean } = {}
): Record<string, unknown> {
    let jsonText = responseText.trim();

    if (!useJsonMode) {
        // Legacy path: strip markdown code blocks from free-text responses
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }
        jsonText = jsonText.trim();
    }

    try {
        return JSON.parse(jsonText) as Record<string, unknown>;
    } catch (error: unknown) {
        throw new Error(
            `Failed to parse Gemini response as JSON: ${(error as Error).message}\nResponse was: ${jsonText.substring(0, 200)}...`
        );
    }
}

/**
 * Validate the extracted analysis has required fields
 * @param analysis - The parsed analysis
 * @param config - The configuration object
 * @returns The validated (and possibly filled) analysis, with _formatWarnings if any
 */
export function validateAnalysis(analysis: Record<string, unknown>, config: AppConfig): InvoiceAnalysis {
    const validated: Record<string, unknown> = { ...analysis };

    const fieldDefinitions = config.fieldDefinitions as FieldDefinition[];
    const tagDefinitions = config.tagDefinitions;

    // Type-aware defaults from field definitions
    const enabledFields = fieldDefinitions.filter((f) => f.enabled);

    for (const field of enabledFields) {
        if (validated[field.key] === undefined || validated[field.key] === null) {
            switch (field.type) {
                case 'number':
                    validated[field.key] = 0;
                    break;
                case 'boolean':
                    validated[field.key] = false;
                    break;
                case 'array':
                    validated[field.key] = [];
                    break;
                case 'date':
                case 'text':
                default:
                    validated[field.key] = 'Unknown';
                    break;
            }
        }
    }

    // Ensure paymentDate falls back to invoiceDate if not found
    if (validated.paymentDate === 'Unknown' && validated.invoiceDate && validated.invoiceDate !== 'Unknown') {
        validated.paymentDate = validated.invoiceDate;
    }

    // Validate tags
    if (tagDefinitions) {
        const enabledTags = tagDefinitions.filter((t) => t.enabled);
        if (!validated.tags || typeof validated.tags !== 'object') {
            validated.tags = {};
        }
        // Ensure all enabled tags have boolean values, default missing to false
        for (const tag of enabledTags) {
            if (typeof (validated.tags as Record<string, unknown>)[tag.id] !== 'boolean') {
                (validated.tags as Record<string, boolean>)[tag.id] = false;
            }
        }
    }

    // Format-aware validation (non-blocking: apply corrections, collect warnings)
    const { corrected, warnings } = validateAllFormats(validated, fieldDefinitions);
    Object.assign(validated, corrected);
    if (warnings.length > 0) {
        validated._formatWarnings = warnings;
    }

    return validated as InvoiceAnalysis;
}

/**
 * Get the list of active tag IDs from analysis.tags
 * @param tags - The tags object from analysis
 * @returns Array of tag IDs that are true
 */
export function getActiveTags(tags: Record<string, boolean> | undefined | null): string[] {
    if (!tags || typeof tags !== 'object') return [];
    return Object.entries(tags)
        .filter(([_, v]) => v === true)
        .map(([k]) => k);
}

/**
 * Build a prompt preview from structured template parts + current config
 * Used by the frontend to show a live preview of the assembled prompt
 * @param config - The configuration object
 * @param templateOverride - Optional override for promptTemplate fields
 * @returns The assembled prompt text
 */
export function buildPromptPreview(config: AppConfig, templateOverride?: Partial<PromptTemplate>): string {
    // Temporarily override promptTemplate and clear rawPrompt for preview
    const previewConfig: AppConfig = {
        ...config,
        rawPrompt: undefined,
        promptTemplate: {
            ...(config.promptTemplate || ({} as PromptTemplate)),
            ...(templateOverride || {})
        } as PromptTemplate
    };
    return buildExtractionPrompt(previewConfig);
}
