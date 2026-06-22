const CHAT_MAX_LENGTH = 500;
const MAP_NAME_MAX_LENGTH = 120;

function sanitizeChatText(text) {
    if (typeof text !== 'string') {
        return '';
    }

    let value = text.replace(/\0/g, '').trim();
    if (!value) {
        return '';
    }

    value = value.replace(/<[^>]*>/g, '');
    if (value.length > CHAT_MAX_LENGTH) {
        value = value.slice(0, CHAT_MAX_LENGTH);
    }

    return value;
}

function sanitizeColor(color, fallback = '#ffffff') {
    if (typeof color !== 'string') {
        return fallback;
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function sanitizeAssetUrl(url) {
    if (typeof url !== 'string' || !url) {
        return '';
    }

    const lower = url.toLowerCase();
    if (!url.startsWith('/') || url.includes('://') || lower.includes('javascript:')) {
        return '';
    }

    if (!/^\/[\w./?=&%-]+$/.test(url)) {
        return '';
    }

    return url;
}

function sanitizeMapId(mapId) {
    if (mapId === null || mapId === undefined) {
        return null;
    }

    const value = String(mapId).replace(/\D/g, '').slice(0, 6);
    return value || null;
}

function sanitizeMapName(mapName) {
    if (typeof mapName !== 'string') {
        return null;
    }

    let value = mapName.replace(/\0/g, '').replace(/<[^>]*>/g, '').trim();
    if (!value) {
        return null;
    }

    if (value.length > MAP_NAME_MAX_LENGTH) {
        value = value.slice(0, MAP_NAME_MAX_LENGTH);
    }

    return value;
}

function sanitizeGameId(gameId) {
    if (typeof gameId !== 'string') {
        return '';
    }

    const value = gameId.trim().toLowerCase();
    if (!value || !/^[\w()-]+$/.test(value)) {
        return '';
    }

    return value;
}

module.exports = {
    sanitizeChatText,
    sanitizeColor,
    sanitizeAssetUrl,
    sanitizeMapId,
    sanitizeMapName,
    sanitizeGameId,
    CHAT_MAX_LENGTH
};
