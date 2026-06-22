// public/scripts/home.js

// Populated from /api/games on load
let gameIds = [];

// Cache DOM elements
const doorsContainer = document.getElementById('doors');
const usernameDisplay = document.getElementById('usernameDisplay');
const colorInput = document.getElementById('nameColor');
const closeRegistrationsButton = document.getElementById('closeRegistrationsButton');


const assetForm = document.getElementById('assetForm');
const gameSelect = document.getElementById('gameSelect');
const gameSelectSettings = document.getElementById('gameSelectSettings');
const assetSelectSettings = document.getElementById('assetSelectSettings');

// State variables
let userLogoPreferences = {};
let currentUser = null; // Store user data

// --- Initialization ---

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.GameNames.loadGames();
        gameIds = window.GameNames.getAllCodes();
    } catch (error) {
        console.error('failed to load games:', error);
        gameIds = [];
    }

    initializeUserSession();
    populateGameSelects();
    setupEventListeners();
    setupPointsTooltipObserver();
});

async function initializeUserSession() {
    try {
        const response = await fetch('/whoami');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        currentUser = data;

        // Update UI with user data
        if (usernameDisplay) {
            usernameDisplay.textContent = data.username;
            usernameDisplay.style.color = data.color || 'var(--base-text-color)'; // Use theme variable as fallback
            // Points and title are now handled by pointsSystem.js and the MutationObserver below
            // const points = data.points || '0'; 
            // usernameDisplay.setAttribute('data-points', points);
            // usernameDisplay.title = `${points} points`;
        }
        if (colorInput) {
            colorInput.value = data.color || '#e0e0e0'; // Default to base text color
        }
        if (closeRegistrationsButton && data.isAdmin) {
            closeRegistrationsButton.style.display = 'inline-block';
        }

        if (document.getElementById('assetSubmissionButton') && data.isAdmin) {
            document.getElementById('assetSubmissionButton').style.display = 'inline-block';
        }


        // After getting user data, fetch preferences
        await loadUserPreferences();

    } catch (error) {
        console.error('Error fetching user data:', error);
        // Redirect to login if user data fetch fails (likely not logged in)
        window.location.href = '/login.html';
    }
}

async function loadUserPreferences() {
    try {
        const response = await fetch('/assets/preferences');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        userLogoPreferences = await response.json();
        loadGameLogos();
    } catch (error) {
        loadGameLogos();
    }
}

function setupEventListeners() {
    if (assetForm) {
        assetForm.addEventListener('submit', handleAssetUpload);
    }
    
    // Handle asset type change to show/hide stamp fields
    const assetTypeSelect = document.getElementById('assetType');
    if (assetTypeSelect) {
        assetTypeSelect.addEventListener('change', function() {
            const stampFields = document.getElementById('stampFields');
            if (stampFields) {
                stampFields.style.display = this.value === 'stamps' ? 'block' : 'none';
            }
        });
    }
    
    // Other listeners if needed can go here
}

// --- Game Logo Handling ---

function populateGameSelects() {
    const selects = [gameSelect, gameSelectSettings];
    selects.forEach(select => {
        if (select) {
            select.innerHTML = ''; // Clear existing options
            gameIds.forEach(gameId => {
                const option = document.createElement('option');
                option.value = gameId;
                option.textContent = window.GameNames ? window.GameNames.getDisplayName(gameId) : gameId.charAt(0).toUpperCase() + gameId.slice(1); // Use consistent game names
                select.appendChild(option);
            });
        }
    });
    // Trigger change on settings select to load initial assets if needed
    if (gameSelectSettings && gameSelectSettings.options.length > 0) {
        gameSelectSettings.dispatchEvent(new Event('change'));
    }
}

function loadGameLogos() {
    if (!doorsContainer) return;
    doorsContainer.innerHTML = '';

    if (gameIds.length === 0) {
        doorsContainer.innerHTML = '<p>no games yet. add a game folder to private/public/play/games/</p>';
        return;
    }

    gameIds.forEach(gameId => {
        const doorDiv = document.createElement('div');
        doorDiv.className = 'door';
        doorDiv.title = `Play ${window.GameNames ? window.GameNames.getDisplayName(gameId) : gameId}`;

        const doorLink = document.createElement('a');
        doorLink.href = `/?game=${gameId}`;

        const doorImg = document.createElement('img');
        const defaultLogo = `/assets/images/logos/${gameId}/logo_${gameId}.png`;
        const logoPath = (userLogoPreferences[gameId] && userLogoPreferences[gameId] !== 'none')
                         ? userLogoPreferences[gameId]
                         : defaultLogo;

        doorImg.src = logoPath;
        doorImg.alt = `${window.GameNames ? window.GameNames.getDisplayName(gameId) : gameId} logo`;
        doorImg.loading = 'lazy';

        if (userLogoPreferences[gameId] === 'none') {
            doorDiv.style.display = 'none';
        }

        doorImg.onerror = () => doorDiv.style.display = 'none';

        doorLink.appendChild(doorImg);
        doorDiv.appendChild(doorLink);
        doorsContainer.appendChild(doorDiv);
    });
}



// --- Asset Upload Handling ---

async function handleAssetUpload(event) {
    event.preventDefault();
    const formData = new FormData(assetForm);
    const assetType = formData.get('type');
    const submitButton = assetForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = 'Uploading...';

    try {
        let endpoint = '/assets/upload';
        
        // If it's a stamp, use the stamp upload endpoint
        if (assetType === 'stamps') {
            endpoint = '/stamps/upload';
            
            // Validate required stamp fields
            const mapId = document.getElementById('mapId').value;
            const stampName = document.getElementById('stampName').value;
            const stampLocation = document.getElementById('stampLocation').value;
            
            if (!mapId || !stampName || !stampLocation) {
                throw new Error('Please fill in all required stamp fields (Map ID, Name, and Location).');
            }
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Upload failed on server.');
        }
        
        const successMessage = assetType === 'stamps' 
            ? 'Stamp uploaded successfully and added to collection!' 
            : 'Asset uploaded successfully! It may require approval.';
        alert(successMessage);
        window.closeAssetModal(); // Close modal on success (function defined inline in HTML)
        
        // Reset form
        assetForm.reset();
        document.getElementById('stampFields').style.display = 'none';
        
    } catch (error) {
        console.error('Asset upload error:', error);
        alert(`Asset upload failed: ${error.message}`);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Submit';
    }
}

// --- Home Settings / Logo Preferences Handling ---

// Exposed function for Game select change in settings
window.loadGameAssets = async function(selectedGame) {
    if (!assetSelectSettings) return;
    assetSelectSettings.innerHTML = '<option value="none">Default</option>';
    assetSelectSettings.disabled = true;

    try {
        const response = await fetch(`/assets/logos/${selectedGame}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const logos = await response.json();

        if (logos && logos.length > 0) {
            assetSelectSettings.disabled = false;
            logos.forEach(logo => {
                const option = document.createElement('option');
                // Construct the full path expected by the backend/frontend
                option.value = `/assets/images/logos/${selectedGame}/${logo}`;
                option.textContent = logo; // Display just the filename
                assetSelectSettings.appendChild(option);
            });
            // Set current preference
            assetSelectSettings.value = userLogoPreferences[selectedGame] || 'none';
        } else {
             assetSelectSettings.value = 'none'; // Ensure default is selected if no assets
        }
    } catch (error) {
        console.warn(`Could not load assets for ${selectedGame}:`, error);
        assetSelectSettings.value = 'none'; // Ensure default on error
    }
};

async function saveLogoPreferences(newPreferences) {
    try {
        const response = await fetch('/assets/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newPreferences)
        });
        if (!response.ok) {
            throw new Error('Save failed on server.');
        }
        userLogoPreferences = newPreferences;
        loadGameLogos();
        return true;
    } catch (error) {
        alert('Failed to save logo preferences.');
        return false;
    }
}

// Exposed functions for Home Settings buttons
window.saveHomeSettings = function() {
    if (!gameSelectSettings || !assetSelectSettings) return;
    const selectedGame = gameSelectSettings.value;
    const selectedAssetPath = assetSelectSettings.value; // This is 'none' or the full path
    const newPreferences = { ...userLogoPreferences };

    if (selectedAssetPath === 'none') {
        // If 'Default' is selected, remove the specific preference for this game
        delete newPreferences[selectedGame];
    } else {
        newPreferences[selectedGame] = selectedAssetPath;
    }

    saveLogoPreferences(newPreferences).then(success => {
        if (success) {
            // Close modal on success (function defined inline in HTML)
            window.closeHomeSettingsModal?.();
        }
    });
};

window.resetToDefault = function() {
    if (!gameSelectSettings) return;
    const selectedGame = gameSelectSettings.value;
    const newPreferences = { ...userLogoPreferences };
    delete newPreferences[selectedGame]; // Remove preference for this game
    saveLogoPreferences(newPreferences).then(success => {
        if (success && assetSelectSettings) {
            assetSelectSettings.value = 'none'; // Reset dropdown to Default
        }
    });
};

window.clearAllLogos = function() {
    if (confirm("Are you sure you want to reset all game logos to their defaults?")) {
        saveLogoPreferences({}); // Save an empty object to clear all preferences
    }
};

// Note: saveNameColor, uploadBadge, uploadPing are now in ui-controls.js

// --- Admin Actions ---
window.toggleRegistrations = async function() {
    if (!currentUser || !currentUser.isAdmin) return;
    try {
        const response = await fetch('/admin/toggle-registrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Failed to toggle registrations.');
        }
        alert(data.message || 'Registration status toggled.');
    } catch (error) {
        alert(`An error occurred: ${error.message}`);
    }
};

// --- Utilities ---
window.switchTab = function(tabName) {
    const activeModal = document.querySelector('.modal.is-active .modal-content');
    if (!activeModal) return;

    activeModal.querySelectorAll('.modal-tab, .modal-tab-content').forEach(el => {
        el.classList.remove('active');
    });
    const tabButton = activeModal.querySelector(`.modal-tab[data-tab="${tabName}"]`);
    const tabContent = activeModal.querySelector(`#${tabName}Content`);
    if (tabButton) tabButton.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
};

// --- Points Tooltip Observer ---
function setupPointsTooltipObserver() {
    if (!usernameDisplay) return;

    const updateTitle = () => {
        const points = usernameDisplay.dataset.points || '0';
        usernameDisplay.title = `${points} points`;
    };

    updateTitle();

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-points') {
                updateTitle();
            }
        }
    });

    observer.observe(usernameDisplay, { attributes: true });
}
