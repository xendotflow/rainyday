// --- Script Loader module ---
// Handles dynamic script loading with progress bar

import { focusPlayer } from './ui-helpers.js';

function loadScriptsWithProgress(onComplete) {
    // Create and configure a progress bar element.
    const progressBar = document.createElement('progress');
    progressBar.style.cssText = "position: absolute; top: 0; left: 0; width: 4rem;";
    progressBar.max = 100;
    document.body.append(progressBar);

    function bytesToPercent(bytes) {
        const thresh = 100;
        if (bytes < thresh) return bytes;
        let u = -1;
        do {
            bytes /= thresh;
            ++u;
        } while (bytes >= thresh && u < 10);
        return bytes * 10 % 99;
    }

    async function fetchWithProgress(url, options) {
        const response = await oldFetch(url, options);
        const contentLength = response.headers.get("Content-Length");
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let bytesLoaded = 0;
        return new Response(response.body.pipeThrough(new TransformStream({
            transform(chunk, controller) {
                bytesLoaded += chunk.byteLength;
                if (total) {
                    progressBar.value = (bytesLoaded / total) * 100;
                } else {
                    progressBar.value = bytesToPercent(bytesLoaded);
                }
                controller.enqueue(chunk);
            }
        })), response);
    }
    const oldFetch = window.fetch;
    window.fetch = fetchWithProgress;

    // Look for the container element with id "scriptTagText"
    const container = document.getElementById('scriptTagText');
    if (container) {
        // Find the first <script> tag inside the container
        const scriptElement = container.querySelector('script');
        if (scriptElement && scriptElement.src) {
            // If a script element with a valid src is found, fetch and load it
            fetch(scriptElement.src)
            .then(response => response.text())
            .then(text => {
                const script = document.createElement('script');
                script.src = scriptElement.src; // Set the src attribute so document.currentScript.src works
                script.textContent = text;
                document.body.appendChild(script);
                onComplete(() => progressBar.style.display = 'none');
            })
            .catch(err => {
                console.error('Error fetching dynamic script:', err);
                onComplete(() => progressBar.style.display = 'none');
            });
        } else {
            // No valid script element found inside the container.
            onComplete(() => progressBar.style.display = 'none');
        }
    } else {
        // If the container element isn't present at all.
        onComplete(() => progressBar.style.display = 'none');
    }
}

export { loadScriptsWithProgress }; 