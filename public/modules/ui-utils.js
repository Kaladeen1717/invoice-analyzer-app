// Shared UI utilities — alert system, logging, HTML escaping, fetch helpers.

/**
 * Escape HTML entities to prevent XSS
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show an alert banner in #alertArea
 * @param {string} message - Alert message (will be HTML-escaped)
 * @param {'success'|'warning'|'error'|'info'} type
 */
export function showAlert(message, type = 'error') {
    const alertArea = document.getElementById('alertArea');
    const alertClass = `alert-${type}`;
    const icons = { success: '\u2713', warning: '!', error: '\u2717', info: 'i' };
    const icon = icons[type] || icons.info;

    const alert = document.createElement('div');
    alert.className = `alert ${alertClass}`;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'alert-icon';
    iconSpan.textContent = icon;
    alert.appendChild(iconSpan);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    alert.appendChild(msgSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'alert-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => alert.remove());
    alert.appendChild(closeBtn);

    // Clear previous alerts
    while (alertArea.firstChild) alertArea.removeChild(alertArea.firstChild);
    alertArea.appendChild(alert);

    if (type === 'success' || type === 'info') {
        setTimeout(() => { if (alert.parentElement) alert.remove(); }, 5000);
    }
}

/**
 * Append a log entry to #processingLog
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 */
export function addLogEntry(message, type = 'info') {
    const processingLog = document.getElementById('processingLog');
    const placeholder = processingLog.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = message;
    processingLog.appendChild(entry);
    processingLog.scrollTop = processingLog.scrollHeight;
}

/**
 * Clear all log entries from #processingLog
 */
export function clearLog() {
    const processingLog = document.getElementById('processingLog');
    while (processingLog.firstChild) processingLog.removeChild(processingLog.firstChild);
}
