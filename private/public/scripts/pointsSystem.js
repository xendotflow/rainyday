// public/scripts/pointsSystem.js
let pointsInterval;

function startPointsTracker() {
    pointsInterval = setInterval(async () => {
        try {
            const response = await fetch('/points/update', { method: 'POST' });
            if (!response.ok) return;
            const data = await response.json();
            const display = document.getElementById('usernameDisplay');
            if (display) display.dataset.points = data.points;
        } catch (e) {}
    }, 10000);
}

window.addEventListener('load', async () => {
    try {
        const response = await fetch('/points/current');
        if (!response.ok) return;
        const data = await response.json();
        const display = document.getElementById('usernameDisplay');
        if (display) display.dataset.points = data.points;
        
        if (window.location.pathname !== '/home.html') {
            startPointsTracker();
        }
    } catch (e) {}
});

window.addEventListener('beforeunload', () => clearInterval(pointsInterval));
