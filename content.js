// LiGiTiMiT - Content Script
// Captures user actions and executes replay steps

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.__LIGITIMIT_LOADED__) return;
  window.__LIGITIMIT_LOADED__ = true;
  
  let isRecording = false;
  let highlightOverlay = null;
  let statusIndicator = null;
  
  // ==========================================
  // SELECTOR GENERATION
  // ==========================================
  
  function generateSelector(element) {
    // Try multiple strategies and return the best one
    const strategies = [
      () => getIdSelector(element),
      () => getDataTestSelector(element),
      () => getAriaSelector(element),
      () => getClassSelector(element),
      () => getNthChildSelector(element),
      () => getXPathSelector(element)
    ];
    
    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && isUniqueSelector(selector)) {
        return selector;
      }
    }
    
    // Fallback to complex selector
    return getComplexSelector(element);
  }
  
  function getIdSelector(element) {
    if (element.id && !element.id.match(/^[0-9]/)) {
      return `#${CSS.escape(element.id)}`;
    }
    return null;
  }
  
  function getDataTestSelector(element) {
    const testAttrs = ['data-testid', 'data-test', 'data-cy', 'data-automation-id'];
    for (const attr of testAttrs) {
      if (element.hasAttribute(attr)) {
        return `[${attr}="${element.getAttribute(attr)}"]`;
      }
    }
    return null;
  }
  
  function getAriaSelector(element) {
    if (element.hasAttribute('aria-label')) {
      return `[aria-label="${element.getAttribute('aria-label')}"]`;
    }
    if (element.hasAttribute('name')) {
      return `[name="${element.getAttribute('name')}"]`;
    }
    return null;
  }
  
  function getClassSelector(element) {
    if (element.classList.length > 0) {
      const classes = Array.from(element.classList)
        .filter(c => !c.match(/^[0-9]/) && !c.includes(':'))
        .slice(0, 3)
        .map(c => CSS.escape(c))
        .join('.');
      if (classes) {
        const selector = `${element.tagName.toLowerCase()}.${classes}`;
        if (isUniqueSelector(selector)) {
          return selector;
        }
      }
    }
    return null;
  }
  
  function getNthChildSelector(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();
      
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(el => el.tagName === current.tagName);
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ');
  }
  
  function getXPathSelector(element) {
    const path = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      
      const tag = current.tagName.toLowerCase();
      path.unshift(`${tag}[${index}]`);
      current = current.parentElement;
    }
    
    return 'xpath://' + path.join('/');
  }
  
  function getComplexSelector(element) {
    const parts = [];
    let current = element;
    
    while (current && current !== document.body && parts.length < 7) {
      let part = current.tagName.toLowerCase();
      
      if (current.id) {
        part = `#${CSS.escape(current.id)}`;
        parts.unshift(part);
        break;
      }
      
      if (current.classList.length > 0) {
        const cls = Array.from(current.classList)
          .filter(c => !c.match(/^[0-9]/))
          .slice(0, 2)
          .map(c => CSS.escape(c))
          .join('.');
        if (cls) part += `.${cls}`;
      }
      
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children)
          .filter(el => {
            if (el.tagName !== current.tagName) return false;
            if (part.includes('.')) {
              return el.matches(part);
            }
            return true;
          });
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }
      
      parts.unshift(part);
      current = current.parentElement;
    }
    
    return parts.join(' > ');
  }
  
  function isUniqueSelector(selector) {
    try {
      if (selector.startsWith('xpath://')) return true;
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }
  
  function findElement(selector, x, y) {
    // Try CSS selector first
    if (selector && !selector.startsWith('xpath://')) {
      try {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 1) {
          return elements[0];
        }
        // If multiple, try to find one near the coordinates
        if (elements.length > 1 && x !== undefined && y !== undefined) {
          for (const el of elements) {
            const rect = el.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
              return el;
            }
          }
        }
      } catch (e) {}
    }
    
    // Try XPath
    if (selector && selector.startsWith('xpath://')) {
      try {
        const xpath = selector.replace('xpath://', '');
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) {
          return result.singleNodeValue;
        }
      } catch (e) {}
    }
    
    // Fallback to coordinates
    if (x !== undefined && y !== undefined) {
      return document.elementFromPoint(x, y);
    }
    
    return null;
  }
  
  // ==========================================
  // EVENT RECORDING
  // ==========================================
  
  function recordEvent(type, data) {
    if (!isRecording) return;
    
    chrome.runtime.sendMessage({
      type: 'RECORD_ACTION',
      action: {
        type,
        ...data
      }
    });
  }
  
  function handleClick(e) {
    if (!isRecording) return;
    if (e.target.closest('#ligitimit-status')) return;
    
    const element = e.target;
    const rect = element.getBoundingClientRect();
    
    recordEvent('click', {
      selector: generateSelector(element),
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      button: e.button,
      tagName: element.tagName,
      textContent: element.textContent?.slice(0, 100)
    });
  }
  
  function handleInput(e) {
    if (!isRecording) return;
    
    const element = e.target;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) return;
    
    recordEvent('input', {
      selector: generateSelector(element),
      value: element.value,
      inputType: element.type || 'text',
      tagName: element.tagName
    });
  }
  
  function handleKeydown(e) {
    if (!isRecording) return;
    
    // Only record special keys
    const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!specialKeys.includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) return;
    
    recordEvent('keydown', {
      selector: generateSelector(e.target),
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    });
  }
  
  let scrollTimeout = null;
  function handleScroll(e) {
    if (!isRecording) return;
    
    // Debounce scroll events
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    scrollTimeout = setTimeout(() => {
      const target = e.target === document ? document.documentElement : e.target;
      
      recordEvent('scroll', {
        selector: e.target === document ? 'window' : generateSelector(target),
        scrollX: target.scrollLeft || window.scrollX,
        scrollY: target.scrollTop || window.scrollY
      });
    }, 150);
  }
  
  function handleSelect(e) {
    if (!isRecording) return;
    
    const element = e.target;
    if (element.tagName !== 'SELECT') return;
    
    recordEvent('select', {
      selector: generateSelector(element),
      value: element.value,
      selectedIndex: element.selectedIndex,
      selectedText: element.options[element.selectedIndex]?.text
    });
  }
  
  function handleFocus(e) {
    if (!isRecording) return;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    
    recordEvent('focus', {
      selector: generateSelector(e.target),
      tagName: e.target.tagName
    });
  }
  
  // ==========================================
  // REPLAY EXECUTION
  // ==========================================
  
  async function executeStep(step) {
    const { settings } = await chrome.storage.local.get(['settings']);
    const timeout = settings?.waitTimeout || 10000;
    
    try {
      switch (step.type) {
        case 'click':
          await executeClick(step, timeout, settings);
          break;
        
        case 'input':
          await executeInput(step, timeout);
          break;
        
        case 'keydown':
          await executeKeydown(step, timeout);
          break;
        
        case 'scroll':
          await executeScroll(step);
          break;
        
        case 'select':
          await executeSelect(step, timeout);
          break;
        
        case 'focus':
          await executeFocus(step, timeout);
          break;
        
        case 'navigate':
          await executeNavigate(step);
          break;
        
        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  async function waitForElement(selector, x, y, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = findElement(selector, x, y);
      if (element && isElementVisible(element)) {
        return element;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    
    throw new Error(`Element not found: ${selector}`);
  }
  
  function isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  
  async function executeClick(step, timeout, settings) {
    const element = await waitForElement(step.selector, step.x, step.y, timeout);
    
    if (settings?.highlightElements) {
      highlightElement(element);
    }
    
    // Scroll element into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 200));
    
    // Simulate mouse events
    const rect = element.getBoundingClientRect();
    const x = rect.left + (step.offsetX || rect.width / 2);
    const y = rect.top + (step.offsetY || rect.height / 2);
    
    const mouseEvents = ['mouseenter', 'mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'];
    
    for (const eventType of mouseEvents) {
      const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button: step.button || 0
      });
      element.dispatchEvent(event);
      await new Promise(r => setTimeout(r, 10));
    }
    
    // Also try native click
    element.click();
    
    clearHighlight();
  }
  
  async function executeInput(step, timeout) {
    const element = await waitForElement(step.selector, undefined, undefined, timeout);
    
    highlightElement(element);
    
    // Focus the element
    element.focus();
    await new Promise(r => setTimeout(r, 50));
    
    // Clear existing value
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Type character by character for more realistic simulation
    for (const char of step.value) {
      element.value += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await new Promise(r => setTimeout(r, 20));
    }
    
    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    clearHighlight();
  }
  
  async function executeKeydown(step, timeout) {
    const element = step.selector ? 
      await waitForElement(step.selector, undefined, undefined, timeout) : 
      document.activeElement || document.body;
    
    const event = new KeyboardEvent('keydown', {
      key: step.key,
      code: step.code,
      ctrlKey: step.ctrlKey,
      shiftKey: step.shiftKey,
      altKey: step.altKey,
      metaKey: step.metaKey,
      bubbles: true,
      cancelable: true
    });
    
    element.dispatchEvent(event);
    
    // Also dispatch keyup
    const upEvent = new KeyboardEvent('keyup', {
      key: step.key,
      code: step.code,
      ctrlKey: step.ctrlKey,
      shiftKey: step.shiftKey,
      altKey: step.altKey,
      metaKey: step.metaKey,
      bubbles: true
    });
    element.dispatchEvent(upEvent);
    
    // Handle Enter on forms
    if (step.key === 'Enter' && element.form) {
      element.form.dispatchEvent(new Event('submit', { bubbles: true }));
    }
  }
  
  async function executeScroll(step) {
    if (step.selector === 'window') {
      window.scrollTo({
        left: step.scrollX,
        top: step.scrollY,
        behavior: 'smooth'
      });
    } else {
      const element = findElement(step.selector);
      if (element) {
        element.scrollTo({
          left: step.scrollX,
          top: step.scrollY,
          behavior: 'smooth'
        });
      }
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  async function executeSelect(step, timeout) {
    const element = await waitForElement(step.selector, undefined, undefined, timeout);
    
    highlightElement(element);
    
    element.value = step.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    
    clearHighlight();
  }
  
  async function executeFocus(step, timeout) {
    const element = await waitForElement(step.selector, undefined, undefined, timeout);
    element.focus();
  }
  
  async function executeNavigate(step) {
    window.location.href = step.url;
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // ==========================================
  // UI HELPERS
  // ==========================================
  
  function highlightElement(element) {
    clearHighlight();
    
    const rect = element.getBoundingClientRect();
    
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'ligitimit-highlight';
    highlightOverlay.style.cssText = `
      position: fixed;
      top: ${rect.top - 2}px;
      left: ${rect.left - 2}px;
      width: ${rect.width + 4}px;
      height: ${rect.height + 4}px;
      border: 2px solid #00ff00;
      background: rgba(0, 255, 0, 0.1);
      pointer-events: none;
      z-index: 999999;
      border-radius: 4px;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
      transition: all 0.2s ease;
    `;
    
    document.body.appendChild(highlightOverlay);
  }
  
  function clearHighlight() {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
  }
  
  function showStatus(text, type = 'info') {
    if (!statusIndicator) {
      statusIndicator = document.createElement('div');
      statusIndicator.id = 'ligitimit-status';
      statusIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
      `;
      document.body.appendChild(statusIndicator);
    }
    
    const colors = {
      recording: { bg: '#ff4444', text: '#ffffff' },
      running: { bg: '#44aa44', text: '#ffffff' },
      error: { bg: '#ff8800', text: '#ffffff' },
      info: { bg: '#333333', text: '#ffffff' }
    };
    
    const color = colors[type] || colors.info;
    statusIndicator.style.backgroundColor = color.bg;
    statusIndicator.style.color = color.text;
    
    const icons = {
      recording: '⏺',
      running: '▶',
      error: '⚠',
      info: 'ℹ'
    };
    
    statusIndicator.innerHTML = `<span>${icons[type] || ''}</span><span>${text}</span>`;
  }
  
  function hideStatus() {
    if (statusIndicator) {
      statusIndicator.remove();
      statusIndicator = null;
    }
  }
  
  function showMissDetection(step, error) {
    const overlay = document.createElement('div');
    overlay.id = 'ligitimit-miss-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 999998;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    overlay.innerHTML = `
      <div style="
        background: white;
        padding: 30px;
        border-radius: 12px;
        max-width: 500px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      ">
        <h2 style="margin: 0 0 20px 0; color: #ff4444; font-size: 20px;">
          ⚠ Step Failed
        </h2>
        <p style="margin: 0 0 15px 0; color: #666;">
          <strong>Step ${step.step}:</strong> ${step.type}
        </p>
        <p style="margin: 0 0 15px 0; color: #333;">
          <strong>Error:</strong> ${error}
        </p>
        <p style="margin: 0 0 20px 0; color: #666; font-size: 13px;">
          <strong>Selector:</strong><br>
          <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${step.selector}</code>
        </p>
        <div style="display: flex; gap: 10px;">
          <button id="ligitimit-retry" style="
            flex: 1;
            padding: 12px 20px;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Retry</button>
          <button id="ligitimit-skip" style="
            flex: 1;
            padding: 12px 20px;
            background: #ff9800;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Skip Step</button>
          <button id="ligitimit-stop" style="
            flex: 1;
            padding: 12px 20px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Stop</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('ligitimit-retry').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({ type: 'RESUME_REPLAY' });
    };
    
    document.getElementById('ligitimit-skip').onclick = () => {
      overlay.remove();
      chrome.runtime.sendMessage({ type: 'REPLAY_STEP_COMPLETE', success: true });
    };
    
    document.getElementById('ligitimit-stop').onclick = () => {
      overlay.remove();
      hideStatus();
      chrome.runtime.sendMessage({ type: 'STOP_REPLAY' });
    };
  }
  
  // ==========================================
  // MESSAGE HANDLING
  // ==========================================
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'RECORDING_STARTED':
        isRecording = true;
        showStatus('Recording...', 'recording');
        attachEventListeners();
        sendResponse({ success: true });
        break;
      
      case 'RECORDING_STOPPED':
        isRecording = false;
        hideStatus();
        detachEventListeners();
        sendResponse({ success: true });
        break;
      
      case 'EXECUTE_STEP':
        showStatus(`Step ${message.stepIndex + 1}/${message.totalSteps}`, 'running');
        executeStep(message.step).then(result => {
          if (!result.success) {
            showMissDetection(message.step, result.error);
          }
          chrome.runtime.sendMessage({
            type: 'REPLAY_STEP_COMPLETE',
            success: result.success,
            error: result.error
          });
        });
        sendResponse({ success: true });
        break;
      
      case 'GET_RECORDING_STATE':
        sendResponse({ isRecording });
        break;
      
      case 'HIGHLIGHT_SELECTOR':
        try {
          const element = findElement(message.selector);
          if (element) {
            highlightElement(element);
            setTimeout(clearHighlight, 2000);
          }
        } catch (e) {}
        sendResponse({ success: true });
        break;
      
      default:
        sendResponse({ error: 'Unknown message type' });
    }
    return true;
  });
  
  // ==========================================
  // EVENT LISTENER MANAGEMENT
  // ==========================================
  
  function attachEventListeners() {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('change', handleSelect, true);
    document.addEventListener('focus', handleFocus, true);
  }
  
  function detachEventListeners() {
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('keydown', handleKeydown, true);
    document.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('change', handleSelect, true);
    document.removeEventListener('focus', handleFocus, true);
  }
  
  // Check initial state
  chrome.runtime.sendMessage({ type: 'GET_STATE' }).then(state => {
    if (state?.isRecording) {
      isRecording = true;
      showStatus('Recording...', 'recording');
      attachEventListeners();
    }
  }).catch(() => {});
  
})();
