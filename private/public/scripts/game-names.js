// public/scripts/game-names.js

function formatGameId(id) {
    return id
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

const gameCache = {};

async function loadGames() {
    const response = await fetch('/api/games');
    if (!response.ok) {
        throw new Error(`failed to load games: ${response.status}`);
    }

    const games = await response.json();
    Object.keys(gameCache).forEach((key) => delete gameCache[key]);
    games.forEach((game) => {
        gameCache[game.id] = game;
    });
    return games;
}

function getDisplayName(gameCode) {
    return gameCache[gameCode]?.name || formatGameId(gameCode);
}

function getAllCodes() {
    return Object.keys(gameCache);
}

function getGame(gameCode) {
    return gameCache[gameCode] || null;
}

window.GameNames = {
    loadGames,
    getDisplayName,
    getAllCodes,
    getGame,
    formatGameId
};
