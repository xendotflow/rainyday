// lib/auth.js
const session = require('express-session');
const crypto = require('crypto');

// In-memory store for session tokens (in production, use Redis or a database)
const sessionTokens = new Map();
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'generate-a-strong-random-secret-here',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_EXPIRY
    }
});

// Generate a secure session token for a user
function generateSessionToken(username) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY;
    
    sessionTokens.set(token, {
        username,
        expiresAt,
        createdAt: Date.now()
    });
    
    // Clean up expired tokens periodically
    cleanupExpiredTokens();
    
    return token;
}

// Validate a session token
function validateSessionToken(token) {
    if (!token) return null;
    
    const tokenData = sessionTokens.get(token);
    if (!tokenData) return null;
    
    // Check if token is expired
    if (Date.now() > tokenData.expiresAt) {
        sessionTokens.delete(token);
        return null;
    }
    
    return tokenData;
}

// Refresh a session token (extend its expiry)
function refreshSessionToken(token) {
    const tokenData = sessionTokens.get(token);
    if (!tokenData) return null;
    
    // Only refresh if token is still valid and not too old
    if (Date.now() > tokenData.expiresAt) {
        sessionTokens.delete(token);
        return null;
    }
    
    // Extend the expiry
    tokenData.expiresAt = Date.now() + TOKEN_EXPIRY;
    sessionTokens.set(token, tokenData);
    
    return token;
}

// Clean up expired tokens
function cleanupExpiredTokens() {
    const now = Date.now();
    for (const [token, data] of sessionTokens.entries()) {
        if (now > data.expiresAt) {
            sessionTokens.delete(token);
        }
    }
}

// Enhanced user validation that checks both session and token
function validateUser(req) {
    // First, try traditional session validation
    if (req.session && req.session.user) {
        return req.session.user;
    }
    
    // If no session, try token validation from headers or query params
    let token = req.headers['x-session-token'] || req.query.token;
    
    // Manual cookie parsing if cookie-parser is not available
    if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        token = cookies.sessionToken;
    }
    
    if (token) {
        const tokenData = validateSessionToken(token);
        if (tokenData) {
            // Restore session from token
            req.session.user = { username: tokenData.username };
            return req.session.user;
        }
    }
    
    return null;
}

// Enhanced WebSocket session validation
function validateWebSocketSession(req, token = null) {
    // Try normal session first
    if (req.session && req.session.user) {
        return req.session.user;
    }
    
    // Try token validation
    if (token) {
        const tokenData = validateSessionToken(token);
        if (tokenData) {
            return { username: tokenData.username };
        }
    }
    
    // Extract token from URL query params as fallback
    if (req.url) {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const urlToken = urlObj.searchParams.get('token');
            if (urlToken) {
                const tokenData = validateSessionToken(urlToken);
                if (tokenData) {
                    return { username: tokenData.username };
                }
            }
        } catch (error) {
            console.error('Error parsing WebSocket URL for token:', error);
        }
    }
    
    return null;
}

// Revoke a session token
function revokeSessionToken(token) {
    return sessionTokens.delete(token);
}

// Revoke all tokens for a user
function revokeUserTokens(username) {
    let revokedCount = 0;
    for (const [token, data] of sessionTokens.entries()) {
        if (data.username === username) {
            sessionTokens.delete(token);
            revokedCount++;
        }
    }
    return revokedCount;
}

const requireLogin = (req, res, next) => {
    const user = validateUser(req);
    if (!user) {
        return process.env.NODE_ENV === 'development'
        ? res.status(401).json({ error: 'Unauthorized' })
        : res.redirect('/login');
    }
    next();
};

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = { 
    sessionMiddleware, 
    requireLogin, 
    generateSessionToken,
    validateSessionToken,
    refreshSessionToken,
    validateUser,
    validateWebSocketSession,
    revokeSessionToken,
    revokeUserTokens
};
