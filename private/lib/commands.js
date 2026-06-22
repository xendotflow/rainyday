const { readUserData, writeUserData } = require('./storage');

/**
 * Handles all chat commands
 * @param {WebSocket} ws - The WebSocket connection
 * @param {WebSocketServer} wss - The WebSocket server instance
 * @param {Object} data - The message data
 * @returns {boolean} - Returns true if command was handled, false otherwise
 */
function handleCommand(ws, wss, data) {
    const text = data.text.trim();
    
    // Check for /party command with @username (targeted party only)
    if (text.startsWith('/party @')) {
        return handlePartyCommand(ws, wss, text);
    }
    
    // Add more commands here in the future
    // if (text.startsWith('/help')) {
    //     return handleHelpCommand(ws, text);
    // }
    
    return false; // Command not handled
}

/**
 * Handles the /party @username command
 * @param {WebSocket} ws - The sender's WebSocket connection
 * @param {WebSocketServer} wss - The WebSocket server instance
 * @param {string} text - The command text
 * @returns {boolean} - Returns true if command was handled
 */
function handlePartyCommand(ws, wss, text) {
    // Extract username from: /party @username
    const targetUsername = text.substring(8).trim(); // Remove '/party @'
    
    if (!targetUsername) {
        const errorMessage = {
            type: 'partyConfirm',
            targetUser: '',
            success: false,
            error: 'Please specify a username: /party @username'
        };
        ws.send(JSON.stringify(errorMessage));
        return true;
    }
    
    // Check if sender has enough points (50 points required)
    const senderUserData = readUserData(ws.user.username) || {};
    const senderPoints = senderUserData.points || 0;
    
    if (senderPoints < 50) {
        // Insufficient points - send error to sender
        const errorMessage = {
            type: 'partyConfirm',
            targetUser: targetUsername,
            success: false,
            error: 'You need 50 points to use the party command'
        };
        ws.send(JSON.stringify(errorMessage));
        return true;
    }
    
    // Find the target user's WebSocket connection
    let targetClient = null;
    wss.clients.forEach(client => {
        if (client.readyState === 1 && // WebSocket.OPEN
            client.user && 
            client.user.username === targetUsername) {
            targetClient = client;
        }
    });
    
    if (!targetClient) {
        // User not found - send error to sender
        const errorMessage = {
            type: 'partyConfirm',
            targetUser: targetUsername,
            success: false,
            error: 'User not found or not online'
        };
        ws.send(JSON.stringify(errorMessage));
        return true;
    }
    
    // Check if target user is in a game
    if (!targetClient.game) {
        // User is not in a game - send error to sender
        const errorMessage = {
            type: 'partyConfirm',
            targetUser: targetUsername,
            success: false,
            error: 'User is not currently in a game'
        };
        ws.send(JSON.stringify(errorMessage));
        return true;
    }
    
    // Deduct 50 points from sender
    senderUserData.points = senderPoints - 50;
    writeUserData(ws.user.username, senderUserData);
    
    // Send party event to the target user
    const partyMessage = {
        type: 'party',
        username: ws.user.username,
        targetUser: targetUsername,
        time: new Date().toISOString()
    };
    
    targetClient.send(JSON.stringify(partyMessage));
    
    // Send confirmation message to the sender with updated points
    const confirmMessage = {
        type: 'partyConfirm',
        targetUser: targetUsername,
        success: true,
        pointsDeducted: 50,
        newPoints: senderUserData.points
    };
    ws.send(JSON.stringify(confirmMessage));
    
    return true;
}

module.exports = {
    handleCommand
}; 