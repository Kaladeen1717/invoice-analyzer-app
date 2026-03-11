// Client List module
// Manages client CRUD, rendering, processing (SSE), and the client form/delete modals.

import { showAlert, addLogEntry, clearLog } from './ui-utils.js';
import { exportConfig } from './export-import.js';
import { openClientDetail } from './client-detail.js';

// --- State ---
let clients: Record<string, unknown>[] = [];
let clientStats: Record<string, Record<string, unknown>> = {};
let isProcessing = false;
let editingClientId: string | null = null;
let deleteClientId: string | null = null;

// --- DOM refs (set in init) ---
let clientListEl: HTMLElement;
let processAllBtn: HTMLButtonElement;
let dashboardStatsEl: HTMLElement;
let statTotalProcessedEl: HTMLElement;
let statSuccessRateEl: HTMLElement;
let statTotalTokensEl: HTMLElement;
let statLastProcessedEl: HTMLElement;
let clientModal: HTMLElement;
let modalTitle: HTMLElement;
let clientForm: HTMLFormElement;
let closeModalBtn: HTMLElement;
let cancelFormBtn: HTMLElement;
let deleteClientBtn: HTMLElement;
let saveClientBtn: HTMLButtonElement;
let clientIdInput: HTMLInputElement;
let clientNameInput: HTMLInputElement;
let folderPathInput: HTMLInputElement;
let apiKeyEnvVarInput: HTMLInputElement;
let clientEnabledInput: HTMLInputElement;
let deleteModal: HTMLElement;
let deleteClientName: HTMLElement;
let closeDeleteModalBtn: HTMLElement;
let cancelDeleteBtn: HTMLElement;
let confirmDeleteBtn: HTMLButtonElement;

// --- Public API ---

export function initClientList(): void {
    clientListEl = document.getElementById('clientList')!;
    processAllBtn = document.getElementById('processAllBtn') as HTMLButtonElement;

    dashboardStatsEl = document.getElementById('dashboardStats')!;
    statTotalProcessedEl = document.getElementById('statTotalProcessed')!;
    statSuccessRateEl = document.getElementById('statSuccessRate')!;
    statTotalTokensEl = document.getElementById('statTotalTokens')!;
    statLastProcessedEl = document.getElementById('statLastProcessed')!;

    clientModal = document.getElementById('clientModal')!;
    modalTitle = document.getElementById('modalTitle')!;
    clientForm = document.getElementById('clientForm') as HTMLFormElement;
    closeModalBtn = document.getElementById('closeModalBtn')!;
    cancelFormBtn = document.getElementById('cancelFormBtn')!;
    deleteClientBtn = document.getElementById('deleteClientBtn')!;
    saveClientBtn = document.getElementById('saveClientBtn') as HTMLButtonElement;

    clientIdInput = document.getElementById('clientId') as HTMLInputElement;
    clientNameInput = document.getElementById('clientName') as HTMLInputElement;
    folderPathInput = document.getElementById('folderPath') as HTMLInputElement;
    apiKeyEnvVarInput = document.getElementById('apiKeyEnvVar') as HTMLInputElement;
    clientEnabledInput = document.getElementById('clientEnabled') as HTMLInputElement;

    deleteModal = document.getElementById('deleteModal')!;
    deleteClientName = document.getElementById('deleteClientName')!;
    closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn')!;
    cancelDeleteBtn = document.getElementById('cancelDeleteBtn')!;
    confirmDeleteBtn = document.getElementById('confirmDeleteBtn') as HTMLButtonElement;

    const refreshClientsBtn = document.getElementById('refreshClientsBtn')!;
    const newClientBtn = document.getElementById('newClientBtn')!;
    const clearLogBtn = document.getElementById('clearLogBtn')!;

    // Event listeners
    refreshClientsBtn.addEventListener('click', loadClients);
    newClientBtn.addEventListener('click', () => openClientForm());
    processAllBtn.addEventListener('click', processAllClients);
    clearLogBtn.addEventListener('click', clearLog);

    closeModalBtn.addEventListener('click', closeClientForm);
    cancelFormBtn.addEventListener('click', closeClientForm);
    clientModal.addEventListener('click', (e: MouseEvent) => {
        if (e.target === clientModal) closeClientForm();
    });
    clientForm.addEventListener('submit', saveClient);
    deleteClientBtn.addEventListener('click', showDeleteConfirmation);

    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    deleteModal.addEventListener('click', (e: MouseEvent) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
}

export async function loadClients(): Promise<void> {
    try {
        clientListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading clients...';
        clientListEl.appendChild(loadingDiv);

        const [clientsResponse, statsResponse] = await Promise.all([
            fetch('/api/clients'),
            fetch('/api/stats').catch(() => null)
        ]);

        const data = await clientsResponse.json();

        // Load stats (non-blocking — dashboard works even if stats fail)
        clientStats = {};
        if (statsResponse && statsResponse.ok) {
            const statsData = await statsResponse.json();
            clientStats = statsData.perClient || {};
            renderDashboardStats(statsData.aggregate);
        }

        if (clientsResponse.ok) {
            clients = data.clients || [];
            renderClientList();
            updateProcessAllButton();
        } else {
            clientListEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'error-placeholder';
            errDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
            clientListEl.appendChild(errDiv);
        }
    } catch (error) {
        clientListEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load clients: ' + (error as Error).message;
        clientListEl.appendChild(errDiv);
    }
}

/**
 * Accessors for Escape key handler in app.js.
 */
export function getClientModal(): HTMLElement {
    return clientModal;
}
export function getDeleteModal(): HTMLElement {
    return deleteModal;
}
export function getCloseClientForm(): () => void {
    return closeClientForm;
}
export function getCloseDeleteModal(): () => void {
    return closeDeleteModal;
}

// --- Internal: Client List Rendering ---

function renderClientList(): void {
    if (clients.length === 0) {
        clientListEl.textContent = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-placeholder';
        const p1 = document.createElement('p');
        p1.textContent = 'No clients configured yet.';
        const p2 = document.createElement('p');
        p2.textContent = 'Click "New Client" to add your first client.';
        emptyDiv.appendChild(p1);
        emptyDiv.appendChild(p2);
        clientListEl.appendChild(emptyDiv);
        return;
    }

    clientListEl.textContent = '';

    clients.forEach((client) => {
        const folderStatus = client.folderStatus as Record<string, unknown>;
        const card = document.createElement('div');
        card.className = 'client-card ' + (client.enabled ? 'enabled' : 'disabled');
        card.dataset.clientId = client.clientId as string;
        card.style.cursor = 'pointer';

        // Header
        const header = document.createElement('div');
        header.className = 'client-header';

        const statusDiv = document.createElement('div');
        statusDiv.className = 'client-status';

        const statusIcon = document.createElement('span');
        statusIcon.className = 'status-icon';
        statusIcon.textContent = client.enabled ? '\u25CF' : '\u25CB';
        statusDiv.appendChild(statusIcon);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'client-name';
        nameSpan.textContent = client.name as string;
        statusDiv.appendChild(nameSpan);

        const idSpan = document.createElement('span');
        idSpan.className = 'client-id';
        idSpan.textContent = '(' + (client.clientId as string) + ')';
        statusDiv.appendChild(idSpan);

        header.appendChild(statusDiv);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small btn-secondary edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            openClientForm(client.clientId as string);
        });
        header.appendChild(editBtn);

        card.appendChild(header);

        // Details
        const details = document.createElement('div');
        details.className = 'client-details';

        const folderDiv = document.createElement('div');
        folderDiv.className = 'client-folder';
        const folderLabel = document.createElement('span');
        folderLabel.className = 'label';
        folderLabel.textContent = 'Folder:';
        const folderValue = document.createElement('span');
        folderValue.className = 'value';
        folderValue.textContent = client.folderPath as string;
        folderDiv.appendChild(folderLabel);
        folderDiv.appendChild(folderValue);
        if (!folderStatus.exists) {
            const warn = document.createElement('span');
            warn.className = 'folder-warning';
            warn.title = 'Folder does not exist';
            warn.textContent = 'Folder not found';
            folderDiv.appendChild(warn);
        }
        details.appendChild(folderDiv);

        const statsDiv = document.createElement('div');
        statsDiv.className = 'client-stats';

        const pendingStat = document.createElement('span');
        pendingStat.className = 'stat';
        const pendingVal = document.createElement('span');
        pendingVal.className = 'stat-value';
        pendingVal.textContent = String(folderStatus.inputPdfCount);
        pendingStat.appendChild(pendingVal);
        pendingStat.appendChild(document.createTextNode(' pending'));
        statsDiv.appendChild(pendingStat);

        const sep1 = document.createElement('span');
        sep1.className = 'stat-separator';
        sep1.textContent = '|';
        statsDiv.appendChild(sep1);

        const processedStat = document.createElement('span');
        processedStat.className = 'stat';
        const processedVal = document.createElement('span');
        processedVal.className = 'stat-value';
        processedVal.textContent = String(folderStatus.processedCount);
        processedStat.appendChild(processedVal);
        processedStat.appendChild(document.createTextNode(' processed'));
        statsDiv.appendChild(processedStat);

        const sep2 = document.createElement('span');
        sep2.className = 'stat-separator';
        sep2.textContent = '|';
        statsDiv.appendChild(sep2);

        const enabledStat = document.createElement('span');
        enabledStat.className = 'stat ' + (client.enabled ? 'enabled' : 'disabled');
        enabledStat.textContent = client.enabled ? 'Enabled' : 'Disabled';
        statsDiv.appendChild(enabledStat);

        details.appendChild(statsDiv);

        // Per-client processing stats
        const perClientStats = clientStats[client.clientId as string];
        if (perClientStats) {
            renderClientProcessingStats(details, perClientStats);
        }

        card.appendChild(details);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'client-actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn btn-secondary btn-small export-client-btn';
        exportBtn.title = 'Export client config';
        exportBtn.textContent = 'Export';
        exportBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            exportConfig('client:' + (client.clientId as string));
        });
        actions.appendChild(exportBtn);

        const dryRunBtn = document.createElement('button');
        dryRunBtn.className = 'btn btn-secondary btn-small dry-run-btn';
        dryRunBtn.dataset.clientId = client.clientId as string;
        dryRunBtn.textContent = 'Dry Run';
        dryRunBtn.disabled = (folderStatus.inputPdfCount as number) === 0 || !folderStatus.exists || isProcessing;
        dryRunBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            processClient(client.clientId as string, { dryRun: true });
        });
        actions.appendChild(dryRunBtn);

        const processBtn = document.createElement('button');
        processBtn.className = 'btn btn-primary process-btn';
        processBtn.dataset.clientId = client.clientId as string;
        processBtn.textContent = 'Process';
        processBtn.disabled = (folderStatus.inputPdfCount as number) === 0 || !folderStatus.exists || isProcessing;
        processBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            processClient(client.clientId as string);
        });
        actions.appendChild(processBtn);

        card.appendChild(actions);

        // Click card to open detail view
        card.addEventListener('click', () => openClientDetail(client.clientId as string));

        clientListEl.appendChild(card);
    });
}

function renderDashboardStats(aggregate: Record<string, unknown>): void {
    if (!aggregate || (aggregate.totalProcessed as number) === 0) {
        dashboardStatsEl.style.display = 'none';
        return;
    }

    dashboardStatsEl.style.display = '';
    statTotalProcessedEl.textContent = formatNumber(aggregate.totalProcessed as number);
    statSuccessRateEl.textContent = aggregate.successRate + '%';
    statTotalTokensEl.textContent = formatTokens(aggregate.totalTokens as number);
    statLastProcessedEl.textContent = aggregate.lastProcessed
        ? formatTimestamp(aggregate.lastProcessed as string)
        : '-';
}

function renderClientProcessingStats(container: HTMLElement, stats: Record<string, unknown>): void {
    if (!stats || (stats.total as number) === 0) return;

    const div = document.createElement('div');
    div.className = 'client-processing-stats';

    // Processed count
    const processedStat = document.createElement('span');
    processedStat.className = 'stat';
    const processedVal = document.createElement('span');
    processedVal.className = 'stat-value';
    processedVal.textContent = String(stats.total);
    processedStat.appendChild(processedVal);
    processedStat.appendChild(document.createTextNode(' processed'));
    div.appendChild(processedStat);

    if ((stats.failed as number) > 0) {
        const sep = document.createElement('span');
        sep.className = 'stat-separator';
        sep.textContent = '|';
        div.appendChild(sep);

        const failedStat = document.createElement('span');
        failedStat.className = 'stat';
        const failedVal = document.createElement('span');
        failedVal.className = 'stat-value failed';
        failedVal.textContent = String(stats.failed);
        failedStat.appendChild(failedVal);
        failedStat.appendChild(document.createTextNode(' failed'));
        div.appendChild(failedStat);
    }

    // Success bar
    const barContainer = document.createElement('div');
    barContainer.className = 'success-bar-container';
    barContainer.title = stats.successRate + '% success rate';
    const barFill = document.createElement('div');
    barFill.className = 'success-bar-fill';
    barFill.style.width = stats.successRate + '%';
    barContainer.appendChild(barFill);
    div.appendChild(barContainer);

    container.appendChild(div);
}

function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function formatTokens(total: number): string {
    if (!total || total === 0) return '0';
    if (total >= 1000000) return (total / 1000000).toFixed(1) + 'M';
    if (total >= 1000) return (total / 1000).toFixed(1) + 'K';
    return String(total);
}

function formatTimestamp(ts: string): string {
    if (!ts) return '-';
    const d = new Date(ts);
    return (
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    );
}

function updateProcessAllButton(): void {
    const enabledClientsWithPdfs = clients.filter(
        (c) =>
            c.enabled &&
            (c.folderStatus as Record<string, unknown>).exists &&
            ((c.folderStatus as Record<string, unknown>).inputPdfCount as number) > 0
    );
    processAllBtn.disabled = enabledClientsWithPdfs.length === 0 || isProcessing;
}

// --- Internal: Client Form ---

function openClientForm(clientId: string | null = null): void {
    editingClientId = clientId;

    if (clientId) {
        const client = clients.find((c) => c.clientId === clientId);
        if (!client) {
            showAlert(`Client "${clientId}" not found`, 'error');
            return;
        }

        modalTitle.textContent = 'Edit Client: ' + (client.name as string);
        clientIdInput.value = client.clientId as string;
        clientIdInput.disabled = true;
        clientNameInput.value = client.name as string;
        folderPathInput.value = client.folderPath as string;
        apiKeyEnvVarInput.value = (client.apiKeyEnvVar as string) || '';
        clientEnabledInput.checked = client.enabled as boolean;
        deleteClientBtn.style.display = 'inline-flex';
    } else {
        modalTitle.textContent = 'Create New Client';
        clientForm.reset();
        clientIdInput.disabled = false;
        clientEnabledInput.checked = true;
        deleteClientBtn.style.display = 'none';
    }

    clientModal.classList.add('active');
}

function closeClientForm(): void {
    clientModal.classList.remove('active');
    editingClientId = null;
    clientForm.reset();
}

async function saveClient(e: Event): Promise<void> {
    e.preventDefault();

    const clientData = {
        clientId: clientIdInput.value.trim().toLowerCase(),
        name: clientNameInput.value.trim(),
        folderPath: folderPathInput.value.trim(),
        apiKeyEnvVar: apiKeyEnvVarInput.value.trim() || null,
        enabled: clientEnabledInput.checked
    };

    if (!clientData.clientId) {
        showAlert('Client ID is required', 'error');
        return;
    }
    if (!/^[a-z0-9-]+$/.test(clientData.clientId)) {
        showAlert('Client ID must contain only lowercase letters, numbers, and hyphens', 'error');
        return;
    }
    if (!clientData.name) {
        showAlert('Display name is required', 'error');
        return;
    }
    if (!clientData.folderPath) {
        showAlert('Folder path is required', 'error');
        return;
    }

    try {
        saveClientBtn.disabled = true;
        saveClientBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        saveClientBtn.appendChild(spinner);
        saveClientBtn.appendChild(document.createTextNode(' Saving...'));

        let response: Response;
        if (editingClientId) {
            response = await fetch(`/api/clients/${editingClientId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });
        } else {
            response = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });
        }

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message || 'Client saved successfully', 'success');
            closeClientForm();
            loadClients();
        } else {
            showAlert(result.error || result.details || 'Failed to save client', 'error');
        }
    } catch (error) {
        showAlert('Failed to save client: ' + (error as Error).message, 'error');
    } finally {
        saveClientBtn.disabled = false;
        saveClientBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Save';
        saveClientBtn.appendChild(span);
    }
}

// --- Internal: Client Delete ---

function showDeleteConfirmation(): void {
    if (!editingClientId) return;

    const client = clients.find((c) => c.clientId === editingClientId);
    if (!client) return;

    deleteClientId = editingClientId;
    deleteClientName.textContent = client.name as string;
    closeClientForm();
    deleteModal.classList.add('active');
}

function closeDeleteModal(): void {
    deleteModal.classList.remove('active');
    deleteClientId = null;
}

async function confirmDelete(): Promise<void> {
    if (!deleteClientId) return;

    try {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        confirmDeleteBtn.appendChild(spinner);
        confirmDeleteBtn.appendChild(document.createTextNode(' Deleting...'));

        const response = await fetch(`/api/clients/${deleteClientId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok) {
            showAlert(result.message || 'Client deleted successfully', 'success');
            closeDeleteModal();
            loadClients();
        } else {
            showAlert(result.error || 'Failed to delete client', 'error');
        }
    } catch (error) {
        showAlert('Failed to delete client: ' + (error as Error).message, 'error');
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Delete';
        confirmDeleteBtn.appendChild(span);
    }
}

// --- Internal: Processing ---

async function processClient(clientId: string, options: { dryRun?: boolean } = {}): Promise<void> {
    if (isProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    const client = clients.find((c) => c.clientId === clientId);
    if (!client) {
        showAlert(`Client "${clientId}" not found`, 'error');
        return;
    }

    const { dryRun } = options;

    isProcessing = true;
    updateProcessAllButton();
    disableAllProcessButtons();
    clearLog();
    addLogEntry((dryRun ? '[DRY RUN] ' : '') + 'Starting processing for client: ' + (client.name as string), 'info');

    try {
        const response = await fetch(`/api/clients/${clientId}/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dryRun: !!dryRun })
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        handleProcessingUpdate(data);
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry('Error: ' + (error as Error).message, 'error');
        showAlert('Processing failed: ' + (error as Error).message, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients();
    }
}

async function processAllClients(): Promise<void> {
    if (isProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    isProcessing = true;
    updateProcessAllButton();
    disableAllProcessButtons();
    clearLog();
    addLogEntry('Starting batch processing for all enabled clients...', 'info');

    try {
        const response = await fetch('/api/clients/process-all', {
            method: 'POST'
        });

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        handleProcessingUpdate(data);
                    } catch {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry('Error: ' + (error as Error).message, 'error');
        showAlert('Batch processing failed: ' + (error as Error).message, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients();
    }
}

function handleProcessingUpdate(data: Record<string, unknown>): void {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;

        case 'starting':
            addLogEntry(
                'Found ' + data.total + ' files. Processing with ' + data.concurrency + ' concurrent tasks...',
                'info'
            );
            break;

        case 'starting-batch':
            addLogEntry('Starting batch processing for ' + data.totalClients + ' clients...', 'info');
            break;

        case 'client-starting':
            addLogEntry(
                '\n--- Client ' + data.clientNumber + '/' + data.totalClients + ': ' + data.clientName + ' ---',
                'info'
            );
            break;

        case 'analyzing':
            addLogEntry('Analyzing: ' + data.filename + '...', 'processing');
            break;

        case 'retrying':
            addLogEntry(
                'Retrying ' + data.filename + ' (attempt ' + data.attempt + '/' + data.maxAttempts + ')...',
                'warning'
            );
            break;

        case 'completed':
            addLogEntry('Completed: ' + data.filename + ' -> ' + data.outputFilename, 'success');
            break;

        case 'dry-run-completed':
            addLogEntry('Dry run: ' + data.filename + ' -> ' + data.outputFilename, 'success');
            break;

        case 'failed':
            addLogEntry('Failed: ' + data.filename + ' - ' + data.error, 'error');
            break;

        case 'client-done':
            addLogEntry('Client complete: ' + data.success + ' successful, ' + data.failed + ' failed', 'info');
            break;

        case 'client-error':
            addLogEntry('Client error (' + data.clientId + '): ' + data.error, 'error');
            break;

        case 'done':
            if (data.mode === 'all') {
                addLogEntry('\n=== Batch complete ===', 'info');
                addLogEntry(
                    'Total: ' +
                        data.totalSuccess +
                        ' successful, ' +
                        data.totalFailed +
                        ' failed across ' +
                        data.totalClients +
                        ' clients',
                    'info'
                );
                if ((data.totalFailed as number) === 0) {
                    showAlert('Successfully processed ' + data.totalSuccess + ' invoices!', 'success');
                } else {
                    showAlert(
                        'Processed ' + data.totalSuccess + ' invoices, ' + data.totalFailed + ' failed',
                        'warning'
                    );
                }
            } else {
                addLogEntry('\nComplete: ' + data.success + ' successful, ' + data.failed + ' failed', 'info');
                if ((data.failed as number) === 0 && (data.success as number) > 0) {
                    showAlert('Successfully processed ' + data.success + ' invoices!', 'success');
                } else if ((data.success as number) === 0 && (data.failed as number) === 0) {
                    showAlert('No invoices to process', 'info');
                } else if ((data.failed as number) > 0) {
                    showAlert('Processed ' + data.success + ' invoices, ' + data.failed + ' failed', 'warning');
                }
            }
            break;

        case 'error':
            addLogEntry('Error: ' + data.error, 'error');
            showAlert('Processing error: ' + data.error, 'error');
            break;
    }
}

function disableAllProcessButtons(): void {
    document
        .querySelectorAll('.process-btn, .dry-run-btn')
        .forEach((btn) => ((btn as HTMLButtonElement).disabled = true));
    processAllBtn.disabled = true;
}

function enableAllProcessButtons(): void {
    document.querySelectorAll('.process-btn, .dry-run-btn').forEach((btn) => {
        const cId = (btn as HTMLElement).dataset ? (btn as HTMLElement).dataset.clientId : null;
        const client = cId ? clients.find((c) => c.clientId === cId) : null;
        const folderStatus = client ? (client.folderStatus as Record<string, unknown>) : null;
        (btn as HTMLButtonElement).disabled =
            !client || !folderStatus || (folderStatus.inputPdfCount as number) === 0 || !folderStatus.exists;
    });
    updateProcessAllButton();
}
