// private/routes/account.js
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');
const config = require('../config');
const { readUserData, createUser, writeUserData } = require('../lib/storage');
const multer = require('multer');

const serverGlobals = require('../server-globals');
const { sanitizeColor } = require('../lib/sanitize');
const { 
    generateSessionToken, 
    revokeUserTokens, 
    validateUser 
} = require('../lib/auth');

const router = express.Router();

// Create a temporary directory for uploads if it doesn't exist
const tempUploadDir = path.join(__dirname, '..', 'temp-uploads');
if (!fs.existsSync(tempUploadDir)) {
    fs.mkdirSync(tempUploadDir, { recursive: true });
}

// Multer upload instances
const badgeUpload = multer({
    dest: tempUploadDir,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for badges
});
const pingUpload = multer({
    dest: tempUploadDir,
    limits: { fileSize: 10 * 1024 * 1024 } // increased limit to 10MB for ping sounds
});

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/home.html');
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const user = readUserData(username);
        
        // Check if user exists and has valid data
        if (!user || !user.password) {
            console.warn(`Login attempt for user '${username}' failed: user not found or invalid data`);
            return res.redirect('/login?error=invalid_credentials');
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (isValidPassword) {
            req.session.user = { username };
            
            // Generate a session token for robust authentication
            const sessionToken = generateSessionToken(username);
            
            // Set the session token as a cookie for automatic inclusion in requests
            res.cookie('sessionToken', sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                sameSite: 'strict'
            });
            
            return res.redirect('/home.html');
        } else {
            console.warn(`Login attempt for user '${username}' failed: invalid password`);
            return res.redirect('/login?error=invalid_credentials');
        }
    } catch (error) {
        console.error(`Login error for user '${username}':`, error);
        return res.redirect('/login?error=server_error');
    }
});

// Registration page
router.get('/register', (req, res) => {
    if (req.session.user) return res.redirect('/home.html');
    res.sendFile(path.join(__dirname, '../public/register.html'));
});

router.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (readUserData(username)) {
        return res.redirect('/register?error=username_taken');
    }
    await createUser(username, password);
    req.session.user = { username };
    
    // Generate a session token for the new user
    const sessionToken = generateSessionToken(username);
    
    // Set the session token as a cookie
    res.cookie('sessionToken', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict'
    });
    
    res.redirect('/home.html');
});

// Logout
router.get('/logout', (req, res) => {
    const user = validateUser(req);
    if (user) {
        // Revoke all session tokens for this user
        revokeUserTokens(user.username);
    }
    
    // Clear the session token cookie
    res.clearCookie('sessionToken');
    
    req.session.destroy(() => res.redirect('/login'));
});

// Get session token endpoint for WebSocket connections
router.get('/api/session-token', (req, res) => {
    const user = validateUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Generate a new token or refresh existing one
    const sessionToken = generateSessionToken(user.username);
    
    res.json({ sessionToken });
});

// Who am I?
router.get('/whoami', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const { username } = req.session.user;
        const userData = readUserData(username);
        
        if (!userData) {
            console.warn(`User data not found for authenticated user: ${username}`);
            // Return basic user info even if full data is missing
            return res.json({ 
                username, 
                color: '#ffffff',
                points: 0,
                logoPreferences: {},
                isAdmin: username === config.adminUsername
            });
        }
        
        res.json({ 
            username, 
            color: userData.color || '#ffffff',
            points: userData.points || 0,
            logoPreferences: userData.logoPreferences || {},
            isAdmin: username === config.adminUsername
        });
    } catch (error) {
        console.error('Error in /whoami endpoint:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Save the user's name color to user.json
router.post('/api/name-color', (req, res) => {
    if (!req.session.user || !req.session.user.username) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const username = req.session.user.username;
    const { color } = req.body;
    if (!color) {
        return res.status(400).json({ error: 'No color provided' });
    }
    const safeColor = sanitizeColor(color);
    const userData = readUserData(username);
    if (!userData) {
        return res.status(404).json({ error: 'User not found' });
    }
    userData.color = safeColor;
    writeUserData(username, userData);
    req.session.user.color = safeColor;
    if (serverGlobals && typeof serverGlobals.broadcastUserList === 'function') {
        serverGlobals.broadcastUserList();
    }
    return res.json({ success: true, color: safeColor });
});

// Upload badge route
router.post('/api/upload-badge', badgeUpload.single('badgeFile'), (req, res) => {
    if (!req.session.user || !req.session.user.username) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const mime = req.file.mimetype;
    let ext;
    if (mime === 'image/png') {
        ext = 'png';
    } else if (mime === 'image/gif') {
        ext = 'gif';
    } else {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Only PNG or GIF allowed' });
    }
    const username = req.session.user.username;
    const userFolder = path.join(__dirname, '..', 'users', username);
    if (!fs.existsSync(userFolder)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'User folder not found' });
    }
    // Remove old badge files if any
    ['png', 'gif'].forEach(oldExt => {
        const oldFile = path.join(userFolder, `badge.${oldExt}`);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    });
        const newPath = path.join(userFolder, `badge.${ext}`);
        try {
            fs.renameSync(req.file.path, newPath);
        } catch (err) {
            return res.status(500).json({ success: false, error: 'Failed to save badge: ' + err.message });
        }
        const newBadgeUrl = `/users/${username}/badge.${ext}?t=${Date.now()}`;
        serverGlobals.latestBadge[username] = newBadgeUrl;
        if (serverGlobals.chatHistory && Array.isArray(serverGlobals.chatHistory)) {
            serverGlobals.chatHistory.forEach(msg => {
                if (msg.user === username) {
                    msg.badge = newBadgeUrl;
                }
            });
        }
        if (serverGlobals && typeof serverGlobals.broadcastBadgeUpdate === 'function') {
            serverGlobals.broadcastBadgeUpdate(username, newBadgeUrl);
            console.log(`Broadcasted badge update for ${username} with URL ${newBadgeUrl}`);
        }
        if (serverGlobals && typeof serverGlobals.broadcastUserList === 'function') {
            serverGlobals.broadcastUserList();
        }
        return res.json({ success: true });
});

// Upload ping sound route
router.post('/api/upload-ping', pingUpload.single('pingFile'), (req, res) => {
    if (!req.session.user || !req.session.user.username) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const mime = req.file.mimetype;
    // Accept WAV and MP3 files
    const allowedMimes = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mpeg3'];
    if (!allowedMimes.includes(mime)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'Only WAV and MP3 files allowed' });
    }
    const username = req.session.user.username;
    const userFolder = path.join(__dirname, '..', 'users', username);
    if (!fs.existsSync(userFolder)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, error: 'User folder not found' });
    }
    // Determine file extension based on MIME type
    const isMp3 = mime === 'audio/mpeg' || mime === 'audio/mp3' || mime === 'audio/mpeg3';
    const extension = isMp3 ? 'mp3' : 'wav';
    
    // Remove old ping files if they exist (both .wav and .mp3)
    const oldPingWav = path.join(userFolder, 'ping.wav');
    const oldPingMp3 = path.join(userFolder, 'ping.mp3');
    if (fs.existsSync(oldPingWav)) {
        fs.unlinkSync(oldPingWav);
    }
    if (fs.existsSync(oldPingMp3)) {
        fs.unlinkSync(oldPingMp3);
    }
    
    const newPath = path.join(userFolder, `ping.${extension}`);
    try {
        fs.renameSync(req.file.path, newPath);
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to save ping sound: ' + err.message });
    }
    const newPingUrl = `/users/${username}/ping.${extension}?t=${Date.now()}`;
    if (serverGlobals && typeof serverGlobals.broadcastUserList === 'function') {
        serverGlobals.broadcastUserList();
    }
    return res.json({ success: true, ping: newPingUrl });
});

module.exports = router;
