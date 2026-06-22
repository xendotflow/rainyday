// routes/upload.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireLogin } = require('../lib/auth');

const router = express.Router();

// Create multer instance with no file size limit
const unlimitedUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(__dirname, '../public/uploads/general');
            fs.mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            // Preserve original filename with timestamp prefix to avoid conflicts
            const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            cb(null, `${uniqueSuffix}-${originalName}`);
        }
    })
    // No limits specified - allows unlimited file size
});

// Upload file route
router.post('/file', requireLogin, unlimitedUpload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: `/uploads/general/${req.file.filename}`,
        uploadedBy: req.session.user.username,
        uploadedAt: new Date().toISOString()
    };

    res.json(fileInfo);
});

// List uploaded files (optional - for viewing uploaded files)
router.get('/files', requireLogin, (req, res) => {
    const uploadDir = path.join(__dirname, '../public/uploads/general');
    try {
        if (fs.existsSync(uploadDir)) {
            const files = fs.readdirSync(uploadDir).map(filename => {
                const filePath = path.join(uploadDir, filename);
                const stats = fs.statSync(filePath);
                return {
                    filename,
                    size: stats.size,
                    uploadedAt: stats.mtime.toISOString(),
                    path: `/uploads/general/${filename}`
                };
            });
            // Sort by upload date, newest first
            files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            res.json(files);
        } else {
            res.json([]);
        }
    } catch (err) {
        console.error('Error listing files:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

module.exports = router;

