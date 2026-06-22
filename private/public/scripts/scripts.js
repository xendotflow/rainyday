// main script entry point
import { initInputHandlers } from './input-handlers.js';
import { createTextInputHelper } from './text-input.js';
import { installPlayerConfigHook, updateClientName } from './player-config.js';
import { loadScriptsWithProgress } from './script-loader.js';
import { focusPlayer, initUIHelpers } from './ui-helpers.js';
import { initMapIdHandler } from './mapid-handler.js';
import { initStampSystem, setCurrentGame } from './stamps.js';

const canvas = document.getElementById('canvas');
let easyrpgPlayer;

initMapIdHandler();
initStampSystem();

function launch(done) {
    if (typeof window.createEasyRpgPlayer === 'undefined') {
        const checkInterval = setInterval(() => {
            if (typeof window.createEasyRpgPlayer !== 'undefined') {
                clearInterval(checkInterval);
                launchEasyRpgPlayer(done);
            }
        }, 100);
        return;
    }

    launchEasyRpgPlayer(done);
}

async function launchEasyRpgPlayer(done) {
    try {
        const whoami = await fetch('/whoami').then(response => response.json());
        installPlayerConfigHook(whoami.username);

        const Module = await window.createEasyRpgPlayer({ game: undefined, saveFs: undefined });
        easyrpgPlayer = Module;
        easyrpgPlayer.initApi();
        focusPlayer();

        const textInputHelper = createTextInputHelper(Module, canvas);
        Module.api_private.startTextInput_js = textInputHelper.startTextInput;
        Module.api_private.stopTextInput_js = textInputHelper.stopTextInput;
        Module.api_private.setTextInputRect_js = textInputHelper.setTextInputRect;
        Module.api_private.getClipboardText_js = textInputHelper.getClipboardText;
        Module.api_private.setClipboardText_js = textInputHelper.setClipboardText;

        window.onbeforeunload = () => 'Please confirm before closing';

        await updateClientName(Module);

        const urlParams = new URLSearchParams(window.location.search);
        const gameParam = urlParams.get('game');
        if (gameParam) {
            setCurrentGame(gameParam);
        }

        done();
    } catch (err) {
        console.error('error launching easyrpg player:', err);
    }
}

initUIHelpers(canvas);
initInputHandlers(canvas);
loadScriptsWithProgress(launch);
