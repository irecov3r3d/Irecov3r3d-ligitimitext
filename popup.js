// LiGiTiMiT - Popup Script
// Handles UI interactions and communicates with background service worker

document.addEventListener('DOMContentLoaded', init);

let currentState = {
  isRecording: false,
  isReplaying: false,
  isPaused: false,
  macroName: null
};

let logs = [];

async function init() {
  // Get current state
  await refreshState();
  
  // Load macros
  await loadMacros();
  
  // Load settings
  await loadSettings();
  
  // Setup event listeners
  setupEventListeners();
  
  // Start polling for state changes
  setInterval(refreshState, 500);
}

async function refreshState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    
    if (state.isRecording !== currentState.isRecording ||
        state.isReplaying !== currentState.isReplaying ||
        state.isPaused !== currentState.isPaused) {
      currentState = state;
      updateUI();
    }
  } catch (e) {
    // Extension context might be invalid
  }
}

function updateUI() {
  const statusBadge = document.getElementById('status-badge');
  const recordSection = document.getElementById('record-section');
  const recordingSection = document.getElementById('recording-section');
  const replaySection = document.getElementById('replay-section');
  
  // Reset all sections
  recordSection.classList.add('hidden');
  recordingSection.classList.add('hidden');
  replaySection.classList.add('hidden');
  statusBadge.className = 'status-badge';
  
  if (currentState.isRecording) {
    recordingSection.classList.remove('hidden');
    document.getElementById('recording-name').textContent = currentState.macroName || 'Untitled';
    statusBadge.textContent = 'Recording';
    statusBadge.classList.add('recording');
  } else if (currentState.isReplaying) {
    replaySection.classList.remove('hidden');
    document.getElementById('running-name').textContent = currentState.macroName || 'Macro';
    statusBadge.textContent = currentState.isPaused ? 'Paused' : 'Running';
    statusBadge.classList.add('running');
    
    const pauseBtn = document.getElementById('pause-replay');
    pauseBtn.innerHTML = currentState.isPaused ? 
      '<span class="btn-icon">▶</span>Resume' : 
      '<span class="btn-icon">⏸</span>Pause';
  } else {
    recordSection.classList.remove('hidden');
    statusBadge.textContent = 'Ready';
  }
}

async function loadMacros() {
  const macros = await chrome.runtime.sendMessage({ type: 'GET_MACROS' });
  const container = document.getElementById('macros-list');
  
  const macroList = Object.values(macros);
  
  if (macroList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>No macros yet</p>
        <p class="empty-hint">Click "Start Recording" to create your first macro</p>
      </div>
    `;
    return;
  }
  
  // Sort by creation date (newest first)
  macroList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  container.innerHTML = macroList.map(macro => `
    <div class="macro-item" data-name="${escapeHtml(macro.name)}">
      <div class="macro-info">
        <div class="macro-name">${escapeHtml(macro.name)}</div>
        <div class="macro-meta">${macro.steps.length} steps • ${formatDate(macro.createdAt)}</div>
      </div>
      <div class="macro-actions">
        <button class="macro-btn play" title="Run macro">▶</button>
        <button class="macro-btn export" title="Export">📤</button>
        <button class="macro-btn edit" title="Edit name">✏️</button>
        <button class="macro-btn delete" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');
  
  // Attach event listeners
  container.querySelectorAll('.macro-item').forEach(item => {
    const name = item.dataset.name;
    
    item.querySelector('.play').onclick = () => runMacro(name);
    item.querySelector('.export').onclick = () => exportMacro(name);
    item.querySelector('.edit').onclick = () => editMacroName(name);
    item.querySelector('.delete').onclick = () => deleteMacro(name);
  });
}

async function loadSettings() {
  const { settings } = await chrome.storage.local.get(['settings']);
  
  if (settings) {
    document.getElementById('replay-speed').value = settings.replaySpeed || 1;
    document.getElementById('wait-timeout').value = settings.waitTimeout || 10000;
    document.getElementById('highlight-elements').checked = settings.highlightElements !== false;
  }
}

async function saveSettings() {
  const settings = {
    replaySpeed: parseFloat(document.getElementById('replay-speed').value),
    waitTimeout: parseInt(document.getElementById('wait-timeout').value),
    highlightElements: document.getElementById('highlight-elements').checked
  };
  
  await chrome.storage.local.set({ settings });
  addLog('Settings saved', 'success');
}

function setupEventListeners() {
  // Recording controls
  document.getElementById('start-record').onclick = startRecording;
  document.getElementById('stop-record').onclick = stopRecording;
  
  // Replay controls
  document.getElementById('pause-replay').onclick = togglePause;
  document.getElementById('stop-replay').onclick = stopReplay;
  
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => switchTab(tab.dataset.tab);
  });
  
  // Import
  document.getElementById('import-btn').onclick = () => {
    document.getElementById('import-file').click();
  };
  
  document.getElementById('import-file').onchange = handleImport;
  
  // Settings
  document.getElementById('replay-speed').onchange = saveSettings;
  document.getElementById('wait-timeout').onchange = saveSettings;
  document.getElementById('highlight-elements').onchange = saveSettings;
  
  document.getElementById('export-all').onclick = exportAllMacros;
  document.getElementById('clear-all').onclick = clearAllData;
  
  // Logs
  document.getElementById('clear-logs').onclick = clearLogs;
  
  // Modal
  document.querySelector('.modal-backdrop').onclick = closeModal;
  document.getElementById('modal-cancel').onclick = closeModal;
}

async function startRecording() {
  const nameInput = document.getElementById('macro-name');
  const name = nameInput.value.trim() || `Macro ${new Date().toLocaleString()}`;
  
  const result = await chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    name
  });
  
  if (result.success) {
    addLog(`Started recording: ${name}`, 'success');
    nameInput.value = '';
    await refreshState();
  } else {
    addLog(`Failed to start recording: ${result.error}`, 'error');
  }
}

async function stopRecording() {
  const result = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  
  if (result.success) {
    const steps = result.macro.steps.length;
    addLog(`Stopped recording: ${result.macro.name} (${steps} steps)`, 'success');
    await loadMacros();
    await refreshState();
  } else {
    addLog(`Failed to stop recording: ${result.error}`, 'error');
  }
}

async function runMacro(name) {
  const result = await chrome.runtime.sendMessage({
    type: 'RUN_MACRO',
    name
  });
  
  if (result.success || result.complete) {
    addLog(`Running macro: ${name}`, 'success');
    currentState.macroName = name;
    await refreshState();
    
    // Close popup to show page
    window.close();
  } else if (result.error) {
    addLog(`Failed to run macro: ${result.error}`, 'error');
  }
}

async function togglePause() {
  const type = currentState.isPaused ? 'RESUME_REPLAY' : 'PAUSE_REPLAY';
  await chrome.runtime.sendMessage({ type });
  await refreshState();
}

async function stopReplay() {
  await chrome.runtime.sendMessage({ type: 'STOP_REPLAY' });
  addLog('Stopped replay', 'info');
  await refreshState();
}

async function deleteMacro(name) {
  showModal(
    'Delete Macro',
    `Are you sure you want to delete "${name}"?`,
    async () => {
      const result = await chrome.runtime.sendMessage({
        type: 'DELETE_MACRO',
        name
      });
      
      if (result.success) {
        addLog(`Deleted macro: ${name}`, 'success');
        await loadMacros();
      } else {
        addLog(`Failed to delete: ${result.error}`, 'error');
      }
      closeModal();
    }
  );
}

async function exportMacro(name) {
  const result = await chrome.runtime.sendMessage({
    type: 'EXPORT_MACRO',
    name
  });
  
  if (result.success) {
    downloadJson(result.data, `${name}.json`);
    addLog(`Exported: ${name}`, 'success');
  } else {
    addLog(`Export failed: ${result.error}`, 'error');
  }
}

async function editMacroName(oldName) {
  const newName = prompt('Enter new name:', oldName);
  if (newName && newName !== oldName) {
    const result = await chrome.runtime.sendMessage({
      type: 'RENAME_MACRO',
      oldName,
      newName
    });
    
    if (result.success) {
      addLog(`Renamed: ${oldName} → ${newName}`, 'success');
      await loadMacros();
    } else {
      addLog(`Rename failed: ${result.error}`, 'error');
    }
  }
}

async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const result = await chrome.runtime.sendMessage({
      type: 'IMPORT_MACRO',
      data: text
    });
    
    if (result.success) {
      addLog(`Imported: ${result.name}`, 'success');
      await loadMacros();
    } else {
      addLog(`Import failed: ${result.error}`, 'error');
    }
  } catch (err) {
    addLog(`Import failed: ${err.message}`, 'error');
  }
  
  e.target.value = '';
}

async function exportAllMacros() {
  const macros = await chrome.runtime.sendMessage({ type: 'GET_MACROS' });
  
  if (Object.keys(macros).length === 0) {
    addLog('No macros to export', 'error');
    return;
  }
  
  downloadJson(JSON.stringify(macros, null, 2), 'ligitimit-macros.json');
  addLog('Exported all macros', 'success');
}

async function clearAllData() {
  showModal(
    'Clear All Data',
    'This will delete ALL macros and settings. This cannot be undone.',
    async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ macros: {}, settings: {} });
      addLog('All data cleared', 'success');
      await loadMacros();
      await loadSettings();
      closeModal();
    }
  );
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

function addLog(message, type = 'info') {
  const now = new Date();
  logs.unshift({
    time: now.toLocaleTimeString(),
    message,
    type
  });
  
  // Keep only last 50 logs
  if (logs.length > 50) logs.pop();
  
  updateLogsUI();
}

function updateLogsUI() {
  const container = document.getElementById('logs-container');
  
  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📝</span>
        <p>No logs yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = logs.map(log => `
    <div class="log-entry ${log.type}">
      <span class="log-time">${log.time}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');
}

function clearLogs() {
  logs = [];
  updateLogsUI();
}

function showModal(title, body, onConfirm) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('modal-confirm').onclick = onConfirm;
  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  
  return date.toLocaleDateString();
}

function downloadJson(data, filename) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
