/**
 * Shared processing logic for invoice analysis
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { buildExtractionPrompt, parseGeminiResponse, validateAnalysis } from './prompt-builder.js';
import { generateFormattedFilename, getUniqueFilename, formatDateForDisplay } from './filename-generator.js';
import { DEFAULT_MODEL } from './constants.js';

import type {
    AppConfig,
    InvoiceAnalysis,
    ProcessingResult,
    ProcessingSuccess,
    ProcessingFailure,
    TokenUsage,
    OnProgressCallback
} from './types/index.js';

// Cache for Gemini AI instances per API key
const genAICache = new Map<string, GoogleGenerativeAI>();

/**
 * Get or create a Gemini AI instance for the given API key
 * @param apiKey - The API key to use
 * @returns The Gemini AI instance
 */
function getGenAI(apiKey: string | null = null): GoogleGenerativeAI {
    const key = apiKey || process.env.GEMINI_API_KEY;

    if (!key) {
        throw new Error('GEMINI_API_KEY not configured in environment');
    }

    if (!genAICache.has(key)) {
        genAICache.set(key, new GoogleGenerativeAI(key));
    }

    return genAICache.get(key)!;
}

/**
 * Clear the Gemini AI cache (useful for testing)
 */
export function clearGenAICache(): void {
    genAICache.clear();
}

/**
 * Convert PDF file to base64
 * @param filePath - Path to the PDF file
 * @returns Base64 encoded PDF
 */
export async function pdfToBase64(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    return buffer.toString('base64');
}

interface AnalyzeOptions {
    apiKey?: string;
    model?: string;
}

/**
 * Analyze an invoice using Gemini Vision API
 * @param pdfPath - Path to the PDF file
 * @param config - Configuration object
 * @param options - Additional options
 * @returns The analysis result with token usage
 */
export async function analyzeInvoice(
    pdfPath: string,
    config: AppConfig,
    options: AnalyzeOptions = {}
): Promise<InvoiceAnalysis> {
    const { apiKey } = options;
    const modelName = options.model || config.model || DEFAULT_MODEL;
    const model = getGenAI(apiKey || null).getGenerativeModel({ model: modelName });
    const pdfBase64 = await pdfToBase64(pdfPath);

    const prompt = buildExtractionPrompt(config);
    const extraction = (config as unknown as Record<string, unknown>).extraction as
        | { useJsonMode?: boolean }
        | undefined;
    const useJsonMode = extraction?.useJsonMode && !config.rawPrompt;

    const result = await model.generateContent({
        systemInstruction: prompt,
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        inlineData: {
                            mimeType: 'application/pdf',
                            data: pdfBase64
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0,
            ...(useJsonMode && { responseMimeType: 'application/json' }),
            // Gemini 3 uses thinkingLevel (not thinkingBudget). 'low' balances cost/speed
            // with safety margin for complex extractions. See INV-69 for analysis.
            thinkingConfig: { thinkingLevel: 'low' }
        } as Record<string, unknown>
    });

    const response = await result.response;
    const text = response.text();

    // Extract token usage from response
    const usageMetadata = response.usageMetadata || {};
    const tokenUsage: TokenUsage = {
        promptTokens: (usageMetadata as Record<string, number>).promptTokenCount || 0,
        outputTokens: (usageMetadata as Record<string, number>).candidatesTokenCount || 0,
        totalTokens: (usageMetadata as Record<string, number>).totalTokenCount || 0,
        cachedTokens: (usageMetadata as Record<string, number>).cachedContentTokenCount || 0,
        thoughtsTokens: (usageMetadata as Record<string, number>).thoughtsTokenCount || 0
    };

    try {
        const analysis = parseGeminiResponse(text, { useJsonMode: useJsonMode || false });
        const validatedAnalysis = validateAnalysis(analysis, config);

        return {
            ...validatedAnalysis,
            _tokenUsage: tokenUsage
        };
    } catch (parseError: unknown) {
        // Attach raw response to parsing errors for debugging
        const MAX_RAW_RESPONSE_LENGTH = 5120;
        (parseError as Record<string, unknown>)._rawResponse =
            text.length > MAX_RAW_RESPONSE_LENGTH ? text.slice(0, MAX_RAW_RESPONSE_LENGTH) : text;
        (parseError as Record<string, unknown>)._tokenUsage = tokenUsage;
        throw parseError;
    }
}

/**
 * Sanitize text for PDF rendering (WinAnsi encoding)
 * Replaces characters that cannot be encoded in WinAnsi with ASCII equivalents
 * @param text - The text to sanitize
 * @returns Sanitized text
 */
function sanitizeTextForPdf(text: unknown): string {
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
 * @param inputPath - Path to the input PDF
 * @param outputPath - Path to save the output PDF
 * @param analysis - The analysis data to include
 * @param config - Configuration object
 */
export async function addSummaryToPdf(
    inputPath: string,
    outputPath: string,
    analysis: InvoiceAnalysis,
    config: AppConfig
): Promise<void> {
    const existingPdfBytes = await fs.promises.readFile(inputPath);
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
        const pdfTags = tagDefinitions.filter((t) => t.enabled && analysis.tags![t.id]);
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

    const fieldDefinitions = config.fieldDefinitions!;
    const fieldEntries = fieldDefinitions.filter((f) => f.enabled && !skipTypes.includes(f.type));

    for (const field of fieldEntries) {
        const key = field.key;
        const label = `${field.label}:`;
        let value: string;

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
    await fs.promises.writeFile(outputPath, pdfBytes);
}

interface ProcessInvoiceOptions {
    onProgress?: OnProgressCallback;
    apiKey?: string;
    dryRun?: boolean;
}

interface ProcessingConfigFolders {
    base?: string;
    input?: string;
    output?: string;
    analyzed?: string;
    processedOriginal?: string;
    processedEnriched?: string;
    csvPath?: string;
}

/**
 * Process a single invoice: analyze, add summary, save to output, move original
 * @param inputPath - Path to the input PDF
 * @param config - Configuration object
 * @param options - Additional options
 * @returns Processing result
 */
export async function processInvoice(
    inputPath: string,
    config: AppConfig,
    options: ProcessInvoiceOptions = {}
): Promise<ProcessingResult> {
    const { onProgress, apiKey, dryRun } = options;
    const filename = path.basename(inputPath);
    const folders = config.folders as unknown as ProcessingConfigFolders;

    try {
        if (onProgress) {
            onProgress({ status: 'analyzing', filename });
        }

        // Analyze the invoice
        const analysisWithTokens = await analyzeInvoice(inputPath, config, { apiKey });

        // Extract token usage and remove from analysis object
        const tokenUsage: TokenUsage = analysisWithTokens._tokenUsage || {
            promptTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
            thoughtsTokens: 0
        };
        const { _tokenUsage, ...analysis } = analysisWithTokens;

        if (onProgress) {
            onProgress({ status: 'generating', filename, analysis });
        }

        // Generate output filename
        const outputFilename = generateFormattedFilename(config.output.filenameTemplate, analysis, config);

        // Determine output folder (multi-client uses processedEnriched, single-client uses output)
        const outputFolder = folders.processedEnriched || folders.output!;

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
            } as ProcessingSuccess;
        }

        if (onProgress) {
            onProgress({ status: 'saving', filename, outputFilename: uniqueFilename });
        }

        // Add summary page and save to output
        await addSummaryToPdf(inputPath, outputPath, analysis as InvoiceAnalysis, config);

        // Move original (multi-client uses processedOriginal, single-client uses analyzed)
        const originalDestFolder = folders.processedOriginal || folders.analyzed!;
        const originalDestPath = path.join(originalDestFolder, filename);
        await fs.promises.rename(inputPath, originalDestPath);

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
        } as ProcessingSuccess;
    } catch (error: unknown) {
        const err = error as Error & { isRateLimited?: boolean; _rawResponse?: string; _tokenUsage?: TokenUsage };
        // Tag rate-limit errors so parallel-processor can use longer backoff
        if (
            err.message &&
            (err.message.includes('429') ||
                err.message.includes('RATE_LIMIT') ||
                err.message.includes('Resource has been exhausted'))
        ) {
            err.isRateLimited = true;
        }

        return {
            success: false,
            originalFilename: filename,
            error: err.message,
            isRateLimited: err.isRateLimited || false,
            rawResponse: err._rawResponse || null,
            tokenUsage: err._tokenUsage || {
                promptTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                cachedTokens: 0,
                thoughtsTokens: 0
            }
        } as ProcessingFailure;
    }
}

/**
 * Get all PDF files from the input directory
 * @param config - Configuration object
 * @returns Array of PDF file paths
 */
export async function getPdfFiles(config: AppConfig): Promise<string[]> {
    const folders = config.folders as unknown as ProcessingConfigFolders;
    // Multi-client uses base folder, single-client uses input folder
    const inputFolder = folders.base || folders.input!;
    const files = await fs.promises.readdir(inputFolder);
    return files.filter((f) => f.toLowerCase().endsWith('.pdf')).map((f) => path.join(inputFolder, f));
}
