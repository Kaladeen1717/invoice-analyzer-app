// State management
let clients = [];
let isProcessing = false;
let eventSource = null;
let editingClientId = null;
let deleteClientId = null;
let activeTab = 'dashboard';

// DOM elements
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const alertArea = document.getElementById('alertArea');
const clientList = document.getElementById('clientList');
const processingLog = document.getElementById('processingLog');

// Buttons
const refreshClientsBtn = document.getElementById('refreshClientsBtn');
const newClientBtn = document.getElementById('newClientBtn');
const processAllBtn = document.getElementById('processAllBtn');
const clearLogBtn = document.getElementById('clearLogBtn');

// Modal elements
const clientModal = document.getElementById('clientModal');
const modalTitle = document.getElementById('modalTitle');
const clientForm = document.getElementById('clientForm');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelFormBtn = document.getElementById('cancelFormBtn');
const deleteClientBtn = document.getElementById('deleteClientBtn');
const saveClientBtn = document.getElementById('saveClientBtn');

// Form fields
const clientIdInput = document.getElementById('clientId');
const clientNameInput = document.getElementById('clientName');
const folderPathInput = document.getElementById('folderPath');
const privateAddressMarkerInput = document.getElementById('privateAddressMarker');
const apiKeyEnvVarInput = document.getElementById('apiKeyEnvVar');
const clientEnabledInput = document.getElementById('clientEnabled');

// Delete modal elements
const deleteModal = document.getElementById('deleteModal');
const deleteClientName = document.getElementById('deleteClientName');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    checkServerHealth();
    loadClients();
    setupEventListeners();
});

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function switchTab(tabName) {
    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

// ============================================================================
// SERVER HEALTH CHECK
// ============================================================================

async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (data.status === 'ok' && data.geminiConfigured) {
            statusText.textContent = `Ready (${data.mode})`;
            statusIndicator.querySelector('.status-dot').style.background = 'var(--success)';
        } else if (data.status === 'ok' && !data.geminiConfigured) {
            statusText.textContent = 'API key not configured';
            statusIndicator.querySelector('.status-dot').style.background = 'var(--warning)';
            showAlert('Please configure your GEMINI_API_KEY in the .env file', 'warning');
        }
    } catch (error) {
        statusText.textContent = 'Server offline';
        statusIndicator.querySelector('.status-dot').style.background = 'var(--error)';
        showAlert('Cannot connect to server. Please ensure the server is running.', 'error');
    }
}

// ============================================================================
// CLIENT MANAGEMENT
// ============================================================================

async function loadClients() {
    try {
        clientList.innerHTML = '<div class="loading-placeholder">Loading clients...</div>';

        const response = await fetch('/api/clients');
        const data = await response.json();

        if (response.ok) {
            clients = data.clients || [];
            renderClientList();
            updateProcessAllButton();
        } else {
            clientList.innerHTML = `<div class="error-placeholder">Error: ${data.error}</div>`;
        }
    } catch (error) {
        clientList.innerHTML = `<div class="error-placeholder">Failed to load clients: ${error.message}</div>`;
    }
}

function renderClientList() {
    if (clients.length === 0) {
        clientList.innerHTML = `
            <div class="empty-placeholder">
                <p>No clients configured yet.</p>
                <p>Click "New Client" to add your first client.</p>
            </div>
        `;
        return;
    }

    clientList.innerHTML = clients.map(client => {
        const enabledClass = client.enabled ? 'enabled' : 'disabled';
        const enabledIcon = client.enabled ? '&#9679;' : '&#9675;';
        const folderWarning = !client.folderStatus.exists ?
            '<span class="folder-warning" title="Folder does not exist">Folder not found</span>' : '';
        const pdfCount = client.folderStatus.inputPdfCount;
        const processedCount = client.folderStatus.processedCount;

        return `
            <div class="client-card ${enabledClass}" data-client-id="${client.clientId}">
                <div class="client-header">
                    <div class="client-status">
                        <span class="status-icon">${enabledIcon}</span>
                        <span class="client-name">${escapeHtml(client.name)}</span>
                        <span class="client-id">(${escapeHtml(client.clientId)})</span>
                    </div>
                    <button class="btn btn-small btn-secondary edit-btn" data-client-id="${client.clientId}">
                        Edit
                    </button>
                </div>
                <div class="client-details">
                    <div class="client-folder">
                        <span class="label">Folder:</span>
                        <span class="value">${escapeHtml(client.folderPath)}</span>
                        ${folderWarning}
                    </div>
                    <div class="client-stats">
                        <span class="stat">
                            <span class="stat-value">${pdfCount}</span> pending
                        </span>
                        <span class="stat-separator">|</span>
                        <span class="stat">
                            <span class="stat-value">${processedCount}</span> processed
                        </span>
                        <span class="stat-separator">|</span>
                        <span class="stat ${enabledClass}">
                            ${client.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                </div>
                <div class="client-actions">
                    <button class="btn btn-primary process-btn"
                            data-client-id="${client.clientId}"
                            ${pdfCount === 0 || !client.folderStatus.exists || isProcessing ? 'disabled' : ''}>
                        Process
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners to edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openClientForm(btn.dataset.clientId);
        });
    });

    // Add event listeners to process buttons
    document.querySelectorAll('.process-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            processClient(btn.dataset.clientId);
        });
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

// ============================================================================
// CLIENT FORM (CREATE/EDIT)
// ============================================================================

function openClientForm(clientId = null) {
    editingClientId = clientId;

    if (clientId) {
        // Edit mode
        const client = clients.find(c => c.clientId === clientId);
        if (!client) {
            showAlert(`Client "${clientId}" not found`, 'error');
            return;
        }

        modalTitle.textContent = `Edit Client: ${client.name}`;
        clientIdInput.value = client.clientId;
        clientIdInput.disabled = true;
        clientNameInput.value = client.name;
        folderPathInput.value = client.folderPath;
        privateAddressMarkerInput.value = client.privateAddressMarker;
        apiKeyEnvVarInput.value = client.apiKeyEnvVar || '';
        clientEnabledInput.checked = client.enabled;
        deleteClientBtn.style.display = 'inline-flex';
    } else {
        // Create mode
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
        privateAddressMarker: privateAddressMarkerInput.value.trim(),
        apiKeyEnvVar: apiKeyEnvVarInput.value.trim() || null,
        enabled: clientEnabledInput.checked
    };

    // Validate
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
    if (!clientData.privateAddressMarker) {
        showAlert('Private address marker is required', 'error');
        return;
    }

    try {
        saveClientBtn.disabled = true;
        saveClientBtn.innerHTML = '<span class="spinner"></span> Saving...';

        let response;
        if (editingClientId) {
            // Update existing client
            response = await fetch(`/api/clients/${editingClientId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientData)
            });
        } else {
            // Create new client
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
        showAlert(`Failed to save client: ${error.message}`, 'error');
    } finally {
        saveClientBtn.disabled = false;
        saveClientBtn.innerHTML = '<span>Save</span>';
    }
}

// ============================================================================
// CLIENT DELETE
// ============================================================================

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
        confirmDeleteBtn.innerHTML = '<span class="spinner"></span> Deleting...';

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
        showAlert(`Failed to delete client: ${error.message}`, 'error');
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = '<span>Delete</span>';
    }
}

// ============================================================================
// PROCESSING
// ============================================================================

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
    addLogEntry(`Starting processing for client: ${client.name}`, 'info');

    try {
        // Use fetch with POST to start SSE stream
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
        addLogEntry(`Error: ${error.message}`, 'error');
        showAlert(`Processing failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients(); // Refresh to update PDF counts
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
        addLogEntry(`Error: ${error.message}`, 'error');
        showAlert(`Batch processing failed: ${error.message}`, 'error');
    } finally {
        isProcessing = false;
        updateProcessAllButton();
        enableAllProcessButtons();
        loadClients(); // Refresh to update PDF counts
    }
}

function handleProcessingUpdate(data) {
    switch (data.status) {
        case 'connected':
            addLogEntry('Connected to server...', 'info');
            break;

        case 'starting':
            addLogEntry(`Found ${data.total} files. Processing with ${data.concurrency} concurrent tasks...`, 'info');
            break;

        case 'starting-batch':
            addLogEntry(`Starting batch processing for ${data.totalClients} clients...`, 'info');
            break;

        case 'client-starting':
            addLogEntry(`\n--- Client ${data.clientNumber}/${data.totalClients}: ${data.clientName} ---`, 'info');
            break;

        case 'analyzing':
            addLogEntry(`Analyzing: ${data.filename}...`, 'processing');
            break;

        case 'retrying':
            addLogEntry(`Retrying ${data.filename} (attempt ${data.attempt}/${data.maxAttempts})...`, 'warning');
            break;

        case 'completed':
            addLogEntry(`Completed: ${data.filename} -> ${data.outputFilename}`, 'success');
            break;

        case 'failed':
            addLogEntry(`Failed: ${data.filename} - ${data.error}`, 'error');
            break;

        case 'client-done':
            addLogEntry(`Client complete: ${data.success} successful, ${data.failed} failed`, 'info');
            break;

        case 'client-error':
            addLogEntry(`Client error (${data.clientId}): ${data.error}`, 'error');
            break;

        case 'done':
            if (data.mode === 'all') {
                addLogEntry(`\n=== Batch complete ===`, 'info');
                addLogEntry(`Total: ${data.totalSuccess} successful, ${data.totalFailed} failed across ${data.totalClients} clients`, 'info');
                if (data.totalFailed === 0) {
                    showAlert(`Successfully processed ${data.totalSuccess} invoices!`, 'success');
                } else {
                    showAlert(`Processed ${data.totalSuccess} invoices, ${data.totalFailed} failed`, 'warning');
                }
            } else {
                addLogEntry(`\nComplete: ${data.success} successful, ${data.failed} failed`, 'info');
                if (data.failed === 0 && data.success > 0) {
                    showAlert(`Successfully processed ${data.success} invoices!`, 'success');
                } else if (data.success === 0 && data.failed === 0) {
                    showAlert('No invoices to process', 'info');
                } else if (data.failed > 0) {
                    showAlert(`Processed ${data.success} invoices, ${data.failed} failed`, 'warning');
                }
            }
            break;

        case 'error':
            addLogEntry(`Error: ${data.error}`, 'error');
            showAlert(`Processing error: ${data.error}`, 'error');
            break;
    }
}

function disableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => btn.disabled = true);
    processAllBtn.disabled = true;
}

function enableAllProcessButtons() {
    document.querySelectorAll('.process-btn').forEach(btn => {
        const clientId = btn.dataset.clientId;
        const client = clients.find(c => c.clientId === clientId);
        btn.disabled = !client ||
            client.folderStatus.inputPdfCount === 0 ||
            !client.folderStatus.exists;
    });
    updateProcessAllButton();
}

// ============================================================================
// LOGGING
// ============================================================================

function clearLog() {
    processingLog.innerHTML = '';
}

function addLogEntry(message, type = 'info') {
    // Remove placeholder if present
    const placeholder = processingLog.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    processingLog.appendChild(entry);
    processingLog.scrollTop = processingLog.scrollHeight;
}

// ============================================================================
// ALERTS
// ============================================================================

function showAlert(message, type = 'error') {
    const alertClass = `alert-${type}`;
    const icons = {
        success: '&#10003;',
        warning: '!',
        error: '&#10007;',
        info: 'i'
    };
    const icon = icons[type] || icons.info;

    const alertHTML = `
        <div class="alert ${alertClass}">
            <span class="alert-icon">${icon}</span>
            <span>${escapeHtml(message)}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">&times;</button>
        </div>
    `;

    alertArea.innerHTML = alertHTML;

    // Auto-dismiss success/info alerts after 5 seconds
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            const alert = alertArea.querySelector('.alert');
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Refresh clients
    refreshClientsBtn.addEventListener('click', loadClients);

    // New client button
    newClientBtn.addEventListener('click', () => openClientForm());

    // Process all button
    processAllBtn.addEventListener('click', processAllClients);

    // Clear log button
    clearLogBtn.addEventListener('click', clearLog);

    // Modal close buttons
    closeModalBtn.addEventListener('click', closeClientForm);
    cancelFormBtn.addEventListener('click', closeClientForm);

    // Close modal on overlay click
    clientModal.addEventListener('click', (e) => {
        if (e.target === clientModal) {
            closeClientForm();
        }
    });

    // Form submission
    clientForm.addEventListener('submit', saveClient);

    // Delete button in edit form
    deleteClientBtn.addEventListener('click', showDeleteConfirmation);

    // Delete modal buttons
    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Close delete modal on overlay click
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) {
            closeDeleteModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (deleteModal.classList.contains('active')) {
                closeDeleteModal();
            } else if (clientModal.classList.contains('active')) {
                closeClientForm();
            }
        }
    });
}
