jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    promises: {
        readFile: jest.fn()
    }
}));

jest.mock('@google/generative-ai');
jest.mock('../src/prompt-builder');
jest.mock('../src/filename-generator');

const fs = require('fs').promises;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildExtractionPrompt, parseGeminiResponse, validateAnalysis } = require('../src/prompt-builder');

const { analyzeInvoice, clearGenAICache } = require('../src/processor');

// Shared mock setup
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({ generateContent: mockGenerateContent }));

beforeEach(() => {
    jest.clearAllMocks();
    clearGenAICache();

    GoogleGenerativeAI.mockImplementation(() => ({
        getGenerativeModel: mockGetGenerativeModel
    }));

    fs.readFile.mockResolvedValue(Buffer.from('fake-pdf'));
    buildExtractionPrompt.mockReturnValue('Extract invoice data');
    parseGeminiResponse.mockReturnValue({ supplierName: 'Acme' });
    validateAnalysis.mockImplementation((analysis) => analysis);

    mockGenerateContent.mockResolvedValue({
        response: {
            text: () => '{"supplierName": "Acme"}',
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        }
    });
});

describe('analyzeInvoice', () => {
    describe('JSON mode (responseMimeType)', () => {
        test('includes responseMimeType when extraction.useJsonMode is true', async () => {
            const config = {
                extraction: { useJsonMode: true },
                fieldDefinitions: [],
                tagDefinitions: []
            };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.generationConfig).toEqual({
                temperature: 0,
                responseMimeType: 'application/json'
            });
        });

        test('excludes responseMimeType when extraction.useJsonMode is false', async () => {
            const config = {
                extraction: { useJsonMode: false },
                fieldDefinitions: [],
                tagDefinitions: []
            };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.generationConfig).toEqual({ temperature: 0 });
        });

        test('excludes responseMimeType when extraction section is absent', async () => {
            const config = { fieldDefinitions: [], tagDefinitions: [] };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.generationConfig).toEqual({ temperature: 0 });
        });

        test('bypasses JSON mode when rawPrompt is set', async () => {
            const config = {
                extraction: { useJsonMode: true },
                rawPrompt: 'Custom prompt here',
                fieldDefinitions: [],
                tagDefinitions: []
            };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            const callArgs = mockGenerateContent.mock.calls[0][0];
            expect(callArgs.generationConfig).toEqual({ temperature: 0 });
        });

        test('passes useJsonMode flag to parseGeminiResponse', async () => {
            const config = {
                extraction: { useJsonMode: true },
                fieldDefinitions: [],
                tagDefinitions: []
            };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            expect(parseGeminiResponse).toHaveBeenCalledWith('{"supplierName": "Acme"}', { useJsonMode: true });
        });

        test('passes useJsonMode falsy to parseGeminiResponse when disabled', async () => {
            const config = { fieldDefinitions: [], tagDefinitions: [] };

            await analyzeInvoice('/test.pdf', config, { apiKey: 'test-key' });

            const callArgs = parseGeminiResponse.mock.calls[0];
            expect(callArgs[0]).toBe('{"supplierName": "Acme"}');
            expect(callArgs[1].useJsonMode).toBeFalsy();
        });
    });
});
