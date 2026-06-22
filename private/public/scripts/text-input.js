// --- Text Input module ---
// Handles text input functionality for the EasyRPG Player

import { simulateKeyboardInput } from './input-handlers.js';
import { focusPlayer } from './ui-helpers.js';

function createTextInputHelper(Module, canvas) {
    const proxy = document.createElement('input');
    Object.assign(proxy.style, {
        position: 'absolute',
        opacity: 0,
        width: '0px',
        height: '0px'
    });
    proxy.id = 'proxy';
    canvas.insertAdjacentElement('beforebegin', proxy);
    let proxyBlocked = false;
    let isPressingControl = false;
    
    ['keydown', 'keypress', 'keyup', 'mousedown', 'mouseenter', 'mouseleave', 'mousemove', 'wheel', 'touchcancel', 'touchend', 'touchmove', 'touchstart', 'webglcontextlost', 'contextmenu'].forEach(eventType => {
        proxy.addEventListener(eventType, event => {
            if (proxyBlocked && event.type !== 'keyup') return;
            if (event.type === 'keydown' && event.key === 'Control') isPressingControl = true;
            if (event.type === 'keyup' && event.key === 'Control') isPressingControl = false;
            if (isPressingControl && (event.code === 'KeyC' || event.code === 'KeyV')) return;
            canvas.dispatchEvent(new event.constructor(event.type, event));
        });
    });
    
    let isComposing = false;
    function handleInput() {
        Module.api.updateTextInputBuffer(proxy.value);
        proxy.value = "";
    }
    
    proxy.addEventListener('compositionstart', () => {
        isComposing = true;
        proxyBlocked = true;
    });
    
    proxy.addEventListener('compositionend', () => {
        isComposing = false;
        proxyBlocked = false;
        handleInput();
    });
    
    proxy.addEventListener('input', () => {
        if (!isComposing && proxy.value !== '') handleInput();
    });
    
    let clipboardText = "";
    proxy.addEventListener('copy', async (event) => {
        event.preventDefault();
        await simulateKeyboardInput('KeyC');
        navigator.clipboard.writeText(clipboardText);
    });
    
    proxy.addEventListener('paste', event => {
        event.preventDefault();
        clipboardText = event.clipboardData.getData('text/plain');
        simulateKeyboardInput('KeyV');
    });
    
    return {
        startTextInput: () => { focusPlayer(proxy); },
        stopTextInput: () => { focusPlayer(null); },
        setTextInputRect: (x, y) => {
            proxy.style.left = `${x}px`;
            proxy.style.top = `${y}px`;
        },
        getClipboardText: () => clipboardText,
        setClipboardText: text => { clipboardText = text; }
    };
}

export { createTextInputHelper }; 