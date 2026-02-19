/**
 * Builds dynamic Gemini prompts based on configuration
 */

/**
 * Resolve parameter templates in a tag instruction
 * Replaces {{paramName}} with the parameter value
 * @param {Object} tag - The tag definition
 * @param {Object} [paramOverrides] - Optional parameter value overrides
 * @returns {string} Resolved instruction string
 */
function resolveTagInstruction(tag, paramOverrides) {
    let instruction = tag.instruction;
    if (!tag.parameters) return instruction;

    for (const [paramKey, paramDef] of Object.entries(tag.parameters)) {
        const value =
            paramOverrides && paramOverrides[paramKey] !== undefined ? paramOverrides[paramKey] : paramDef.default;
        instruction = instruction.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), value);
    }
    return instruction;
}

/**
 * Build the invoice analysis prompt from configuration
 * @param {Object} config - The configuration object
 * @param {Object} [options] - Optional parameters
 * @param {Object} [options.fieldFilter] - Filter which fields/tags to include
 * @param {string[]} [options.fieldFilter.fields] - Array of field keys to include (omit for all enabled)
 * @param {string[]} [options.fieldFilter.tags] - Array of tag IDs to include (omit for all enabled)
 * @param {boolean} [options.fieldFilter.includeSummary] - Whether to include summary (defaults to config setting)
 * @returns {string} The Gemini prompt
 */
function buildExtractionPrompt(config, options = {}) {
    const fieldDefinitions = config.fieldDefinitions;
    const tagDefinitions = config.tagDefinitions;
    const { fieldFilter } = options;
    const includeSummary =
        fieldFilter && 'includeSummary' in fieldFilter
            ? fieldFilter.includeSummary
            : config.output && config.output.includeSummary;

    // Build the JSON structure dynamically
    const jsonStructure = {};
    const instructions = [];

    let enabledFields = fieldDefinitions.filter((f) => f.enabled);
    if (fieldFilter && fieldFilter.fields) {
        const fieldSet = new Set(fieldFilter.fields);
        enabledFields = enabledFields.filter((f) => fieldSet.has(f.key));
    }

    for (const field of enabledFields) {
        jsonStructure[field.key] = field.schemaHint;
        instructions.push(`- For ${field.key}, ${field.instruction}`);
    }

    if (includeSummary) {
        jsonStructure.summary = 'Brief summary of the invoice including key items, services, or products';
        instructions.push(
            '- For summary, provide a concise description of what this invoice is for (2-3 sentences max)'
        );
    }

    // Build tags section from tagDefinitions
    const tagInstructions = [];
    if (tagDefinitions) {
        let enabledTags = tagDefinitions.filter((t) => t.enabled);
        if (fieldFilter && fieldFilter.tags) {
            const tagSet = new Set(fieldFilter.tags);
            enabledTags = enabledTags.filter((t) => tagSet.has(t.id));
        }
        if (enabledTags.length > 0) {
            const tagsSchema = {};
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
    const template = config.promptTemplate || {};
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
 * @param {string} responseText - The raw response from Gemini
 * @returns {Object} The parsed analysis object
 */
function parseGeminiResponse(responseText) {
    let jsonText = responseText.trim();

    // Handle markdown code blocks
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '');
    }

    // Remove any trailing whitespace or newlines
    jsonText = jsonText.trim();

    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(
            `Failed to parse Gemini response as JSON: ${error.message}\nResponse was: ${jsonText.substring(0, 200)}...`
        );
    }
}

/**
 * Validate the extracted analysis has required fields
 * @param {Object} analysis - The parsed analysis
 * @param {Object} config - The configuration object
 * @returns {Object} The validated (and possibly filled) analysis
 */
function validateAnalysis(analysis, config) {
    const validated = { ...analysis };

    const fieldDefinitions = config.fieldDefinitions;
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
            if (typeof validated.tags[tag.id] !== 'boolean') {
                validated.tags[tag.id] = false;
            }
        }
    }

    return validated;
}

/**
 * Get the list of active tag IDs from analysis.tags
 * @param {Object} tags - The tags object from analysis
 * @returns {string[]} Array of tag IDs that are true
 */
function getActiveTags(tags) {
    if (!tags || typeof tags !== 'object') return [];
    return Object.entries(tags)
        .filter(([_, v]) => v === true)
        .map(([k]) => k);
}

/**
 * Build a prompt preview from structured template parts + current config
 * Used by the frontend to show a live preview of the assembled prompt
 * @param {Object} config - The configuration object
 * @param {Object} [templateOverride] - Optional override for promptTemplate fields
 * @returns {string} The assembled prompt text
 */
function buildPromptPreview(config, templateOverride) {
    // Temporarily override promptTemplate and clear rawPrompt for preview
    const previewConfig = {
        ...config,
        rawPrompt: undefined,
        promptTemplate: {
            ...(config.promptTemplate || {}),
            ...(templateOverride || {})
        }
    };
    return buildExtractionPrompt(previewConfig);
}

module.exports = {
    buildExtractionPrompt,
    buildPromptPreview,
    parseGeminiResponse,
    validateAnalysis,
    resolveTagInstruction,
    getActiveTags
};
