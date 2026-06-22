// private/routes/stamps.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { readUserData, writeUserData } = require('../lib/storage');
const { fileUpload } = require('../lib/storage');

// Helper function to get stamp metadata
function getStampMetadata() {
    try {
        // Use absolute path from server root
        const stamplistPath = path.join(__dirname, '..', 'public', 'stamps', 'stamplist.json');
        
        console.log('Looking for stamplist.json at:', stamplistPath);
        
        // Check if the file exists
        if (fs.existsSync(stamplistPath)) {
            console.log('Found stamplist.json, reading content...');
            // Read the file
            const stamplistContent = fs.readFileSync(stamplistPath, 'utf8');
            
            // Parse and return metadata
            const metadata = JSON.parse(stamplistContent);
            console.log('Successfully parsed stamplist.json:', Object.keys(metadata));
            return metadata;
        } else {
            console.log('stamplist.json not found at:', stamplistPath);
        }
    } catch (error) {
        console.error('Error reading stamplist.json:', error);
    }
    
    // Return empty object if file doesn't exist or there's an error
    return {};
}

// Check if a stamp exists in the metadata
function stampExists(game, mapId) {
    const metadata = getStampMetadata();
    return metadata && 
           metadata[game] && 
           metadata[game][mapId];
}

// Get user's collected stamps
router.get('/user-stamps', (req, res) => {
    console.log('GET /stamps/user-stamps - Request received');
    console.log('Session user:', req.session?.user);
    
    if (!req.session || !req.session.user) {
        console.log('GET /stamps/user-stamps - No session or user, returning 401');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const username = req.session.user.username;
        console.log(`Loading stamps for user: ${username}`);
        
        // Read user data
        const userData = readUserData(username);
        
        // Handle case where user data doesn't exist
        if (!userData) {
            console.log(`User data not found for ${username}, returning empty stamps`);
            return res.json({ collectedStamps: {} });
        }
        
        // Get collected stamps from user data
        const collectedStamps = userData.collectedStamps || {};
        
        console.log(`Returning collected stamps for ${username}:`, collectedStamps);
        
        res.json({ collectedStamps });
    } catch (error) {
        console.error('Error loading user stamps:', error);
        res.status(500).json({ error: 'Failed to load user stamps' });
    }
});

// Serve the stamplist.json file
router.get('/stamplist.json', (req, res) => {
    console.log('GET /stamps/stamplist.json - Request received');
    try {
        // Use absolute path from server root
        const stamplistPath = path.join(__dirname, '..', 'public', 'stamps', 'stamplist.json');
        
        console.log('Looking for stamplist.json at:', stamplistPath);
        
        // Check if the file exists
        if (fs.existsSync(stamplistPath)) {
            console.log('Found stamplist.json, reading content...');
            // Read the file
            const stamplistContent = fs.readFileSync(stamplistPath, 'utf8');
            
            // Parse and send as JSON
            const stamplist = JSON.parse(stamplistContent);
            console.log('GET /stamps/stamplist.json - Returning stamplist data');
            res.json(stamplist);
        } else {
            // If file doesn't exist, return an empty object
            console.log('GET /stamps/stamplist.json - File not found at:', stamplistPath);
            res.json({});
        }
    } catch (error) {
        console.error('Error serving stamplist.json:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Save user's collected stamps
router.post('/user-stamps', (req, res) => {
    console.log('POST /stamps/user-stamps - Request received');
    console.log('Session user:', req.session?.user);
    console.log('Request body:', req.body);
    
    if (!req.session || !req.session.user) {
        console.log('POST /stamps/user-stamps - No session or user, returning 401');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const username = req.session.user.username;
        const { collectedStamps } = req.body;
        
        if (!collectedStamps) {
            console.log('POST /stamps/user-stamps - Missing collectedStamps');
            return res.status(400).json({ error: 'Missing collectedStamps' });
        }
        
        console.log(`Saving stamps for user ${username}:`, collectedStamps);
        
        // Read existing user data
        let userData = readUserData(username);
        
        // Create user data if it doesn't exist
        if (!userData) {
            console.log(`Creating new user data for ${username}`);
            userData = {
                username,
                points: 0,
                logoPreferences: {},
                color: "#ffffff"
            };
        }
        
        // Update collected stamps
        userData.collectedStamps = collectedStamps;
        
        // Write updated user data
        writeUserData(username, userData);
        
        console.log(`Successfully saved stamps for user ${username}`);
        
        res.json({ success: true, message: 'Stamps saved successfully' });
    } catch (error) {
        console.error('Error saving user stamps:', error);
        res.status(500).json({ error: 'Failed to save user stamps' });
    }
});

// Add a single stamp to a user's collection
router.post('/collect-stamp', (req, res) => {
    console.log('POST /stamps/collect-stamp - Request received');
    console.log('Session user:', req.session?.user);
    console.log('Request body:', req.body);
    
    if (!req.session || !req.session.user) {
        console.log('POST /stamps/collect-stamp - No session or user, returning 401');
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const username = req.session.user.username;
        const { game, mapId } = req.body;
        
        if (!game || !mapId) {
            console.log('POST /stamps/collect-stamp - Missing game or mapId');
            return res.status(400).json({ error: 'Missing game or mapId' });
        }
        
        console.log(`Attempting to collect stamp: game=${game}, mapId=${mapId} for user ${username}`);
        
        // Check if the stamp exists in the stamplist
        const metadata = getStampMetadata();
        if (!metadata[game] || !metadata[game][mapId]) {
            console.log(`POST /stamps/collect-stamp - Stamp not found in metadata: game=${game}, mapId=${mapId}`);
            return res.status(404).json({ error: 'Stamp not found' });
        }
        
        // Read current user data
        let userData = readUserData(username);
        
        // Create user data if it doesn't exist
        if (!userData) {
            console.log(`Creating new user data for ${username}`);
            userData = {
                username,
                points: 0,
                logoPreferences: {},
                color: "#ffffff",
                collectedStamps: {}
            };
        }
        
        // Initialize collectedStamps if it doesn't exist
        if (!userData.collectedStamps) {
            userData.collectedStamps = {};
        }
        
        // Initialize game array if it doesn't exist
        if (!userData.collectedStamps[game]) {
            userData.collectedStamps[game] = [];
        }
        
        // Check if stamp is already collected
        const alreadyCollected = userData.collectedStamps[game].includes(mapId);
        
        if (alreadyCollected) {
            console.log(`POST /stamps/collect-stamp - Stamp already collected: game=${game}, mapId=${mapId}`);
            return res.json({ 
                success: true, 
                added: false, 
                message: 'Stamp already collected' 
            });
        }
        
        // Add the stamp to the collection
        userData.collectedStamps[game].push(mapId);
        
        // Write updated user data back to file
        writeUserData(username, userData);
        
        console.log(`POST /stamps/collect-stamp - Successfully collected stamp: game=${game}, mapId=${mapId} for user ${username}`);
        
        res.json({ 
            success: true, 
            added: true, 
            message: 'Stamp collected successfully',
            stamp: metadata[game][mapId]
        });
    } catch (error) {
        console.error('Error collecting stamp:', error);
        res.status(500).json({ error: 'Failed to collect stamp' });
    }
});

// Upload a new stamp (admin only)
router.post('/upload', (req, res) => {
    console.log('POST /stamps/upload - Request received');
    console.log('Session user:', req.session?.user);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    // Check if user is authenticated and is admin (xen)
    if (!req.session || !req.session.user || req.session.user.username !== config.adminUsername) {
        console.log('POST /stamps/upload - Unauthorized access attempt');
        return res.status(403).json({ error: 'Admin access required' });
    }

    // Use fileUpload middleware to handle the file upload
    fileUpload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('File upload error:', err);
            return res.status(400).json({ error: 'File upload failed: ' + err.message });
        }
        
        console.log('After fileUpload middleware:');
        console.log('Request body:', req.body);
        console.log('Request file:', req.file);

        try {
            const { game, mapId, stampName, stampLocation, stampDescription } = req.body;
            
            if (!game || !mapId || !stampName || !stampLocation || !req.file) {
                console.log('Missing fields:', { game, mapId, stampName, stampLocation, hasFile: !!req.file });
                return res.status(400).json({ 
                    error: 'Missing required fields',
                    details: { game, mapId, stampName, stampLocation, hasFile: !!req.file }
                });
            }

            // Validate mapId format (4 digits)
            if (!/^\d{4}$/.test(mapId)) {
                return res.status(400).json({ error: 'Map ID must be 4 digits (e.g., 0001)' });
            }

            console.log(`Uploading stamp: game=${game}, mapId=${mapId}, name=${stampName}`);

            // Create stamps directory for the game if it doesn't exist
            const gameStampsDir = path.join(__dirname, '..', 'public', 'stamps', game);
            fs.mkdirSync(gameStampsDir, { recursive: true });

            // Save the stamp image
            const stampImagePath = path.join(gameStampsDir, `${mapId}.png`);
            fs.renameSync(req.file.path, stampImagePath);

            // Update stamplist.json
            const stamplistPath = path.join(__dirname, '..', 'public', 'stamps', 'stamplist.json');
            let stamplist = {};
            
            if (fs.existsSync(stamplistPath)) {
                stamplist = JSON.parse(fs.readFileSync(stamplistPath, 'utf8'));
            }

            // Initialize game entry if it doesn't exist
            if (!stamplist[game]) {
                stamplist[game] = {};
            }

            // Add the new stamp to the metadata
            stamplist[game][mapId] = {
                name: stampName,
                location: stampLocation,
                description: stampDescription || 'No description available.',
                mapId: mapId
            };

            // Write updated stamplist back to file
            fs.writeFileSync(stamplistPath, JSON.stringify(stamplist, null, 2));

            console.log(`Successfully uploaded stamp: ${game}/${mapId}.png`);
            res.json({ 
                success: true, 
                message: 'Stamp uploaded successfully',
                stamp: {
                    game,
                    mapId,
                    name: stampName,
                    location: stampLocation
                }
            });

        } catch (error) {
            console.error('Error uploading stamp:', error);
            res.status(500).json({ error: 'Failed to upload stamp' });
        }
    });
});

module.exports = router; 