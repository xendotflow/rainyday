// routes/admin.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { recoverUserData } = require('../lib/storage');

const router = express.Router();
const registrationsFilePath = path.join(__dirname, '../registrationsState.json');

// Load current registration state or default to open
let registrationsOpen = true;
if (fs.existsSync(registrationsFilePath)) {
    try {
        const state = JSON.parse(fs.readFileSync(registrationsFilePath, 'utf8'));
        registrationsOpen = state.registrationsOpen;
    } catch (err) {
        console.error('Error reading registrations state:', err);
    }
}

// Toggle registrations (admin only)
router.post('/toggle-registrations', (req, res) => {
    if (req.session.user?.username !== config.adminUsername)
        return res.status(403).json({ error: 'Forbidden' });
    registrationsOpen = !registrationsOpen;
    fs.writeFileSync(registrationsFilePath, JSON.stringify({ registrationsOpen }), 'utf8');
    const message = registrationsOpen ? 'Registrations are now open.' : 'Registrations are now closed.';
    res.json({ message });
});

// Get current registration status
router.get('/registration-status', (req, res) => {
    res.json({ registrationsOpen });
});

// Recover user data (admin only)
router.post('/recover-user', async (req, res) => {
    if (req.session.user?.username !== config.adminUsername) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { username, newPassword } = req.body;
    
    if (!username || !newPassword) {
        return res.status(400).json({ error: 'Username and new password are required' });
    }
    
    try {
        const userData = await recoverUserData(username, newPassword);
        res.json({ 
            message: `User ${username} recovered successfully`,
            username: userData.username
        });
    } catch (error) {
        console.error('Error recovering user:', error);
        res.status(500).json({ error: 'Failed to recover user' });
    }
});

// Middleware to block registration submissions if closed
const checkRegistrations = (req, res, next) => {
    if (!registrationsOpen && req.path === '/register' && req.method === 'POST') {
        return res.status(403).json({ error: 'Registrations are currently closed.' });
    }
    next();
};

module.exports = { router, checkRegistrations };
