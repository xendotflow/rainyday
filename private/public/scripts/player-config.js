// --- Player Configuration module ---
// Sets F4 as chat toggle key, site username, and multiplayer address in config.ini

function getMpRemoteAddress() {
    const port = window.location.port;
    if (port !== '' && port !== '80' && port !== '443') {
        return `${window.location.hostname}:${port}`;
    }
    return null;
}

function patchConfigContent(configContent, username) {
    const mpRemoteAddress = getMpRemoteAddress();
    const lines = configContent.split(/\r?\n/);
    const newLines = [];
    let currentSection = '';
    let multiplayerUpdated = false;
    let inputUpdated = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const sectionMatch = line.match(/^\s*\[(.+?)\]\s*$/);

        if (sectionMatch) {
            currentSection = sectionMatch[1];
            newLines.push(line);

            if (currentSection === 'Multiplayer' && !multiplayerUpdated) {
                newLines.push(`ClientChatName=${username}`);
                if (mpRemoteAddress) {
                    newLines.push(`ClientRemoteAddress=${mpRemoteAddress}`);
                }
                multiplayerUpdated = true;
            }
            if (currentSection === 'Input' && !inputUpdated) {
                newLines.push('TOGGLE_CHAT=F4');
                inputUpdated = true;
            }
            continue;
        }

        if (currentSection === 'Multiplayer' && line.startsWith('ClientChatName=')) {
            continue;
        }
        if (currentSection === 'Multiplayer' && line.startsWith('ClientRemoteAddress=')) {
            continue;
        }
        if (currentSection === 'Input' && line.startsWith('TOGGLE_CHAT=')) {
            continue;
        }

        newLines.push(line);
    }

    if (!multiplayerUpdated) {
        newLines.push('[Multiplayer]');
        newLines.push(`ClientChatName=${username}`);
        if (mpRemoteAddress) {
            newLines.push(`ClientRemoteAddress=${mpRemoteAddress}`);
        }
    }
    if (!inputUpdated) {
        newLines.push('[Input]');
        newLines.push('TOGGLE_CHAT=F4');
    }

    return newLines.join('\n');
}

function applyPlayerConfig(Module, username) {
    const configPath = '/home/web_user/.config/EasyRPG/Player/config.ini';

    try {
        let configContent = '';
        try {
            configContent = Module.FS.readFile(configPath, { encoding: 'utf8' });
        } catch (_) {
            configContent = '';
        }

        const newConfigContent = patchConfigContent(configContent, username);
        Module.FS.writeFile(configPath, newConfigContent);
        console.log('Updated config.ini content:\n', newConfigContent);

        Module.FS.syncfs(false, (err) => {
            if (err) {
                console.error('Error syncing FS (save):', err);
            }
        });
    } catch (e) {
        console.error('Error applying player config:', e);
    }
}

function installPlayerConfigHook(username) {
    window.rainydayConfigPatched = false;
    window.rainydayPatchPlayerConfig = (Module) => {
        applyPlayerConfig(Module, username);
    };
}

function updateClientName(Module) {
    return fetch('/whoami')
        .then(response => response.json())
        .then(data => {
            applyPlayerConfig(Module, data.username);
            if (Module.api && typeof Module.api.refreshScene === 'function') {
                try {
                    Module.api.refreshScene();
                } catch (refreshErr) {
                    console.error('Error refreshing scene:', refreshErr);
                }
            }
        });
}

export { installPlayerConfigHook, updateClientName, applyPlayerConfig };
