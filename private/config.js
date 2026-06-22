// config.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const { listGameIds } = require('./lib/games');

const config = {
    port: process.env.PORT || 3000,
    https: isProduction,
    sessionSecret: process.env.SESSION_SECRET || 'dev-secret',
    saltRounds: parseInt(process.env.SALT_ROUNDS, 10) || 12,
    maxUploadSize: '10MB',
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    credentials: null,
    gamesPath: path.join(__dirname, 'public', 'play', 'games'),
    easyrpgMp: {
        autoStart: process.env.EASYRPG_MP_AUTO_START !== 'false',
        bind: process.env.EASYRPG_MP_BIND || '127.0.0.1:6500',
        upstream: process.env.EASYRPG_MP_UPSTREAM || 'ws://127.0.0.1:6500',
        binary: process.env.EASYRPG_MP_BINARY || path.join(
            __dirname,
            '..',
            'EasyRPG-Player-Monoko',
            'build',
            'easyrpg-player-server'
        )
    }
};

if (config.https) {
    if (!process.env.SSL_KEY_PATH || !process.env.SSL_CERT_PATH) {
        console.error('SSL_KEY_PATH and SSL_CERT_PATH are required when NODE_ENV=production');
    } else {
        try {
            config.credentials = {
                key: fs.readFileSync(process.env.SSL_KEY_PATH),
                cert: fs.readFileSync(process.env.SSL_CERT_PATH)
            };
        } catch (err) {
            console.error('Failed to load SSL credentials:', err);
        }
    }
}

try {
    config.games = listGameIds();
} catch (error) {
    console.log('games directory not found, skipping game configuration:', error.message);
    config.games = [];
}

module.exports = config;
