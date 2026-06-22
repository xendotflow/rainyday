// routes/assets.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { requireLogin } = require('../lib/auth');
const { fileUpload } = require('../lib/storage');

const router = express.Router();

// Upload asset file
router.post('/upload', requireLogin, fileUpload.single('file'), (req, res) => {
    const { game, type } = req.body;
    if (!game || !type || !req.file) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }
    const targetDir = path.join(__dirname, '../public/assets/images/logos', game, type);
    fs.mkdirSync(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, req.file.originalname);
    fs.rename(req.file.path, targetPath, (err) => {
        if (err) {
            console.error('File rename error:', err);
            return res.status(500).json({ error: 'File processing error' });
        }
        res.json({ success: true });
    });
});

// List logo files for a game (no authentication required)
router.get('/logos/:game', (req, res) => {
    const logosDir = path.join(__dirname, '../public/assets/images/logos', req.params.game);
    try {
        if (fs.existsSync(logosDir)) {
            const files = fs.readdirSync(logosDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
            res.json(files);
        } else {
            res.json([]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get or update user logo preferences
router.route('/preferences')
.get((req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { readUserData } = require('../lib/storage');
    const user = readUserData(req.session.user.username);
    res.json(user.logoPreferences || {});
})
.post((req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { readUserData, writeUserData } = require('../lib/storage');
    const user = readUserData(req.session.user.username);
    user.logoPreferences = req.body;
    writeUserData(req.session.user.username, user);
    res.json({ success: true });
});

module.exports = router;
