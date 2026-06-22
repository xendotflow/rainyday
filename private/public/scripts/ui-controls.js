// public/scripts/ui-controls.js
// Shared UI control functions for rainyday

(function() {
    'use strict';

    // ==========================================================================
    // MOBILE DETECTION
    // ==========================================================================
    function isMobileDevice() {
        return (('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0) || 
                (navigator.msMaxTouchPoints > 0)) &&
               window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    }

    // ==========================================================================
    // USER SESSION INITIALIZATION
    // ==========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        fetch('/whoami')
            .then(res => {
                if (!res.ok) throw new Error('Not logged in');
                return res.json();
            })
            .then(data => {
                const usernameDisplay = document.getElementById('usernameDisplay');
                if (usernameDisplay) {
                    usernameDisplay.textContent = data.username;
                    usernameDisplay.style.color = data.color || '#ffffff';
                }
                const colorInput = document.getElementById('nameColor');
                if (colorInput) {
                    colorInput.value = data.color || '#ffffff';
                }
            })
            .catch(() => {
                // Silently fail - user may not be logged in
            });

        // Setup modal click-outside-to-close
        setupModalListeners();
        
        // Initialize panel visibility based on device type
        initializePanelVisibility();
    });
    
    function initializePanelVisibility() {
        const chatContainer = document.getElementById('chatContainer');
        const usersContainer = document.getElementById('onlineUsersContainer');
        const chatBtn = document.getElementById('toggleChatButton');
        const playersBtn = document.getElementById('togglePlayersButton');
        const iconVisible = document.getElementById('onlineUsersIconVisible');
        const iconHidden = document.getElementById('onlineUsersIconHidden');
        
        if (isMobileDevice()) {
            // On mobile, panels start hidden (no mobile-visible class)
            // Icons should show "hidden" state
            if (iconVisible) iconVisible.style.display = 'none';
            if (iconHidden) iconHidden.style.display = 'block';
        } else {
            // On desktop, panels are visible by default
            if (chatContainer) chatContainer.classList.add('mobile-visible');
            if (usersContainer) usersContainer.classList.add('mobile-visible');
            // Icons should show "visible" state
            if (iconVisible) iconVisible.style.display = 'block';
            if (iconHidden) iconHidden.style.display = 'none';
        }
    }

    // ==========================================================================
    // MODAL FUNCTIONS
    // ==========================================================================
    function setupModalListeners() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.classList.remove('is-active');
                }
            });
        });
    }

    window.openAccountSettingsModal = function() {
        const modal = document.getElementById('accountSettingsModal');
        if (modal) modal.classList.add('is-active');
    };

    window.closeAccountSettingsModal = function() {
        const modal = document.getElementById('accountSettingsModal');
        if (modal) modal.classList.remove('is-active');
    };

    // ==========================================================================
    // VISIBILITY TOGGLES
    // ==========================================================================
    window.toggleChatVisibility = function() {
        const chatContainer = document.getElementById('chatContainer');
        const toggleBtn = document.getElementById('toggleChatButton');
        
        if (chatContainer) {
            if (isMobileDevice()) {
                // On mobile, toggle mobile-visible class
                chatContainer.classList.toggle('mobile-visible');
                const isVisible = chatContainer.classList.contains('mobile-visible');
                if (toggleBtn) toggleBtn.classList.toggle('active', isVisible);
            } else {
                // On desktop, toggle hidden class
                chatContainer.classList.toggle('hidden');
                if (toggleBtn) toggleBtn.classList.toggle('active', chatContainer.classList.contains('hidden'));
            }
        }
    };

    window.togglePlayersVisibility = function() {
        const playersContainer = document.getElementById('onlineUsersContainer');
        const iconVisible = document.getElementById('onlineUsersIconVisible');
        const iconHidden = document.getElementById('onlineUsersIconHidden');
        
        if (playersContainer) {
            let isHidden;
            
            if (isMobileDevice()) {
                // On mobile, toggle mobile-visible class
                playersContainer.classList.toggle('mobile-visible');
                isHidden = !playersContainer.classList.contains('mobile-visible');
            } else {
                // On desktop, toggle hidden class
                playersContainer.classList.toggle('hidden');
                isHidden = playersContainer.classList.contains('hidden');
            }
            
            if (iconVisible) iconVisible.style.display = isHidden ? 'none' : 'block';
            if (iconHidden) iconHidden.style.display = isHidden ? 'block' : 'none';
        }
    };

    window.toggleFullscreen = function() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
        } else if (viewport.requestFullscreen) {
            viewport.requestFullscreen();
        } else if (viewport.webkitRequestFullscreen) {
            viewport.webkitRequestFullscreen();
        } else if (viewport.msRequestFullscreen) {
            viewport.msRequestFullscreen();
        }
    };

    // ==========================================================================
    // DO NOT DISTURB (DND) MODE
    // ==========================================================================
    let isDNDModeActive = false;

    window.toggleDNDMode = function() {
        isDNDModeActive = !isDNDModeActive;
        const dndButton = document.getElementById('toggleDNDButton');
        
        document.body.classList.toggle('dnd-mode', isDNDModeActive);
        if (dndButton) {
            dndButton.classList.toggle('active', isDNDModeActive);
        }
        
        // Send DND state to server if WebSocket is available
        if (window.chatWs && window.chatWs.readyState === 1) {
            window.chatWs.send(JSON.stringify({
                type: 'dndStatus',
                isDND: isDNDModeActive
            }));
        }
    };

    window.isDNDMode = function() {
        return isDNDModeActive;
    };

    // ==========================================================================
    // ACCOUNT SETTINGS FUNCTIONS
    // ==========================================================================
    window.saveNameColor = function() {
        const colorInput = document.getElementById('nameColor');
        const usernameDisplay = document.getElementById('usernameDisplay');
        
        if (!colorInput) return;
        
        const chosenColor = colorInput.value;
        if (usernameDisplay) {
            usernameDisplay.style.color = chosenColor;
        }
        
        fetch('/api/name-color', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ color: chosenColor })
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to save color');
            return response.json();
        })
        .then(() => {
            window.closeAccountSettingsModal?.();
        })
        .catch(error => {
            console.error('Error saving color:', error);
            alert('Could not save color. Please try again.');
        });
    };

    window.uploadBadge = function() {
        const fileInput = document.getElementById('badgeFile');
        if (!fileInput?.files?.length) {
            alert('Please select a badge image (PNG or GIF).');
            return;
        }
        
        const formData = new FormData();
        formData.append('badgeFile', fileInput.files[0]);

        fetch('/api/upload-badge', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Upload failed'); });
            }
            return response.json();
        })
        .then(() => {
            alert('Badge uploaded successfully!');
            fileInput.value = '';
            window.closeAccountSettingsModal?.();
        })
        .catch(error => {
            console.error('Error uploading badge:', error);
            alert('Error uploading badge: ' + error.message);
        });
    };

    window.uploadPing = function() {
        const fileInput = document.getElementById('pingFile');
        if (!fileInput?.files?.length) {
            alert('Please select a ping sound file (WAV or MP3).');
            return;
        }
        
        const formData = new FormData();
        formData.append('pingFile', fileInput.files[0]);

        fetch('/api/upload-ping', {
            method: 'POST',
            body: formData
        })
        .then(async response => {
            const contentType = response.headers.get('content-type');
            const isJson = contentType && contentType.includes('application/json');
            
            if (!response.ok) {
                if (isJson) {
                    const err = await response.json();
                    throw new Error(err.error || 'Upload failed');
                } else {
                    const text = await response.text();
                    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
                }
            }
            
            if (isJson) {
                return response.json();
            } else {
                throw new Error('Server returned non-JSON response');
            }
        })
        .then(() => {
            alert('Ping sound uploaded successfully!');
            fileInput.value = '';
            window.closeAccountSettingsModal?.();
        })
        .catch(error => {
            console.error('Error uploading ping:', error);
            alert('Error uploading ping sound: ' + error.message);
        });
    };
})();

