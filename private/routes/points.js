// routes/points.js
const express = require('express');
const { readUserData, writeUserData } = require('../lib/storage');

const router = express.Router();

router.post('/update', (req, res) => {
    const username = req.session.user.username;
    const user = readUserData(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.points = (user.points || 0) + 1;
    writeUserData(username, user);
    res.json({ points: user.points });
});

router.get('/current', (req, res) => {
    const user = readUserData(req.session.user.username);
    res.json({ points: user?.points || 0 });
});

// New route to set points value (for casino games)
router.post('/set', (req, res) => {
    const username = req.session.user.username;
    const { points } = req.body;
    
    if (points === undefined || isNaN(points)) {
        return res.status(400).json({ error: 'Invalid points value' });
    }
    
    const user = readUserData(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.points = parseInt(points, 10);
    writeUserData(username, user);
    
    res.json({ points: user.points });
});

// New route to deduct points (for party commands)
router.post('/deduct', (req, res) => {
    const username = req.session.user.username;
    const { amount } = req.body;
    
    if (amount === undefined || isNaN(amount) || amount < 0) {
        return res.status(400).json({ error: 'Invalid amount value' });
    }
    
    const user = readUserData(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const currentPoints = user.points || 0;
    if (currentPoints < amount) {
        return res.status(400).json({ error: 'Insufficient points' });
    }
    
    user.points = currentPoints - parseInt(amount, 10);
    writeUserData(username, user);
    
    res.json({ points: user.points, deducted: parseInt(amount, 10) });
});

module.exports = router;
