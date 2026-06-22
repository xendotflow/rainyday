// --- Stamps Collection System ---
// A collectible system where players can collect stamps by visiting specific maps

// Configuration
const STAMP_STORAGE_KEY = 'collected_stamps';
const STAMP_GRID_VISIBLE_KEY = 'stamp_grid_visible';

// State
let currentGame = '';
let currentMapId = null;
let collectedStamps = {};
let isStampGridVisible = localStorage.getItem(STAMP_GRID_VISIBLE_KEY) === 'true';
let gridElement = null;
let isInitialized = false;
let stampMetadata = {};

let supportedGames = [];

function getSupportedGames() {
    if (window.GameNames && window.GameNames.getAllCodes().length) {
        return window.GameNames.getAllCodes();
    }
    if (supportedGames.length) {
        return supportedGames;
    }
    return Object.keys(stampMetadata);
}

async function loadSupportedGames() {
    if (window.GameNames) {
        await window.GameNames.loadGames();
        supportedGames = window.GameNames.getAllCodes();
        return supportedGames;
    }

    const response = await fetch('/api/games');
    if (!response.ok) {
        return [];
    }

    const games = await response.json();
    supportedGames = games.map((game) => game.id);
    return supportedGames;
}

function isSupportedGame(gameId) {
    if (!gameId) {
        return false;
    }
    return getSupportedGames().includes(gameId.toLowerCase());
}

// Function to get current game from URL
function getGameFromUrl() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const gameParam = urlParams.get('game');
        if (gameParam) {
            return gameParam.toLowerCase();
        }

        const gameMatch = window.location.href.match(/\/play\/games\/([^/?#]+)/);
        if (gameMatch && gameMatch[1]) {
            return gameMatch[1].toLowerCase();
        }

        return '';
    } catch (e) {
        console.error("Error detecting game from URL:", e);
        return '';
    }
}

// Initialize the stamps collection system
function initStampSystem() {
    console.log("Initializing stamps collection system...");
    
    if (isInitialized) {
        console.log("Stamp system already initialized, skipping...");
        return;
    }
    
    createStampGridUI();
    
    Promise.all([loadSupportedGames(), loadStampMetadata()]).then(() => {
        currentGame = getGameFromUrl();
        console.log(`Current game detected: ${currentGame}`);
        console.log(`Loaded stamp metadata:`, stampMetadata);
        
        isInitialized = true;
        
        // Load collected stamps from server
        loadCollectedStamps();
        
        // Start monitoring for map changes
        monitorMapChanges();
        
        // Set up key sequence detection
        setupKeySequenceDetection();
        
        // Hide the stamp grid initially
        setStampGridVisibility(false);
        
        console.log("🎖️ Stamps collection system initialized");
    }).catch(error => {
        console.error("Failed to initialize stamp system:", error);
        // Continue with initialization
        currentGame = getGameFromUrl();
        isInitialized = true;
        loadCollectedStamps();
        monitorMapChanges();
        setupKeySequenceDetection();
        setStampGridVisibility(false);
        console.log("🎖️ Stamps collection system initialized with fallback");
    });
}

// Load stamp metadata from stamplist.json
async function loadStampMetadata() {
    try {
        console.log("Loading stamp metadata from server...");
        const response = await fetch('/stamps/stamplist.json');
        if (!response.ok) {
            throw new Error(`Failed to load stamp metadata: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        if (!data || Object.keys(data).length === 0) {
            console.warn("Stamp metadata is empty or invalid");
            return {};
        }
        
        stampMetadata = data;
        console.log("Successfully loaded stamp metadata:", stampMetadata);
        return stampMetadata;
    } catch (error) {
        console.error("Error loading stamp metadata:", error);
        return {};
    }
}

// Get stamp info for a specific map ID and game
function getStampInfo(game, mapId) {
    if (stampMetadata && stampMetadata[game] && stampMetadata[game][mapId]) {
        return stampMetadata[game][mapId];
    }
    
    // Return default info if not found
    return {
        name: `Map ${mapId}`,
        location: "Unknown Location",
        description: "No information available for this stamp.",
        mapId: mapId
    };
}

// Load collected stamps from server
async function loadCollectedStamps() {
    try {
        console.log("Attempting to load collected stamps from server...");
        
        // Fetch stamps from server
        const response = await fetch('/stamps/user-stamps');
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server error response:", errorText);
            
            if (response.status === 404) {
                console.log("Stamps endpoint not found (404), using localStorage fallback");
                throw new Error("Stamps endpoint not available");
            }
            
            throw new Error(`Failed to load stamps from server: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("Parsed server response:", data);
        
        if (data && data.collectedStamps) {
            collectedStamps = data.collectedStamps;
        } else {
            // Initialize with empty collections for each game
            collectedStamps = {};
        }
    } catch (e) {
        console.error("Error loading collected stamps from server", e);
        
        // On error, try to load from localStorage as fallback
        try {
            const saved = localStorage.getItem(STAMP_STORAGE_KEY);
            if (saved) {
                collectedStamps = JSON.parse(saved);
                console.log("Loaded stamps from localStorage fallback:", collectedStamps);
                // Try to save to server as well (but don't fail if it doesn't work)
                saveCollectedStamps().catch(err => {
                    console.log("Could not save to server, continuing with localStorage:", err.message);
                });
            } else {
                // Initialize with empty collections
                getSupportedGames().forEach(game => {
                    collectedStamps[game] = [];
                });
                console.log("Initialized empty stamp collections");
            }
        } catch (localError) {
            console.error("Error loading from localStorage fallback", localError);
            // Initialize with empty collections
            collectedStamps = {};
            console.log("Initialized empty stamp collections after localStorage error");
        }
    }
    
    console.log("Final loaded collected stamps:", collectedStamps);
}

// Save collected stamps to server
async function saveCollectedStamps() {
    try {
        console.log("Attempting to save collected stamps to server:", collectedStamps);
        
        const response = await fetch('/stamps/user-stamps', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ collectedStamps })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server error response:", errorText);
            throw new Error(`Failed to save stamps to server: ${response.status} ${response.statusText}`);
        }
        
        console.log("Successfully saved stamps to server");
        
        // Also save to localStorage as fallback
        localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(collectedStamps));
    } catch (e) {
        console.error("Error saving collected stamps to server", e);
        
        // On error, save to localStorage as fallback
        try {
            localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(collectedStamps));
            console.log("Saved stamps to localStorage as fallback");
        } catch (localError) {
            console.error("Error saving to localStorage fallback", localError);
        }
    }
}

// Create the stamp grid UI
function createStampGridUI() {
    console.log("Creating stamp grid UI...");
    
    // Check if stamp grid already exists
    if (document.getElementById('stamp-grid')) {
        console.log("Stamp grid already exists, skipping creation");
        return;
    }
    
    // Create the stamp grid container
    gridElement = document.createElement('div');
    gridElement.id = 'stamp-grid';
    gridElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        height: 500px;
        background-color: rgba(0, 0, 0, 0.9);
        border: 2px solid #666;
        border-radius: 10px;
        z-index: 1000;
        display: none;
        padding: 20px;
        box-sizing: border-box;
        color: white;
        font-family: Arial, sans-serif;
    `;
    
    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 10px;
        border-bottom: 1px solid #666;
    `;
    
    const title = document.createElement('h2');
    title.textContent = 'Stamp Collection';
    title.style.cssText = `
        margin: 0;
        color: #fff;
        font-size: 24px;
    `;
    
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
        background: none;
        border: none;
        color: #fff;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    closeButton.onclick = toggleStampGridVisibility;
    
    header.appendChild(title);
    header.appendChild(closeButton);
    gridElement.appendChild(header);
    
    // Create game selector
    const gameSelector = document.createElement('div');
    gameSelector.style.cssText = `
        margin-bottom: 20px;
        text-align: center;
    `;
    
    const gameSelect = document.createElement('select');
    gameSelect.id = 'game-select';
    gameSelect.style.cssText = `
        padding: 8px 12px;
        border-radius: 5px;
        border: 1px solid #666;
        background-color: #333;
        color: white;
        font-size: 16px;
        cursor: pointer;
    `;
    
    // Add game options
    getSupportedGames().forEach(game => {
        const option = document.createElement('option');
        option.value = game;
        option.textContent = window.GameNames ? window.GameNames.getDisplayName(game) : game.toUpperCase();
        gameSelect.appendChild(option);
    });
    
    gameSelect.value = currentGame;
    gameSelect.onchange = (e) => {
        currentGame = e.target.value;
        populateStampGrid();
    };
    
    gameSelector.appendChild(gameSelect);
    gridElement.appendChild(gameSelector);

    // Create stamps container
    const stampsContainer = document.createElement('div');
    stampsContainer.id = 'stamps-container';
    stampsContainer.style.cssText = `
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 15px;
        height: 350px;
        overflow-y: auto;
        padding: 10px;
        background-color: rgba(255, 255, 255, 0.05);
        border-radius: 5px;
    `;
    
    gridElement.appendChild(stampsContainer);
    
    // Add to DOM
    document.body.appendChild(gridElement);
    
    console.log("Stamp grid UI created and added to DOM");
}

// Set up key sequence detection (0, 4, 2, 7) to toggle stamp grid
function setupKeySequenceDetection() {
    const targetSequence = ['0', '4', '2', '7'];
    let currentSequence = [];
    
    document.addEventListener('keydown', (event) => {
        const key = event.key;
        currentSequence.push(key);
        
        if (currentSequence.length > targetSequence.length) {
            currentSequence.shift();
        }
        
        if (currentSequence.length === targetSequence.length && 
            currentSequence.every((val, index) => val === targetSequence[index])) {
            toggleStampGridVisibility();
            currentSequence = [];
        }
    });
    
    console.log("Key sequence detection set up (0, 4, 2, 7)");
}

// Toggle stamp grid visibility
function toggleStampGridVisibility() {
    isStampGridVisible = !isStampGridVisible;
    setStampGridVisibility(isStampGridVisible);
    localStorage.setItem(STAMP_GRID_VISIBLE_KEY, isStampGridVisible);
}

// Set stamp grid visibility
function setStampGridVisibility(visible) {
    console.log(`Setting stamp grid visibility to: ${visible}`);
    
    if (!gridElement) {
        console.log("Stamp grid element not found, creating it...");
        createStampGridUI();
        gridElement = document.getElementById('stamp-grid');
    }
    
    if (!gridElement) {
        console.error("Failed to create stamp grid element");
        return;
    }
    
    isStampGridVisible = visible;
    gridElement.style.display = visible ? 'block' : 'none';
    
    if (visible) {
        populateStampGrid();
    }
    
    console.log(`Stamp grid display set to: ${gridElement.style.display}`);
}

// Populate the stamp grid with stamps for the current game
function populateStampGrid() {
    const container = document.getElementById('stamps-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Get the collected stamps for this game
    const gameStamps = collectedStamps[currentGame] || [];
    
    // Get available stamps from metadata
    const availableStamps = stampMetadata && stampMetadata[currentGame] ? Object.keys(stampMetadata[currentGame]) : [];
    
    // If no metadata available for this game, show message
    if (availableStamps.length === 0) {
        const noStampsMsg = document.createElement('div');
        noStampsMsg.style.cssText = `
            grid-column: 1 / -1;
            text-align: center;
            color: #888;
            font-size: 16px;
            padding: 50px 20px;
        `;
        noStampsMsg.textContent = `No stamps available for ${currentGame.toUpperCase()}`;
        container.appendChild(noStampsMsg);
        return;
    }
    
    // Sort stamps by ID (numeric order)
    availableStamps.sort((a, b) => parseInt(a) - parseInt(b));
    
    // Create stamps
    availableStamps.forEach((mapId) => {
        const stampInfo = getStampInfo(currentGame, mapId);
        const isCollected = gameStamps.includes(mapId);
        
        const stamp = document.createElement('div');
        stamp.className = 'stamp';
        stamp.dataset.mapId = mapId;
        stamp.style.cssText = `
            width: 100px;
            height: 120px;
            border: 2px solid ${isCollected ? '#4CAF50' : '#666'};
            border-radius: 8px;
            overflow: hidden;
            position: relative;
            margin: 0 auto;
            background-color: ${isCollected ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
            transition: transform 0.2s ease;
            cursor: pointer;
        `;
        
        if (isCollected) {
            // Show collected stamp
            const stampImg = document.createElement('img');
            stampImg.src = `/stamps/${currentGame}/${mapId}.png`;
            stampImg.alt = stampInfo.name || `Map ${mapId}`;
            stampImg.title = `${stampInfo.name || `Map ${mapId}`} - ${stampInfo.location || 'Unknown Location'}`;
            stampImg.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            `;
            
            stampImg.onerror = () => {
                // Fallback if image doesn't exist
                stamp.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #4CAF50; font-weight: bold;">
                        ✓
                    </div>
                `;
            };
            
            stamp.appendChild(stampImg);
        } else {
            // Show uncollected stamp placeholder
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #888;
            `;
            
            const questionMark = document.createElement('div');
            questionMark.style.cssText = `
                font-size: 32px;
                font-weight: bold;
                margin-bottom: 5px;
            `;
            questionMark.textContent = '?';
            
            const mapIdText = document.createElement('div');
            mapIdText.style.cssText = `
                font-size: 12px;
                color: #666;
            `;
            mapIdText.textContent = mapId;
            
            placeholder.appendChild(questionMark);
            placeholder.appendChild(mapIdText);
            placeholder.title = `${stampInfo.location || 'Unknown Location'}`;
            
            stamp.appendChild(placeholder);
        }
        
        // Add hover effect
        stamp.onmouseenter = () => {
                stamp.style.transform = 'scale(1.05)';
        };
            
        stamp.onmouseleave = () => {
                stamp.style.transform = 'scale(1)';
        };
            
        container.appendChild(stamp);
    });
}

// Monitor map changes
function monitorMapChanges() {
    console.log("Starting map change monitoring...");
    
    const checkInterval = setInterval(() => {
        // Use the existing mapIdHandler if available
        if (window.mapIdHandler && window.mapIdHandler.getCurrentMapId) {
            const mapId = window.mapIdHandler.getCurrentMapId();
            const detectedGame = window.mapIdHandler.getCurrentGame();
            
            console.log(`mapIdHandler check - mapId: ${mapId}, detectedGame: ${detectedGame}, currentMapId: ${currentMapId}`);
            
            if (mapId && mapId !== currentMapId) {
                currentMapId = mapId;
                console.log(`Map changed to: ${mapId}`);
                
                // Update current game if detected
                if (detectedGame && detectedGame !== currentGame && getSupportedGames().includes(detectedGame)) {
                    currentGame = detectedGame;
                    console.log(`Game updated to: ${currentGame}`);
                    
                    // Update game selector if grid is visible
                    const gameSelect = document.getElementById('game-select');
                    if (gameSelect) {
                        gameSelect.value = currentGame;
                    }
                }
                
                // Check if this map has a stamp to collect
                checkForStamp(mapId);
            }
        } else {
            // Fallback to checking mapid-display element
            let mapIdDisplay = document.getElementById('mapid-display');
            
            if (!mapIdDisplay) {
                console.log("Map ID display not found, attempting to create it...");
                mapIdDisplay = createMapIdDisplay();
            }
            
            if (mapIdDisplay) {
                const text = mapIdDisplay.textContent;
                const match = text.match(/Map ID: (\d+)/);
                
                if (match && match[1]) {
                    const mapId = match[1].padStart(4, '0');
                    
                    if (mapId !== currentMapId) {
                        currentMapId = mapId;
                        console.log(`Map changed to: ${mapId}`);
                        
                        // Update current game based on URL
                        const detectedGame = getGameFromUrl();
                        if (detectedGame && detectedGame !== currentGame && getSupportedGames().includes(detectedGame)) {
                            currentGame = detectedGame;
                            console.log(`Game updated to: ${currentGame}`);
                            
                            // Update game selector if grid is visible
                            const gameSelect = document.getElementById('game-select');
                            if (gameSelect) {
                                gameSelect.value = currentGame;
                            }
                        }
                        
                        // Check if this map has a stamp to collect
                        checkForStamp(mapId);
                    }
                }
            }
        }
    }, 1000);
    
    console.log("Map change monitoring started");
}

// Create map ID display if it doesn't exist
function createMapIdDisplay() {
    try {
        let mapIdDisplay = document.getElementById('mapid-display');
        if (mapIdDisplay) {
            return mapIdDisplay;
        }
        
        mapIdDisplay = document.createElement('div');
        mapIdDisplay.id = 'mapid-display';
        mapIdDisplay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
            z-index: 9999;
            pointer-events: none;
        `;
        mapIdDisplay.textContent = 'Map ID: 0000';
        
        document.body.appendChild(mapIdDisplay);
        
        console.log("Map ID display created");
        return mapIdDisplay;
    } catch (error) {
        console.error("Error creating map ID display:", error);
        return null;
    }
}

// Check if the current map has a stamp to collect
function checkForStamp(mapId) {
    const paddedMapId = mapId.padStart(4, '0');
    
    console.log(`Checking for stamp: map ${paddedMapId} in game ${currentGame}`);
    console.log(`Current stamp metadata:`, stampMetadata);
    console.log(`Current collected stamps:`, collectedStamps);
    
    // Check if the stamp exists in metadata
    if (!stampMetadata || !stampMetadata[currentGame] || !stampMetadata[currentGame][paddedMapId]) {
        console.log(`No stamp metadata found for map ${paddedMapId} in game ${currentGame}`);
        console.log(`Available stamps for ${currentGame}:`, stampMetadata[currentGame] ? Object.keys(stampMetadata[currentGame]) : 'none');
        return;
    }
    
    // Check if already collected
    if (collectedStamps[currentGame] && collectedStamps[currentGame].includes(paddedMapId)) {
        console.log(`Stamp for map ${paddedMapId} already collected`);
        return;
    }
    
    // Check if stamp image exists
    const img = new Image();
    img.onload = function() {
        console.log(`Stamp image found for map ${paddedMapId}, collecting...`);
        collectStamp(paddedMapId);
    };
    img.onerror = function() {
        console.log(`No stamp image available for map ${paddedMapId} in game ${currentGame}`);
        
        // Even if no image, try to collect if metadata exists
        if (stampMetadata[currentGame] && stampMetadata[currentGame][paddedMapId]) {
            console.log(`Attempting to collect stamp ${paddedMapId} despite missing image`);
            collectStamp(paddedMapId);
        }
    };
    
    const timeout = setTimeout(() => {
        console.log(`Timeout checking stamp image for map ${paddedMapId}`);
        img.src = '';
    }, 5000);
    
    img.onload = function() {
        clearTimeout(timeout);
        console.log(`Stamp image found for map ${paddedMapId}, collecting...`);
        collectStamp(paddedMapId);
    };
    
    img.onerror = function() {
        clearTimeout(timeout);
        console.log(`No stamp image available for map ${paddedMapId} in game ${currentGame}`);
        
        if (stampMetadata[currentGame] && stampMetadata[currentGame][paddedMapId]) {
            console.log(`Attempting to collect stamp ${paddedMapId} despite missing image`);
            collectStamp(paddedMapId);
        }
    };
    
    img.src = `/stamps/${currentGame}/${paddedMapId}.png?nocache=${Date.now()}`;
}

// Collect a stamp
async function collectStamp(mapId) {
    console.log(`Attempting to collect stamp for map ${mapId} in game ${currentGame}`);
    
    const paddedMapId = mapId.padStart(4, '0');
    
    if (!stampMetadata[currentGame] || !stampMetadata[currentGame][paddedMapId]) {
        console.error(`Cannot collect stamp - no metadata found for map ${paddedMapId} in game ${currentGame}`);
        return;
    }
    
    try {
        const response = await fetch('/stamps/collect-stamp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                game: currentGame,
                mapId: paddedMapId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Server error response:", errorText);
            
            if (response.status === 404) {
                console.log("Collect-stamp endpoint not found (404), using localStorage fallback");
                throw new Error("Collect-stamp endpoint not available");
            }
            
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            if (!collectedStamps[currentGame]) {
                collectedStamps[currentGame] = [];
            }
            
            if (!collectedStamps[currentGame].includes(paddedMapId) && result.added) {
                collectedStamps[currentGame].push(paddedMapId);
                
                // Update the UI if grid is visible
                if (isStampGridVisible && document.getElementById('stamp-grid').style.display === 'block') {
                    populateStampGrid();
                }
                
                // Show collection animation and play sound
                showStampCollectedAnimation(paddedMapId);
                playStampCollectedSound();
                
                console.log(`Successfully collected stamp ${paddedMapId} for game ${currentGame}`);
            } else {
                console.log(`Stamp ${paddedMapId} was already collected for game ${currentGame}`);
            }
        }
    } catch (e) {
        console.error(`Error collecting stamp ${paddedMapId}:`, e);
        
        // Fallback to localStorage if server fails
        try {
            console.log("Using localStorage fallback for stamp collection");
            
            if (!collectedStamps[currentGame]) {
                collectedStamps[currentGame] = [];
            }
            
            if (!collectedStamps[currentGame].includes(paddedMapId)) {
                collectedStamps[currentGame].push(paddedMapId);
                
                localStorage.setItem(STAMP_STORAGE_KEY, JSON.stringify(collectedStamps));
                
                // Update the UI if grid is visible
                if (isStampGridVisible && document.getElementById('stamp-grid').style.display === 'block') {
                    populateStampGrid();
                }
                
                // Show collection animation and play sound
                showStampCollectedAnimation(paddedMapId);
                playStampCollectedSound();
                
                console.log(`Successfully collected stamp ${paddedMapId} for game ${currentGame} (localStorage fallback)`);
            } else {
                console.log(`Stamp ${paddedMapId} was already collected for game ${currentGame}`);
            }
        } catch (localError) {
            console.error("Error with localStorage fallback:", localError);
        }
    }
}

// Show an animation when a stamp is collected
function showStampCollectedAnimation(mapId) {
    const animation = document.createElement('div');
    animation.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 200px;
        height: 200px;
        background-image: url('/stamps/${currentGame}/${mapId}.png');
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 10000;
        animation: stamp-collected 2s forwards;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes stamp-collected {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            20% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(animation);
    
    setTimeout(() => {
        animation.remove();
    }, 2000);
}

// Play sound when a stamp is collected
function playStampCollectedSound() {
    const sound = new Audio(`/stamps/stampget_${currentGame}.mp3`);
    sound.volume = 0.6;
    
    sound.onerror = function() {
        const defaultSound = new Audio('/stamps/stampget_default.mp3');
        defaultSound.volume = 0.6;
        defaultSound.play();
    };
    
    sound.play();
}

// Set the current game
function setCurrentGame(game) {
    if (getSupportedGames().includes(game)) {
        currentGame = game;
        console.log(`Stamp collection game set to: ${game}`);
        
        // Update UI if needed
        if (isStampGridVisible && document.getElementById('stamp-grid').style.display === 'block') {
            populateStampGrid();
        }
        
        // Update game selector if it exists
        const gameSelect = document.getElementById('game-select');
        if (gameSelect) {
            gameSelect.value = game;
        }
    } else {
        console.error(`Game "${game}" is not supported for stamp collection`);
    }
}

// Export public functions
export {
    initStampSystem,
    setCurrentGame
}; 