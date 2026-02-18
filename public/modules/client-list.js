// Client List module
// Manages client CRUD, rendering, processing (SSE), and the client form/delete modals.

import { showAlert, addLogEntry, clearLog } from './ui-utils.js';
import { exportConfig } from './export-import.js';
import { openClientDetail } from './client-detail.js';

// --- State ---
let clients = [];
let isProcessing = false;
let editingClientId = null;
let deleteClientId = null;

// --- DOM refs (set in init) ---
let clientListEl, processAllBtn;
let clientModal, modalTitle, clientForm, closeModalBtn, cancelFormBtn, deleteClientBtn, saveClientBtn;
let clientIdInput, clientNameInput, folderPathInput, apiKeyEnvVarInput, clientEnabledInput;
let deleteModal, deleteClientName, closeDeleteModalBtn, cancelDeleteBtn, confirmDeleteBtn;

// --- Public API ---

export function initClientList() {
    clientListEl = document.getElementById('clientList');
    processAllBtn = document.getElementById('processAllBtn');

    clientModal = document.getElementById('clientModal');
    modalTitle = document.getElementById('modalTitle');
    clientForm = document.getElementById('clientForm');
    closeModalBtn = document.getElementById('closeModalBtn');
    cancelFormBtn = document.getElementById('cancelFormBtn');
    deleteClientBtn = document.getElementById('deleteClientBtn');
    saveClientBtn = document.getElementById('saveClientBtn');

    clientIdInput = document.getElementById('clientId');
    clientNameInput = document.getElementById('clientName');
    folderPathInput = document.getElementById('folderPath');
    apiKeyEnvVarInput = document.getElementById('apiKeyEnvVar');
    clientEnabledInput = document.getElementById('clientEnabled');

    deleteModal = document.getElementById('deleteModal');
    deleteClientName = document.getElementById('deleteClientName');
    closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
    cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    const refreshClientsBtn = document.getElementById('refreshClientsBtn');
    const newClientBtn = document.getElementById('newClientBtn');
    const clearLogBtn = document.getElementById('clearLogBtn');

    // Event listeners
    refreshClientsBtn.addEventListener('click', loadClients);
    newClientBtn.addEventListener('click', () => openClientForm());
    processAllBtn.addEventListener('click', processAllClients);
    clearLogBtn.addEventListener('click', clearLog);

    closeModalBtn.addEventListener('click', closeClientForm);
    cancelFormBtn.addEventListener('click', closeClientForm);
    clientModal.addEventListener('click', (e) => {
        if (e.target === clientModal) closeClientForm();
    });
    clientForm.addEventListener('submit', saveClient);
    deleteClientBtn.addEventListener('click', showDeleteConfirmation);

    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) closeDeleteModal();
    });
}

export async function loadClients() {
    try {
        clientListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading clients...';
        clientListEl.appendChild(loadingDiv);

        const response = await fetch('/api/clients');
        const data = await response.json();

        if (response.ok) {
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
        errDiv.textContent = 'Failed to load clients: ' + error.message;
        clientListEl.appendChild(errDiv);
    }
}

/**
 * Accessors for Escape key handler in app.js.
 */
export function getClientModal() { return clientModal; }
export function getDeleteModal() { return deleteModal; }
export function getCloseClientForm() { return closeClientForm; }
export function getCloseDeleteModal() { return closeDeleteModal; }

// --- Internal: Client List Rendering ---

function renderClientList() {
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

    clients.forEach(client => {
        const card = document.createElement('div');
        card.className = 'client-card ' + (client.enabled ? 'enabled' : 'disabled');
        card.dataset.clientId = client.clientId;
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
        nameSpan.textContent = client.name;
        statusDiv.appendChild(nameSpan);

        const idSpan = document.createElement('span');
        idSpan.className = 'client-id';
        idSpan.textContent = '(' + client.clientId + ')';
        statusDiv.appendChild(idSpan);

        header.appendChild(statusDiv);

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small btn-secondary edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openClientForm(client.clientId);
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
        folderValue.textContent = client.folderPath;
        folderDiv.appendChild(folderLabel);
        folderDiv.appendChild(folderValue);
        if (!client.folderStatus.exists) {
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
        pendingVal.textContent = String(client.folderStatus.inputPdfCount);
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
        processedVal.textContent = String(client.folderStatus.processedCount);
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
        card.appendChild(details);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'client-actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = 'btn btn-secondary btn-small export-client-btn';
        exportBtn.title = 'Export client config';
        exportBtn.textContent = 'Export';
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportConfig('client:' + client.clientId);
        });
        actions.appendChild(exportBtn);

        const processBtn = document.createElement('button');
        processBtn.className = 'btn btn-primary process-btn';
        processBtn.dataset.clientId = client.clientId;
        processBtn.textContent = 'Process';
        processBtn.disabled = client.folderStatus.inputPdfCount === 0 || !client.folderStatus.exists || isProcessing;
        processBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            processClient(client.clientId);
        });
        actions.appendChild(processBtn);

        card.appendChild(actions);

        // Click card to open detail view
        card.addEventListener('click', () => openClientDetail(client.clientId));

        clientListEl.appendChild(card);
    });
}

function updateProcessAllButton() {
    const enabledClientsWithPdfs = clients.filter(c =>
        c.enabled &&
        c.folderStatus.exists &&
        c.folderStatus.inputPdfCount > 0
    );
    processAllBtn.disabled = enabledClientsWithPdfs.length === 0 || isProcessing;
}

// --- Internal: Client Form ---

function openClientForm(clientId = null) {
    editingClientId = clientId;

    if (clientId) {
        const client = clients.find(c => c.clientId === clientId);
        if (!client) {
            showAlert(`Client "${clientId}" not found`, 'error');
            return;
        }

        modalTitle.textContent = 'Edit Client: ' + client.name;
        clientIdInput.value = client.clientId;
        clientIdInput.disabled = true;
        clientNameInput.value = client.name;
        folderPathInput.value = client.folderPath;
        apiKeyEnvVarInput.value = client.apiKeyEnvVar || '';
        clientEnabledInput.checked = client.enabled;
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

function closeClientForm() {
    clientModal.classList.remove('active');
    editingClientId = null;
    clientForm.reset();
}

async function saveClient(e) {
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

        let response;
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
        showAlert('Failed to save client: ' + error.message, 'error');
    } finally {
        saveClientBtn.disabled = false;
        saveClientBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Save';
        saveClientBtn.appendChild(span);
    }
}

// --- Internal: Client Delete ---

function showDeleteConfirmation() {
    if (!editingClientId) return;

    const client = clients.find(c => c.clientId === editingClientId);
    if (!client) return;

    deleteClientId = editingClientId;
    deleteClientName.textContent = client.name;
    closeClientForm();
    deleteModal.classList.add('active');
}

function closeDeleteModal() {
    deleteModal.classList.remove('active');
    deleteClientId = null;
}

async function confirmDelete() {
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
        showAlert('Failed to delete client: ' + error.message, 'error');
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Delete';
        confirmDeleteBtn.appendChild(span);
    }
}

// --- Internal: Processing ---

async function processClient(clientId) {
    if (isProcessing) {
        showAlert('Processing already in progress', 'warning');
        return;
    }

    const client = clients.find(c => c.clientId === clientId);
    if (!client) {
        showAlert(`Client "${clientId}" not found`, 'error');
        return;
    }

    isProcessing = true;
    updateProcessAllButton();
    disableAllProcessButtons();
    clearLog();
    addLogEntry('Starting processing for client: ' + client.name, 'info');

    try {
        const response = await fetch(`/api/clients/${clientId}/process`, {
            method: 'POST'
        });

        const reader = response.body.getReader();
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
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry('Error: ' + error.message, 'error');
        showAlert('Processing failed: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients();
    }
}

async function processAllClients() {
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

        const reader = response.body.getReader();
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
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        }
    } catch (error) {
        addLogEntry('Error: ' + error.message, 'error');
        showAlert('Batch processing failed: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients();
    }
}

function handleProcessingUpdate(data) {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;

        case 'starting':
            addLogEntry('Found ' + data.total + ' files. Processing with ' + data.concurrency + ' concurrent tasks...', 'info');
            break;

        case 'starting-batch':
            addLogEntry('Starting batch processing for ' + data.totalClients + ' clients...', 'info');
            break;

        case 'client-starting':
            addLogEntry('\n--- Client ' + data.clientNumber + '/' + data.totalClients + ': ' + data.clientName + ' ---', 'info');
            break;

        case 'analyzing':
            addLogEntry('Analyzing: ' + data.filename + '...', 'processing');
            break;

        case 'retrying':
            addLogEntry('Retrying ' + data.filename + ' (attempt ' + data.attempt + '/' + data.maxAttempts + ')...', 'warning');
            break;

        case 'completed':
            addLogEntry('Completed: ' + data.filename + ' -> ' + data.outputFilename, 'success');
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
                addLogEntry('Total: ' + data.totalSuccess + ' successful, ' + data.totalFailed + ' failed across ' + data.totalClients + ' clients', 'info');
                if (data.totalFailed === 0) {
                    showAlert('Successfully processed ' + data.totalSuccess + ' invoices!', 'success');
                } else {
                    showAlert('Processed ' + data.totalSuccess + ' invoices, ' + data.totalFailed + ' failed', 'warning');
                }
            } else {
                addLogEntry('\nComplete: ' + data.success + ' successful, ' + data.failed + ' failed', 'info');
                if (data.failed === 0 && data.success > 0) {
                    showAlert('Successfully processed ' + data.success + ' invoices!', 'success');
                } else if (data.success === 0 && data.failed === 0) {
                    showAlert('No invoices to process', 'info');
                } else if (data.failed > 0) {
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

function disableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => btn.disabled = true);
    processAllBtn.disabled = true;
}

function enableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => {
        const cId = btn.dataset ? btn.dataset.clientId : null;
        const client = cId ? clients.find(c => c.clientId === cId) : null;
        btn.disabled = !client ||
            client.folderStatus.inputPdfCount === 0 ||
            !client.folderStatus.exists;
    });
    updateProcessAllButton();
}
