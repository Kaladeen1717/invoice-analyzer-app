// Processing Results Viewer module
// Shows processing history for a client with filtering, pagination, expandable detail rows, and retry.

import { showAlert } from './ui-utils.js';

const PAGE_SIZE = 25;

let resultsViewerEl, resultsCountEl, resultsFiltersEl;
let retryAllBtn;
let currentClientId = null;
let currentFilter = 'all';
let currentOffset = 0;
let currentTotal = 0;
let loadedResults = [];
let isRetrying = false;

export function initResultsViewer() {
    resultsViewerEl = document.getElementById('resultsViewer');
    resultsCountEl = document.getElementById('resultsCount');
    resultsFiltersEl = document.getElementById('resultsFilters');
    retryAllBtn = document.getElementById('retryAllFailedBtn');

    resultsFiltersEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-filter]');
        if (!btn) return;

        currentFilter = btn.dataset.filter;
        resultsFiltersEl.querySelectorAll('.btn-filter').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        currentOffset = 0;
        loadedResults = [];
        loadResults();
    });

    retryAllBtn.addEventListener('click', () => retryAllFailed());
}

export async function loadClientResults(clientId) {
    currentClientId = clientId;
    currentFilter = 'all';
    currentOffset = 0;
    loadedResults = [];

    resultsFiltersEl.querySelectorAll('.btn-filter').forEach((b) => b.classList.remove('active'));
    resultsFiltersEl.querySelector('[data-filter="all"]').classList.add('active');

    await loadResults();
}

export function clearResults() {
    currentClientId = null;
    loadedResults = [];
    resultsCountEl.textContent = '';
    resultsViewerEl.textContent = '';
    retryAllBtn.style.display = 'none';
}

async function loadResults() {
    if (!currentClientId) return;

    resultsViewerEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'loading-placeholder';
    loading.textContent = 'Loading results...';
    resultsViewerEl.appendChild(loading);

    try {
        const params = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(currentOffset)
        });
        if (currentFilter !== 'all') {
            params.set('status', currentFilter);
        }

        const response = await fetch(`/api/clients/${currentClientId}/results?${params}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to load results');
        }

        const data = await response.json();

        if (currentOffset === 0) {
            loadedResults = data.results;
        } else {
            loadedResults = loadedResults.concat(data.results);
        }

        currentTotal = data.total;
        resultsCountEl.textContent = data.total > 0 ? `(${data.total})` : '';

        // Show/hide Retry All Failed button
        const hasFailed = loadedResults.some((r) => r.status === 'failed');
        retryAllBtn.style.display = hasFailed ? 'inline-flex' : 'none';

        renderResults(data.hasMore);
    } catch (error) {
        resultsViewerEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load results: ' + error.message;
        resultsViewerEl.appendChild(errDiv);
    }
}

function renderResults(hasMore) {
    resultsViewerEl.textContent = '';

    if (loadedResults.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-placeholder';
        empty.textContent = 'No processing results yet. Process invoices to see results here.';
        resultsViewerEl.appendChild(empty);
        return;
    }

    const table = document.createElement('table');
    table.className = 'results-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Filename', 'Date', 'Status', 'Model', 'Tokens'].forEach((text) => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    loadedResults.forEach((result) => {
        const tr = document.createElement('tr');
        tr.className = 'results-row';
        tr.dataset.resultId = result.id;

        // Filename
        const tdFile = document.createElement('td');
        tdFile.className = 'results-filename';
        tdFile.textContent = result.originalFilename;
        tdFile.title = result.originalFilename;
        tr.appendChild(tdFile);

        // Date
        const tdDate = document.createElement('td');
        tdDate.className = 'results-date';
        tdDate.textContent = formatTimestamp(result.timestamp);
        tr.appendChild(tdDate);

        // Status
        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        const statusClass =
            result.status === 'success'
                ? 'status-success'
                : result.status === 'dry-run'
                  ? 'status-dry-run'
                  : 'status-failed';
        const statusLabel =
            result.status === 'success' ? 'Success' : result.status === 'dry-run' ? 'Dry Run' : 'Failed';
        badge.className = 'status-badge ' + statusClass;
        badge.textContent = statusLabel;
        tdStatus.appendChild(badge);
        tr.appendChild(tdStatus);

        // Model
        const tdModel = document.createElement('td');
        tdModel.className = 'results-model';
        tdModel.textContent = result.model || '-';
        tr.appendChild(tdModel);

        // Tokens
        const tdTokens = document.createElement('td');
        tdTokens.className = 'results-tokens';
        tdTokens.textContent = formatTokens(result.tokenUsage?.totalTokens || 0);
        tr.appendChild(tdTokens);

        tr.addEventListener('click', () => toggleDetail(tr, result));

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    resultsViewerEl.appendChild(table);

    if (hasMore) {
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.className = 'btn btn-secondary btn-load-more';
        loadMoreBtn.textContent = `Load More (${loadedResults.length} of ${currentTotal})`;
        loadMoreBtn.addEventListener('click', () => {
            currentOffset += PAGE_SIZE;
            loadResults();
        });
        resultsViewerEl.appendChild(loadMoreBtn);
    }
}

function toggleDetail(tr, result) {
    const existing = tr.nextElementSibling;
    if (existing && existing.classList.contains('results-detail-row')) {
        existing.remove();
        tr.classList.remove('expanded');
        return;
    }

    const table = tr.closest('table');
    table.querySelectorAll('.results-detail-row').forEach((r) => r.remove());
    table.querySelectorAll('.results-row.expanded').forEach((r) => r.classList.remove('expanded'));

    tr.classList.add('expanded');

    const detailTr = document.createElement('tr');
    detailTr.className = 'results-detail-row';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 5;

    const content = document.createElement('div');
    content.className = 'results-detail-content';

    if (result.status === 'success' || result.status === 'dry-run') {
        renderSuccessDetail(content, result);
    } else {
        renderFailedDetail(content, result);
    }

    detailTd.appendChild(content);
    detailTr.appendChild(detailTd);
    tr.after(detailTr);
}

function renderSuccessDetail(content, result) {
    if (result.outputFilename) {
        appendDetailField(content, 'Output File:', result.outputFilename);
    }
    if (result.duration) {
        appendDetailField(content, 'Duration:', (result.duration / 1000).toFixed(1) + 's');
    }
    if (result.tokenUsage) {
        let tokenText = `${result.tokenUsage.promptTokens} prompt + ${result.tokenUsage.outputTokens} output = ${result.tokenUsage.totalTokens} total`;
        const extras = [];
        if (result.tokenUsage.cachedTokens > 0) {
            extras.push(`${result.tokenUsage.cachedTokens} cached`);
        }
        if (result.tokenUsage.thoughtsTokens > 0) {
            extras.push(`${result.tokenUsage.thoughtsTokens} thinking`);
        }
        if (extras.length > 0) {
            tokenText += ` (${extras.join(', ')})`;
        }
        appendDetailField(content, 'Tokens:', tokenText);
    }

    // Extracted fields
    const fields = result.extractedFields || {};
    const fieldEntries = Object.entries(fields).filter(([k]) => k !== 'tags');
    if (fieldEntries.length > 0) {
        const h4 = document.createElement('h4');
        h4.textContent = 'Extracted Fields';
        content.appendChild(h4);

        const fieldTable = document.createElement('table');
        fieldTable.className = 'results-fields-table';
        fieldEntries.forEach(([key, value]) => {
            const row = document.createElement('tr');
            const keyTd = document.createElement('td');
            keyTd.className = 'results-field-key';
            keyTd.textContent = key;
            const valTd = document.createElement('td');
            valTd.textContent = Array.isArray(value) ? value.join(', ') : String(value);
            row.appendChild(keyTd);
            row.appendChild(valTd);
            fieldTable.appendChild(row);
        });
        content.appendChild(fieldTable);
    }

    // Tags
    const tags = result.tags || {};
    const tagEntries = Object.entries(tags);
    if (tagEntries.length > 0) {
        const h4 = document.createElement('h4');
        h4.textContent = 'Tags';
        content.appendChild(h4);

        const tagList = document.createElement('div');
        tagList.className = 'results-tag-list';
        tagEntries.forEach(([key, value]) => {
            const tag = document.createElement('span');
            tag.className = 'results-tag ' + (value ? 'tag-active' : 'tag-inactive');
            tag.textContent = key + ': ' + (value ? 'Yes' : 'No');
            tagList.appendChild(tag);
        });
        content.appendChild(tagList);
    }
}

function renderFailedDetail(content, result) {
    const errDiv = document.createElement('div');
    errDiv.className = 'results-error';
    const errLabel = document.createElement('span');
    errLabel.className = 'results-detail-label';
    errLabel.textContent = 'Error:';
    const errValue = document.createElement('span');
    errValue.className = 'results-error-message';
    errValue.textContent = result.error || 'Unknown error';
    errDiv.appendChild(errLabel);
    errDiv.appendChild(errValue);
    content.appendChild(errDiv);

    if (result.duration) {
        appendDetailField(content, 'Duration:', (result.duration / 1000).toFixed(1) + 's');
    }

    // Raw response (expandable)
    if (result.rawResponse) {
        const rawToggle = document.createElement('button');
        rawToggle.className = 'btn btn-small btn-secondary';
        rawToggle.textContent = 'Show Raw Response';
        rawToggle.style.marginTop = '0.75rem';

        const rawPre = document.createElement('pre');
        rawPre.className = 'raw-response';
        rawPre.style.display = 'none';
        rawPre.textContent = result.rawResponse;

        rawToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const visible = rawPre.style.display !== 'none';
            rawPre.style.display = visible ? 'none' : 'block';
            rawToggle.textContent = visible ? 'Show Raw Response' : 'Hide Raw Response';
        });

        content.appendChild(rawToggle);
        content.appendChild(rawPre);
    }

    // Retry button
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-small btn-primary retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.style.marginTop = '0.75rem';
    retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        retrySingle(result.id, retryBtn);
    });
    content.appendChild(retryBtn);
}

function appendDetailField(container, label, value) {
    const div = document.createElement('div');
    div.className = 'results-detail-field';
    const lbl = document.createElement('span');
    lbl.className = 'results-detail-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    container.appendChild(div);
}

// --- Retry Logic ---

async function retrySingle(resultId, btn) {
    if (isRetrying) {
        showAlert('A retry is already in progress', 'warning');
        return;
    }
    isRetrying = true;
    btn.disabled = true;
    btn.textContent = 'Retrying...';

    try {
        await executeRetry({ resultIds: [resultId] });
        showAlert('Retry complete', 'success');
    } catch (error) {
        showAlert('Retry failed: ' + error.message, 'error');
    } finally {
        isRetrying = false;
        // Reload results to reflect changes
        currentOffset = 0;
        loadedResults = [];
        await loadResults();
    }
}

async function retryAllFailed() {
    if (isRetrying) {
        showAlert('A retry is already in progress', 'warning');
        return;
    }
    isRetrying = true;
    retryAllBtn.disabled = true;
    retryAllBtn.textContent = 'Retrying...';

    try {
        await executeRetry({ all: true });
        showAlert('Retry all complete', 'success');
    } catch (error) {
        showAlert('Retry failed: ' + error.message, 'error');
    } finally {
        isRetrying = false;
        retryAllBtn.disabled = false;
        retryAllBtn.textContent = 'Retry All Failed';
        // Reload results to reflect changes
        currentOffset = 0;
        loadedResults = [];
        await loadResults();
    }
}

async function executeRetry(body) {
    return new Promise((resolve, reject) => {
        fetch(`/api/clients/${currentClientId}/results/retry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
            .then(async (response) => {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                handleRetryUpdate(data);

                                if (data.status === 'retry-done') {
                                    resolve(data);
                                    return;
                                }
                                if (data.status === 'error') {
                                    reject(new Error(data.error));
                                    return;
                                }
                            } catch {
                                // Ignore parse errors
                            }
                        }
                    }
                }
                resolve();
            })
            .catch(reject);
    });
}

function handleRetryUpdate(data) {
    switch (data.status) {
        case 'retry-starting':
            retryAllBtn.textContent = `Retrying 0/${data.total}...`;
            break;
        case 'retry-processing':
            retryAllBtn.textContent = `Retrying ${data.current}/${data.total}...`;
            break;
        case 'retry-completed':
        case 'retry-failed':
            retryAllBtn.textContent = `Retrying ${data.current}/${data.total}...`;
            break;
        case 'retry-done':
            if (data.failed === 0) {
                showAlert(`Retried ${data.total}: all succeeded`, 'success');
            } else {
                showAlert(`Retried ${data.total}: ${data.success} succeeded, ${data.failed} failed`, 'warning');
            }
            break;
    }
}

function formatTimestamp(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return (
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    );
}

function formatTokens(total) {
    if (!total || total === 0) return '-';
    if (total >= 1000000) return (total / 1000000).toFixed(1) + 'M';
    if (total >= 1000) return (total / 1000).toFixed(1) + 'K';
    return String(total);
}
