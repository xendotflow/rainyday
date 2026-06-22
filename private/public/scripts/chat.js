// public/scripts/chat.js

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function sanitizeColor(color, fallback = '#ffffff') {
    return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function sanitizeMediaUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }

    const lower = url.toLowerCase();
    if (!url.startsWith('/') || url.includes('://') || lower.includes('javascript:')) {
        return '';
    }

    if (!/^\/[\w./?=&%-]+$/.test(url)) {
        return '';
    }

    return url;
}

function formatChatText(text, emotes) {
    let safe = escapeHtml(text ?? '');

    if (emotes) {
        Object.entries(emotes).forEach(([name, path]) => {
            if (!/^[\w-]+$/.test(name)) {
                return;
            }
            if (!/^\/emotes\/[\w./-]+$/.test(path)) {
                return;
            }

            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const emoteRegex = new RegExp(`:${escapedName}:`, 'g');
            const safePath = escapeHtml(path);
            safe = safe.replace(emoteRegex, `<img src="${safePath}" alt=":${escapeHtml(name)}:" class="chat-emote">`);
        });
    }

    return safe;
}

document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSend = document.getElementById('chatSend');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const stampPreview = document.getElementById('stampPreview');
    const stampCaption = document.getElementById('stampCaption');
    
    let ws;
    let currentUserList = [];
    let currentUsername = "";
    let stampList = {}; // Initialize stampList
    let emoteList = {}; // Initialize emoteList
    let dndUsers = new Set(); // Track users who have DND enabled
    let collectedStamps = {};
    
    // Session token for robust authentication
    let sessionToken = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000; // 3 seconds
    
    // Track the active timer for preview hide
    let previewHideTimer = null;

    // Get session token from server
    async function getSessionToken() {
        try {
            const response = await fetch('/api/session-token');
            if (response.ok) {
                const data = await response.json();
                sessionToken = data.sessionToken;
                return sessionToken;
            } else {
                console.error('Failed to get session token:', response.status);
                return null;
            }
        } catch (error) {
            console.error('Error getting session token:', error);
            return null;
        }
    }

    // Load stamp list
    async function loadStampList() {
        try {
            const response = await fetch('/stamps/stamplist.json');
            stampList = await response.json();
            if (currentUserList.length > 0) {
                renderOnlineUsers(currentUserList);
            }
        } catch (error) {
            // Stamps not loaded
        }
    }

    // Load emote list
    async function loadEmoteList() {
        try {
            const response = await fetch('/emotes/emotes.json');
            emoteList = await response.json();
        } catch (error) {
            // Emotes not loaded
        }
    }

    // Load current user info
    async function loadCollectedStamps() {
        try {
            const response = await fetch('/whoami');
            const data = await response.json();
            currentUsername = data.username;
        } catch (error) {
            // User info not loaded
        }
    }

    // Add DND event listeners
    function attachDNDEventListeners() {
        // This function can be expanded to handle DND-related UI elements
        // For now, it's a placeholder
    }

    // Get 'game' parameter from the URL (if any)
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game') || '';

    function initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsUrl = `${protocol}//${location.host}/chat?game=${encodeURIComponent(gameParam)}`;
        
        // Add session token to URL if available
        if (sessionToken) {
            wsUrl += `&token=${encodeURIComponent(sessionToken)}`;
        }
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            reconnectAttempts = 0;
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'connectionStatus') {
                    if (data.status === 'connected') {
                        currentUsername = data.username;
                    }
                } else if (data.type === 'sessionValid') {
                    // Session valid
                } else if (data.type === 'sessionInvalid') {
                    alert('Your session has expired. Please login again.');
                    window.location = '/login';
                } else if (data.type === 'history') {
                    chatMessages.innerHTML = '';
                    data.messages.forEach(msg => appendMessage(msg, false));
                } else if (data.type === 'message') {
                    appendMessage(data, true);
                } else if (data.type === 'userList') {
                    currentUserList = data.users;
                    renderOnlineUsers(data.users);
                } else if (data.type === 'badgeUpdate') {
                    updateBadgeForUser(data.username, data.badge);
                } else if (data.type === 'mapUpdate') {
                    updateUserMapInfo(data.username, data.mapId, data.mapName);
                } else if (data.type === 'party') {
                    handlePartyEvent(data.username, data.targetUser);
                } else if (data.type === 'partyConfirm') {
                    handlePartyConfirmation(data.targetUser, data.success, data.error, data.pointsDeducted, data.newPoints);
                } else if (data.type === 'dndStatus') {
                    handleDNDUpdate(data.username, data.isDND);
                }
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        };

        ws.onerror = () => {};
        
        ws.onclose = (event) => {
            if (event.code === 1008) {
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    
                    setTimeout(async () => {
                        const newToken = await getSessionToken();
                        if (newToken) {
                            sessionToken = newToken;
                            initializeWebSocket();
                        } else {
                            alert('Authentication failed. Please login again.');
                            window.location = '/login';
                        }
                    }, reconnectDelay);
                } else {
                    alert('Unable to reconnect. Please login again.');
                    window.location = '/login';
                }
            } else if (event.code === 1006 || event.code === 1000) {
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    
                    setTimeout(initializeWebSocket, reconnectDelay);
                } else {
                    alert('Connection lost. Please refresh the page.');
                }
            }
        };
    }

    // Separate function to attach chat event listeners
    function attachChatEventListeners() {
        chatSend.onclick = function() {
            const message = chatInput.value.trim().slice(0, 500);
            // Check WebSocket state using readyState value directly (1 = OPEN)
            if (message && ws && ws.readyState === 1) {
                try {
                    // Get current map ID and name from the mapIdHandler if available
                    let mapId = null;
                    let mapName = null;
                    
                    if (window.mapIdHandler) {
                        mapId = window.mapIdHandler.getCurrentMapId();
                        mapName = window.mapIdHandler.getCurrentMapName();
                    }
                    
                    ws.send(JSON.stringify({
                        type: 'chat',
                        text: message,
                        game: gameParam,
                        mapId: mapId,
                        mapName: mapName
                    }));
                    chatInput.value = '';
                } catch (error) {
                    // Send failed
                }
            }
        };

        chatInput.onkeypress = function(e) {
            if (e.key === 'Enter') {
                chatSend.click();
            }
        };
    }

    /**
     * Checks if a map in a game has a stamp and returns the stamp info
     * @param {string} game - Game code
     * @param {string} mapId - Map ID
     * @returns {Object|null} - Stamp info or null if no stamp
     */
    function getStampForLocation(game, mapId) {
        if (!game || !mapId || !stampList[game]) return null;
        
        // Ensure mapId is padded to 4 digits
        const paddedMapId = mapId.padStart(4, '0');
        
        // Check if there's a stamp for this game+mapId
        if (stampList[game][paddedMapId]) {
            return {
                ...stampList[game][paddedMapId],
                game: game,
                mapId: paddedMapId,
                // Add path to the stamp image
                imagePath: `/stamps/${game}/${paddedMapId}.png`
            };
        }
        
        return null;
    }

    /**
     * Appends a chat message to the chat window.
     * @param {Object} message - The chat message object.
     * @param {boolean} playPing - If true, check for @mentions and play ping sound.
     */
    function appendMessage(message, playPing) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        messageElement.setAttribute('data-username', message.user);

        const fullGameName = message.game ? (window.GameNames ? window.GameNames.getDisplayName(message.game) : message.game) : '';

        // Create header container (two rows)
        const headerDiv = document.createElement('div');
        headerDiv.className = 'header';

        // Top row: timestamp on the left and game info on the right
        const headerTop = document.createElement('div');
        headerTop.className = 'header-top';
        const timeSpan = document.createElement('span');
        const localTime = new Date(message.time).toLocaleTimeString([], {
   	 hour: '2-digit',
   	 minute: '2-digit',
   	 hour12: false  // change to true for 12-hour clock
	});
	timeSpan.textContent = localTime;
        headerTop.appendChild(timeSpan);
        if (fullGameName) {
            const gameSpan = document.createElement('span');
            gameSpan.className = 'game-name';
            gameSpan.textContent = `[${fullGameName}]`;
            
            // Add map info to title attribute for hover effect
            if (message.mapId || message.mapName) {
                let tooltipText = '';
                if (message.mapName) {
                    tooltipText = message.mapName;
                    if (message.mapId) {
                        tooltipText += ` (${message.mapId})`;
                    }
                } else if (message.mapId) {
                    tooltipText = `Map ID: ${message.mapId}`;
                }
                
                if (tooltipText) {
                    gameSpan.title = tooltipText;
                }
            }
            
            headerTop.appendChild(gameSpan);
        }
        headerDiv.appendChild(headerTop);

        // Bottom row: username and badge
        const headerBottom = document.createElement('div');
        headerBottom.className = 'header-bottom';
        const userSpan = document.createElement('span');
        userSpan.className = 'chat-user';
        userSpan.style.color = sanitizeColor(message.color);
        userSpan.textContent = message.user;
        headerBottom.appendChild(userSpan);
        if (message.badge) {
            const badgeImg = document.createElement('img');
            badgeImg.className = 'badge';
            badgeImg.src = sanitizeMediaUrl(message.badge);
            badgeImg.alt = 'badge';
            headerBottom.appendChild(badgeImg);
        }
        headerDiv.appendChild(headerBottom);

        // Create chat text element
        const textDiv = document.createElement('div');
        textDiv.className = 'chat-text';
        
        textDiv.innerHTML = formatChatText(message.text, emoteList);

        messageElement.appendChild(headerDiv);
        messageElement.appendChild(textDiv);
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Ping system: if playPing is true and the message (from someone else) mentions the current user, play the sound.
        if (playPing && currentUsername) {
            const mentionRegex = new RegExp(`@${currentUsername}\\b`, 'i');
            if (mentionRegex.test(message.text)) {
                // Check if DND mode is enabled before playing sound
                if (!window.isDNDMode || !window.isDNDMode()) {
                    const soundUrl = message.ping || '/assets/audio/sfx/ping.wav';
                    const pingSound = new Audio(soundUrl);
                    pingSound.play().catch(err => console.error('Error playing ping sound:', err));
                }
            }
        }
    }

    // Render online users list with a left container (username and badge) and a right container (game info)
    function renderOnlineUsers(users) {
        // Hide any visible stamp previews when re-rendering the user list
        if (stampPreview) {
            stampPreview.style.display = 'none';
        }
        if (stampCaption) {
            stampCaption.style.display = 'none';
        }
        
        if (!onlineUsersList) {
            console.warn('onlineUsersList element not found');
            return;
        }

        // Update DND users set based on user data
        dndUsers.clear();
        users.forEach(user => {
            if (user.isDND) {
                dndUsers.add(user.username);
            }
        });

        onlineUsersList.innerHTML = '';
        users.forEach(userObj => {
            const li = createUserListItem(userObj);
            onlineUsersList.appendChild(li);
        });
    }
    
    // Helper function to create a user list item
    function createUserListItem(userObj) {
        const li = document.createElement('li');
        li.setAttribute('data-username', userObj.username);
        
        const leftDiv = document.createElement('div');
        leftDiv.style.display = "flex";
        leftDiv.style.alignItems = "center";
        leftDiv.style.gap = "6px";
        
        const usernameSpan = document.createElement('span');
        usernameSpan.style.color = sanitizeColor(userObj.color);
        usernameSpan.textContent = userObj.username;
        leftDiv.appendChild(usernameSpan);
        
        if (userObj.badge) {
            const badgeImg = document.createElement('img');
            badgeImg.src = sanitizeMediaUrl(userObj.badge);
            badgeImg.alt = "badge";
            badgeImg.className = "badge";
            leftDiv.appendChild(badgeImg);
        }

        // Add DND icon if user has DND enabled
        if (dndUsers.has(userObj.username)) {
            const dndSpan = document.createElement('span');
            dndSpan.innerHTML = 'Z<small style="font-size: 12px; opacity: 0.7;">z</small>';
            dndSpan.style.color = '#ccc';
            dndSpan.style.fontSize = '16px';
            dndSpan.style.fontWeight = 'bold';
            dndSpan.style.marginLeft = '4px';
            dndSpan.title = `${userObj.username} is in sleep mode`;
            leftDiv.appendChild(dndSpan);
        }

        const rightDiv = document.createElement('div');
        rightDiv.style.color = "#fff";
        rightDiv.style.whiteSpace = "nowrap";
        
        if (userObj.game) {
            const fullGameName = window.GameNames ? window.GameNames.getDisplayName(userObj.game) : userObj.game;
            const stamp = userObj.game && userObj.mapId ? getStampForLocation(userObj.game, userObj.mapId) : null;
            
            if (stamp && stamp.imagePath) {
                // Create stamp image element
                const stampImg = document.createElement('img');
                stampImg.src = stamp.imagePath;
                stampImg.alt = stamp.name;
                stampImg.className = 'stamp-image';
                
                // Add tooltip with game and location info
                let tooltipText = `${fullGameName}: ${stamp.location}`;
                if (userObj.mapName && userObj.mapName !== stamp.location) {
                    tooltipText += ` (${userObj.mapName})`;
                }
                
                // Add event listeners for hover effects using a simpler approach
                stampImg.addEventListener('mouseenter', (event) => {
                    // Skip if stamp preview elements don't exist (not on chat page)
                    if (!stampPreview || !stampCaption) return;
                    
                    // Clear any pending hide timer
                    if (previewHideTimer) {
                        clearTimeout(previewHideTimer);
                        previewHideTimer = null;
                    }
                    
                    // Calculate position next to the user's name
                    const rect = event.target.getBoundingClientRect();
                    const previewLeft = rect.right + 10;
                    
                    // Get viewport dimensions
                    const viewportHeight = window.innerHeight;
                    
                    // Set the caption text first so its size is accurate
                    stampCaption.textContent = tooltipText;
                    stampCaption.style.display = 'block'; // Temporarily show to get accurate height
                    
                    // Calculate total height needed (preview + caption)
                    // Use a fixed estimation for caption height plus padding to be safe
                    const captionHeight = 40; // Using a slightly larger value to be safe
                    const totalHeight = 128 + captionHeight;
                    
                    // After getting dimensions, hide again until properly positioned
                    stampCaption.style.display = 'none';
                    
                    // Check if there's enough space below
                    let previewTop = rect.top + rect.height/2 - 64; // Default center alignment
                    
                    // Adjust if it would go off the bottom of the viewport
                    if (previewTop + totalHeight > viewportHeight - 30) { // 30px buffer from bottom
                        // Move it up enough to fit
                        previewTop = viewportHeight - totalHeight - 30;
                    }
                    
                    // Ensure it doesn't go above the top of the viewport
                    if (previewTop < 30) { // 30px buffer from top
                        previewTop = 30;
                    }
                    
                    // Ensure the full height fits in the viewport
                    // If viewport is too small, prioritize showing from the top
                    if (totalHeight > viewportHeight - 60) { // If can't fit even with buffers
                        previewTop = 30; // Show from the top with buffer
                    }
                    
                    // Position the preview
                    stampPreview.style.left = previewLeft + 'px';
                    stampPreview.style.top = previewTop + 'px';
                    
                    // Position the caption below the preview
                    stampCaption.style.left = previewLeft + 'px';
                    stampCaption.style.top = (previewTop + 128) + 'px'; // Position right below the preview
                    
                    // Set the background image and display the preview and caption
                    stampPreview.style.backgroundImage = `url(${stamp.imagePath})`;
                    stampPreview.style.display = 'flex';
                    stampCaption.style.display = 'block';
                });
                
                stampImg.addEventListener('mouseleave', () => {
                    // Skip if stamp preview elements don't exist (not on chat page)
                    if (!stampPreview || !stampCaption) return;
                    
                    // Use a short delay to hide the preview
                    // This prevents flickering if the mouse briefly moves between elements
                    previewHideTimer = setTimeout(() => {
                        stampPreview.style.display = 'none';
                        stampCaption.style.display = 'none';
                    }, 100);
                });
                
                rightDiv.appendChild(stampImg);
            } else {
                const gameSpan = document.createElement('span');
                gameSpan.textContent = `[${fullGameName}]`;
                
                // Add map info to title attribute for hover effect
                if (userObj.mapId || userObj.mapName) {
                    let tooltipText = '';
                    if (userObj.mapName) {
                        tooltipText = userObj.mapName;
                        if (userObj.mapId) {
                            tooltipText += ` (${userObj.mapId})`;
                        }
                    } else if (userObj.mapId) {
                        tooltipText = `Map ID: ${userObj.mapId}`;
                    }
                    
                    if (tooltipText) {
                        gameSpan.title = tooltipText;
                    }
                }
                
                rightDiv.appendChild(gameSpan);
            }
        }

        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";

        li.appendChild(leftDiv);
        li.appendChild(rightDiv);
        
        return li;
    }

    // Periodically update current map info in WebSocket connection
    function updateMapInfoInConnection() {
        if (!ws || ws.readyState !== WebSocket.OPEN || !window.mapIdHandler) return;
        
        const mapId = window.mapIdHandler.getCurrentMapId();
        const mapName = window.mapIdHandler.getCurrentMapName();
        
        // Only send updates if we have map information and the WebSocket is open
        if ((mapId || mapName) && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'updateMapInfo',
                mapId: mapId,
                mapName: mapName
            }));
        }
    }

    // Set up periodic map info updates (every 3 seconds for more immediate updates)
    setInterval(updateMapInfoInConnection, 3000);

    function updateBadgeForUser(username, newBadgeUrl) {
        const safeBadgeUrl = sanitizeMediaUrl(newBadgeUrl);
        if (!safeBadgeUrl) {
            return;
        }

        const tempImg = new Image();
        tempImg.onload = () => {
            const messageElements = document.querySelectorAll(`.chat-message[data-username="${CSS.escape(username)}"]`);
            messageElements.forEach(msgElem => {
                let badgeImg = msgElem.querySelector('img.badge');
                if (badgeImg) {
                    badgeImg.src = safeBadgeUrl;
                } else {
                    const userSpan = msgElem.querySelector('.chat-user');
                    if (userSpan) {
                        const newImg = document.createElement('img');
                        newImg.className = 'badge';
                        newImg.src = safeBadgeUrl;
                        newImg.alt = 'badge';
                        newImg.style.width = '37px';
                        newImg.style.height = '37px';
                        newImg.style.marginLeft = '8px';
                        newImg.style.verticalAlign = 'middle';
                        userSpan.insertAdjacentElement('afterend', newImg);
                    }
                }
            });
            const onlineUsersItems = document.querySelectorAll(`#onlineUsersList li[data-username="${CSS.escape(username)}"]`);
            onlineUsersItems.forEach(li => {
                let badgeImg = li.querySelector('img.badge');
                if (badgeImg) {
                    badgeImg.src = safeBadgeUrl;
                } else {
                    const newImg = document.createElement('img');
                    newImg.className = 'badge';
                    newImg.src = safeBadgeUrl;
                    newImg.alt = 'badge';
                    newImg.style.width = '37px';
                    newImg.style.height = '37px';
                    newImg.style.marginLeft = '8px';
                    newImg.style.verticalAlign = 'middle';
                    li.appendChild(newImg);
                }
            });
        };
        tempImg.onerror = () => {
            console.error(`Failed to load new badge image for ${username}`);
        };
        tempImg.src = safeBadgeUrl;
    }

    /**
     * Updates a specific user's map information in the user list
     * @param {string} username - Username to update
     * @param {string} mapId - New map ID
     * @param {string} mapName - New map name
     */
    function updateUserMapInfo(username, mapId, mapName) {
        // First hide any visible stamp previews
        if (stampPreview) {
            stampPreview.style.display = 'none';
        }
        if (stampCaption) {
            stampCaption.style.display = 'none';
        }
        
        // Clear any pending hide timer
        if (previewHideTimer) {
            clearTimeout(previewHideTimer);
            previewHideTimer = null;
        }
        
        // Find the user in the current list
        const userIndex = currentUserList.findIndex(u => u.username === username);
        if (userIndex !== -1) {
            // Update the user's map info
            currentUserList[userIndex].mapId = mapId;
            currentUserList[userIndex].mapName = mapName;
            
            // Re-render the online users list
            renderOnlineUsers(currentUserList);
        }
    }

    /**
     * Handles party events - plays sound and shows party display
     * @param {string} username - Username who triggered the party
     * @param {string|null} targetUser - Target user for the party, null for broadcast
     */
    function handlePartyEvent(username, targetUser) {
        // If this is a targeted party and we're not the target, ignore it
        if (targetUser && targetUser !== currentUsername) {
            return;
        }
        
        // Play party sound unless DND is enabled
        if (!window.isDNDMode || !window.isDNDMode()) {
            const partySound = new Audio('/assets/audio/sfx/party.mp3');
            partySound.volume = 0.3; // Set volume to 30%
            partySound.play().catch(err => console.error('Error playing party sound:', err));
        }
        
        // Show the party display overlay (from input-handlers.js)
        if (window.partyDisplaySystem) {
            window.partyDisplaySystem.show(username);
        }
    }

    /**
     * Handles party confirmation messages
     */
    function handlePartyConfirmation(targetUser, success, error, pointsDeducted, newPoints) {
        if (success) {
            if (pointsDeducted && newPoints !== undefined) {
                // Update the points display
                const usernameDisplay = document.getElementById('usernameDisplay');
                if (usernameDisplay) {
                    usernameDisplay.dataset.points = newPoints;
                    usernameDisplay.title = `${newPoints} points`;
                }
                
                // Show the points deduction animation
                showPointsDeduction(pointsDeducted);
            }
            
            showPartyCheckmark();
        } else {
            showPartyError();
        }
    }

    /**
     * Shows a checkmark to the left of the chat box that fades away after a second
     */
    function showPartyCheckmark() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        
        const inputRect = chatInput.getBoundingClientRect();
        
        const checkmark = document.createElement('div');
        checkmark.style.cssText = `
            position: fixed;
            left: ${inputRect.left - 50}px;
            top: ${inputRect.top + (inputRect.height / 2) - 20}px;
            width: 40px;
            height: 40px;
            background: rgba(107, 114, 128, 0.9);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            opacity: 0;
            transform: scale(0.5);
            transition: all 0.3s ease;
            pointer-events: none;
        `;
        
        // Create checkmark symbol
        checkmark.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
        `;
        
        document.body.appendChild(checkmark);
        
        // Animate in
        setTimeout(() => {
            checkmark.style.opacity = '1';
            checkmark.style.transform = 'scale(1)';
        }, 10);
        
        // Fade out and remove after 1 second
        setTimeout(() => {
            checkmark.style.opacity = '0';
            checkmark.style.transform = 'scale(0.5)';
            setTimeout(() => {
                if (checkmark.parentNode) {
                    checkmark.parentNode.removeChild(checkmark);
                }
            }, 300);
        }, 1000);
    }

    /**
     * Shows an X mark to the left of the chat box that fades away after a second
     */
    function showPartyError() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        
        const inputRect = chatInput.getBoundingClientRect();
        
        const errorMark = document.createElement('div');
        errorMark.style.cssText = `
            position: fixed;
            left: ${inputRect.left - 50}px;
            top: ${inputRect.top + (inputRect.height / 2) - 20}px;
            width: 40px;
            height: 40px;
            background: rgba(107, 114, 128, 0.9);
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
            opacity: 0;
            transform: scale(0.5);
            transition: all 0.3s ease;
            pointer-events: none;
        `;
        
        // Create X symbol
        errorMark.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        
        document.body.appendChild(errorMark);
        
        // Animate in
        setTimeout(() => {
            errorMark.style.opacity = '1';
            errorMark.style.transform = 'scale(1)';
        }, 10);
        
        // Fade out and remove after 1 second
        setTimeout(() => {
            errorMark.style.opacity = '0';
            errorMark.style.transform = 'scale(0.5)';
            setTimeout(() => {
                if (errorMark.parentNode) {
                    errorMark.parentNode.removeChild(errorMark);
                }
            }, 300);
        }, 1000);
    }

    /**
     * Shows a points deduction animation near the username display
     * @param {number} amount - Amount of points deducted
     */
    function showPointsDeduction(amount) {
        const usernameDisplay = document.getElementById('usernameDisplay');
        if (!usernameDisplay) return;
        
        const displayRect = usernameDisplay.getBoundingClientRect();
        
        const pointsAnimation = document.createElement('div');
        pointsAnimation.style.cssText = `
            position: fixed;
            left: ${displayRect.left + (displayRect.width / 2)}px;
            top: ${displayRect.bottom + 10}px;
            transform: translateX(-50%);
            font-size: 18px;
            font-weight: bold;
            color: #ef4444;
            z-index: 10001;
            opacity: 0;
            transition: all 0.8s ease;
            pointer-events: none;
        `;
        
        pointsAnimation.textContent = `-${amount}`;
        document.body.appendChild(pointsAnimation);
        
        // Animate in and up
        setTimeout(() => {
            pointsAnimation.style.opacity = '1';
            pointsAnimation.style.top = `${displayRect.bottom - 10}px`;
        }, 10);
        
        // Fade out and remove after animation
        setTimeout(() => {
            pointsAnimation.style.opacity = '0';
            pointsAnimation.style.top = `${displayRect.bottom - 30}px`;
            setTimeout(() => {
                if (pointsAnimation.parentNode) {
                    pointsAnimation.parentNode.removeChild(pointsAnimation);
                }
            }, 800);
        }, 1500);
    }

    /**
     * Handles DND status updates from other users
     * @param {string} username - Username who changed DND status
     * @param {boolean} isDND - Whether DND is enabled
     */
    function handleDNDUpdate(username, isDND) {
        if (isDND) {
            dndUsers.add(username);
        } else {
            dndUsers.delete(username);
        }
        
        // Re-render user list to show/hide DND icon
        renderOnlineUsers(currentUserList);
    }

    // Validate session periodically
    function validateSession() {
        if (ws && ws.readyState === WebSocket.OPEN && sessionToken) {
            ws.send(JSON.stringify({
                type: 'validateSession',
                token: sessionToken
            }));
        }
    }
    
    // Start session validation every 5 minutes
    setInterval(validateSession, 5 * 60 * 1000);

    // Initialize everything
    async function initialize() {
        // Get session token first
        await getSessionToken();
        
        // Load external data
        await Promise.all([
            loadStampList(),
            loadEmoteList(),
            
            loadCollectedStamps()
        ]);
        
        // Initialize WebSocket connection
        initializeWebSocket();
        
        // Attach event listeners
        attachChatEventListeners();
        attachDNDEventListeners();
        
        // Set up map ID handler if available
        if (window.mapIdHandler) {
            window.mapIdHandler.onMapChange = updateMapInfoInConnection;
        }
    }
    
    // Start initialization
    initialize();
});
