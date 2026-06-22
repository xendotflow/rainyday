// --- MapID Handler module ---
// Monitors connected map ID and displays it in the top right corner

let isMonitoring = true;
let currentMapId = null;
let mapIdDisplay = null;
let currentMapName = null;
let currentGame = null;
let consoleMonitorActive = false;
let processingMapId = false;

// Create a global object to expose map information to other scripts
window.mapIdHandler = {
    getCurrentMapId: () => currentMapId ? currentMapId.padStart(4, '0') : null,
    getCurrentMapName: () => currentMapName,
    getCurrentGame: () => currentGame
};

// Function to get current game from URL
function getGameFromUrl() {
    try {
        const gameMatch = window.location.href.match(/\/play\/games\/([^/?#]+)/);
        if (gameMatch && gameMatch[1]) {
            return gameMatch[1].toLowerCase();
        }

        const urlParams = new URLSearchParams(window.location.search);
        const gameParam = urlParams.get('game');
        if (gameParam) {
            return gameParam.toLowerCase();
        }

        return null;
    } catch (e) {
        console.error("Error detecting game from URL:", e);
        return null;
    }
}

// Function to extract map ID from various formats
function extractMapId(text) {
    if (typeof text !== 'string') return null;
    
    // Exact match pattern for "Loaded Map MapXXXX.lmu"
    const exactMapLoadPattern = /Loaded Map Map(\d+)\.lmu/i;
    const exactMatch = text.match(exactMapLoadPattern);
    if (exactMatch && exactMatch[1]) {
        return String(parseInt(exactMatch[1], 10));
    }
    
    // Other patterns to try
    const patterns = [
        /\/Map(\d+)\.lmu/i,  // URL format
        /Map(\d+)\.lmu/i,    // Filename
        /MAP(\d+)/i,         // All caps MAP format
        /Map (\d+)/i,        // Space separated
        /map_id=(\d+)/i      // Query parameter
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            return String(parseInt(match[1], 10));
        }
    }
    
    return null;
}

// Function to fetch map location name from API
async function fetchMapLocationName(mapId) {
    if (!mapId || mapId === "Unknown") return null;
    
    try {
        // Pad the map ID with leading zeros to ensure it's 4 digits
        const paddedMapId = mapId.padStart(4, '0');
        const gameName = currentGame || getGameFromUrl();
        
        console.log(`Fetching location for ${gameName} map ${paddedMapId}`);
        
        // Use our server-side proxy endpoint to avoid CORS issues
        const response = await fetch(`/api/map-name-proxy?mapId=${paddedMapId}&game=${gameName}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            // Add timeout to prevent hanging requests
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            console.warn(`Failed to fetch map location: ${response.status} ${response.statusText}`);
            return null;
        }
        
        const data = await response.json();
        if (data && data.length > 0 && data[0].title) {
            const location = data[0];
            console.log(`Found location: ${location.title}${location.titleJP ? ` (${location.titleJP})` : ''}`);
            // Return the English title, or Japanese title if English is not available
            return location.title || location.titleJP;
        }
        
        console.log(`No location data found for map ${paddedMapId} in ${gameName} config`);
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn(`Request timeout for map ${mapId}`);
        } else {
            console.error(`Error fetching map location for ${mapId}:`, error);
        }
        return null;
    }
}

// Function to update the map ID display
function updateMapIdDisplay(mapId) {
    // If we're already processing, don't interrupt
    if (processingMapId) return;
    
    processingMapId = true;
    
    try {
        if (mapId === currentMapId) return;
        
        currentMapId = mapId;
        
        // Get current game
        const gameName = currentGame || getGameFromUrl();
        if (currentGame !== gameName) {
            currentGame = gameName;
        }
        
        // Create the display element if it doesn't exist
        if (!mapIdDisplay) {
            mapIdDisplay = document.createElement('div');
            mapIdDisplay.id = 'mapid-display';
            mapIdDisplay.style.cssText = `
                background-color: rgba(0, 0, 0, 0.7);
                color: #ffffff;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 14px;
                font-family: monospace;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                display: flex;
                flex-direction: column;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(mapIdDisplay);
        }
        
        // Update the display with map ID
        if (!mapId || mapId === "Unknown") {
            mapIdDisplay.innerHTML = `<span style="color: #cccccc;">Map ID: Unknown</span>`;
            return;
        }
        
        // Format the map ID with leading zeros to be 4 digits
        const formattedMapId = mapId.padStart(4, '0');
        
        // Update with just the map ID
        mapIdDisplay.innerHTML = `<span style="color: #6A9AE8; font-weight: bold;">Map ID: ${formattedMapId}</span>`;
        
        // Fetch and add map name if available (in background)
        fetchMapLocationName(mapId).then(mapName => {
            if (mapName && mapId === currentMapId) {
                currentMapName = mapName;
                mapIdDisplay.innerHTML = `
                    <span style="color: #6A9AE8; font-weight: bold;">Map ID: ${formattedMapId}</span>
                    <span style="color: #ffffff; margin-top: 4px;">${mapName}</span>
                `;
            }
        }).catch(() => {
            // Silently handle errors
        });
    } finally {
        processingMapId = false;
    }
}

// Process a message for map ID
function processMessageForMapId(message) {
    if (!isMonitoring || typeof message !== 'string') return;
    
    // First priority: Check for "Loaded Map Map" pattern
    if (message.includes("Loaded Map Map")) {
        const mapId = extractMapId(message);
        if (mapId) {
            updateMapIdDisplay(mapId);
            return;
        }
    }
    
    // Second priority: Check for other map indicators
    if (message.includes("MAP") || message.includes("Map")) {
        const mapId = extractMapId(message);
        if (mapId) {
            updateMapIdDisplay(mapId);
        }
    }
}

// Set up console interception
function setupConsoleMonitor() {
    if (consoleMonitorActive) return;
    consoleMonitorActive = true;
    
    // Store the original console.log
    const originalLog = console.log;
    
    // Replace with our own function
    console.log = function() {
        // First, call the original console.log
        originalLog.apply(console, arguments);
        
        try {
            if (!isMonitoring) return;
            
            // Convert all arguments to strings and join
            const fullText = Array.from(arguments)
                .map(arg => {
                    try {
                        return typeof arg === 'string' ? arg : JSON.stringify(arg);
                    } catch (e) {
                        return String(arg);
                    }
                })
                .join(' ');
            
            // Look for "Loaded Map" specifically
            if (fullText.includes('Loaded Map Map')) {
                processMessageForMapId(fullText);
            }
            // Also check for MAP references
            else if (fullText.includes('MAP') || fullText.includes('Map')) {
                processMessageForMapId(fullText);
            }
        } catch (e) {
            // Ignore errors
        }
    };
    
    // Do the same for console.info and console.debug
    const originalInfo = console.info;
    console.info = function() {
        originalInfo.apply(console, arguments);
        try {
            if (isMonitoring) {
                const fullText = Array.from(arguments).join(' ');
                if (fullText.includes('Loaded Map') || fullText.includes('MAP')) {
                    processMessageForMapId(fullText);
                }
            }
        } catch (e) {
            // Ignore errors
        }
    };
    
    const originalDebug = console.debug;
    console.debug = function() {
        originalDebug.apply(console, arguments);
        try {
            if (isMonitoring) {
                const fullText = Array.from(arguments).join(' ');
                if (fullText.includes('Loaded Map') || fullText.includes('MAP')) {
                    processMessageForMapId(fullText);
                }
            }
        } catch (e) {
            // Ignore errors
        }
    };
}

// Create an interval that checks for console elements in the DOM
function setupConsoleElementMonitor() {
    // Set up an interval to check for console output in the DOM
    setInterval(() => {
        if (!isMonitoring) return;
        
        // Look for anything mentioning "Loaded Map" in the DOM
        const elements = document.querySelectorAll('*');
        for (const element of elements) {
            if (element.textContent && 
                (element.textContent.includes('Loaded Map Map') || 
                 element.textContent.includes('MAP'))) {
                
                // Skip if it's our own display
                if (element.id === 'mapid-debug' || element.id === 'mapid-display') continue;
                
                processMessageForMapId(element.textContent);
            }
        }
    }, 1000); // Check every second
}

// Function to initialize the map ID handler
function initMapIdHandler() {
    if (typeof window !== 'undefined') {
        // Initial game detection
        currentGame = getGameFromUrl();
        
        // Monitor console output
        setupConsoleMonitor();
        
        // Monitor specific DOM elements
        setupConsoleElementMonitor();
        
        const urlMapId = extractMapId(window.location.href);
        if (urlMapId) {
            updateMapIdDisplay(urlMapId);
        }

        // Check initial console content (if any)
        const initialConsoleContent = document.body.innerText;
        processMessageForMapId(initialConsoleContent);
        
        console.log("MapID Handler Initialized. Monitoring started.");
    } else {
        console.error("MapID Handler cannot run outside of a browser environment.");
    }
}

// Check if running in browser and run initialization
if (typeof window !== 'undefined') {
    // Use DOMContentLoaded or similar event to ensure DOM is ready
    document.addEventListener('DOMContentLoaded', initMapIdHandler);
}

// Export the initialization function
export { initMapIdHandler }; 