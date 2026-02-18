/**
 * Processing result storage — persists per-file results to processing-results.json
 * in each client's folder for history, retry, and statistics features.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const RESULTS_FILENAME = 'processing-results.json';

/**
 * Read the results file for a client folder, or return empty structure if missing.
 * @param {string} folderPath - The client's base folder path
 * @returns {Promise<Object>} The results data { results: [], lastUpdated }
 */
async function readResultsFile(folderPath) {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { results: [], lastUpdated: null };
    }
}

/**
 * Write the results file atomically (write to temp, then rename).
 * @param {string} folderPath - The client's base folder path
 * @param {Object} data - The full results data to write
 */
async function writeResultsFile(folderPath, data) {
    const filePath = path.join(folderPath, RESULTS_FILENAME);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fs.rename(tmpPath, filePath);
}

/**
 * Append a single processing result to the client's results file.
 * @param {string} folderPath - The client's base folder path
 * @param {Object} result - The processing result from the pipeline
 * @param {Object} options - Additional metadata
 * @param {string} options.model - The model used for processing
 * @param {number} options.duration - Processing duration in ms
 * @returns {Promise<Object>} The stored result record
 */
async function appendResult(folderPath, result, options = {}) {
    const data = await readResultsFile(folderPath);
    const now = new Date().toISOString();

    const record = {
        id: crypto.randomUUID(),
        originalFilename: result.originalFilename,
        outputFilename: result.outputFilename || null,
        status: result.success ? 'success' : 'failed',
        model: options.model || null,
        extractedFields: result.success ? result.analysis || {} : {},
        tags: result.success && result.analysis ? result.analysis.tags || {} : {},
        tokenUsage: result.tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
        timestamp: now,
        error: result.error || null,
        duration: options.duration || null
    };

    data.results.push(record);
    data.lastUpdated = now;

    await writeResultsFile(folderPath, data);
    return record;
}

/**
 * Get results with optional filtering and pagination.
 * @param {string} folderPath - The client's base folder path
 * @param {Object} options - Query options
 * @param {string} [options.status] - Filter by status ("success" or "failed")
 * @param {number} [options.limit=50] - Max results to return
 * @param {number} [options.offset=0] - Skip this many results
 * @returns {Promise<Object>} { results, total, hasMore }
 */
async function getResults(folderPath, options = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const data = await readResultsFile(folderPath);

    // Sort newest first
    let filtered = data.results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (status) {
        filtered = filtered.filter((r) => r.status === status);
    }

    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return {
        results: paged,
        total,
        hasMore: offset + limit < total
    };
}

/**
 * Get a single result by ID.
 * @param {string} folderPath - The client's base folder path
 * @param {string} id - The result ID
 * @returns {Promise<Object|null>} The result record or null
 */
async function getResult(folderPath, id) {
    const data = await readResultsFile(folderPath);
    return data.results.find((r) => r.id === id) || null;
}

/**
 * Get aggregate statistics for a client's processing history.
 * @param {string} folderPath - The client's base folder path
 * @returns {Promise<Object>} Summary stats
 */
async function getSummary(folderPath) {
    const data = await readResultsFile(folderPath);
    const results = data.results;

    if (results.length === 0) {
        return {
            total: 0,
            success: 0,
            failed: 0,
            successRate: 0,
            tokenUsage: { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
            firstProcessed: null,
            lastProcessed: null
        };
    }

    const success = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    const tokenUsage = results.reduce(
        (acc, r) => {
            const usage = r.tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
            return {
                promptTokens: acc.promptTokens + usage.promptTokens,
                outputTokens: acc.outputTokens + usage.outputTokens,
                totalTokens: acc.totalTokens + usage.totalTokens
            };
        },
        { promptTokens: 0, outputTokens: 0, totalTokens: 0 }
    );

    const timestamps = results.map((r) => r.timestamp).sort();

    return {
        total: results.length,
        success,
        failed,
        successRate: Math.round((success / results.length) * 100),
        tokenUsage,
        firstProcessed: timestamps[0],
        lastProcessed: timestamps[timestamps.length - 1]
    };
}

/**
 * Replace a result entry by ID with a new processing outcome.
 * Used by retry to update failed results with new success/failure.
 * @param {string} folderPath - The client's base folder path
 * @param {string} id - The result ID to replace
 * @param {Object} result - The new processing result
 * @param {Object} options - Additional metadata (model, duration)
 * @returns {Promise<Object>} The updated result record
 */
async function updateResult(folderPath, id, result, options = {}) {
    const data = await readResultsFile(folderPath);
    const index = data.results.findIndex((r) => r.id === id);
    if (index === -1) throw new Error(`Result ${id} not found`);

    const now = new Date().toISOString();
    const record = {
        id,
        originalFilename: result.originalFilename,
        outputFilename: result.outputFilename || null,
        status: result.success ? 'success' : 'failed',
        model: options.model || data.results[index].model,
        extractedFields: result.success ? result.analysis || {} : {},
        tags: result.success && result.analysis ? result.analysis.tags || {} : {},
        tokenUsage: result.tokenUsage || { promptTokens: 0, outputTokens: 0, totalTokens: 0 },
        timestamp: now,
        error: result.error || null,
        duration: options.duration || null,
        retriedFrom: data.results[index].timestamp
    };

    data.results[index] = record;
    data.lastUpdated = now;

    await writeResultsFile(folderPath, data);
    return record;
}

/**
 * Get all failed result entries (for retry-all).
 * @param {string} folderPath - The client's base folder path
 * @returns {Promise<Object[]>} Array of failed result records
 */
async function getFailedResults(folderPath) {
    const data = await readResultsFile(folderPath);
    return data.results.filter((r) => r.status === 'failed');
}

module.exports = {
    appendResult,
    getResults,
    getResult,
    getSummary,
    updateResult,
    getFailedResults,
    RESULTS_FILENAME
};
