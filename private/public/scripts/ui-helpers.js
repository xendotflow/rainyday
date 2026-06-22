// --- UI Helpers module ---
// Handles UI-related functionality

// --- Focus helper ---
let playerFocusElement = null;
function focusPlayer(element) {
    if (element !== undefined) playerFocusElement = element;
    if (playerFocusElement) {
        playerFocusElement.focus();
        return;
    }
    document.getElementById('canvas').focus();
}

// --- Fullscreen handling ---
function setupFullscreenButton() {
    document.getElementById('controls-fullscreen').addEventListener('click', () => {
        const viewport = document.getElementById('viewport');
        if (viewport.requestFullscreen) viewport.requestFullscreen();
    });
}

// --- Initialize UI elements ---
function initUIHelpers(canvas) {
    canvas.addEventListener('mouseenter', () => focusPlayer());
    canvas.addEventListener('click', () => focusPlayer());
    setupFullscreenButton();
}

export { 
    focusPlayer, 
    setupFullscreenButton, 
    initUIHelpers 
}; 