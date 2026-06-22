// --- Input handlers module ---
// Handles keyboard, touch and gamepad inputs

// --- Global constants and variables ---
const hasTouchscreen = window.matchMedia('(hover: none), (pointer: coarse)').matches;
const preventNativeKeys = ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', ' ', 'F12'];
const keys = new Map();
const keysDown = new Map();
let lastTouchedId = null;
let gamepads = {};

// --- Keyboard simulation helpers ---
function simulateKeyboardEvent(eventType, key) {
    const event = new Event(eventType, { bubbles: true });
    event.code = key;
    canvas.dispatchEvent(event);
}

async function simulateKeyboardInput(key) {
    simulateKeyboardEvent('keydown', key);
    return new Promise(resolve => {
        setTimeout(() => {
            simulateKeyboardEvent('keyup', key);
            resolve();
        }, 100);
    });
}

// --- Bind touch keys ---
function bindKey(node, key) {
    keys.set(node.id, key);
    node.addEventListener('touchstart', event => {
        event.preventDefault();
        simulateKeyboardEvent('keydown', key);
        keysDown.set(event.target.id, node.id);
        node.classList.add('active');
    });
    node.addEventListener('touchend', event => {
        event.preventDefault();
        const pressedKey = keysDown.get(event.target.id);
        if (pressedKey && keys.has(pressedKey)) {
            simulateKeyboardEvent('keyup', keys.get(pressedKey));
        }
        keysDown.delete(event.target.id);
        node.classList.remove('active');
        if (lastTouchedId) document.getElementById(lastTouchedId).classList.remove('active');
    });
    node.addEventListener('touchmove', event => {
        const { clientX, clientY } = event.changedTouches[0];
        const origTargetId = keysDown.get(event.target.id);
        const nextTarget = document.elementFromPoint(clientX, clientY);
        const nextTargetId = nextTarget ? nextTarget.id : null;
        if (origTargetId === nextTargetId) return;
        if (origTargetId) {
            simulateKeyboardEvent('keyup', keys.get(origTargetId));
            keysDown.delete(event.target.id);
            document.getElementById(origTargetId).classList.remove('active');
        }
        if (nextTargetId && keys.has(nextTargetId)) {
            simulateKeyboardEvent('keydown', keys.get(nextTargetId));
            keysDown.set(event.target.id, nextTargetId);
            lastTouchedId = nextTargetId;
            document.getElementById(nextTargetId).classList.add('active');
        }
    });
}

// --- Gamepad handling ---
function addGamepad(gamepad) {
    if (!gamepad) return;
    gamepads[gamepad.index] = gamepad;
    updateTouchControlsVisibility();
}

function removeGamepad(gamepad) {
    if (!gamepad) return;
    delete gamepads[gamepad.index];
    updateTouchControlsVisibility();
}

function getGamepads() {
    return navigator.getGamepads ? navigator.getGamepads() : [];
}

function scanGamePads() {
    const pads = getGamepads();
    for (let i = 0; i < pads.length; i++) {
        if (pads[i]) gamepads[pads[i].index] = pads[i];
    }
}

function updateTouchControlsVisibility() {
    if (hasTouchscreen && Object.keys(gamepads).length === 0) {
        document.querySelectorAll('#dpad, #apad, #buttons').forEach(elem => {
            elem.style.display = '';
        });
    } else {
        document.querySelectorAll('#dpad, #apad, #buttons').forEach(elem => {
            elem.style.display = 'none';
        });
    }
}

function initInputHandlers(canvas) {
    if (!('ongamepadconnected' in window)) setInterval(scanGamePads, 500);
    window.addEventListener('gamepadconnected', e => addGamepad(e.gamepad));
    window.addEventListener('gamepaddisconnected', e => removeGamepad(e.gamepad));

    if (hasTouchscreen) {
        document.querySelectorAll('[data-key]').forEach(button => {
            bindKey(button, button.dataset.key);
        });
    } else {
        canvas.addEventListener('keydown', event => {
            if (preventNativeKeys.includes(event.key)) event.preventDefault();
        });
        canvas.addEventListener('contextmenu', event => event.preventDefault());
    }
    updateTouchControlsVisibility();

    // --- Tab key toggling between chat and game ---
    window.addEventListener("keydown", (e) => {
        // Check if the Tab key was pressed
        if (e.key === "Tab") {
            e.preventDefault();
            // If the chat input is currently focused, switch focus to the canvas (game)
            if (document.activeElement === document.getElementById("chatInput")) {
                canvas.focus();
            } else {
                // Otherwise, focus the chat input
                document.getElementById("chatInput").focus();
            }
        }
    });
    
    initPartyDisplaySystem();
}

// --- Party Display System ---
class PartyDisplaySystem {
    constructor() {
        this.isActive = false;
        this.overlay = null;
        this.animationFrame = null;
        this.startTime = null;
        this.duration = 2000; // 2 seconds display time
        this.confettiParticles = [];
    }
    
    show(targetUsername) {
        if (this.isActive) {
            this.hide();
        }
        
        this.createOverlay(targetUsername);
        this.isActive = true;
        this.startTime = performance.now();
        this.animate();
        
        // Auto-hide after duration
        setTimeout(() => this.hide(), this.duration);
    }
    
    createOverlay(targetUsername) {
        this.overlay = document.createElement('div');
        this.overlay.id = 'party-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        
        // Create party image
        const partyImg = document.createElement('img');
        partyImg.src = '/images/chat/party.png';
        partyImg.style.cssText = `
            width: 300px;
            height: 300px;
            object-fit: contain;
            animation: partyPulse 1s ease-in-out infinite alternate;
            z-index: 10000;
        `;
        
        // Add CSS animations
        if (!document.getElementById('party-styles')) {
            const style = document.createElement('style');
            style.id = 'party-styles';
            style.textContent = `
                @keyframes partyPulse {
                    from { transform: scale(1) rotate(-5deg); }
                    to { transform: scale(1.1) rotate(5deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        this.overlay.appendChild(partyImg);
        document.body.appendChild(this.overlay);
        
        // Create initial burst of confetti
        this.createInitialConfetti();
        
        // Trigger fade in
        setTimeout(() => {
            this.overlay.style.opacity = '1';
        }, 10);
    }
    
    createInitialConfetti() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
        
        // Create 50 initial confetti particles
        for (let i = 0; i < 50; i++) {
            this.confettiParticles.push(this.createConfettiParticle(colors));
        }
    }
    
    createConfettiParticle(colors) {
        return {
            x: Math.random() * window.innerWidth,
            y: -10,
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * 6 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 15,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            life: 1.0,
            decay: Math.random() * 0.02 + 0.005,
            shape: Math.random() < 0.6 ? 'rectangle' : 'circle'
        };
    }
    
    animate() {
        if (!this.isActive || !this.overlay) return;
        
        const elapsed = performance.now() - this.startTime;
        const progress = Math.min(elapsed / this.duration, 1);
        
        // Add more confetti particles periodically
        if (Math.random() < 0.7 && this.confettiParticles.length < 100) {
            const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
            for (let i = 0; i < 3; i++) {
                this.confettiParticles.push(this.createConfettiParticle(colors));
            }
        }
        
        // Update and render confetti
        this.updateConfetti();
        this.renderConfetti();
        
        if (progress < 1) {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        }
    }
    
    updateConfetti() {
        for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
            const particle = this.confettiParticles[i];
            
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.rotation += particle.rotationSpeed;
            
            // Apply gravity
            particle.vy += 0.2;
            
            // Fade out
            particle.life -= particle.decay;
            
            // Remove if off screen or faded
            if (particle.y > window.innerHeight + 50 || particle.life <= 0) {
                this.confettiParticles.splice(i, 1);
            }
        }
    }
    
    renderConfetti() {
        // Clear previous confetti elements
        this.overlay.querySelectorAll('.confetti-piece').forEach(el => el.remove());
        
        // Render current confetti particles
        this.confettiParticles.forEach(particle => {
            const confettiEl = document.createElement('div');
            confettiEl.className = 'confetti-piece';
            confettiEl.style.cssText = `
                position: absolute;
                left: ${particle.x}px;
                top: ${particle.y}px;
                width: ${particle.size}px;
                height: ${particle.shape === 'circle' ? particle.size : particle.size * 0.6}px;
                background-color: ${particle.color};
                opacity: ${particle.life};
                transform: rotate(${particle.rotation}deg);
                border-radius: ${particle.shape === 'circle' ? '50%' : '0'};
                pointer-events: none;
                z-index: 9998;
            `;
            this.overlay.appendChild(confettiEl);
        });
    }
    
    hide() {
        if (!this.isActive || !this.overlay) return;
        
        this.isActive = false;
        this.confettiParticles = [];
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        // Fade out
        this.overlay.style.opacity = '0';
        setTimeout(() => {
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
                this.overlay = null;
            }
        }, 300);
    }
}

// Initialize systems
let partyDisplaySystem = null;

function initPartyDisplaySystem() {
    partyDisplaySystem = new PartyDisplaySystem();
    
    // Export for global access
    window.partyDisplaySystem = {
        show: (username) => partyDisplaySystem?.show(username),
        hide: () => partyDisplaySystem?.hide(),
        isActive: () => partyDisplaySystem?.isActive || false
    };
}

// Export functions and variables
export { 
    initInputHandlers, 
    simulateKeyboardEvent, 
    simulateKeyboardInput 
}; 