const fs = require('fs');
const path = require('path');

const gamesPath = path.join(__dirname, '../public/play/games');
const logosPath = path.join(__dirname, '../public/assets/images/logos');

function formatGameId(id) {
    return id
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function readGameMeta(gameDir) {
    const metaPath = path.join(gameDir, 'game.json');
    if (!fs.existsSync(metaPath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
        return null;
    }
}

function listGameIds() {
    if (!fs.existsSync(gamesPath)) {
        return [];
    }

    return fs.readdirSync(gamesPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
}

function getGameInfo(id) {
    const gameDir = path.join(gamesPath, id);
    const hasGame = fs.existsSync(gameDir);
    const meta = hasGame ? readGameMeta(gameDir) : null;

    return {
        id,
        name: meta?.name || formatGameId(id),
        playable: hasGame,
        logo: `/assets/images/logos/${id}/logo_${id}.png`
    };
}

function listGames() {
    return listGameIds().map(getGameInfo);
}

function gameExists(id) {
    return fs.existsSync(path.join(gamesPath, id));
}

function logoExists(id) {
    const logoDir = path.join(logosPath, id);
    if (!fs.existsSync(logoDir)) {
        return false;
    }
    return fs.readdirSync(logoDir).some((file) => /\.(png|jpe?g|webp)$/i.test(file));
}

module.exports = {
    listGames,
    getGameInfo,
    listGameIds,
    gameExists,
    logoExists,
    formatGameId
};
