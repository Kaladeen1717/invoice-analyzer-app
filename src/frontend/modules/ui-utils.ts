// Shared UI utilities — alert system, logging, HTML escaping, fetch helpers.

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show an alert banner in #alertArea
 */
export function showAlert(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'error'): void {
    const alertArea = document.getElementById('alertArea')!;
    const alertClass = `alert-${type}`;
    const icons: Record<string, string> = { success: '\u2713', warning: '!', error: '\u2717', info: 'i' };
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
        setTimeout(() => {
            if (alert.parentElement) alert.remove();
        }, 5000);
    }
}

/**
 * Append a log entry to #processingLog
 */
export function addLogEntry(
    message: string,
    type: 'info' | 'success' | 'error' | 'warning' | 'processing' = 'info'
): void {
    const processingLog = document.getElementById('processingLog')!;
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
export function clearLog(): void {
    const processingLog = document.getElementById('processingLog')!;
    while (processingLog.firstChild) processingLog.removeChild(processingLog.firstChild);
}
