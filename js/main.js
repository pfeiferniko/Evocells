const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

let WORLD_WIDTH = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
let WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
const GRID_SIZE = window.SETTINGS.GRID_SIZE || 50;
let grid;

let entities = [];
let startTime = 0; // NEU: Merkt sich den Startzeitpunkt

// --- PLANKTON / WASSERSTAUB ---
const PLANKTON_COUNT = 150; // Anzahl der Partikel
const planktons = [];

// --- PARTIKEL-SYSTEM (Fress-Krümel) ---
let particles = [];

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
    debugBtn.innerText = "Debug-Linien: AUS";
    debugBtn.style.color = "#555";
    
    debugBtn.addEventListener('click', () => {
        showDebugLines = !showDebugLines;
        if (showDebugLines) {
            debugBtn.innerText = "Debug-Linien: AN";
            debugBtn.style.color = "#999";
        } else {
            debugBtn.innerText = "Debug-Linien: AUS";
            debugBtn.style.color = "#555";
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

// Neue Funktion zum Anwenden der Auflösung
function applyResolution(factor) {
    // 1. Interne Canvas-Größe ändern
    canvas.width = WORLD_WIDTH * factor;
    canvas.height = WORLD_HEIGHT * factor;

    // 2. Den Pinsel-Maßstab anpassen
    // Wichtig: setTransform stellt sicher, dass alte Skalierungen gelöscht werden
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(factor, factor);

    // 3. CSS-Filter umschalten
    if (factor === 1.0) {
        canvas.classList.remove('pixel-mode');
    } else {
        canvas.classList.add('pixel-mode');
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

function init() {
    console.log("Initializing...");
    startTime = Date.now(); // NEU: Stoppuhr starten

    const isPortrait = window.innerHeight > window.innerWidth;

    if (isPortrait) {
        WORLD_WIDTH = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
        WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
    } else {
        WORLD_WIDTH = window.SETTINGS.WORLD_BASE_WIDTH || 2000;
        WORLD_HEIGHT = window.SETTINGS.WORLD_BASE_HEIGHT || 1000;
    }

    // Globale Referenzen für andere Klassen
    window.WORLD_WIDTH = WORLD_WIDTH;
    window.WORLD_HEIGHT = WORLD_HEIGHT;

    // Nutze die neue Funktion zum ersten Mal (Standard: 1.0)
    applyResolution(pixelModes[currentPixelMode].factor);

    grid = new Grid(WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

    // Wasserstaub generieren
    for (let i = 0; i < PLANKTON_COUNT; i++) {
        planktons.push({
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            baseVx: (Math.random() - 0.5) * 0.2,
            baseVy: (Math.random() - 0.5) * 0.2,

            // --- NEU: Größer und sichtbarer für die Pixeloptik ---
            // Vorher: 0.5 bis 2. Jetzt: 2 bis 5 (Damit überleben sie die Skalierung)
            size: Math.random() * 2 + 1,

            // Vorher: 0.05 bis 0.25. Jetzt: 0.2 bis 0.5 (Deutlich kräftiger)
            opacity: Math.random() * 0.3 + 0.2,

            wobbleSpeed: Math.random() * 0.002 + 0.001,
            wobbleOffset: Math.random() * Math.PI * 2
        });
    }

    // 1. Steine generieren und in einer extra Liste kurz merken
    const stones = [];

    // 3 SUPER-Steine
    for (let i = 0; i < window.SETTINGS.SPAWN_SUPER_STONES; i++) {
        const spawnX = Math.max(300, Math.random() * (WORLD_WIDTH - 300));
        const spawnY = Math.max(300, Math.random() * (WORLD_HEIGHT - 300));
        const size = 20 + Math.random() * 20;
        const stone = new StoneCell(spawnX, spawnY, size, true); // true = isSuper
        stones.push(stone);
        entities.push(stone);
    }

    // 7 NORMALE Steine
    for (let i = 0; i < window.SETTINGS.SPAWN_NORMAL_STONES; i++) {
        const spawnX = Math.max(100, Math.random() * (WORLD_WIDTH - 100));
        const spawnY = Math.max(100, Math.random() * (WORLD_HEIGHT - 100));
        const size = 10 + Math.random() * 20;
        const stone = new StoneCell(spawnX, spawnY, size, false); // false = normal
        stones.push(stone);
        entities.push(stone);
    }

    // 2. Pflanzen um die Steine herum spawnen
    stones.forEach(targetStone => {
        for (let i = 0; i < 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = targetStone.size + 5 + Math.random() * 15;

            let spawnX = targetStone.x + Math.cos(angle) * dist;
            let spawnY = targetStone.y + Math.sin(angle) * dist;

            spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
            spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

            // NEU: Übergibt den Status des Steins an die Pflanze
            entities.push(new PlantSegment(spawnX, spawnY, null, targetStone.isSuper));
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

        // Die Schlange startet direkt mit 8 Gliedern!
        addInitialTail(snake, entities, 8);
    }
    console.log("Entities created:", entities.length);
    animate();
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
    grid.clear();
    entities.forEach(e => grid.add(e));

    let globalHerbivoreCount = 0;
    let globalCarnivoreCount = 0;
    let globalPlantCount = 0; // --- NEU: Pflanzenzähler ---

    for (let i = 0; i < entities.length; i++) {
        const ent = entities[i];
        if (ent.alive !== false) {
            if (ent instanceof HerbivoreCell) {
                globalHerbivoreCount++;
            } else if (ent instanceof CarnivoreCell && !(ent instanceof SnakeCell)) {
                globalCarnivoreCount++;
            } else if (ent.type === 'plant') {
                globalPlantCount++; // --- NEU ---
            }
        }
    }

    const newEntities = [];
    const survivingEntities = [];

    const isStartup = (Date.now() - startTime) < window.SETTINGS.STARTUP_PHASE_DURATION;

    entities.forEach(e => {
        let isAlive = true;

        if (e.type === 'animal') {
            const status = e.update(grid);

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
                    // 1. Aktuelle Anzahl der Pflanzenfresser zählen
                    const herbivoreCount = globalHerbivoreCount;

                    if (herbivoreCount <= window.SETTINGS.HERBIVORE_OVERPOPULATION_START) {
                        numChildren = 10;
                    } else if (herbivoreCount <= window.SETTINGS.HERBIVORE_OVERPOPULATION_MAX) {
                        // Bereich 30 bis 100: Von 10 runter auf 1 Kind
                        const diffTiere = window.SETTINGS.HERBIVORE_OVERPOPULATION_MAX - window.SETTINGS.HERBIVORE_OVERPOPULATION_START;
                        numChildren = 10 - ((herbivoreCount - window.SETTINGS.HERBIVORE_OVERPOPULATION_START) / diffTiere) * 9;
                    } else {
                        if (herbivoreCount >= window.SETTINGS.MAX_HERBIVORE_FOR_BIRTH) {
                            numChildren = 0;
                        } else {
                            numChildren = 1;
                        }
                    }

                    // Da wir keine halben Kinder haben können:
                    numChildren = Math.round(numChildren);
                } else if (e instanceof SnakeCell) {
                    numChildren = window.SETTINGS.SNAKE_LITTER_SIZE;
                } else {
                    // --- NEU: GEBURTENKONTROLLE FÜR FLEISCHFRESSER ---
                    // Zählt WIRKLICH NUR die roten Fleischfresser
                    const carnivoreCount = globalCarnivoreCount;

                    // Wenn es mehr als 8 Räuber auf der Karte gibt, bekommen sie gar keine Kinder mehr!
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
                            child = new HerbivoreCell(childX, childY, newGenome);
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
            const nearby = grid.getEntitiesInArea(e.x, e.y, e.size * 2 + 50);
            for (const other of nearby) {
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
                                other.energy -= 1;
                                other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);
                                other.graceTimer = 60;

                                // --- NEU: NOTWEHR (Berserker-Modus) ---
                                // Sobald das Tier gebissen wird, wehrt es sich!
                                other.target = e;               // Nimm den Angreifer ins Visier
                                other.threat = null;            // Vergiss die Flucht
                                other.currentFleeTarget = null; // Zielpunkt der Flucht löschen
                                other.berserkTimer = 60;        // Für 60 Frames (ca. 1 Sekunde) unterdrückt dies den Fluchtinstinkt

                                // --- NEU: Ruckartige Drehung zum Angreifer! ---
                                other.angle = Math.atan2(e.y - other.y, e.x - other.x);

                                // --- Dynamische Krümelgröße beim Knabbern ---
                                if (Math.random() < 0.4) {
                                    const pCount = Math.max(1, Math.floor(other.size * 0.3));
                                    const pSize = Math.max(2, other.size * 0.3);
                                    createParticles(other.x, other.y, other.color, pCount, pSize);
                                }

                                e.energy += 0.01;
                                e.stuckTimer = 0;
                                e.accumulatedDist = 0;

                                // Wenn das Tier durch den Biss stirbt
                                if (other.energy <= 0) {
                                    other.isEaten = true;
                                    other.alive = false;
                                    if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);

                                    const energyGain = other.size;
                                    e.energy = Math.min(e.getMaxEnergy(), e.energy + energyGain);

                                    if (e.size < e.maxSize) e.size += 0.15;

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

            // Energy consumption & instant death
            if (e.energy <= 0) {

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

                // 3. Super-Pflanzen spawnen (aus den Nährstoffen des Kopfes)
                if (!e.isEaten && Math.random() > 0.7) { // 30% Chance

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
                }

                isAlive = false;
                e.alive = false;
                if (e.tailSegments) e.tailSegments.forEach(t => t.alive = false);
            }
        }

        if (e.type === 'plant') {
            e.update(isStartup);

            // --- OPTIMIERUNG: Spatial Sleep (Schlafende Pflanzen) ---
            // Neue Pflanzen bekommen 30 Frames Zeit, um ihren Platz zu finden. Danach schlafen sie ein.
            if (e.settleTimer === undefined) e.settleTimer = 30;

            if (e.settleTimer > 0) {
                e.settleTimer--; // Timer läuft ab

                const neighbors = grid.getEntitiesInArea(e.x, e.y, e.size * 2 + 50);
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
                                e.x += Math.cos(angle) * overlap;
                                e.y += Math.sin(angle) * overlap;
                            } else {
                                e.x += Math.cos(angle) * (overlap / 2);
                                e.y += Math.sin(angle) * (overlap / 2);
                                other.x -= Math.cos(angle) * (overlap / 2);
                                other.y -= Math.sin(angle) * (overlap / 2);

                                // WICHTIG: Wenn die andere Pflanze weggeschoben wurde, wecken wir sie kurz auf!
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

                const dist = e.size + 8;

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
                const nearby = grid.getEntitiesInArea(spawnX, spawnY, 25);

                // Wir zählen NUR die Pflanzen, die exakt im 25er Radius sind
                let plantNeighborsCount = 0;
                for (let i = 0; i < nearby.length; i++) {
                    const n = nearby[i];
                    if (n.type === 'plant' && n.alive !== false) {
                        const dx = n.x - spawnX;
                        const dy = n.y - spawnY;
                        // 25 * 25 = 625 (Superschneller Check ohne Wurzel)
                        if (dx * dx + dy * dy <= 625) {
                            plantNeighborsCount++;
                        }
                    }
                }

                // Wachstum nur, wenn wirklich Platz ist UND das globale Limit nicht erreicht ist
                if (plantNeighborsCount <= 3 && globalPlantCount < window.SETTINGS.PLANTS_MAX_COUNT) {
                    e.isTip = false;
                    const child = new PlantSegment(spawnX, spawnY, e, e.isSuper, e.baseColor);
                    newEntities.push(child);
                    globalPlantCount++; // Sofort mitzählen!
                }
            }

            e.x = Math.max(1, Math.min(WORLD_WIDTH - 1, e.x));
            e.y = Math.max(1, Math.min(WORLD_HEIGHT - 1, e.y));
        }

        // Stein-Spawning und Kontrolle
        if (e.type === 'stone') {
            const checkRadius = e.size + 40;
            const nearby = grid.getEntitiesInArea(e.x, e.y, checkRadius);

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
                    if (nearbyPlantsCount < 5 && Math.random() < 0.05) shouldSpawn = true;
                } else {
                    if (nearbyPlantsCount < 3 && Math.random() < 0.05) shouldSpawn = true;
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

                newEntities.push(new PlantSegment(spawnX, spawnY, null, e.isSuper));
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

    entities = [...survivingEntities.filter(ent => ent.alive !== false), ...newEntities];

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
}

// requestAnimationFrame übergibt automatisch einen hochpräzisen Zeitstempel (timestamp)
function animate(timestamp) {
    // 1. Stoppuhr starten (Millisekunden für die Berechnung messen)
    const t0 = performance.now();

    update();
    draw();

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