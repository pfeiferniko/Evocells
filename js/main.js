window.isDemoMode = false;
window.is3DMode = false; // Neuer globaler Schalter

// main.js - ganz oben
const canvas = document.getElementById('canvas2D');
const canvas3D = document.getElementById('canvas3D');
const uiCanvas = document.getElementById('uiCanvas');

// WICHTIG: let statt const, damit wir den Pinsel wechseln können!
window.ctx = canvas2D.getContext('2d');
const uiCtx = uiCanvas.getContext('2d');

let WORLD_WIDTH = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
let WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
const GRID_SIZE = window.SETTINGS.GRID_SIZE || 50;
let staticGrid, dynamicGrid;

let mouseX = 0;
let mouseY = 0;

let entities = [];
let startTime = 0; // NEU: Merkt sich den Startzeitpunkt
let simScore = parseInt(localStorage.getItem('evoSimScore')) || 1000;

let globalHerbivoreCount = 0;
let globalCarnivoreCount = 0;
let globalPlantCount = 0;
let globalGiantCount = 0;

// --- PLANKTON / WASSERSTAUB ---
const PLANKTON_COUNT = 150; // Anzahl der Partikel
const planktons = [];

// --- PARTIKEL-SYSTEM (Fress-Krümel) ---
let particles = [];
let scoreParticles = []; // <--- NEU: Schwarm-Partikel für die Punkte

// --- DEBUG-LINIEN LOGIK ---
let showDebugLines = false;
const debugBtn = document.getElementById('debug-btn');

// --- PERFORMANCE MONITORING ---
let currentFps = 0;
let currentProcessTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;

// Setze den initialen Text passend zur Variable
if (debugBtn) {
    debugBtn.innerText = "Debug: AUS";
    debugBtn.style.color = "#555";
    
    debugBtn.addEventListener('click', () => {
        showDebugLines = !showDebugLines;
        if (showDebugLines) {
            debugBtn.innerText = "Debug: AN";
            debugBtn.style.color = "#999";
        } else {
            debugBtn.innerText = "Debug: AUS";
            debugBtn.style.color = "#555";
        }
    });
}

// --- NEU: FPS-ANZEIGE LOGIK ---
let showFps = false; // Standardmäßig AN
const fpsBtn = document.getElementById('fps-btn');

if (fpsBtn) {
    fpsBtn.innerText = "FPS: AUS";
    fpsBtn.style.color = "#555";

    fpsBtn.addEventListener('click', () => {
        showFps = !showFps;
        if (showFps) {
            fpsBtn.innerText = "FPS: AN";
            fpsBtn.style.color = "#999";
        } else {
            fpsBtn.innerText = "FPS: AUS";
            fpsBtn.style.color = "#555";
        }
    });
}

// --- VOLLBILD-LOGIK ---
const fullscreenBtn = document.getElementById('fullscreen-btn');

if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        // Wir nehmen das gesamte HTML-Dokument in den Vollbildmodus
        const elem = document.documentElement;

        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            // Vollbild aktivieren
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) { /* Safari / iOS */
                elem.webkitRequestFullscreen();
            }
            fullscreenBtn.innerText = "Beenden";
            fullscreenBtn.style.background = "rgba(0, 0, 0, 0.5)";
        } else {
            // Vollbild beenden
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari / iOS */
                document.webkitExitFullscreen();
            }
            fullscreenBtn.innerText = "Vollbild";
            fullscreenBtn.style.background = "rgba(255, 255, 255, 0.15)";
        }
    });
}

const demoBtn = document.getElementById('demo-btn');

if (demoBtn) {
    demoBtn.innerText = "Demo: AUS";
    demoBtn.style.color = "#555";

    demoBtn.addEventListener('click', () => {
        // Fall 1: Demo-Modus wird EINGESCHALTET
        if (!window.isDemoMode) {

            // --- NEU: VOR dem Wechsel zwingend den aktuellen Spielstand speichern! ---
            if (entities.length > 0) {
                saveSimulationState();
                console.log("Echter Spielstand vor Demo-Start sicher gespeichert.");
            }

            window.isDemoMode = true;

            // Alles sauber leeren für die Demo
            entities = [];
            particles = [];
            staticGrid.clear();
            dynamicGrid.clear();
            startTime = Date.now();

            demoBtn.innerText = "Demo: AN";
            demoBtn.style.color = "#999";

            // Shop erzwingend schließen
            if (typeof isShopOpen !== 'undefined') {
                isShopOpen = false;
                isPlacementMode = false;
                pendingItem = null;
            }

            // Demo-Welt generieren
            generateInitialWorld();

            // Fall 2: Demo-Modus wird AUSGESCHALTET
        } else {
            window.isDemoMode = false;

            // Demo-Entities komplett löschen
            entities = [];
            particles = [];
            staticGrid.clear();
            dynamicGrid.clear();

            demoBtn.innerText = "Demo: AUS";
            demoBtn.style.color = "#555";

            // Versuchen, die eben gespeicherte Welt wiederherzustellen
            if (loadSimulationState()) {
                console.log("Gespeicherte Welt nach Demo-Modus erfolgreich geladen.");
            } else {
                console.log("Kein Spielstand vorhanden. Starte kleine Welt.");
                startTime = Date.now();
                generateInitialWorld2();
            }
        }
    });
}

const modeBtn = document.getElementById('mode-btn');
if (modeBtn) {
    modeBtn.addEventListener('click', () => {
        window.is3DMode = !window.is3DMode;

        if (window.is3DMode) {
            modeBtn.innerText = "Ansicht: 3D";
            modeBtn.style.color = "#999";
            canvas.style.display = 'none';      // 2D verstecken
            canvas3D.style.display = 'block';   // 3D anzeigen
        } else {
            modeBtn.innerText = "Ansicht: 2D";
            modeBtn.style.color = "#555";
            canvas.style.display = 'block';     // 2D anzeigen
            canvas3D.style.display = 'none';    // 3D verstecken
            uiCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT); // UI-Scheibe putzen
        }
    });
}

// Wir definieren alle unsere gewünschten Stufen in einer einfachen Liste
const pixelModes = [
    { label: "AUS", factor: 1.0 },
    { label: "0.8", factor: 0.8 },
    { label: "0.6", factor: 0.6 },
    { label: "0.5", factor: 0.5 },
    { label: "0.4", factor: 0.4 },
    { label: "0.3", factor: 0.3 },
    { label: "0.2", factor: 0.2 }
];

let currentPixelMode = 0; // Startet bei Index 0 (AUS)
const pixelBtn = document.getElementById('pixel-btn');

if (pixelBtn) {
    // Setzt den Text direkt beim Start auf den richtigen Wert ("Pixel: 0.6")
    pixelBtn.innerText = `Pixel: ${pixelModes[currentPixelMode].label}`;

    pixelBtn.addEventListener('click', () => {
        currentPixelMode = (currentPixelMode + 1) % pixelModes.length;
        const mode = pixelModes[currentPixelMode];

        pixelBtn.innerText = `Pixel: ${mode.label}`;
        applyResolution(mode.factor);
    });
}

function applyResolution(factor) {
    canvas.width = WORLD_WIDTH * factor;
    canvas.height = WORLD_HEIGHT * factor;
    canvas3D.width = WORLD_WIDTH * factor;
    canvas3D.height = WORLD_HEIGHT * factor;
    uiCanvas.width = WORLD_WIDTH * factor;
    uiCanvas.height = WORLD_HEIGHT * factor;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(factor, factor);

    uiCtx.setTransform(1, 0, 0, 1, 0, 0);
    uiCtx.scale(factor, factor);

    if (typeof renderer !== 'undefined') {
        renderer.setSize(canvas3D.width, canvas3D.height, false);
    }

    if (factor === 1.0) {
        canvas.classList.remove('pixel-mode');
        canvas3D.classList.remove('pixel-mode');
        uiCanvas.classList.remove('pixel-mode');
    } else {
        canvas.classList.add('pixel-mode');
        canvas3D.classList.add('pixel-mode');
        uiCanvas.classList.add('pixel-mode');
    }
}

// Hilfsfunktion, um schnell neue Krümel zu erzeugen
function createParticles(x, y, color, count, baseSize = null) {
    for (let i = 0; i < count; i++) {

        // Wenn eine baseSize übergeben wurde, skalieren wir den Krümel.
        // Ansonsten nehmen wir den Standard für Pflanzen (1 bis 3 Pixel).
        let pSize = baseSize ? (baseSize * 0.5 + Math.random() * baseSize) : (Math.random() * 2 + 1);

        particles.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0,
            decay: 0.02 + Math.random() * 0.03,
            color: color,
            size: pSize
        });
    }
}
// Ändere die Ziel-Variable für die Listener:
// Statt canvas.addEventListener... nutzen wir uiCanvas.addEventListener...

uiCanvas.addEventListener('mousemove', (e) => {
    const rect = uiCanvas.getBoundingClientRect();
    // Nutze uiCanvas für die Berechnung des Skalierungsfaktors
    const factor = pixelModes[currentPixelMode].factor;
    const scaleX = uiCanvas.width / rect.width;
    const scaleY = uiCanvas.height / rect.height;

    mouseX = (e.clientX - rect.left) * scaleX / factor;
    mouseY = (e.clientY - rect.top) * scaleY / factor;
});


uiCanvas.addEventListener('mousedown', (e) => {
    const rect = uiCanvas.getBoundingClientRect();
    const factor = pixelModes[currentPixelMode].factor;
    const scaleX = uiCanvas.width / rect.width;
    const scaleY = uiCanvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX / factor;
    const clickY = (e.clientY - rect.top) * scaleY / factor;

    // Der Shop prüft, ob das Plus oder ein Item getroffen wurde
    const consumed = handleShopClick(clickX, clickY);

    if (!consumed) {

        // --- NEU: LÖSCH-MODUS LOGIK ---
        if (typeof isDeleteMode !== 'undefined' && isDeleteMode) {
            // Wir suchen das nächste Element im Umkreis des Klicks
            let target = null;
            let minDist = 30; // Toleranz-Radius für das Treffen kleiner Objekte

            for (let i = 0; i < entities.length; i++) {
                const ent = entities[i];
                // Wir löschen nur Köpfe, Pflanzen und Steine (Schwänze verschwinden mit dem Tier)
                if (ent.type === 'animal' || ent.type === 'plant' || ent.type === 'stone') {
                    const dx = ent.x - clickX;
                    const dy = ent.y - clickY;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < (ent.size || 5) + 15 && dist < minDist) {
                        target = ent;
                        minDist = dist;
                    }
                }
            }

            if (target) {
                // Aus den Grids entfernen
                if (target.type === 'plant' || target.type === 'stone') {
                    staticGrid.remove(target);
                }

                // Tier und Schwanz markieren
                target.alive = false;
                if (target.tailSegments) {
                    target.tailSegments.forEach(t => t.alive = false);
                }

                // Effekt beim Löschen
                createParticles(target.x, target.y, '#ffffff', 10, 2);
            }
            return; // Klick ist verarbeitet
        }

        // --- NEU: Diamanten einsammeln ---
        // Wir nutzen eine großzügige Hitbox, damit das auch im 3D Modus (trotz Perspektive) gut klickbar ist!
        for (let i = 0; i < entities.length; i++) {
            const ent = entities[i];
            if (ent.type === 'diamond' && ent.alive) {
                const dx = ent.x - clickX;
                const dy = ent.y - clickY;

                // Radius + 25 Pixel Toleranz
                const hitRadius = ent.size + 25;

                if (dx * dx + dy * dy < hitRadius * hitRadius) {
                    simScore += ent.points;
                    ent.alive = false;
                    staticGrid.remove(ent);

                    // --- NEU: Punkte-Partikel Perlenkette ---
                    if (typeof scoreParticles !== 'undefined') {
                        const pCount = Math.min(ent.points, 1000);

                        const targetX = 50;
                        const targetY = 30;

                        const ctrlX = ent.x + (targetX - ent.x) * 0.4;
                        const ctrlY = Math.min(ent.y, targetY) - 20;

                        // --- DYNAMISCHES DELAY ---
                        // Wir wollen, dass der letzte Punkt spätestens nach ~90 Frames (1,5 Sek) startet.
                        let delayStep = 70 / pCount;

                        // Bei extrem wenig Punkten (z.B. 2 Stück) wäre der Abstand sonst 45 Frames.
                        // Damit das nicht ruckelig wirkt, begrenzen wir den maximalen Abstand auf 15.
                        if (delayStep > 15) delayStep = 15;

                        for (let i = 0; i < pCount; i++) {
                            scoreParticles.push({
                                startX: ent.x,
                                startY: ent.y,
                                ctrlX: ctrlX,
                                ctrlY: ctrlY,
                                targetX: targetX,
                                targetY: targetY,
                                color: ent.color || '#f1c40f',

                                progress: 0,
                                speed: 0.002,
                                // Das Delay passt sich jetzt automatisch der Menge an!
                                delay: Math.floor(i * delayStep)
                            });
                        }
                    }

                    break; // Immer nur 1 Diamant pro Klick
                }
            }
        }
    }
});

function init() {
    console.log("Initializing...");

    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) {
        WORLD_WIDTH = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
        WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
    } else {
        WORLD_WIDTH = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
        WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
    }

    window.WORLD_WIDTH = WORLD_WIDTH;
    window.WORLD_HEIGHT = WORLD_HEIGHT;

    applyResolution(pixelModes[currentPixelMode].factor);

    staticGrid = new Grid(WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);
    dynamicGrid = new Grid(WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

    // Wasserstaub (Plankton) generieren (Dieser ist nur visuell und wird immer neu erstellt)
    for (let i = 0; i < PLANKTON_COUNT; i++) {
        planktons.push({
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            baseVx: (Math.random() - 0.5) * 0.2,
            baseVy: (Math.random() - 0.5) * 0.2,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.3 + 0.2,
            wobbleSpeed: Math.random() * 0.002 + 0.001,
            wobbleOffset: Math.random() * Math.PI * 2
        });
    }

    if (loadSimulationState()) {
        console.log("State loaded successfully!");
    } else {
        console.log("No valid save state found. Starting fresh.");
        startTime = Date.now();
        generateInitialWorld2(); // <-- HIER: Die 2 anhängen!
    }

    animate();
}

function generateInitialWorld2() {
    const stones = [];

    // 1. Steine generieren
    for (let i = 0; i < 1; i++) {
        const spawnX = Math.max(600, Math.random() * (WORLD_WIDTH - 600));
        const spawnY = Math.max(300, Math.random() * (WORLD_HEIGHT - 300));
        const size = 20 + Math.random() * 20;
        const stone = new StoneCell(spawnX, spawnY, size, false);
        stones.push(stone);
        entities.push(stone);
        staticGrid.add(stone);
    }

    // 2. Pflanzen generieren
    stones.forEach(targetStone => {
        for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = targetStone.size + 5 + Math.random() * 15;
            let spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, targetStone.x + Math.cos(angle) * dist));
            let spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, targetStone.y + Math.sin(angle) * dist));
            const plant = new PlantSegment(spawnX, spawnY, null, targetStone.isSuper);
            entities.push(plant);
            staticGrid.add(plant);
        }
    });

    // 3. Tiere generieren
    for (let i = 0; i < 5; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.HERB_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.HERB_SPEED_VARIANCE * 2;
        initialGenome.maxSize = window.SETTINGS.HERB_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }

    console.log("Entities created:", entities.length);
}

function generateInitialWorld() {
    const stones = [];

    // 1. Steine generieren
    for (let i = 0; i < window.SETTINGS.SPAWN_SUPER_STONES; i++) {
        const spawnX = Math.max(600, Math.random() * (WORLD_WIDTH - 600));
        const spawnY = Math.max(300, Math.random() * (WORLD_HEIGHT - 300));
        const size = 20 + Math.random() * 20;
        const stone = new StoneCell(spawnX, spawnY, size, true);
        stones.push(stone);
        entities.push(stone);
        staticGrid.add(stone);
    }

    for (let i = 0; i < window.SETTINGS.SPAWN_NORMAL_STONES; i++) {
        let spawnX, spawnY, tooClose = true, attempts = 0;
        while (tooClose && attempts < 50) {
            spawnX = Math.max(100, Math.random() * (WORLD_WIDTH - 100));
            spawnY = Math.max(100, Math.random() * (WORLD_HEIGHT - 100));
            tooClose = false;
            for (const existingStone of stones) {
                if (existingStone.isSuper) {
                    const dx = spawnX - existingStone.x, dy = spawnY - existingStone.y;
                    if (dx * dx + dy * dy < 100000) { tooClose = true; break; }
                }
            }
            attempts++;
        }
        const size = 10 + Math.random() * 20;
        const stone = new StoneCell(spawnX, spawnY, size, false);
        stones.push(stone);
        entities.push(stone);
        staticGrid.add(stone);
    }

    // 2. Pflanzen generieren
    stones.forEach(targetStone => {
        for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = targetStone.size + 5 + Math.random() * 15;
            let spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, targetStone.x + Math.cos(angle) * dist));
            let spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, targetStone.y + Math.sin(angle) * dist));
            const plant = new PlantSegment(spawnX, spawnY, null, targetStone.isSuper);
            entities.push(plant);
            staticGrid.add(plant);
        }
    });

    // 3. Tiere generieren
    for (let i = 0; i < window.SETTINGS.SPAWN_HERBIVORES; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.HERB_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.HERB_SPEED_VARIANCE * 2;
        initialGenome.maxSize = window.SETTINGS.HERB_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }
    for (let i = 0; i < 5; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.HERB_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.HERB_SPEED_VARIANCE * 2;
        initialGenome.maxSize = window.SETTINGS.HERB_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome, true);
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }
    for (let i = 0; i < window.SETTINGS.SPAWN_CARNIVORES; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.CARN_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.CARN_SPEED_VARIANCE * 2;
        initialGenome.maxSize = window.SETTINGS.CARN_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
        let carnivore = new CarnivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        carnivore.size = 3;
        entities.push(carnivore);
        addInitialTail(carnivore, entities);
    }
    for (let i = 0; i < window.SETTINGS.SPAWN_SNAKES; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.SNAKE_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.SNAKE_SPEED_VARIANCE * 2;
        initialGenome.maxSize = window.SETTINGS.SNAKE_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
        let snake = new SnakeCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        snake.size = 3;
        entities.push(snake);
        addInitialTail(snake, entities, 8);
    }
    console.log("Entities created:", entities.length);
}

function addInitialTail(animal, targetArray, length = 3) {
    for (let i = 0; i < length; i++) {
        let parentNode = (i === 0) ? animal : animal.tailSegments[i - 1];

        // NEU: offset 0, Tiefe i + 1
        let tail = new TailSegment(animal.x, animal.y, parentNode, animal.size * 0.8, 0, i + 1);

        animal.tailSegments.push(tail);
        targetArray.push(tail);
    }
}

function update() {
    dynamicGrid.clear();
    entities.forEach(e => {
        if (e.type === 'animal') {
            dynamicGrid.add(e);
        }
    });

    globalHerbivoreCount = 0;
    globalCarnivoreCount = 0;
    globalPlantCount = 0;
    globalGiantCount = 0;

    for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        if (ent.alive !== false) {
            if (ent instanceof HerbivoreCell) {
                globalHerbivoreCount++;
                if (ent.isGiant) globalGiantCount++; // --- NEU: Riesen mitzählen ---
            } else if (ent instanceof CarnivoreCell && !(ent instanceof SnakeCell)) {
                globalCarnivoreCount++;
            } else if (ent.type === 'plant') {
                globalPlantCount++;
            }
        }
    }

    const newEntities = [];
    const survivingEntities = [];

    const isStartup = (Date.now() - startTime) < window.SETTINGS.STARTUP_PHASE_DURATION;

    entities.forEach(e => {
        let isAlive = true;

        if (e.type === 'animal') {
            const status = e.update(staticGrid, dynamicGrid);

            // Update tail segments (Größe anpassen)
            if (e.tailSegments && e.tailSegments.length > 0) {
                const headSize = e.size;

                // NEU: Wir richten uns nach der maximalen Tiefe für einen sauberen Übergang
                let maxDepth = 0;
                for (let i = 0; i < e.tailSegments.length; i++) {
                    if (e.tailSegments[i].depth > maxDepth) maxDepth = e.tailSegments[i].depth;
                }
                const targetSteps = maxDepth;
                const step = (headSize - 1) / targetSteps;

                e.tailSegments.forEach((t) => {
                    t.size = Math.max(1, headSize - t.depth * step);
                    t.update();
                });
            }

            // Schwanz wachsen lassen (Hier passiert die Spaltung oder das Schlangen-Wachstum)
            if (e.type === 'animal' && e.shouldGrowTail) {
                e.shouldGrowTail = false;

                if (e instanceof SnakeCell) {
                    // --- NEU: Schlangen wachsen immer linear, aber 2 Glieder auf einmal ---
                    for (let i = 0; i < 3; i++) {
                        // Wir suchen das aktuell letzte Glied am Ende des Schwanzes
                        const lastNode = e.tailSegments.length > 0 ? e.tailSegments[e.tailSegments.length - 1] : e;
                        const nextDepth = (lastNode.depth || 0) + 1;

                        // Neue Glieder der Schlange haben immer branch = 0 (keine Gabelung)
                        const newTail = new TailSegment(e.x, e.y, lastNode, e.size * 0.8, 0, nextDepth);
                        e.tailSegments.push(newTail);
                        newEntities.push(newTail);
                    }
                }
                else if (e instanceof CarnivoreCell && !(e instanceof SnakeCell) && e.tailSegments.length >= 3) {
                    // ROTER JÄGER (keine Schlange): Gabelung/Splitting ab dem 3. Glied
                    const len = e.tailSegments.length;
                    const parentL = len === 3 ? e.tailSegments[2] : e.tailSegments[len - 2];
                    const parentR = len === 3 ? e.tailSegments[2] : e.tailSegments[len - 1];
                    const nextDepth = parentL.depth + 1;

                    const newTailL = new TailSegment(e.x, e.y, parentL, e.size * 0.8, -1, nextDepth);
                    const newTailR = new TailSegment(e.x, e.y, parentR, e.size * 0.8, 1, nextDepth);

                    e.tailSegments.push(newTailL, newTailR);
                    newEntities.push(newTailL, newTailR);
                }
                else {
                    // PFLANZENFRESSER oder Basis-Stück des Schwanzes: 1 Glied linear
                    const lastNode = e.tailSegments.length > 0 ? e.tailSegments[e.tailSegments.length - 1] : e;
                    const nextDepth = (lastNode.depth || 0) + 1;

                    const newTail = new TailSegment(e.x, e.y, lastNode, e.size * 0.8, 0, nextDepth);
                    e.tailSegments.push(newTail);
                    newEntities.push(newTail);
                }
            }

            // Reproduktion
            if (status === 'reproduce') {
                let numChildren;

                if (e instanceof HerbivoreCell) {
                    const herbivoreCount = globalHerbivoreCount;

                    if (herbivoreCount >= window.SETTINGS.MAX_HERBIVORE_FOR_BIRTH) {
                        numChildren = 0;
                    } else {
                        numChildren = 1;
                    }
                } else if (e instanceof SnakeCell) {
                    numChildren = window.SETTINGS.SNAKE_LITTER_SIZE;
                } else {
                    const carnivoreCount = globalCarnivoreCount;

                    if (carnivoreCount >= window.SETTINGS.MAX_CARNIVORES_FOR_BIRTH) {
                        numChildren = 0;
                    } else {
                        numChildren = 1;
                    }
                }

                if (numChildren > 0) {
                    for (let i = 0; i < numChildren; i++) {
                        const newGenome = new Genome(e.genome);
                        newGenome.mutate();

                        const offsetX = (Math.random() - 0.5) * 30;
                        const offsetY = (Math.random() - 0.5) * 30;

                        const childX = Math.max(0, Math.min(WORLD_WIDTH, e.x + offsetX));
                        const childY = Math.max(0, Math.min(WORLD_HEIGHT, e.y + offsetY));

                        // Das Kind erschaffen (mit seiner vorläufigen Zufallsfarbe)
                        let child;

                        if (e instanceof HerbivoreCell) {
                            child = new HerbivoreCell(childX, childY, newGenome, false);
                        } else if (e instanceof SnakeCell) {
                            child = new SnakeCell(childX, childY, newGenome);
                        } else {
                            child = new CarnivoreCell(childX, childY, newGenome);
                        }

                        if (child.isGiant) {
                            // 1. Kind ist ein Riese: Es MUSS sein Gold aus dem Konstruktor behalten!
                            // (Wir überschreiben hier absichtlich nichts)
                        } else if (e.isGiant) {
                            // 2. Elternteil war Riese, aber Kind ist normal:
                            // Es bekommt nicht das Gold der Eltern, sondern behält sein frisches Standard-Grün.
                        } else {
                            // 3. Normaler Familien-Stammbaum: Exakte Farbe wird an das Kind weitergegeben.
                            child.color = e.color;
                            child.dotColor = e.dotColor;
                        }

                        addInitialTail(child, newEntities, child.startTailLength);

                        child.energy = Math.min(e.energy, child.getMaxEnergy() - 1);
                        newEntities.push(child);
                    }
                }
            }

            // Animal collision & Eat check
            // Suchradius erhöht (+ 50), damit auch sehr große Steine frühzeitig erkannt werden
            const nearbyDynamic = dynamicGrid.getEntitiesInArea(e.x, e.y, e.size * 2 + 20);

            for (const other of nearbyDynamic) {
                if (other === e || !other.alive) continue;

                // --- NEU: Schwanz-Erkennung ---
                let rootAnimal = null;
                if (other.type === 'tail') {
                    // Pflanzenfresser ignorieren Schwänze wie bisher. Nur Räuber schnappen zu!
                    if (!(e instanceof CarnivoreCell)) continue;

                    // Wem gehört dieser Schwanz? Wir klettern den Baum hoch bis zum Kopf.
                    rootAnimal = other.parent;
                    while (rootAnimal && rootAnimal.type === 'tail') {
                        rootAnimal = rootAnimal.parent;
                    }

                    // Ganz wichtig: Ein Räuber darf sich nicht selbst in den Schwanz beißen!
                    if (rootAnimal === e) continue;
                }


                const dx = other.x - e.x;
                const dy = other.y - e.y;
                const distSq = dx * dx + dy * dy; // Keine Wurzel!
                const minDist = e.size + (other.size || 2);

                // Wir vergleichen die quadrierten Werte
                if (distSq < minDist * minDist && distSq > 0) {
                    // ERST JETZT, bei einer echten Kollision, ziehen wir die Wurzel für die Physik
                    const dist = Math.sqrt(distSq);
                    let eaten = false;

                    // NEU: Die Abfrage "e.energy < e.getMaxEnergy()" ist weg. Sie fressen jetzt immer!
                    if (status !== 'reproduce' && status !== 'stationary') {

                        // Herbivore eats Plant
                        if (e instanceof HerbivoreCell && other.type === 'plant') {
                            if (e.target === other) {
                                // NEU: Pflanzen werden IMMER stückchenweise abgeknabbert, egal wie groß der Fresser ist.
                                // 0.05 pro Frame bedeutet: Bei 60 FPS dauert es über 3 Sekunden,
                                // um eine normalgroße Pflanze (Größe 10) komplett zu fressen.
                                const biteAmount = Math.min((e.size * 0.02), other.size);

                                other.size -= biteAmount; // Pflanze wird langsam kleiner
                                e.energy += biteAmount; // Energie wird langsam hochgezählt

                                if (Math.random() < 0.2) {
                                    createParticles(other.x, other.y, other.color, 1);
                                }

                                // Energie am Maximum kappen
                                e.energy = Math.min(e.getMaxEnergy(), e.energy);

                                // Sehr sanftes, stetiges Wachstum beim Grasen
                                if (e.size < e.maxSize) e.size += 0.002;

                                // Pflanze stirbt erst, wenn nur noch ein winziger Rest übrig ist
                                if (other.size < 0.5) {
                                    other.alive = false;
                                    staticGrid.remove(other);
                                }
                                eaten = true;
                            }
                        }
                        // --- NEU: Carnivore beißt in einen Schwanz ---
                        else if (e instanceof CarnivoreCell && other.type === 'tail' && rootAnimal && e.size >= rootAnimal.size) {
                            if (e.target === other) {
                                // Auch die Bremswirkung ist sanfter, sonst gefriert die Beute sofort ein
                                rootAnimal.speedMultiplier = Math.max(0.02, rootAnimal.speedMultiplier - 0.02);
                            }
                        }
                        // Carnivore eats Herbivore
                        else if (e instanceof CarnivoreCell && other instanceof HerbivoreCell) {
                            if (e.target === other) {
                                other.energy -= e.size * 0.2;
                                other.speedMultiplier = Math.max(0.02, other.speedMultiplier - 0.15);

                                // --- NEU: Dynamische Krümelgröße beim Knabbern ---
                                if (Math.random() < 0.4) {
                                    // Anzahl: Je größer das Opfer, desto mehr Krümel. (Mindestens 1)
                                    const pCount = Math.max(1, Math.floor(other.size * 0.3));

                                    // Größe: Je dicker das Opfer, desto größer die Brocken.
                                    const pSize = Math.max(2, other.size * 0.3);

                                    createParticles(other.x, other.y, other.color, pCount, pSize);
                                }

                                e.energy += 0.01;
                                e.stuckTimer = 0; // STUCK-FIX: Wenn er frisst, steckt er nicht fest
                                e.accumulatedDist = 0;

                                if (other.energy <= 0) {
                                    other.isEaten = true;
                                    other.alive = false;
                                    other.graceTimer = 60;
                                    if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);

                                    // --- NEU: Energiegewinn basiert rein auf der Beutegröße ---
                                    // 10 Energiepunkte pro Größen-Einheit. Ein ausgewachsenes Tier (Größe 10)
                                    // füllt den Jäger (+100) komplett auf. Ein Baby (Größe 2) gibt nur +20.
                                    const energyGain = other.size * 2;
                                    e.energy = Math.min(e.getMaxEnergy(), e.energy + energyGain);

                                    if (e.size < e.maxSize) e.size += 0.15;

                                    const finalPuffCount = Math.floor(other.size * 2);
                                    const finalPuffSize = other.size * 0.4;
                                    createParticles(other.x, other.y, other.color, finalPuffCount, finalPuffSize);
                                }
                                eaten = true;
                            }
                        }
                        // Carnivore isst Carnivore (Kannibalismus)
                        else if (e instanceof CarnivoreCell && other instanceof CarnivoreCell) {
                            if (e.target === other) {

                                // Starker, fairer Schaden
                                other.energy -= 1;
                                other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                                // Notwehr (Berserker-Modus)
                                other.target = e;
                                other.threat = null;
                                other.currentFleeTarget = null;
                                other.berserkTimer = 60;
                                other.angle = Math.atan2(e.y - other.y, e.x - other.x);

                                if (Math.random() < 0.4) {
                                    const pCount = Math.max(1, Math.floor(other.size * 0.3));
                                    const pSize = Math.max(2, other.size * 0.3);
                                    createParticles(other.x, other.y, other.color, pCount, pSize);
                                }

                                e.stuckTimer = 0;
                                e.accumulatedDist = 0;

                                // --- HIER IST DER FIX: e.energy > 0 wurde entfernt! ---
                                if (other.energy <= 0) {
                                    other.isEaten = true;
                                    other.alive = false;
                                    if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);

                                    // Der Sieger heilt sich nur, wenn er den K.O.-Schlag überlebt hat
                                    if (e.energy > 0) {
                                        const energyGain = other.size;
                                        e.energy = Math.min(e.getMaxEnergy(), e.energy + energyGain);
                                        if (e.size < e.maxSize) e.size += 0.15;
                                    }

                                    const finalPuffCount = Math.floor(other.size * 2);
                                    const finalPuffSize = other.size * 0.4;
                                    createParticles(other.x, other.y, other.color, finalPuffCount, finalPuffSize);
                                }
                                eaten = true;
                            }
                        }
                    }

                    // NEUE KOLLISIONS-LOGIK MIT GESTRÜPP-WIDERSTAND
                    if (!eaten && other.type !== 'tail') {
                        const angle = Math.atan2(dy, dx);
                        const overlap = minDist - dist;

                        let moveE = 0;
                        let moveOther = 0;

                        if (other.type === 'stone') {
                            // Steine sind massiv: Das Tier (e) nimmt den vollen Rückstoß
                            moveE = overlap;
                        } else if (other.type === 'plant') {
                            if (e instanceof CarnivoreCell) {
                                // Fleischfresser: Schieben Pflanzen weg, werden dabei gebremst
                                moveOther = overlap * 0.5;
                                moveE = overlap * 0.5;
                            } else {
                                // Pflanzenfresser: Die Pflanze ist eine unbewegliche Wand
                                moveE = overlap*0.95;      // Tier weicht voll aus
                                moveOther = overlap * 0.05;        // Pflanze bewegt sich nicht

                                if (e.reproductionCount < e.maxReproductions && (!e.target || e.target.type !== 'plant')) {
                                    e.target = other;
                                }
                            }

                            // --- NEU: PFLANZE AUFWECKEN ---
                            // Wenn sie von einem Tier angerempelt wird, wacht sie für 10 Frames auf,
                            // um sich wieder sauber von ihren Nachbar-Pflanzen wegzudrücken!
                            other.settleTimer = 10;

                        } else {
                            // Zwei Tiere prallen aufeinander: Größeres Tier bewegt sich weniger
                            const totalSize = e.size + other.size;
                            moveE = overlap * (other.size / totalSize);
                            moveOther = overlap * (e.size / totalSize);
                        }

                        // Position des aktuellen Tiers anpassen
                        e.x -= Math.cos(angle) * moveE;
                        e.y -= Math.sin(angle) * moveE;

                        // Position des anderen Objekts anpassen
                        if (other.type !== 'stone') {
                            other.x += Math.cos(angle) * moveOther;
                            other.y += Math.sin(angle) * moveOther;
                        }
                    }
                }
            }

            const nearbyStatic = staticGrid.getEntitiesInArea(e.x, e.y, e.size * 2 + 20);

            for (const other of nearbyStatic) {
                if (other === e || !other.alive) continue;

                const dx = other.x - e.x;
                const dy = other.y - e.y;
                const distSq = dx * dx + dy * dy; // Keine Wurzel!
                const minDist = e.size + (other.size || 2);

                // Wir vergleichen die quadrierten Werte
                if (distSq < minDist * minDist && distSq > 0) {
                    // ERST JETZT, bei einer echten Kollision, ziehen wir die Wurzel für die Physik
                    const dist = Math.sqrt(distSq);
                    let eaten = false;

                    // --- HIER MUSS DER FRESS-CODE FÜR PFLANZEN HIN! ---
                    if (status !== 'reproduce' && status !== 'stationary') {
                        if (e instanceof HerbivoreCell && other.type === 'plant') {
                            if (e.target === other) {
                                const biteAmount = Math.min((e.size * 0.02), other.size);
                                other.size -= biteAmount;
                                e.energy += biteAmount;

                                if (Math.random() < 0.2) {
                                    createParticles(other.x, other.y, other.color, 1);
                                }

                                e.energy = Math.min(e.getMaxEnergy(), e.energy);
                                if (e.size < e.maxSize) e.size += 0.002;

                                if (other.size < 0.5) {
                                    other.alive = false;
                                    // GANZ WICHTIG: Die gefressene Pflanze aus dem Static Grid löschen!
                                    staticGrid.remove(other);
                                }
                                eaten = true;
                            }
                        }
                    }

                    // NEUE KOLLISIONS-LOGIK MIT GESTRÜPP-WIDERSTAND
                    if (!eaten && other.type !== 'tail') {
                        const angle = Math.atan2(dy, dx);
                        const overlap = minDist - dist;

                        let moveE = 0;
                        let moveOther = 0;

                        if (other.type === 'stone') {
                            // Steine sind massiv: Das Tier (e) nimmt den vollen Rückstoß
                            moveE = overlap;
                        } else if (other.type === 'plant' || other.type === 'diamond') {
                            if (e instanceof CarnivoreCell) {
                                // Fleischfresser: Schieben Pflanzen weg, werden dabei gebremst
                                moveOther = overlap * 0.5;
                                moveE = overlap * 0.5;
                            } else {
                                // Pflanzenfresser: Die Pflanze ist eine unbewegliche Wand
                                moveE = overlap*0.95;      // Tier weicht voll aus
                                moveOther = overlap * 0.05;        // Pflanze bewegt sich nicht

                                if (e.reproductionCount < e.maxReproductions && (!e.target || e.target.type !== 'plant')) {
                                    e.target = other;
                                }
                            }

                            // --- NEU: PFLANZE AUFWECKEN ---
                            // Wenn sie von einem Tier angerempelt wird, wacht sie für 10 Frames auf,
                            // um sich wieder sauber von ihren Nachbar-Pflanzen wegzudrücken!
                            other.settleTimer = 10;

                        } else {
                            // Zwei Tiere prallen aufeinander: Größeres Tier bewegt sich weniger
                            const totalSize = e.size + other.size;
                            moveE = overlap * (other.size / totalSize);
                            moveOther = overlap * (e.size / totalSize);
                        }

                        // Position des aktuellen Tiers anpassen
                        e.x -= Math.cos(angle) * moveE;
                        e.y -= Math.sin(angle) * moveE;

                        // Position des anderen Objekts anpassen
                        if (other.type !== 'stone') {
                            staticGrid.remove(other); // <--- HIER EINFÜGEN!
                            other.x += Math.cos(angle) * moveOther;
                            other.y += Math.sin(angle) * moveOther;
                            staticGrid.add(other);    // <--- HIER EINFÜGEN!
                        }
                    }
                }
            }


            // Energy consumption & instant death
            if (e.energy <= 0 || e.isEaten) {

                /// 1. Der Kopf zerfällt in Partikel
                const headPuffCount = Math.floor(e.size * 4);
                const headPuffSize = e.size * 0.5;
                createParticles(e.x, e.y, e.color, headPuffCount, headPuffSize);

                // 2. NEU: Jedes einzelne Schwanzglied zerfällt ebenfalls an seiner eigenen Position
                if (e.tailSegments) {
                    e.tailSegments.forEach(t => {
                        // Ein paar Partikel pro Glied, passend zu dessen Größe
                        const tailPuffCount = Math.max(1, Math.floor(t.size * 3));
                        const tailPuffSize = t.size * 0.5;

                        // Wolke spawnen
                        createParticles(t.x, t.y, e.color, tailPuffCount, tailPuffSize);

                        // Schwanzglied direkt auf "tot" setzen
                        t.alive = false;
                    });
                }

                // --- NEU: Diamant droppen, wenn es ein friedlicher Tod im Alter war ---
                if (!window.isDemoMode && !e.isEaten && e.reproductionCount >= e.maxReproductions) {
                    let dPoints, dColor,  dSize = 15; // Basis: Herbivore

                    dColor = e.color;

                    if (e instanceof SnakeCell) {
                        dPoints = window.SETTINGS.SCORE_SNAKE_BIRTH;
                    } else if (e instanceof CarnivoreCell) {
                        dPoints = window.SETTINGS.SCORE_CARNIVORE_BIRTH;
                    } else {
                        dPoints = window.SETTINGS.SCORE_HERBIVORE_BIRTH;
                    }

                    const diamond = new DiamondCell(e.x, e.y, dSize, dPoints, dColor);
                    newEntities.push(diamond);
                    staticGrid.add(diamond);
                }


                // 3. Super-Pflanzen spawnen (aus den Nährstoffen des Kopfes)
               /* if (!e.isEaten && e.reproductionCount < e.maxReproductions) { // && Math.random() > 0.7

                    // NEU: Farbe des Tiers auslesen (z.B. aus "rgb(200, 100, 50)" die Zahlen holen)
                    const rgbMatch = e.color.match(/\d+/g);
                    let animalBaseColor = null;

                    if (rgbMatch && rgbMatch.length >= 3) {
                        animalBaseColor = {
                            r: parseInt(rgbMatch[0]),
                            g: parseInt(rgbMatch[1]),
                            b: parseInt(rgbMatch[2])
                        };
                    }

                    const superPlant = new PlantSegment(e.x, e.y, null, true, animalBaseColor);
                    superPlant.isTip = true;
                    newEntities.push(superPlant);
                    staticGrid.add(superPlant);
                }*/

                isAlive = false;
                e.alive = false;
                if (e.tailSegments) e.tailSegments.forEach(t => t.alive = false);
            }
        }

        if (e.type === 'plant') {
            e.update(isStartup);

            // --- OPTIMIERUNG: Spatial Sleep (Schlafende Pflanzen) ---
            if (e.settleTimer === undefined) e.settleTimer = 30;

            // --- NEU: Wachstums-Wache ---
            // Solange die Pflanze noch nicht ihre volle Größe erreicht hat,
            // halten wir sie gewaltsam wach, damit sie beim Wachsen ihre Nachbarn wegschiebt!
            if (e.size < e.maxSize - 0.1) {
                e.settleTimer = Math.max(e.settleTimer, 5);
            }

            if (e.settleTimer > 0) {
                e.settleTimer--; // Timer läuft ab

                const neighbors = staticGrid.getEntitiesInArea(e.x, e.y, e.size * 2 + 50);
                for (const other of neighbors) {
                    if (other !== e && (other.type === 'plant' || other.type === 'stone')) {
                        const dx = e.x - other.x;
                        const dy = e.y - other.y;

                        // OPTIMIERUNG: distSq (ohne Wurzel) für den ersten Check!
                        const distSq = dx * dx + dy * dy;
                        const minDist = e.size + other.size;

                        if (distSq < minDist * minDist && distSq > 0) {
                            // Erst wenn sie sich WIRKLICH berühren, ziehen wir die Wurzel
                            const dist = Math.sqrt(distSq);
                            const angle = Math.atan2(dy, dx);
                            const overlap = minDist - dist;

                            if (other.type === 'stone') {
                                staticGrid.remove(e); // <--- NEU
                                e.x += Math.cos(angle) * overlap;
                                e.y += Math.sin(angle) * overlap;
                                staticGrid.add(e);    // <--- NEU
                            } else {
                                staticGrid.remove(e);     // <--- NEU
                                staticGrid.remove(other); // <--- NEU

                                e.x += Math.cos(angle) * (overlap / 2);
                                e.y += Math.sin(angle) * (overlap / 2);
                                other.x -= Math.cos(angle) * (overlap / 2);
                                other.y -= Math.sin(angle) * (overlap / 2);

                                staticGrid.add(e);     // <--- NEU
                                staticGrid.add(other); // <--- NEU

                                other.settleTimer = 10;
                            }

                            if (overlap > 0.5) {
                                e.settleTimer = Math.max(e.settleTimer, 5);
                            }
                        }
                    }
                }
            }

            if (e.shouldGrow) {
                e.shouldGrow = false;

                let angle;
                if (e.parent) {
                    const angleFromParent = Math.atan2(e.y - e.parent.y, e.x - e.parent.x);
                    angle = angleFromParent + (Math.random() - 0.5) * (Math.PI / 2);
                } else {
                    angle = Math.random() * Math.PI * 2;
                }

                const dist = e.maxSize;

                let spawnX = e.x + Math.cos(angle) * dist;
                let spawnY = e.y + Math.sin(angle) * dist;

                // Abprall-Logik am Spielfeldrand
                let bounced = false;
                if (spawnX < 50 || spawnX > WORLD_WIDTH - 50) {
                    angle = Math.PI - angle;
                    bounced = true;
                }
                if (spawnY < 50 || spawnY > WORLD_HEIGHT - 50) {
                    angle = -angle;
                    bounced = true;
                }

                if (bounced) {
                    spawnX = e.x + Math.cos(angle) * dist;
                    spawnY = e.y + Math.sin(angle) * dist;
                }

                spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
                spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

                // --- KORREKTUR: Wachstums-Check (Dichte-Regel) ---
                const nearby = staticGrid.getEntitiesInArea(spawnX, spawnY, 25);

                // Wir zählen NUR die Pflanzen, die exakt im 25er Radius sind
                let plantNeighborsCount = 0;
                for (let i = 0; i < nearby.length; i++) {
                    const n = nearby[i];
                    if (n.type === 'plant' && n.alive !== false) {
                        const dx = n.x - spawnX;
                        const dy = n.y - spawnY;
                        // 25 * 25 = 625 , 30x30=900 (Superschneller Check ohne Wurzel)
                        if (dx * dx + dy * dy <= 900) {
                            plantNeighborsCount++;
                        }
                    }
                }

                const currentGen = e.generation || 0;

                // Wachstum nur, wenn wirklich Platz ist UND das globale Limit nicht erreicht ist
                if (plantNeighborsCount <= 2 && globalPlantCount < window.SETTINGS.PLANTS_MAX_COUNT && currentGen < 20) {
                    e.isTip = false;
                    const child = new PlantSegment(spawnX, spawnY, e, e.isSuper, e.baseColor);
                    child.generation = currentGen + 1;
                    newEntities.push(child);
                    staticGrid.add(child);
                    globalPlantCount++; // Sofort mitzählen!
                }
            }

            e.x = Math.max(1, Math.min(WORLD_WIDTH - 1, e.x));
            e.y = Math.max(1, Math.min(WORLD_HEIGHT - 1, e.y));
        }

        // Stein-Spawning und Kontrolle
        if (e.type === 'stone') {
            const checkRadius = e.size + 30;
            const nearby = staticGrid.getEntitiesInArea(e.x, e.y, checkRadius);

            // --- KORREKTUR: Strikte Distanzprüfung ---
            let nearbyPlantsCount = 0;
            const checkRadiusSq = checkRadius * checkRadius;

            for (let i = 0; i < nearby.length; i++) {
                const n = nearby[i];
                if (n.type === 'plant' && n.alive !== false) {
                    const dx = n.x - e.x;
                    const dy = n.y - e.y;
                    if (dx * dx + dy * dy <= checkRadiusSq) {
                        nearbyPlantsCount++;
                    }
                }
            }

            let shouldSpawn = false;

            // --- STRENGERE GRENZEN FÜR DIE EXAKTE ZÄHLUNG ---
            if (nearbyPlantsCount <= 1) { // Notfall-Spawn nur, wenn fast gar nichts mehr da ist
                shouldSpawn = true;
            } else if (isStartup) {
                if (e.isSuper && nearbyPlantsCount < 5 && Math.random() < 0.5) shouldSpawn = true;
                if (!e.isSuper && nearbyPlantsCount < 3 && Math.random() < 0.2) shouldSpawn = true;
            } else {
                if (e.isSuper) {
                    if (nearbyPlantsCount < 7 && Math.random() < 0.15) shouldSpawn = true;
                } else {
                    if (nearbyPlantsCount < 4 && Math.random() < 0.15) shouldSpawn = true;
                }
            }

            // Die eigentliche Pflanze spawnen
            if (shouldSpawn) {
                const angle = Math.random() * Math.PI * 2;
                const dist = e.size + 5;

                let spawnX = e.x + Math.cos(angle) * dist;
                let spawnY = e.y + Math.sin(angle) * dist;

                spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
                spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

                const newPlant = new PlantSegment(spawnX, spawnY, null, e.isSuper);
                newEntities.push(newPlant);
                staticGrid.add(newPlant);
            }
        }

        if (e.type === 'diamond') {
            e.update();
            if (!e.alive) {
                // Wenn er abgelaufen ist, lautlos aus dem Grid entfernen
                staticGrid.remove(e);
            }
        }

        // --- NEUE RAND-LOGIK ---
        // Puffer ist die Größe des Objekts, damit es immer komplett im Bild bleibt.
        // Bei Pflanzen/Steinen nehmen wir e.size, falls definiert, sonst einen Standardwert.
        const margin = e.size || 5;

        if (e.x < margin) {
            e.x = margin;
            if (e.type === 'animal') { e.angle = Math.PI - e.angle; e.target = null; e.ignoreTargetTimer = 20; }
        }
        if (e.x > WORLD_WIDTH - margin) {
            e.x = WORLD_WIDTH - margin;
            if (e.type === 'animal') { e.angle = Math.PI - e.angle; e.target = null; e.ignoreTargetTimer = 20; }
        }
        if (e.y < margin) {
            e.y = margin;
            if (e.type === 'animal') { e.angle = -e.angle; e.target = null; e.ignoreTargetTimer = 20; }
        }
        if (e.y > WORLD_HEIGHT - margin) {
            e.y = WORLD_HEIGHT - margin;
            if (e.type === 'animal') { e.angle = -e.angle; e.target = null; e.ignoreTargetTimer = 20; }
        }

        if (isAlive && e.alive !== false) survivingEntities.push(e);
    });

    // --- PERFORMANCE FIX: Kein Array-Spamming mehr ---
    // Wir leeren das entities-Array nicht, sondern überschreiben es in-place
    let nextIndex = 0;

    // 1. Überlebende übernehmen
    for (let i = 0; i < survivingEntities.length; i++) {
        if (survivingEntities[i].alive !== false) {
            entities[nextIndex++] = survivingEntities[i];
        }
    }

    // 2. Neugeborene hinzufügen
    for (let i = 0; i < newEntities.length; i++) {
        entities[nextIndex++] = newEntities[i];
    }

    // 3. Array auf die tatsächliche Länge abschneiden
    entities.length = nextIndex;

    // Krümel bewegen und verblassen lassen
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        // Wasserwiderstand: Die Partikel werden schnell langsamer
        p.vx *= 0.85;
        p.vy *= 0.85;

        // Wenn sie unsichtbar sind, löschen wir sie aus dem Array
        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }

    // --- NEU: Score-Partikel auf Bezier-Kurve updaten ---
    if (typeof scoreParticles !== 'undefined') {
        for (let i = scoreParticles.length - 1; i >= 0; i--) {
            let sp = scoreParticles[i];

            if (sp.delay > 0) {
                // Das Partikel wartet noch auf seinen Start (es sitzt leuchtend auf der Ursprungsposition)
                sp.delay--;
                sp.x = sp.startX;
                sp.y = sp.startY;
            } else {
                // --- NEU: BESCHLEUNIGUNG (Ease-In) ---
                sp.speed *= 1.08; // Wird JEDEN Frame 8% schneller!
                sp.progress += sp.speed;

                if (sp.progress >= 1.0) {
                    // Am Ziel angekommen
                    scoreParticles.splice(i, 1);
                    continue;
                }

                // Hochperformante Bezier-Mathematik (Bleibt exakt gleich!)
                const t = sp.progress;
                const invT = 1 - t;

                sp.x = invT * invT * sp.startX + 2 * invT * t * sp.ctrlX + t * t * sp.targetX;
                sp.y = invT * invT * sp.startY + 2 * invT * t * sp.ctrlY + t * t * sp.targetY;
            }
        }
    }
}

// requestAnimationFrame übergibt automatisch einen hochpräzisen Zeitstempel (timestamp)
function animate(timestamp) {
    // 1. Stoppuhr starten (Millisekunden für die Berechnung messen)
    const t0 = performance.now();

    update();

    // ENTSCHEIDUNG: Welche Engine malt?
    if (window.is3DMode) {
        if (typeof draw3D === 'function') draw3D();
    } else {
        if (typeof draw2D === 'function') draw2D();
    }

    // Stoppuhr stoppen und Zeitdifferenz speichern
    const t1 = performance.now();
    const frameTime = t1 - t0;

    // --- NEU: Weiche Glättung der Berechnungszeit ---
    if (currentProcessTime === 0) {
        currentProcessTime = frameTime; // Beim ersten Frame direkt setzen
    } else {
        // 98% alter Wert + 2% neuer Wert (Extrem weiche Glättung)
        currentProcessTime = currentProcessTime * 0.98 + frameTime * 0.02;
    }

    // 2. FPS berechnen
    // Wir aktualisieren die Anzeige nur alle 500ms, damit die Zahlen nicht wild flackern
    if (!lastFpsUpdate) lastFpsUpdate = timestamp;
    frameCount++;

    if (timestamp - lastFpsUpdate >= 500) {
        // Wie viele Frames gab es in der vergangenen halben Sekunde? -> Auf 1 Sekunde hochrechnen
        currentFps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
        lastFpsUpdate = timestamp;
        frameCount = 0;
    }

    requestAnimationFrame(animate);
}

window.addEventListener('load', init);

// ==========================================
// PERSISTENZ (SPEICHERN & LADEN)
// ==========================================

let isResetting = false; // <--- NEU: Schalter, um das Speichern beim Neustart zu blockieren

function saveSimulationState() {
    const state = {
        runTime: Date.now() - startTime,
        score: simScore, // <--- NEU: Punktestand ins Savegame packen
        entities: []
    };

    // 1. Temporäre IDs für alle vergeben (damit wir Verknüpfungen wiederherstellen können)
    entities.forEach((e, i) => e._saveId = i);

    // 2. Objekte in reines JSON übersetzen
    state.entities = entities.map(e => {
        let data = {
            id: e._saveId,
            className: e.constructor.name,
            x: e.x, y: e.y, size: e.size, alive: e.alive,
            color: e.color
        };

        if (e instanceof StoneCell) {
            data.isSuper = e.isSuper;
        } else if (e instanceof PlantSegment) {
            data.isSuper = e.isSuper;
            data.baseColor = e.baseColor;
            data.age = e.age;
            data.isTip = e.isTip;
            data.generation = e.generation || 0; // <--- NEU
            data.parentId = e.parent ? e.parent._saveId : null;
        } else if (e.type === 'diamond') {
            data.points = e.points;
            data.life = e.life;
            data.maxLife = e.maxLife;
            data.angle = e.angle;
        } else if (e.type === 'tail') {
            data.branch = e.branch;
            data.depth = e.depth;
            data.spineX = e.spineX;
            data.spineY = e.spineY;
            data.dotColor = e.dotColor;
            data.parentId = e.parent ? e.parent._saveId : null;
        } else if (e instanceof AnimalCell) {
            data.genome = { ...e.genome };
            data.angle = e.angle;
            data.energy = e.energy;
            data.age = e.age;
            data.reproductionCount = e.reproductionCount;
            data.speedMultiplier = e.speedMultiplier;
            data.agingFactor = e.agingFactor;
            data.dotColor = e.dotColor;
            data.isGiant = e.isGiant || false;
            // Ziele/Wegpunkte absichtlich NICHT speichern, damit sie nicht verbuggen
            data.tailSegmentIds = e.tailSegments.map(t => t._saveId);
        }
        return data;
    });

    try {
        localStorage.setItem('evoSimState', JSON.stringify(state));
        // NEU: Punkte in einen separaten Tresor legen
        localStorage.setItem('evoSimScore', simScore);
    } catch(err) {
        console.warn("Konnte nicht speichern (LocalStorage voll?)", err);
    }
}

function loadSimulationState() {
    const raw = localStorage.getItem('evoSimState');
    if (!raw) return false;

    let state;
    try { state = JSON.parse(raw); } catch(e) { return false; }
    if (!state || !state.entities || state.entities.length === 0) return false;

    // Simulationstimer wiederherstellen (damit die Start-Wachstumsphase nicht neu triggert)
    startTime = Date.now() - state.runTime;
    simScore = parseInt(localStorage.getItem('evoSimScore')) || 1000;

    entities = [];
    const idMap = new Map();

    // Durchlauf 1: Alle Instanzen als korrekte Klassen wiedererschaffen
    state.entities.forEach(data => {
        let e;
        if (data.className === 'StoneCell') {
            e = new StoneCell(data.x, data.y, data.size, data.isSuper);
            e.color = data.color; // Konstruktor-Farbe überschreiben
        } else if (data.className === 'PlantSegment') {
            e = new PlantSegment(data.x, data.y, null, data.isSuper, data.baseColor);
            e.size = data.size; e.age = data.age; e.isTip = data.isTip; e.color = data.color;
            e.generation = data.generation || 0;
        } else if (data.className === 'TailSegment') {
            e = new TailSegment(data.x, data.y, null, data.size, data.branch, data.depth);
            e.spineX = data.spineX; e.spineY = data.spineY; e.color = data.color; e.dotColor = data.dotColor;
        } else if (data.className === 'DiamondCell') {
            e = new DiamondCell(data.x, data.y, data.size, data.points, data.color);
            e.life = data.life;
            e.maxLife = data.maxLife;
            e.angle = data.angle;
        } else if (['HerbivoreCell', 'CarnivoreCell', 'SnakeCell'].includes(data.className)) {
            let gen = new Genome(data.genome);
            if (data.className === 'HerbivoreCell') e = new HerbivoreCell(data.x, data.y, gen, false);
            if (data.className === 'CarnivoreCell') e = new CarnivoreCell(data.x, data.y, gen);
            if (data.className === 'SnakeCell') e = new SnakeCell(data.x, data.y, gen);

            e.size = data.size; e.angle = data.angle; e.energy = data.energy; e.age = data.age;
            e.reproductionCount = data.reproductionCount; e.speedMultiplier = data.speedMultiplier;
            e.agingFactor = data.agingFactor; e.color = data.color; e.dotColor = data.dotColor;

            if (data.isGiant) {
                e.isGiant = true;
                e.maxReproductions = Infinity;
            }
            e.tailSegments = []; // Wird im 2. Durchlauf gefüllt
            e._tailIds = data.tailSegmentIds;
        }

        if (e) {
            e._loadParentId = data.parentId;
            e.alive = data.alive;
            idMap.set(data.id, e);
            entities.push(e);

            // Steine und Pflanzen direkt wieder ins statische Grid packen
            if (e.type === 'stone' || e.type === 'plant') {
                staticGrid.add(e);
            }
        }
    });

    // Durchlauf 2: Alle Referenzen (Elternteile & Schwänze) wieder verknüpfen
    entities.forEach(e => {
        if (e.type === 'plant' || e.type === 'tail') {
            if (e._loadParentId !== undefined && e._loadParentId !== null) {
                e.parent = idMap.get(e._loadParentId) || null;
            }
        }
        if (e.type === 'animal' && e._tailIds) {
            e.tailSegments = e._tailIds.map(id => idMap.get(id)).filter(Boolean);
            delete e._tailIds;
        }
        delete e._loadParentId;
    });

    return true;
}

// Auto-Save alle 10 Sekunden (geändert)
setInterval(() => {
    if (!isResetting && !window.isDemoMode && entities.length > 0) saveSimulationState();
}, 10000);

// Save beim Schließen / Aktualisieren des Tabs (geändert)
window.addEventListener('beforeunload', () => {
    if (!isResetting && !window.isDemoMode && entities.length > 0) saveSimulationState();
});

// Neustart-Button Logik (geändert)
const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        // NEU: Im Demo-Modus das Löschen des Spielstands blockieren
        if (window.isDemoMode) {
            alert("Im Demo-Modus kann nicht neu gestartet werden. Bitte beende den Demo-Modus zuerst.");
            return;
        }

        if(confirm("Simulation wird neu gestartet. Der Punktestand wird übernommen...")) {
            isResetting = true;
            localStorage.removeItem('evoSimState');
            if (simScore < 1000) {
                localStorage.setItem('evoSimScore', 1000);
            }
            location.reload();
        }
    });
}

// --- Impressum Logik ---
const impressumBtn = document.getElementById('impressum-btn');
const impressumModal = document.getElementById('impressum-modal');
const closeBtn = document.getElementById('close-btn');

impressumBtn.addEventListener('click', () => {
    impressumModal.classList.remove('hidden');
});

closeBtn.addEventListener('click', () => {
    impressumModal.classList.add('hidden');
});

// Schließt das Modal, wenn man daneben in den dunklen Bereich klickt
window.addEventListener('click', (e) => {
    if (e.target === impressumModal) {
        impressumModal.classList.add('hidden');
    }
});