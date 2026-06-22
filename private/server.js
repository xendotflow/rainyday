// private/server.js
const config = require('./config');
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

// Import serverGlobals
const serverGlobals = require('./server-globals');

const { sessionMiddleware, requireLogin, validateWebSocketSession } = require('./lib/auth');
const { fileUpload, readUserData, writeUserData } = require('./lib/storage');
const { handleCommand } = require('./lib/commands');
const { router: adminRouter, checkRegistrations } = require('./routes/admin');
const { listGames, getGameInfo } = require('./lib/games');
const {
    sanitizeChatText,
    sanitizeColor,
    sanitizeAssetUrl,
    sanitizeMapId,
    sanitizeMapName,
    sanitizeGameId
} = require('./lib/sanitize');
const { setupMultiplayerProxy, startEasyRpgServer } = require('./lib/multiplayer');

const accountRoutes = require('./routes/account');
const pointsRoutes = require('./routes/points');
const assetsRoutes = require('./routes/assets');
const stampsRoutes = require('./routes/stamps');
const uploadRoutes = require('./routes/upload');

const app = express();

// Increase body parser limits to allow larger uploads (no limit for file uploads)
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

app.use(sessionMiddleware);
app.use(checkRegistrations);

app.use('/', accountRoutes);
app.use('/points', requireLogin, pointsRoutes);
app.use('/assets', assetsRoutes);
app.use('/stamps', stampsRoutes);
app.use('/upload', uploadRoutes);
app.use('/admin', adminRouter);

app.get('/api/games', (req, res) => {
  res.json(listGames());
});

app.get('/api/games/:id', (req, res) => {
  const game = getGameInfo(req.params.id);
  if (!game.playable) {
    return res.status(404).json({ error: 'game not found' });
  }
  res.json(game);
});

// Add a map proxy endpoint to handle CORS issues
app.get('/api/map-name-proxy', async (req, res) => {
  try {
    const mapId = req.query.mapId;
    const game = req.query.game;
    
    if (!mapId || !game) {
      return res.status(400).json({ error: 'missing mapId or game parameter' });
    }
    
    // Path to local map data
    const localMapPath = path.join(__dirname, 'public', 'ynolocations', game, 'config.json');
    
    if (fs.existsSync(localMapPath)) {
      try {
        console.log(`Looking for map ${mapId} in local file: ${localMapPath}`);
        const fileContent = fs.readFileSync(localMapPath, 'utf8');
        const mapData = JSON.parse(fileContent);
        
        // Check if map ID exists in the local file
        if (mapData.mapLocations && mapData.mapLocations[mapId] !== undefined) {
          const locationData = mapData.mapLocations[mapId];
          let title;
          
          // Handle different formats of location data
          if (typeof locationData === 'string') {
            title = locationData;
          } else if (Array.isArray(locationData)) {
            // For arrays, use the first title or the entire first object
            const firstLocation = locationData[0];
            if (typeof firstLocation === 'string') {
              title = firstLocation;
            } else if (firstLocation && typeof firstLocation === 'object' && firstLocation.title) {
              title = firstLocation.title;
            } else {
              // If first element doesn't have a title, try to find one that does
              for (const location of locationData) {
                if (typeof location === 'string') {
                  title = location;
                  break;
                } else if (location && typeof location === 'object' && location.title) {
                  title = location.title;
                  break;
                }
              }
            }
          } else if (locationData && typeof locationData === 'object') {
            // Handle object format with title property
            title = locationData.title;
          }
          
          if (title) {
            console.log(`Found location for ${game} map ${mapId}: ${title}`);
            return res.json([{ title }]);
          }
        }
        
        console.log(`No location found for ${game} map ${mapId} in config.json`);
        return res.json([]);
      } catch (localError) {
        console.error(`Error parsing local map data for ${game}:`, localError.message);
        return res.status(500).json({ error: `Error parsing map data: ${localError.message}` });
      }
    } else {
      console.log(`No config file found for game: ${game} at path: ${localMapPath}`);
      return res.json([]);
    }
  } catch (error) {
    console.error('Map proxy error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch map data' });
  }
});

// Serve /users folder so badge and ping files are accessible
app.use('/users', express.static(path.join(__dirname, 'users')));

// Serve ynolocations for direct access if needed
app.use('/ynolocations', express.static(path.join(__dirname, 'public', 'ynolocations')));

// serve games from /play/games
app.use('/play/games', express.static(path.join(__dirname, 'public', 'play', 'games')));

// Allow unauthenticated access to some paths
app.use((req, res, next) => {
    const allowedPaths = [
        '/login',
        '/register',
        '/chat',
        '/login.css',
        '/styles/background.png',
        '/assets/icons/logo.png',
        '/assets/icons/favicon.ico'
    ];
    if (allowedPaths.includes(req.path) || req.path.startsWith('/styles/') || req.path.startsWith('/assets/') || req.path.startsWith('/stamps/') || req.path.startsWith('/emotes/') || req.path.startsWith('/play/games/') || req.path.startsWith('/uploads/')) {
        return next();
    }
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

const server = config.https
? https.createServer(config.credentials, app)
: http.createServer(app);

// WebSocket server at /chat
const wss = new WebSocket.Server({ server, path: '/chat' });

startEasyRpgServer({
    binaryPath: config.easyrpgMp.binary,
    bindAddress: config.easyrpgMp.bind,
    enabled: config.easyrpgMp.autoStart
});
setupMultiplayerProxy(server, config.easyrpgMp.upstream);

const MAX_CHAT_HISTORY = 25;
let chatHistory = [];
serverGlobals.chatHistory = chatHistory; // make chatHistory accessible
serverGlobals.latestBadge = serverGlobals.latestBadge || {};

// Keep-alive ping/pong mechanism
function heartbeat() {
    this.isAlive = true;
}
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', () => {
    clearInterval(interval);
});

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection attempt');
    sessionMiddleware(req, {}, () => {
        // Extract token from URL query params for WebSocket connections
        let sessionToken = null;
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            sessionToken = urlObj.searchParams.get('token');
            console.log(`WebSocket URL: ${req.url}, extracted token: ${sessionToken ? 'present' : 'none'}`);
        } catch (error) {
            console.error('Error parsing WebSocket URL:', error);
        }
        
        console.log(`Session exists: ${!!req.session?.user}, session user: ${req.session?.user?.username}`);
        
        // Use enhanced validation that checks both session and token
        const user = validateWebSocketSession(req, sessionToken);
        
        if (!user) {
            console.log('WebSocket connection rejected: No valid session or token');
            ws.close(1008, 'Unauthorized');
            return;
        }
        
        // Ensure session is properly established for token-based authentication
        if (!req.session.user && user) {
            req.session.user = user;
            console.log(`Session restored from token for user: ${user.username}`);
        }
        
        console.log(`WebSocket connection established for user: ${user.username}`);
        ws.isAlive = true;
        ws.on('pong', heartbeat);
        ws.user = user;

        // Parse ?game= from URL
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            ws.game = urlObj.searchParams.get('game') || '';
            console.log(`User ${user.username} connected to game: ${ws.game || 'none'}`);
        } catch (error) {
            console.error('Error parsing game param:', error);
            ws.game = '';
        }

        // Send immediate user list to the new connection
        const userList = getUserList();
        ws.send(JSON.stringify({ type: 'userList', users: userList }));

        // Broadcast updated user list to all clients (including the new one)
        broadcastUserList();

        ws.send(JSON.stringify({ type: 'history', messages: chatHistory }));

        // Send connection success message with user info
        ws.send(JSON.stringify({ 
            type: 'connectionStatus', 
            status: 'connected',
            username: user.username
        }));

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                
                // Handle session validation requests
                if (data.type === 'validateSession') {
                    // Re-validate the session/token
                    const validUser = validateWebSocketSession(req, data.token);
                    if (validUser && validUser.username === ws.user.username) {
                        ws.send(JSON.stringify({ 
                            type: 'sessionValid', 
                            username: validUser.username 
                        }));
                    } else {
                        ws.send(JSON.stringify({ 
                            type: 'sessionInvalid' 
                        }));
                        ws.close(1008, 'Session expired');
                    }
                    return;
                }
                
                if (data.type === 'chat') {
                    const userData = readUserData(ws.user.username) || {};
                    const text = sanitizeChatText(data.text);

                    if (!text) {
                        return;
                    }

                    // Check for commands first
                    if (text.startsWith('/')) {
                        const commandHandled = handleCommand(ws, wss, { ...data, text });
                        if (commandHandled) {
                            return;
                        }
                    }

                    // Determine badge URL from global mapping or file system
                    let badgeUrl = serverGlobals.latestBadge[ws.user.username] || "";
                    if (!badgeUrl) {
                        const userFolder = path.join(__dirname, 'users', ws.user.username);
                        const badgePng = path.join(userFolder, 'badge.png');
                        const badgeGif = path.join(userFolder, 'badge.gif');
                        if (fs.existsSync(badgePng)) {
                            badgeUrl = `/users/${ws.user.username}/badge.png`;
                        } else if (fs.existsSync(badgeGif)) {
                            badgeUrl = `/users/${ws.user.username}/badge.gif`;
                        }
                    }

                    // Determine ping sound URL if available
                    let pingUrl = "";
                    const userFolder = path.join(__dirname, 'users', ws.user.username);
                    const pingWav = path.join(userFolder, 'ping.wav');
                    const pingMp3 = path.join(userFolder, 'ping.mp3');
                    if (fs.existsSync(pingMp3)) {
                        pingUrl = `/users/${ws.user.username}/ping.mp3?t=${Date.now()}`;
                    } else if (fs.existsSync(pingWav)) {
                        pingUrl = `/users/${ws.user.username}/ping.wav?t=${Date.now()}`;
                    }

                    const chatMessage = {
                        user: ws.user.username,
                        time: new Date().toISOString(),
                        text,
                        game: sanitizeGameId(ws.game),
                        color: sanitizeColor(userData.color),
                        badge: sanitizeAssetUrl(badgeUrl),
                        ping: sanitizeAssetUrl(pingUrl),
                        mapId: sanitizeMapId(data.mapId || ws.mapId),
                        mapName: sanitizeMapName(data.mapName || ws.mapName)
                    };

                    chatHistory.push(chatMessage);
                    if (chatHistory.length > MAX_CHAT_HISTORY) {
                        chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY);
                        serverGlobals.chatHistory = chatHistory;
                    }
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'message', ...chatMessage }));
                        }
                    });
                } else if (data.type === 'updateMapInfo') {
                    const mapId = sanitizeMapId(data.mapId);
                    const mapName = sanitizeMapName(data.mapName);
                    const mapChanged = ws.mapId !== mapId || ws.mapName !== mapName;

                    ws.mapId = mapId;
                    ws.mapName = mapName;
                    
                    // If the map has changed, broadcast it to all clients
                    if (mapChanged) {
                        // First, broadcast just the individual map update for immediate display
                        broadcastMapUpdate(ws.user.username, ws.mapId, ws.mapName);
                        
                        // Then, broadcast the full user list (with a small delay to prevent race conditions)
                        setTimeout(() => {
                            broadcastUserList();
                        }, 100);
                    }
                } else if (data.type === 'dndStatus') {
                    // Handle DND status update
                    ws.isDND = data.isDND;
                    
                    // Broadcast DND status update to all clients immediately
                    const dndMessage = {
                        type: 'dndStatus',
                        username: ws.user.username,
                        isDND: data.isDND
                    };
                    
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(dndMessage));
                        }
                    });
                    
                    // Also update the user list immediately to reflect DND status
                    broadcastUserList();
                }
            } catch (err) {
                console.error('Error parsing WS message:', err);
            }
        });

        ws.on('close', () => {
            console.log(`WebSocket connection closed for user: ${user.username}`);
            broadcastUserList();
        });

        ws.on('error', (err) => {
            console.error('WS error for user', user.username, ':', err);
        });
    });
});

function getUserList() {
    const userMap = new Map(); // Use Map to track most recent connection per user
    console.log(`Getting user list. WebSocket clients count: ${wss.clients.size}`);
    
    wss.clients.forEach(client => {
        console.log(`Client state: ${client.readyState}, has user: ${!!client.user}, user: ${client.user?.username}`);
        if (client.readyState === WebSocket.OPEN && client.user) {
            const username = client.user.username;
            
            // If user already exists, deduplicate by keeping only one connection per username
            if (userMap.has(username)) {
                return;
            }
            
            const userData = readUserData(username) || {};
            let badgeUrl = serverGlobals.latestBadge[username] || "";
            if (!badgeUrl) {
                const userFolder = path.join(__dirname, 'users', username);
                const badgePng = path.join(userFolder, 'badge.png');
                const badgeGif = path.join(userFolder, 'badge.gif');
                if (fs.existsSync(badgePng)) {
                    badgeUrl = `/users/${username}/badge.png`;
                } else if (fs.existsSync(badgeGif)) {
                    badgeUrl = `/users/${username}/badge.gif`;
                }
            }
            userMap.set(username, {
                username,
                game: sanitizeGameId(client.game),
                color: sanitizeColor(userData.color),
                badge: sanitizeAssetUrl(badgeUrl),
                mapId: sanitizeMapId(client.mapId),
                mapName: sanitizeMapName(client.mapName),
                isDND: client.isDND || false
            });
            console.log(`Added user to list: ${username}`);
        }
    });
    
    // Convert Map to array
    const userList = Array.from(userMap.values());
    console.log(`Final user list has ${userList.length} users:`, userList.map(u => u.username));
    return userList;
}

function broadcastUserList() {
    const userList = getUserList();
    console.log(`Broadcasting user list to ${wss.clients.size} clients`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'userList', users: userList }));
        }
    });
}

// Broadcast badge update to all clients
function broadcastBadgeUpdate(username, badgeUrl) {
    const safeBadge = sanitizeAssetUrl(badgeUrl);
    const payload = JSON.stringify({ type: 'badgeUpdate', username, badge: safeBadge });
    console.log(`Broadcasting badge update for ${username}: ${badgeUrl}`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}
serverGlobals.broadcastBadgeUpdate = broadcastBadgeUpdate;
serverGlobals.broadcastUserList = broadcastUserList;

// Add a new function to broadcast map updates
function broadcastMapUpdate(username, mapId, mapName) {
    const payload = JSON.stringify({
        type: 'mapUpdate',
        username,
        mapId: sanitizeMapId(mapId),
        mapName: sanitizeMapName(mapName)
    });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} (${config.https ? 'HTTPS' : 'HTTP'})`);
});

// Initialize collectedStamps for all users
function initializeUserStamps() {
    try {
        const usersDir = path.join(__dirname, 'users');
        
        // Check if users directory exists
        if (!fs.existsSync(usersDir)) {
            console.error('Users directory not found');
            return;
        }
        
        // Get all user directories
        const userDirs = fs.readdirSync(usersDir).filter(dir => 
            fs.statSync(path.join(usersDir, dir)).isDirectory()
        );
        
        // Initialize stamps for each user
        let initializedCount = 0;
        userDirs.forEach(username => {
            try {
                const userData = readUserData(username);
                
                // Skip if user data doesn't exist
                if (!userData) return;
                
                // Initialize collectedStamps if it doesn't exist
                if (!userData.collectedStamps) {
                    userData.collectedStamps = {};
                    writeUserData(username, userData);
                    initializedCount++;
                }
            } catch (userError) {
                console.error(`Error initializing stamps for user ${username}:`, userError);
            }
        });
        
        console.log(`Initialized collectedStamps for ${initializedCount} users`);
    } catch (error) {
        console.error('Error initializing user stamps:', error);
    }
}

// Call initialization function
initializeUserStamps();
