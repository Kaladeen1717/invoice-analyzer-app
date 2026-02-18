// State management
let clients = [];
let isProcessing = false;
let eventSource = null;
let editingClientId = null;
let deleteClientId = null;
let activeTab = 'dashboard';

// Field editor state
let fieldDefinitions = [];
let originalFieldDefinitions = [];
let deleteFieldIndex = null;
let fieldsLoaded = false;
let editMode = false;

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
const apiKeyEnvVarInput = document.getElementById('apiKeyEnvVar');
const clientEnabledInput = document.getElementById('clientEnabled');

// Delete modal elements
const deleteModal = document.getElementById('deleteModal');
const deleteClientName = document.getElementById('deleteClientName');
const closeDeleteModalBtn = document.getElementById('closeDeleteModalBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

// Field editor elements
const fieldListEl = document.getElementById('fieldList');
const fieldsSaveBar = document.getElementById('fieldsSaveBar');
const reloadFieldsBtn = document.getElementById('reloadFieldsBtn');
const addFieldBtn = document.getElementById('addFieldBtn');
const editToggleBtn = document.getElementById('editToggleBtn');
const saveFieldsBtn = document.getElementById('saveFieldsBtn');
const discardFieldsBtn = document.getElementById('discardFieldsBtn');

// Delete field modal elements
const deleteFieldModal = document.getElementById('deleteFieldModal');
const deleteFieldName = document.getElementById('deleteFieldName');
const closeDeleteFieldModalBtn = document.getElementById('closeDeleteFieldModalBtn');
const cancelDeleteFieldBtn = document.getElementById('cancelDeleteFieldBtn');
const confirmDeleteFieldBtn = document.getElementById('confirmDeleteFieldBtn');

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
    // Check for unsaved field changes when leaving global-config
    if (activeTab === 'global-config' && tabName !== 'global-config') {
        if (editMode) readFieldsFromDOM();
        if (hasUnsavedFieldChanges()) {
            if (!confirm('You have unsaved field changes. Discard and switch tabs?')) {
                return;
            }
            discardFieldChanges();
        }
    }

    activeTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Load fields on first visit to global-config
    if (tabName === 'global-config' && !fieldsLoaded) {
        loadFieldDefinitions();
    }
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
// FIELD DEFINITIONS EDITOR
// ============================================================================

async function loadFieldDefinitions() {
    try {
        fieldListEl.textContent = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading-placeholder';
        loadingDiv.textContent = 'Loading fields...';
        fieldListEl.appendChild(loadingDiv);

        const response = await fetch('/api/config');
        const data = await response.json();

        if (response.ok) {
            fieldDefinitions = data.fieldDefinitions || [];
            originalFieldDefinitions = JSON.parse(JSON.stringify(fieldDefinitions));
            fieldsLoaded = true;
            renderFieldList();
        } else {
            fieldListEl.textContent = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'error-placeholder';
            errDiv.textContent = 'Error: ' + (data.error || 'Unknown error');
            fieldListEl.appendChild(errDiv);
        }
    } catch (error) {
        fieldListEl.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-placeholder';
        errDiv.textContent = 'Failed to load fields: ' + error.message;
        fieldListEl.appendChild(errDiv);
    }
}

function renderFieldList() {
    fieldListEl.textContent = '';

    if (fieldDefinitions.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'empty-placeholder';
        const p1 = document.createElement('p');
        p1.textContent = 'No extraction fields defined.';
        const p2 = document.createElement('p');
        p2.textContent = 'Click "+ Add Custom Field" to create one.';
        placeholder.appendChild(p1);
        placeholder.appendChild(p2);
        fieldListEl.appendChild(placeholder);
        updateFieldsSaveBar();
        return;
    }

    const typeOptions = ['text', 'number', 'boolean', 'date', 'array'];
    const table = document.createElement('table');
    table.className = 'fields-table' + (editMode ? ' edit-mode' : '');
    table.id = 'fieldsTable';

    // Build thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = [
        { text: 'On', cls: 'col-enabled' },
        { text: 'Label', cls: 'col-label' },
        { text: 'Key', cls: 'col-key' },
        { text: 'Type', cls: 'col-type' },
        { text: 'Schema Hint', cls: 'col-hint' },
        { text: 'Instruction', cls: 'col-instruction' },
        { text: 'Source', cls: 'col-source' },
        { text: 'Actions', cls: 'col-actions' }
    ];
    headers.forEach(h => {
        const th = document.createElement('th');
        th.className = h.cls;
        th.textContent = h.text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build tbody
    const tbody = document.createElement('tbody');
    tbody.id = 'fieldListBody';

    fieldDefinitions.forEach((field, index) => {
        const tr = document.createElement('tr');
        if (!field.enabled) tr.className = 'disabled';
        tr.dataset.index = index;

        // Enabled column
        const tdEnabled = document.createElement('td');
        tdEnabled.className = 'col-enabled';
        const enabledView = document.createElement('span');
        enabledView.className = 'cell-view';
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon ' + (field.enabled ? 'enabled' : 'disabled');
        toggleIcon.innerHTML = field.enabled ? '&#9679;' : '&#9675;';
        enabledView.appendChild(toggleIcon);
        tdEnabled.appendChild(enabledView);
        const enabledEdit = document.createElement('span');
        enabledEdit.className = 'cell-edit';
        const enabledCheckbox = document.createElement('input');
        enabledCheckbox.type = 'checkbox';
        enabledCheckbox.dataset.field = 'enabled';
        enabledCheckbox.checked = field.enabled;
        enabledEdit.appendChild(enabledCheckbox);
        tdEnabled.appendChild(enabledEdit);
        tr.appendChild(tdEnabled);

        // Label column
        const tdLabel = document.createElement('td');
        tdLabel.className = 'col-label';
        const labelView = document.createElement('span');
        labelView.className = 'cell-view';
        labelView.textContent = field.label;
        tdLabel.appendChild(labelView);
        const labelEdit = document.createElement('span');
        labelEdit.className = 'cell-edit';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.dataset.field = 'label';
        labelInput.value = field.label;
        labelEdit.appendChild(labelInput);
        tdLabel.appendChild(labelEdit);
        tr.appendChild(tdLabel);

        // Key column
        const tdKey = document.createElement('td');
        tdKey.className = 'col-key';
        const keyView = document.createElement('span');
        keyView.className = 'cell-view';
        const keyCode = document.createElement('code');
        keyCode.textContent = field.key;
        keyView.appendChild(keyCode);
        tdKey.appendChild(keyView);
        const keyEdit = document.createElement('span');
        keyEdit.className = 'cell-edit';
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.dataset.field = 'key';
        keyInput.value = field.key;
        const isKeyReadonly = field.builtIn || field.key !== '';
        keyInput.readOnly = isKeyReadonly;
        keyEdit.appendChild(keyInput);
        tdKey.appendChild(keyEdit);
        tr.appendChild(tdKey);

        // Type column
        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        const typeView = document.createElement('span');
        typeView.className = 'cell-view';
        typeView.textContent = field.type;
        tdType.appendChild(typeView);
        const typeEdit = document.createElement('span');
        typeEdit.className = 'cell-edit';
        const typeSelect = document.createElement('select');
        typeSelect.dataset.field = 'type';
        typeOptions.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            opt.selected = t === field.type;
            typeSelect.appendChild(opt);
        });
        typeEdit.appendChild(typeSelect);
        tdType.appendChild(typeEdit);
        tr.appendChild(tdType);

        // Schema Hint column
        const tdHint = document.createElement('td');
        tdHint.className = 'col-hint';
        const hintView = document.createElement('span');
        hintView.className = 'cell-view cell-view-truncate';
        hintView.title = field.schemaHint;
        hintView.textContent = field.schemaHint;
        tdHint.appendChild(hintView);
        const hintEdit = document.createElement('span');
        hintEdit.className = 'cell-edit';
        const hintTextarea = document.createElement('textarea');
        hintTextarea.dataset.field = 'schemaHint';
        hintTextarea.rows = 3;
        hintTextarea.value = field.schemaHint;
        hintEdit.appendChild(hintTextarea);
        tdHint.appendChild(hintEdit);
        tr.appendChild(tdHint);

        // Instruction column
        const tdInstruction = document.createElement('td');
        tdInstruction.className = 'col-instruction';
        const instrView = document.createElement('span');
        instrView.className = 'cell-view cell-view-truncate';
        instrView.title = field.instruction;
        instrView.textContent = field.instruction;
        tdInstruction.appendChild(instrView);
        const instrEdit = document.createElement('span');
        instrEdit.className = 'cell-edit';
        const instrTextarea = document.createElement('textarea');
        instrTextarea.dataset.field = 'instruction';
        instrTextarea.rows = 3;
        instrTextarea.value = field.instruction;
        instrEdit.appendChild(instrTextarea);
        tdInstruction.appendChild(instrEdit);
        tr.appendChild(tdInstruction);

        // Source column
        const tdSource = document.createElement('td');
        tdSource.className = 'col-source';
        const badge = document.createElement('span');
        badge.className = field.builtIn ? 'field-badge-builtin' : 'field-badge-custom';
        badge.textContent = field.builtIn ? 'Built-in' : 'Custom';
        tdSource.appendChild(badge);
        tr.appendChild(tdSource);

        // Actions column
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'row-actions';

        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'btn-icon field-move-up-btn';
        moveUpBtn.dataset.index = index;
        moveUpBtn.title = 'Move up';
        moveUpBtn.innerHTML = '&#9650;';
        moveUpBtn.disabled = index === 0;
        actionsDiv.appendChild(moveUpBtn);

        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'btn-icon field-move-down-btn';
        moveDownBtn.dataset.index = index;
        moveDownBtn.title = 'Move down';
        moveDownBtn.innerHTML = '&#9660;';
        moveDownBtn.disabled = index === fieldDefinitions.length - 1;
        actionsDiv.appendChild(moveDownBtn);

        if (!field.builtIn) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon btn-icon-danger field-delete-btn';
            deleteBtn.dataset.index = index;
            deleteBtn.title = 'Delete field';
            deleteBtn.innerHTML = '&#10005;';
            actionsDiv.appendChild(deleteBtn);
        }

        tdActions.appendChild(actionsDiv);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    fieldListEl.appendChild(table);

    attachFieldRowListeners();
    updateFieldsSaveBar();
}

function attachFieldRowListeners() {
    document.querySelectorAll('.field-move-up-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            readFieldsFromDOM();
            moveField(parseInt(btn.dataset.index), -1);
        });
    });

    document.querySelectorAll('.field-move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            readFieldsFromDOM();
            moveField(parseInt(btn.dataset.index), 1);
        });
    });

    document.querySelectorAll('.field-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            readFieldsFromDOM();
            showDeleteFieldConfirmation(parseInt(btn.dataset.index));
        });
    });

    // Auto-generate key from label for new rows (key input not readonly)
    document.querySelectorAll('#fieldListBody tr').forEach(row => {
        const keyInput = row.querySelector('input[data-field="key"]');
        const labelInput = row.querySelector('input[data-field="label"]');
        if (keyInput && labelInput && !keyInput.readOnly) {
            labelInput.addEventListener('input', () => {
                keyInput.value = labelToCamelCase(labelInput.value);
            });
        }
    });

    // Listen for input changes to update save bar
    document.querySelectorAll('#fieldListBody input, #fieldListBody select, #fieldListBody textarea').forEach(el => {
        el.addEventListener('change', () => {
            readFieldsFromDOM();
            updateFieldsSaveBar();
        });
    });
}

function toggleEditMode() {
    if (editMode && hasUnsavedFieldChanges()) {
        if (!confirm('You have unsaved changes. Discard and exit edit mode?')) {
            return;
        }
        fieldDefinitions = JSON.parse(JSON.stringify(originalFieldDefinitions));
    }

    editMode = !editMode;

    editToggleBtn.classList.toggle('active', editMode);
    editToggleBtn.querySelector('span').textContent = editMode ? 'Editing' : 'Locked';
    addFieldBtn.style.display = editMode ? 'inline-flex' : 'none';

    const table = document.getElementById('fieldsTable');
    if (table) {
        table.classList.toggle('edit-mode', editMode);
    }

    if (!editMode) {
        renderFieldList();
    }
}

function readFieldsFromDOM() {
    const rows = document.querySelectorAll('#fieldListBody tr');
    rows.forEach((row, index) => {
        if (index >= fieldDefinitions.length) return;
        const field = fieldDefinitions[index];

        const enabledInput = row.querySelector('input[data-field="enabled"]');
        const labelInput = row.querySelector('input[data-field="label"]');
        const keyInput = row.querySelector('input[data-field="key"]');
        const typeSelect = row.querySelector('select[data-field="type"]');
        const hintTextarea = row.querySelector('textarea[data-field="schemaHint"]');
        const instructionTextarea = row.querySelector('textarea[data-field="instruction"]');

        if (enabledInput) field.enabled = enabledInput.checked;
        if (labelInput) field.label = labelInput.value.trim();
        if (keyInput) field.key = keyInput.value.trim();
        if (typeSelect) field.type = typeSelect.value;
        if (hintTextarea) field.schemaHint = hintTextarea.value.trim();
        if (instructionTextarea) field.instruction = instructionTextarea.value.trim();
    });
}

function addNewFieldRow() {
    if (!editMode) {
        toggleEditMode();
    }
    readFieldsFromDOM();
    fieldDefinitions.push({
        key: '',
        label: '',
        type: 'text',
        schemaHint: '',
        instruction: '',
        enabled: true
    });
    renderFieldList();

    // Focus the label input of the new row
    const lastRow = document.querySelector('#fieldListBody tr:last-child');
    if (lastRow) {
        const labelInput = lastRow.querySelector('input[data-field="label"]');
        if (labelInput) labelInput.focus();
    }
}

function hasUnsavedFieldChanges() {
    return JSON.stringify(fieldDefinitions) !== JSON.stringify(originalFieldDefinitions);
}

function updateFieldsSaveBar() {
    if (hasUnsavedFieldChanges()) {
        fieldsSaveBar.style.display = 'flex';
    } else {
        fieldsSaveBar.style.display = 'none';
    }
}

function labelToCamelCase(label) {
    return label
        .trim()
        .split(/\s+/)
        .map((word, i) => {
            const lower = word.toLowerCase();
            return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');
}

function toggleField(index) {
    fieldDefinitions[index].enabled = !fieldDefinitions[index].enabled;
    renderFieldList();
}

function moveField(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fieldDefinitions.length) return;

    const temp = fieldDefinitions[index];
    fieldDefinitions[index] = fieldDefinitions[newIndex];
    fieldDefinitions[newIndex] = temp;
    renderFieldList();
}

function showDeleteFieldConfirmation(index) {
    const field = fieldDefinitions[index];
    if (field.builtIn) return;

    deleteFieldIndex = index;
    deleteFieldName.textContent = field.label;
    deleteFieldModal.classList.add('active');
}

function closeDeleteFieldModal() {
    deleteFieldModal.classList.remove('active');
    deleteFieldIndex = null;
}

function confirmDeleteField() {
    if (deleteFieldIndex === null) return;
    if (fieldDefinitions[deleteFieldIndex].builtIn) return;

    fieldDefinitions.splice(deleteFieldIndex, 1);
    closeDeleteFieldModal();
    renderFieldList();
}

async function saveFieldDefinitions() {
    readFieldsFromDOM();

    if (fieldDefinitions.length === 0) {
        showAlert('Cannot save an empty field list', 'error');
        return;
    }

    // Validate all fields
    const validTypes = ['text', 'number', 'boolean', 'date', 'array'];
    for (let i = 0; i < fieldDefinitions.length; i++) {
        const field = fieldDefinitions[i];
        const rowNum = i + 1;

        if (!field.label) {
            showAlert(`Row ${rowNum}: label is required`, 'error');
            return;
        }
        if (!field.key) {
            showAlert(`Row ${rowNum}: key is required`, 'error');
            return;
        }
        if (!/^[a-z][a-zA-Z0-9]*$/.test(field.key)) {
            showAlert(`Row ${rowNum}: key must start with a lowercase letter and contain only alphanumeric characters`, 'error');
            return;
        }
        if (!validTypes.includes(field.type)) {
            showAlert(`Row ${rowNum}: invalid field type`, 'error');
            return;
        }
        if (!field.schemaHint) {
            showAlert(`Row ${rowNum}: schema hint is required`, 'error');
            return;
        }
        if (!field.instruction) {
            showAlert(`Row ${rowNum}: instruction is required`, 'error');
            return;
        }

        // Check duplicate keys
        const duplicateIndex = fieldDefinitions.findIndex((f, j) => j !== i && f.key === field.key);
        if (duplicateIndex !== -1) {
            showAlert(`Row ${rowNum}: duplicate key "${field.key}" (also in row ${duplicateIndex + 1})`, 'error');
            return;
        }
    }

    try {
        saveFieldsBtn.disabled = true;
        saveFieldsBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        saveFieldsBtn.appendChild(spinner);
        saveFieldsBtn.appendChild(document.createTextNode(' Saving...'));

        const response = await fetch('/api/config/fields', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fieldDefinitions })
        });

        const result = await response.json();

        if (response.ok) {
            originalFieldDefinitions = JSON.parse(JSON.stringify(fieldDefinitions));
            if (editMode) {
                editMode = false;
                editToggleBtn.classList.remove('active');
                editToggleBtn.querySelector('span').textContent = 'Locked';
                addFieldBtn.style.display = 'none';
            }
            renderFieldList();
            showAlert(result.message || 'Field definitions saved', 'success');
        } else {
            showAlert(result.error || result.details || 'Failed to save fields', 'error');
        }
    } catch (error) {
        showAlert(`Failed to save fields: ${error.message}`, 'error');
    } finally {
        saveFieldsBtn.disabled = false;
        saveFieldsBtn.textContent = '';
        const span = document.createElement('span');
        span.textContent = 'Save Changes';
        saveFieldsBtn.appendChild(span);
    }
}

function discardFieldChanges() {
    fieldDefinitions = JSON.parse(JSON.stringify(originalFieldDefinitions));
    if (editMode) {
        editMode = false;
        editToggleBtn.classList.remove('active');
        editToggleBtn.querySelector('span').textContent = 'Locked';
        addFieldBtn.style.display = 'none';
    }
    renderFieldList();
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

    // Field editor buttons
    editToggleBtn.addEventListener('click', toggleEditMode);
    reloadFieldsBtn.addEventListener('click', () => {
        fieldsLoaded = false;
        loadFieldDefinitions();
    });
    addFieldBtn.addEventListener('click', addNewFieldRow);
    saveFieldsBtn.addEventListener('click', saveFieldDefinitions);
    discardFieldsBtn.addEventListener('click', discardFieldChanges);

    // Delete field modal
    closeDeleteFieldModalBtn.addEventListener('click', closeDeleteFieldModal);
    cancelDeleteFieldBtn.addEventListener('click', closeDeleteFieldModal);
    confirmDeleteFieldBtn.addEventListener('click', confirmDeleteField);

    deleteFieldModal.addEventListener('click', (e) => {
        if (e.target === deleteFieldModal) {
            closeDeleteFieldModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (deleteFieldModal.classList.contains('active')) {
                closeDeleteFieldModal();
            } else if (deleteModal.classList.contains('active')) {
                closeDeleteModal();
            } else if (clientModal.classList.contains('active')) {
                closeClientForm();
            }
        }
    });
}
