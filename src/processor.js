/**
 * Shared processing logic for invoice analysis
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { buildExtractionPrompt, parseGeminiResponse, validateAnalysis } = require('./prompt-builder');
const { generateFormattedFilename, getUniqueFilename, formatDateForDisplay } = require('./filename-generator');
const { DEFAULT_MODEL } = require('./constants');

// Cache for Gemini AI instances per API key
const genAICache = new Map();

/**
 * Get or create a Gemini AI instance for the given API key
 * @param {string} apiKey - The API key to use
 * @returns {GoogleGenerativeAI} The Gemini AI instance
 */
function getGenAI(apiKey = null) {
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key) {
        throw new Error('GEMINI_API_KEY not configured in environment');
    }

    if (!genAICache.has(key)) {
        genAICache.set(key, new GoogleGenerativeAI(key));
    }

    return genAICache.get(key);
}

/**
 * Clear the Gemini AI cache (useful for testing)
 */
function clearGenAICache() {
    genAICache.clear();
}

/**
 * Convert PDF file to base64
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Base64 encoded PDF
 */
async function pdfToBase64(filePath) {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
}

/**
 * Analyze an invoice using Gemini Vision API
 * @param {string} pdfPath - Path to the PDF file
 * @param {Object} config - Configuration object
 * @param {Object} options - Additional options
 * @param {string} options.apiKey - Optional API key (uses default if not provided)
 * @param {string} options.model - Optional model name (uses config.model or default if not provided)
 * @returns {Promise<Object>} The analysis result with token usage
 */
async function analyzeInvoice(pdfPath, config, options = {}) {
    const { apiKey } = options;
    const modelName = options.model || config.model || DEFAULT_MODEL;
    const model = getGenAI(apiKey).getGenerativeModel({ model: modelName });
    const pdfBase64 = await pdfToBase64(pdfPath);

    const prompt = buildExtractionPrompt(config);
    const useJsonMode = config.extraction?.useJsonMode && !config.rawPrompt;

    const result = await model.generateContent({
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: pdfBase64
                        }
                    },
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            temperature: 0,
            ...(useJsonMode && { responseMimeType: 'application/json' })
        }
    });

    const response = await result.response;
    const text = response.text();

    // Extract token usage from response
    const usageMetadata = response.usageMetadata || {};
    const tokenUsage = {
        promptTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0
    };

    try {
        const analysis = parseGeminiResponse(text, { useJsonMode });
        const validatedAnalysis = validateAnalysis(analysis, config);

        return {
            ...validatedAnalysis,
            _tokenUsage: tokenUsage
        };
    } catch (parseError) {
        // Attach raw response to parsing errors for debugging
        const MAX_RAW_RESPONSE_LENGTH = 5120;
        parseError._rawResponse = text.length > MAX_RAW_RESPONSE_LENGTH ? text.slice(0, MAX_RAW_RESPONSE_LENGTH) : text;
        parseError._tokenUsage = tokenUsage;
        throw parseError;
    }
}

/**
 * Sanitize text for PDF rendering (WinAnsi encoding)
 * Replaces characters that cannot be encoded in WinAnsi with ASCII equivalents
 * @param {string} text - The text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeTextForPdf(text) {
    if (!text) return '';

    // Replace common problematic characters
    return (
        String(text)
            // Greek letters
            .replace(/[Α-Ωα-ω]/g, '')
            // Cyrillic
            .replace(/[\u0400-\u04FF]/g, '')
            // Chinese/Japanese/Korean
            .replace(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g, '')
            // Other non-Latin characters - keep only printable ASCII and extended Latin
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
            // Normalize multiple spaces
            .replace(/\s+/g, ' ')
            .trim()
    );
}

/**
 * Add a summary page to a PDF document
 * @param {string} inputPath - Path to the input PDF
 * @param {string} outputPath - Path to save the output PDF
 * @param {Object} analysis - The analysis data to include
 * @param {Object} config - Configuration object
 */
async function addSummaryToPdf(inputPath, outputPath, analysis, config) {
    const existingPdfBytes = await fs.readFile(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const fontSize = 12;
    const titleFontSize = 16;
    const margin = 50;
    let yPosition = height - margin;

    // Title - show PRIVATE badge if applicable (check unified tags first, then legacy)
    const isPrivate = (analysis.tags && analysis.tags.private) || analysis.isPrivate;
    const titleText = isPrivate ? 'Invoice Analysis Summary [PRIVATE]' : 'Invoice Analysis Summary';
    page.drawText(titleText, {
        x: margin,
        y: yPosition,
        size: titleFontSize,
        font: boldFont,
        color: isPrivate ? rgb(0.8, 0, 0) : rgb(0, 0, 0.5)
    });

    yPosition -= 40;

    // Tags section
    const tagDefinitions = config.tagDefinitions;
    if (tagDefinitions && analysis.tags) {
        const pdfTags = tagDefinitions.filter((t) => t.enabled && analysis.tags[t.id]);
        if (pdfTags.length > 0) {
            page.drawText('Tags:', {
                x: margin,
                y: yPosition,
                size: fontSize,
                font: boldFont,
                color: rgb(0, 0, 0)
            });

            const tagLabels = sanitizeTextForPdf(pdfTags.map((t) => t.label).join(', '));
            page.drawText(tagLabels, {
                x: margin + 120,
                y: yPosition,
                size: fontSize,
                font: font,
                color: rgb(0.2, 0.4, 0.6)
            });

            yPosition -= 25;
        }
    }

    // Build details from configured fields
    // Types handled separately (rendered above or in title)
    const skipTypes = ['array', 'boolean'];

    const fieldDefinitions = config.fieldDefinitions;
    const fieldEntries = fieldDefinitions.filter((f) => f.enabled && !skipTypes.includes(f.type));

    for (const field of fieldEntries) {
        const key = field.key;
        const label = `${field.label}:`;
        let value;

        // Format dates for display
        if (field.type === 'date') {
            value = sanitizeTextForPdf(formatDateForDisplay(analysis[key]));
        } else {
            value = sanitizeTextForPdf(analysis[key] !== undefined ? String(analysis[key]) : 'N/A');
        }

        page.drawText(label, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });

        page.drawText(value, {
            x: margin + 120,
            y: yPosition,
            size: fontSize,
            font: font,
            color: rgb(0, 0, 0)
        });

        yPosition -= 25;
    }

    // Summary section (if included)
    if (config.output && config.output.includeSummary && analysis.summary) {
        yPosition -= 15;
        page.drawText('Summary:', {
            x: margin,
            y: yPosition,
            size: fontSize,
            font: boldFont,
            color: rgb(0, 0, 0)
        });

        yPosition -= 20;

        // Word wrap the summary (sanitized for PDF)
        const maxWidth = width - 2 * margin;
        const sanitizedSummary = sanitizeTextForPdf(analysis.summary);
        const words = sanitizedSummary.split(' ');
        let line = '';

        for (const word of words) {
            const testLine = line + word + ' ';
            const testWidth = font.widthOfTextAtSize(testLine, fontSize);

            if (testWidth > maxWidth && line !== '') {
                page.drawText(line, {
                    x: margin,
                    y: yPosition,
                    size: fontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });
                line = word + ' ';
                yPosition -= 20;
            } else {
                line = testLine;
            }
        }

        if (line !== '') {
            page.drawText(line, {
                x: margin,
                y: yPosition,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);
}

/**
 * Process a single invoice: analyze, add summary, save to output, move original
 * @param {string} inputPath - Path to the input PDF
 * @param {Object} config - Configuration object
 * @param {Object} options - Additional options
 * @param {Function} options.onProgress - Progress callback
 * @param {string} options.apiKey - Optional API key (uses default if not provided)
 * @param {boolean} options.dryRun - If true, skip file moves and PDF enrichment
 * @returns {Promise<Object>} Processing result
 */
async function processInvoice(inputPath, config, options = {}) {
    const { onProgress, apiKey, dryRun } = options;
    const filename = path.basename(inputPath);

    try {
        if (onProgress) {
            onProgress({ status: 'analyzing', filename });
        }

        // Analyze the invoice
        const analysisWithTokens = await analyzeInvoice(inputPath, config, { apiKey });

        // Extract token usage and remove from analysis object
        const tokenUsage = analysisWithTokens._tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
        const { _tokenUsage, ...analysis } = analysisWithTokens;

        if (onProgress) {
            onProgress({ status: 'generating', filename, analysis });
        }

        // Generate output filename
        const outputFilename = generateFormattedFilename(config.output.filenameTemplate, analysis, config);

        // Determine output folder (multi-client uses processedEnriched, single-client uses output)
        const outputFolder = config.folders.processedEnriched || config.folders.output;

        // Ensure unique filename
        const uniqueFilename = await getUniqueFilename(outputFolder, outputFilename);

        const outputPath = path.join(outputFolder, uniqueFilename);

        // Dry-run: skip file system changes (PDF enrichment, file moves)
        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                originalFilename: filename,
                outputFilename: uniqueFilename,
                analysis,
                tokenUsage
            };
        }

        if (onProgress) {
            onProgress({ status: 'saving', filename, outputFilename: uniqueFilename });
        }

        // Add summary page and save to output
        await addSummaryToPdf(inputPath, outputPath, analysis, config);

        // Move original (multi-client uses processedOriginal, single-client uses analyzed)
        const originalDestFolder = config.folders.processedOriginal || config.folders.analyzed;
        const originalDestPath = path.join(originalDestFolder, filename);
        await fs.rename(inputPath, originalDestPath);

        return {
            success: true,
            originalFilename: filename,
            outputFilename: uniqueFilename,
            outputPath,
            originalDestPath,
            // Keep analyzedPath for backward compatibility
            analyzedPath: originalDestPath,
            analysis,
            tokenUsage
        };
    } catch (error) {
        // Tag rate-limit errors so parallel-processor can use longer backoff
        if (
            error.message &&
            (error.message.includes('429') ||
                error.message.includes('RATE_LIMIT') ||
                error.message.includes('Resource has been exhausted'))
        ) {
            error.isRateLimited = true;
        }

        return {
            success: false,
            originalFilename: filename,
            error: error.message,
            isRateLimited: error.isRateLimited || false,
            rawResponse: error._rawResponse || null,
            tokenUsage: error._tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
        };
    }
}

/**
 * Get all PDF files from the input directory
 * @param {Object} config - Configuration object
 * @returns {Promise<string[]>} Array of PDF file paths
 */
async function getPdfFiles(config) {
    // Multi-client uses base folder, single-client uses input folder
    const inputFolder = config.folders.base || config.folders.input;
    const files = await fs.readdir(inputFolder);
    return files.filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(inputFolder, f));
}

module.exports = {
    pdfToBase64,
    analyzeInvoice,
    addSummaryToPdf,
    processInvoice,
    getPdfFiles,
    clearGenAICache
};
