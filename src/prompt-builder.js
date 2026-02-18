/**
 * Builds dynamic Gemini prompts based on configuration
 */

const { getDefaultDocumentTypes } = require('./config');

// Field keys that are replaced by the unified tag system
const TAG_REPLACED_FIELDS = ['documentTypes', 'isPrivate'];

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
        const value = (paramOverrides && paramOverrides[paramKey] !== undefined)
            ? paramOverrides[paramKey]
            : paramDef.default;
        instruction = instruction.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), value);
    }
    return instruction;
}

/**
 * Build the invoice analysis prompt from configuration
 * @param {Object} config - The configuration object (with optional documentTypes array)
 * @returns {string} The Gemini prompt
 */
function buildExtractionPrompt(config) {
    const { fields, includeSummary, privateAddressMarker } = config.extraction;

    // Get document types from config or use defaults
    const documentTypes = config.documentTypes || getDefaultDocumentTypes();
    const documentTypeIds = documentTypes.map(dt => dt.id);

    // Check for data-driven field definitions and tag definitions
    const fieldDefinitions = config.fieldDefinitions;
    const tagDefinitions = config.tagDefinitions;

    // Build the JSON structure dynamically
    const jsonStructure = {};
    const instructions = [];

    if (fieldDefinitions) {
        // Data-driven mode
        let enabledFields = fieldDefinitions.filter(f => f.enabled);

        // When tag system is active, skip fields that are now handled as tags
        if (tagDefinitions) {
            enabledFields = enabledFields.filter(f => !TAG_REPLACED_FIELDS.includes(f.key));
        }

        for (const field of enabledFields) {
            jsonStructure[field.key] = field.schemaHint;

            // Special handling for fields that need dynamic content (legacy compat when no tagDefinitions)
            if (!tagDefinitions && field.key === 'documentTypes') {
                instructions.push(`- For documentTypes, analyze the document and return an array of applicable types from: ${documentTypeIds.join(', ')}`);
                for (const dt of documentTypes) {
                    instructions.push(`  * ${dt.id}: ${dt.description || dt.label}`);
                }
                instructions.push('  Multiple types can apply (e.g., a receipt that is also a commercial invoice)');
            } else if (!tagDefinitions && field.key === 'isPrivate' && privateAddressMarker) {
                instructions.push(`- For isPrivate, set to true if the address "${privateAddressMarker}" appears anywhere in the document, otherwise false`);
            } else {
                instructions.push(`- For ${field.key}, ${field.instruction}`);
            }
        }
    } else {
        // Legacy: Switch-based mode
        for (const field of fields) {
            switch (field) {
                case 'supplierName':
                    jsonStructure.supplierName = 'Full company/supplier name as it appears on the invoice';
                    instructions.push('- For supplierName, extract the full company name with proper spacing (e.g., "Acme Corporation" not "AcmeCorporation")');
                    break;

                case 'paymentDate':
                    jsonStructure.paymentDate = 'YYYYMMDD format - the date payment is due';
                    instructions.push('- For paymentDate, look for "Due Date", "Payment Due", "Pay By", or similar fields. Convert to YYYYMMDD format. If not found, use the invoiceDate.');
                    break;

                case 'invoiceDate':
                    jsonStructure.invoiceDate = 'YYYYMMDD format - the date the invoice was issued';
                    instructions.push('- For invoiceDate, convert any date format to YYYYMMDD (e.g., "2024-01-15" becomes "20240115")');
                    break;

                case 'invoiceNumber':
                    jsonStructure.invoiceNumber = 'Invoice number/reference';
                    instructions.push('- For invoiceNumber, extract the invoice number or reference as shown on the document');
                    break;

                case 'currency':
                    jsonStructure.currency = 'Currency code (e.g., USD, EUR, DKK, NOK, SEK)';
                    instructions.push('- For currency, identify the 3-letter currency code (USD, EUR, DKK, etc.)');
                    break;

                case 'totalAmount':
                    jsonStructure.totalAmount = 'Total amount as a number (no currency symbol, no thousands separators)';
                    instructions.push('- For totalAmount, provide just the numeric value without currency symbol or separators (e.g., "1500.50" not "$1,500.50")');
                    break;

                case 'documentTypes':
                    jsonStructure.documentTypes = 'Array of document type tags that apply to this document';
                    instructions.push(`- For documentTypes, analyze the document and return an array of applicable types from: ${documentTypeIds.join(', ')}`);
                    for (const dt of documentTypes) {
                        instructions.push(`  * ${dt.id}: ${dt.description || dt.label}`);
                    }
                    instructions.push('  Multiple types can apply (e.g., a receipt that is also a commercial invoice)');
                    break;

                case 'isPrivate':
                    jsonStructure.isPrivate = 'Boolean - true if this appears to be a private/personal invoice';
                    if (privateAddressMarker) {
                        instructions.push(`- For isPrivate, set to true if the address "${privateAddressMarker}" appears anywhere in the document, otherwise false`);
                    } else {
                        instructions.push('- For isPrivate, set to true if this appears to be a personal/private invoice rather than business');
                    }
                    break;

                default:
                    jsonStructure[field] = `Value for ${field}`;
                    instructions.push(`- For ${field}, extract the relevant value from the invoice`);
            }
        }
    }

    if (includeSummary) {
        jsonStructure.summary = 'Brief summary of the invoice including key items, services, or products';
        instructions.push('- For summary, provide a concise description of what this invoice is for (2-3 sentences max)');
    }

    // Build tags section from tagDefinitions
    const tagInstructions = [];
    if (tagDefinitions) {
        const enabledTags = tagDefinitions.filter(t => t.enabled);
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

    const prompt = `Analyze this invoice PDF and extract the following information in JSON format:
${jsonExample}

Important extraction rules:
${rulesText}

If any field cannot be determined, use "Unknown" for text fields, "0" for amounts, false for booleans, or [] for arrays.
Always return valid JSON that can be parsed directly.`;

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
        throw new Error(`Failed to parse Gemini response as JSON: ${error.message}\nResponse was: ${jsonText.substring(0, 200)}...`);
    }
}

/**
 * Validate the extracted analysis has required fields
 * @param {Object} analysis - The parsed analysis
 * @param {Object} config - The configuration object (with optional documentTypes array)
 * @returns {Object} The validated (and possibly filled) analysis
 */
function validateAnalysis(analysis, config) {
    const validated = { ...analysis };

    // Get document types from config or use defaults
    const documentTypes = config.documentTypes || getDefaultDocumentTypes();
    const validTypeIds = documentTypes.map(dt => dt.id);

    const fieldDefinitions = config.fieldDefinitions;
    const tagDefinitions = config.tagDefinitions;

    if (fieldDefinitions) {
        // Data-driven: type-aware defaults from field definitions
        let enabledFields = fieldDefinitions.filter(f => f.enabled);

        // When tag system is active, skip tag-replaced fields
        if (tagDefinitions) {
            enabledFields = enabledFields.filter(f => !TAG_REPLACED_FIELDS.includes(f.key));
        }

        for (const field of enabledFields) {
            if (validated[field.key] === undefined || validated[field.key] === null) {
                switch (field.type) {
                    case 'number': validated[field.key] = 0; break;
                    case 'boolean': validated[field.key] = false; break;
                    case 'array': validated[field.key] = []; break;
                    case 'date':
                    case 'text':
                    default: validated[field.key] = 'Unknown'; break;
                }
            }
        }
    } else {
        // Legacy mode
        for (const field of config.extraction.fields) {
            if (validated[field] === undefined || validated[field] === null) {
                if (field === 'totalAmount') {
                    validated[field] = 0;
                } else if (field === 'documentTypes') {
                    validated[field] = [];
                } else if (field === 'isPrivate') {
                    validated[field] = false;
                } else {
                    validated[field] = 'Unknown';
                }
            }
        }
    }

    // Ensure paymentDate falls back to invoiceDate if not found
    if (validated.paymentDate === 'Unknown' && validated.invoiceDate && validated.invoiceDate !== 'Unknown') {
        validated.paymentDate = validated.invoiceDate;
    }

    // Validate tags when tag system is active
    if (tagDefinitions) {
        const enabledTags = tagDefinitions.filter(t => t.enabled);
        if (!validated.tags || typeof validated.tags !== 'object') {
            validated.tags = {};
        }
        // Ensure all enabled tags have boolean values, default missing to false
        for (const tag of enabledTags) {
            if (typeof validated.tags[tag.id] !== 'boolean') {
                validated.tags[tag.id] = false;
            }
        }
    } else {
        // Legacy: ensure documentTypes is always an array and normalize
        if (validated.documentTypes !== undefined) {
            if (!Array.isArray(validated.documentTypes)) {
                validated.documentTypes = validated.documentTypes ? [validated.documentTypes] : [];
            }
            validated.documentTypes = validated.documentTypes
                .map(t => String(t).toLowerCase().replace(/\s+/g, '_'))
                .filter(t => validTypeIds.includes(t));
        }
    }

    return validated;
}

/**
 * Format document types for display
 * @param {string[]} types - Array of document type codes
 * @param {Array} [documentTypes] - Optional document types config array with id/label
 * @returns {string} Human-readable string
 */
function formatDocumentTypes(types, documentTypes = null) {
    if (!types || types.length === 0) return 'Unknown';

    // Build labels map from config or use defaults
    const docTypes = documentTypes || getDefaultDocumentTypes();
    const labels = {};
    for (const dt of docTypes) {
        labels[dt.id] = dt.label;
    }

    return types.map(t => labels[t] || t).join(', ');
}

/**
 * Get the list of active tag IDs from analysis.tags
 * @param {Object} tags - The tags object from analysis
 * @returns {string[]} Array of tag IDs that are true
 */
function getActiveTags(tags) {
    if (!tags || typeof tags !== 'object') return [];
    return Object.entries(tags).filter(([_, v]) => v === true).map(([k]) => k);
}

module.exports = {
    buildExtractionPrompt,
    parseGeminiResponse,
    validateAnalysis,
    formatDocumentTypes,
    resolveTagInstruction,
    getActiveTags,
    TAG_REPLACED_FIELDS
};
