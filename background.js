// LiGiTiMiT - Background Service Worker
// Handles macro storage, recording state, and replay orchestration

const STATE = {
  isRecording: false,
  currentMacro: null,
  currentMacroName: null,
  replayTabId: null,
  replayStepIndex: 0,
  replayMacro: null,
  isPaused: false
};

// Initialize storage
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['macros', 'settings']);
  if (!existing.macros) {
    await chrome.storage.local.set({ macros: {} });
  }
  if (!existing.settings) {
    await chrome.storage.local.set({ 
      settings: { 
        replaySpeed: 1.0,
        highlightElements: true,
        waitTimeout: 10000
      } 
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'START_RECORDING':
      return await startRecording(message.name);
    
    case 'STOP_RECORDING':
      return await stopRecording();
    
    case 'RECORD_ACTION':
      return recordAction(message.action, sender.tab);
    
    case 'GET_STATE':
      return { 
        isRecording: STATE.isRecording, 
        macroName: STATE.currentMacroName,
        isPaused: STATE.isPaused,
        isReplaying: STATE.replayMacro !== null
      };
    
    case 'GET_MACROS':
      return await getMacros();
    
    case 'RUN_MACRO':
      return await runMacro(message.name);
    
    case 'DELETE_MACRO':
      return await deleteMacro(message.name);
    
    case 'EXPORT_MACRO':
      return await exportMacro(message.name);
    
    case 'IMPORT_MACRO':
      return await importMacro(message.data);
    
    case 'PAUSE_REPLAY':
      STATE.isPaused = true;
      return { success: true };
    
    case 'RESUME_REPLAY':
      STATE.isPaused = false;
      return await continueReplay();
    
    case 'STOP_REPLAY':
      return stopReplay();
    
    case 'REPLAY_STEP_COMPLETE':
      return await handleStepComplete(message.success, message.error);
    
    case 'RENAME_MACRO':
      return await renameMacro(message.oldName, message.newName);
    
    default:
      return { error: 'Unknown message type' };
  }
}

async function startRecording(name) {
  if (STATE.isRecording) {
    return { error: 'Already recording' };
  }
  
  const macroName = name || `Macro ${Date.now()}`;
  
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return { error: 'No active tab' };
  }
  
  STATE.isRecording = true;
  STATE.currentMacroName = macroName;
  STATE.currentMacro = {
    name: macroName,
    createdAt: new Date().toISOString(),
    startUrl: tab.url,
    steps: []
  };
  
  // Notify content script
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STARTED' });
  } catch (e) {
    // Content script might not be ready
  }
  
  // Update badge
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  
  return { success: true, name: macroName };
}

async function stopRecording() {
  if (!STATE.isRecording) {
    return { error: 'Not recording' };
  }
  
  const macro = STATE.currentMacro;
  
  // Save macro
  const { macros } = await chrome.storage.local.get(['macros']);
  macros[macro.name] = macro;
  await chrome.storage.local.set({ macros });
  
  // Reset state
  STATE.isRecording = false;
  STATE.currentMacro = null;
  STATE.currentMacroName = null;
  
  // Notify all tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STOPPED' });
    } catch (e) {}
  }
  
  // Clear badge
  chrome.action.setBadgeText({ text: '' });
  
  return { success: true, macro };
}

function recordAction(action, tab) {
  if (!STATE.isRecording || !STATE.currentMacro) {
    return { error: 'Not recording' };
  }
  
  const step = {
    step: STATE.currentMacro.steps.length + 1,
    timestamp: Date.now(),
    tabId: tab?.id,
    url: tab?.url,
    ...action
  };
  
  STATE.currentMacro.steps.push(step);
  
  return { success: true, step };
}

async function getMacros() {
  const { macros } = await chrome.storage.local.get(['macros']);
  return macros || {};
}

async function runMacro(name) {
  const { macros } = await chrome.storage.local.get(['macros']);
  const macro = macros[name];
  
  if (!macro) {
    return { error: 'Macro not found' };
  }
  
  if (macro.steps.length === 0) {
    return { error: 'Macro has no steps' };
  }
  
  // Get or create tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    return { error: 'No active tab' };
  }
  
  STATE.replayTabId = tab.id;
  STATE.replayMacro = macro;
  STATE.replayStepIndex = 0;
  STATE.isPaused = false;
  
  // Update badge
  chrome.action.setBadgeText({ text: 'RUN' });
  chrome.action.setBadgeBackgroundColor({ color: '#00AA00' });
  
  // Navigate to start URL if different
  if (tab.url !== macro.startUrl) {
    await chrome.tabs.update(tab.id, { url: macro.startUrl });
    // Wait for navigation
    await waitForTabLoad(tab.id);
  }
  
  // Start replay
  return await executeNextStep();
}

async function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 500); // Extra wait for dynamic content
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });
}

async function executeNextStep() {
  if (!STATE.replayMacro || STATE.isPaused) {
    return { paused: true };
  }
  
  if (STATE.replayStepIndex >= STATE.replayMacro.steps.length) {
    // Replay complete
    stopReplay();
    return { success: true, complete: true };
  }
  
  const step = STATE.replayMacro.steps[STATE.replayStepIndex];
  
  // Check if URL changed and we need to navigate
  if (step.url && step.type !== 'navigate') {
    const tab = await chrome.tabs.get(STATE.replayTabId);
    if (tab.url !== step.url) {
      await chrome.tabs.update(STATE.replayTabId, { url: step.url });
      await waitForTabLoad(STATE.replayTabId);
    }
  }
  
  // Send step to content script
  try {
    await chrome.tabs.sendMessage(STATE.replayTabId, {
      type: 'EXECUTE_STEP',
      step: step,
      stepIndex: STATE.replayStepIndex,
      totalSteps: STATE.replayMacro.steps.length
    });
  } catch (e) {
    return { error: `Failed to execute step: ${e.message}` };
  }
  
  return { success: true, stepIndex: STATE.replayStepIndex };
}

async function handleStepComplete(success, error) {
  if (!success) {
    // Step failed
    STATE.isPaused = true;
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF6600' });
    return { error, paused: true, stepIndex: STATE.replayStepIndex };
  }
  
  // Move to next step
  STATE.replayStepIndex++;
  
  // Small delay between steps
  await new Promise(r => setTimeout(r, 100));
  
  return await executeNextStep();
}

async function continueReplay() {
  STATE.isPaused = false;
  chrome.action.setBadgeText({ text: 'RUN' });
  chrome.action.setBadgeBackgroundColor({ color: '#00AA00' });
  return await executeNextStep();
}

function stopReplay() {
  STATE.replayMacro = null;
  STATE.replayTabId = null;
  STATE.replayStepIndex = 0;
  STATE.isPaused = false;
  
  chrome.action.setBadgeText({ text: '' });
  
  return { success: true };
}

async function deleteMacro(name) {
  const { macros } = await chrome.storage.local.get(['macros']);
  if (macros[name]) {
    delete macros[name];
    await chrome.storage.local.set({ macros });
    return { success: true };
  }
  return { error: 'Macro not found' };
}

async function exportMacro(name) {
  const { macros } = await chrome.storage.local.get(['macros']);
  const macro = macros[name];
  if (!macro) {
    return { error: 'Macro not found' };
  }
  return { success: true, data: JSON.stringify(macro, null, 2) };
}

async function importMacro(data) {
  try {
    const macro = JSON.parse(data);
    if (!macro.name || !macro.steps) {
      return { error: 'Invalid macro format' };
    }
    
    const { macros } = await chrome.storage.local.get(['macros']);
    
    // Handle name conflicts
    let name = macro.name;
    let counter = 1;
    while (macros[name]) {
      name = `${macro.name} (${counter})`;
      counter++;
    }
    macro.name = name;
    
    macros[name] = macro;
    await chrome.storage.local.set({ macros });
    
    return { success: true, name };
  } catch (e) {
    return { error: `Import failed: ${e.message}` };
  }
}

async function renameMacro(oldName, newName) {
  const { macros } = await chrome.storage.local.get(['macros']);
  
  if (!macros[oldName]) {
    return { error: 'Macro not found' };
  }
  
  if (macros[newName]) {
    return { error: 'A macro with that name already exists' };
  }
  
  const macro = macros[oldName];
  macro.name = newName;
  delete macros[oldName];
  macros[newName] = macro;
  
  await chrome.storage.local.set({ macros });
  return { success: true };
}

// Listen for tab updates during replay
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === STATE.replayTabId && changeInfo.status === 'complete') {
    // Tab finished loading, might need to continue replay
  }
});
