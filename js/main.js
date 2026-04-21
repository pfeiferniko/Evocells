const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

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

let currentPixelMode = 3; // Startet bei Index 0 (AUS)
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
        const spawnX = Math.max(60, Math.random() * (WORLD_WIDTH - 60));
        const spawnY = Math.max(60, Math.random() * (WORLD_HEIGHT - 60));
        const size = 20 + Math.random() * 30;
        const stone = new StoneCell(spawnX, spawnY, size, true); // true = isSuper
        stones.push(stone);
        entities.push(stone);
    }

    // 7 NORMALE Steine
    for (let i = 0; i < window.SETTINGS.SPAWN_NORMAL_STONES; i++) {
        const spawnX = Math.max(60, Math.random() * (WORLD_WIDTH - 60));
        const spawnY = Math.max(60, Math.random() * (WORLD_HEIGHT - 60));
        const size = 10 + Math.random() * 30;
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
        initialGenome.maxSize = 7 + Math.random() * 2;

        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }
    for (let i = 0; i < window.SETTINGS.SPAWN_CARNIVORES; i++) {
        const initialGenome = new Genome();
        initialGenome.speed = window.SETTINGS.CARN_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.CARN_SPEED_VARIANCE * 2;
        initialGenome.maxSize = 9 + Math.random() * 2;

        let carnivore = new CarnivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        carnivore.size = 3;
        entities.push(carnivore);
        addInitialTail(carnivore, entities);
    }

    console.log("Entities created:", entities.length);
    animate();
}

function addInitialTail(animal, targetArray) {
    for (let i = 0; i < 3; i++) {
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
                const maxDepth = Math.max(...e.tailSegments.map(t => t.depth));
                const targetSteps = maxDepth;
                const step = (headSize - 1) / targetSteps;

                e.tailSegments.forEach((t) => {
                    t.size = Math.max(1, headSize - t.depth * step);
                    t.update();
                });
            }

            // Schwanz wachsen lassen (Hier passiert die Spaltung!)
            if (e.type === 'animal' && e.shouldGrowTail) {
                e.shouldGrowTail = false;

                if (e instanceof CarnivoreCell && e.tailSegments.length >= 3) {
                    // ROTER JÄGER UND SCHWANZ >= 3: WIR SPALTEN!
                    const len = e.tailSegments.length;

                    const parentL = len === 3 ? e.tailSegments[2] : e.tailSegments[len - 2];
                    const parentR = len === 3 ? e.tailSegments[2] : e.tailSegments[len - 1];
                    const nextDepth = parentL.depth + 1;

                    // NEU: Wir übergeben nur noch die Richtung (-1 für Links, 1 für Rechts)
                    const newTailL = new TailSegment(e.x, e.y, parentL, e.size * 0.8, -1, nextDepth);
                    const newTailR = new TailSegment(e.x, e.y, parentR, e.size * 0.8, 1, nextDepth);

                    e.tailSegments.push(newTailL, newTailR);
                    newEntities.push(newTailL, newTailR);
                } else {
                    // PFLANZENFRESSER (oder Basis des Schwanzes): Normaler, gerader Ast (0)
                    const lastNode = e.tailSegments.length > 0 ? e.tailSegments[e.tailSegments.length - 1] : e;
                    const nextDepth = lastNode ? lastNode.depth + 1 : 1;

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
                    const herbivoreCount = entities.filter(ent => ent instanceof HerbivoreCell && ent.alive).length;

                    if (herbivoreCount <= window.SETTINGS.HERBIVORE_OVERPOPULATION_START) {
                        numChildren = 10;
                    } else if (herbivoreCount <= window.SETTINGS.HERBIVORE_OVERPOPULATION_MAX) {
                        // Bereich 30 bis 100: Von 10 runter auf 1 Kind
                        const diffTiere = window.SETTINGS.HERBIVORE_OVERPOPULATION_MAX - window.SETTINGS.HERBIVORE_OVERPOPULATION_START;
                        numChildren = 10 - ((herbivoreCount - window.SETTINGS.HERBIVORE_OVERPOPULATION_START) / diffTiere) * 9;
                    } else {
                        numChildren = 1; // Minimum bei Überbevölkerung
                    }

                    // Da wir keine halben Kinder haben können:
                    numChildren = Math.round(numChildren);
                } else {
                    // --- NEU: GEBURTENKONTROLLE FÜR FLEISCHFRESSER ---
                    const carnivoreCount = entities.filter(ent => ent instanceof CarnivoreCell && ent.alive).length;

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
                        const child = (e instanceof HerbivoreCell)
                            ? new HerbivoreCell(childX, childY, newGenome)
                            : new CarnivoreCell(childX, childY, newGenome);

                        // Hier überschreiben wir die Zufallsfarbe des Babys exakt mit der Farbe der Eltern
                        child.color = e.color;
                        child.dotColor = e.dotColor;

                        addInitialTail(child, newEntities);

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

    1           // Wir vergleichen die quadrierten Werte
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
                                const biteAmount = Math.min(0.2, other.size);

                                other.size -= biteAmount; // Pflanze wird langsam kleiner
                                e.energy += biteAmount; // Energie wird langsam hochgezählt

                                if (Math.random() < 0.2) {
                                    createParticles(other.x, other.y, other.color, 1);
                                }

                                // Energie am Maximum kappen
                                e.energy = Math.min(e.getMaxEnergy(), e.energy);

                                // Sehr sanftes, stetiges Wachstum beim Grasen
                                if (e.size < e.genome.maxSize) e.size += 0.005;

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
                                rootAnimal.speedMultiplier = Math.max(0.1, rootAnimal.speedMultiplier - 0.02);
                            }
                        }
                        // Carnivore eats Herbivore
                        else if (e instanceof CarnivoreCell && other instanceof HerbivoreCell && e.size >= other.size) {
                            other.energy -= 1;
                            other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                            // --- NEU: Dynamische Krümelgröße beim Knabbern ---
                            if (Math.random() < 0.4) {
                                // Anzahl: Je größer das Opfer, desto mehr Krümel. (Mindestens 1)
                                const pCount = Math.max(1, Math.floor(other.size * 0.3));

                                // Größe: Je dicker das Opfer, desto größer die Brocken.
                                const pSize = Math.max(2, other.size * 0.3);

                                createParticles(other.x, other.y, other.color, pCount, pSize);
                            }

                            e.energy += 0.05;
                            e.stuckTimer = 0; // STUCK-FIX: Wenn er frisst, steckt er nicht fest
                            e.accumulatedDist = 0;

                            if (other.energy <= 0) {
                                other.isEaten = true;
                                e.energy = Math.min(e.getMaxEnergy(), e.energy + 80);
                                other.alive = false;
                                e.energy += Math.floor(other.size * 3);

                                // NEU: Jäger wachsen massiv durch einen Kill (von 0.2 auf 0.5 erhöht)
                                if (e.size < e.genome.maxSize) e.size += 0.5;

                                if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);

                                // --- NEU: Große Explosion, wenn das Tier komplett gefressen wurde! ---
                                // Das erzeugt eine kleine Wolke, die das Ende des Tieres signalisiert.
                                const finalPuffCount = Math.floor(other.size * 2);
                                const finalPuffSize = other.size * 0.4;
                                createParticles(other.x, other.y, other.color, finalPuffCount, finalPuffSize);
                            }
                            eaten = true;
                        }
                        // Carnivore isst Carnivore (Kannibalismus)
                        else if (e instanceof CarnivoreCell && other instanceof CarnivoreCell && e.size >= other.size) {
                            if (e.target === other) {
                                other.energy -= 1;
                                other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);
                                other.graceTimer = 60; // NEU: 1 Sekunde Schutz vor Verhungern

                                // --- NEU: Dynamische Krümelgröße beim Knabbern ---
                                if (Math.random() < 0.4) {
                                    // Anzahl: Je größer das Opfer, desto mehr Krümel. (Mindestens 1)
                                    const pCount = Math.max(1, Math.floor(other.size * 0.3));

                                    // Größe: Je dicker das Opfer, desto größer die Brocken.
                                    const pSize = Math.max(2, other.size * 0.3);

                                    createParticles(other.x, other.y, other.color, pCount, pSize);
                                }

                                e.energy += 0.05;
                                e.stuckTimer = 0; // STUCK-FIX: Wenn er frisst, steckt er nicht fest
                                e.accumulatedDist = 0;

                                if (other.energy <= 0) {
                                    other.isEaten = true;
                                    other.alive = false;
                                    if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);

                                    // --- NEU: Große Explosion, wenn das Tier komplett gefressen wurde! ---
                                    // Das erzeugt eine kleine Wolke, die das Ende des Tieres signalisiert.
                                    const finalPuffCount = Math.floor(other.size * 2);
                                    const finalPuffSize = other.size * 0.4;
                                    createParticles(other.x, other.y, other.color, finalPuffCount, finalPuffSize);

                                    // Nur wenn er überlebt, bekommt er Nahrung, aber WENIGER als bei einem Pflanzenfresser
                                    e.energy = Math.min(e.getMaxEnergy(), e.energy + 30);
                                    // Und er wächst nur noch minimal durch Kannibalismus
                                    if (e.size < e.genome.maxSize) e.size += 0.1;
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

                // Spawne IMMER eine Super-Pflanze, wenn ein PFLANZENFRESSER verhungert ist
                if (e instanceof HerbivoreCell && !e.isEaten && Math.random() < 0.3) { // 30% Chance
                    const superPlant = new PlantSegment(e.x, e.y, null, true);
                    superPlant.color = '#00FFFF';
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

            // Plant Collision: Push apart from other plants AND stones
            // Suchradius ist hier auch etwas größer (+ 50), um die dicken Steine zu erfassen
            const neighbors = grid.getEntitiesInArea(e.x, e.y, e.size * 2 + 50);
            for (const other of neighbors) {
                if (other !== e && (other.type === 'plant' || other.type === 'stone')) {
                    const dx = e.x - other.x;
                    const dy = e.y - other.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const minDist = e.size + other.size;

                    if (dist < minDist && dist > 0) {
                        const angle = Math.atan2(dy, dx);
                        const overlap = minDist - dist;

                        if (other.type === 'stone') {
                            // Stein ist massiv: Die Pflanze weicht zu 100% aus
                            e.x += Math.cos(angle) * overlap;
                            e.y += Math.sin(angle) * overlap;
                        } else {
                            // Pflanze vs Pflanze: Beide weichen zu 50% aus
                            e.x += Math.cos(angle) * (overlap / 2);
                            e.y += Math.sin(angle) * (overlap / 2);
                            other.x -= Math.cos(angle) * (overlap / 2);
                            other.y -= Math.sin(angle) * (overlap / 2);
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

                // --- NEU: Wachstums-Check (Dichte-Regel) ---
                // Wir prüfen die Umgebung des Zielpunktes
                const nearby = grid.getEntitiesInArea(spawnX, spawnY, 25);
                const plantNeighbors = nearby.filter(n => n.type === 'plant' && n.alive !== false);

                // Wachstum nur, wenn Platz ist (<= 3 Pflanzen)
                if (plantNeighbors.length <= 10) {
                    e.isTip = false;

                    const child = new PlantSegment(spawnX, spawnY, e, e.isSuper);

                    // --- Eigenschaften vererben ---
                    child.color = e.color;
                    child.maxSize = e.maxSize; // Vererbung der individuellen Maximalgröße
                    child.opacity = e.opacity; // Vererbung der Transparenz

                    newEntities.push(child);
                }
            }

            e.x = Math.max(1, Math.min(WORLD_WIDTH - 1, e.x));
            e.y = Math.max(1, Math.min(WORLD_HEIGHT - 1, e.y));
        }

        // Stein-Spawning und Kontrolle
        if (e.type === 'stone') {
            // RADIUS MASSIV REDUZIERT: Von + 60 auf + 20!
            // Der Stein schaut jetzt nur noch direkt an seine eigene Kante.
            const nearbyPlants = grid.getEntitiesInArea(e.x, e.y, e.size + 40).filter(n => n.type === 'plant' && n.alive !== false);

            let shouldSpawn = false;

            // NEU: Die absolute Priorität. Wenn in seinem engen Umkreis KEINE Pflanze mehr ist,
            // spawnt er in genau diesem Frame sofort eine neue, egal was sonst passiert!
            if (nearbyPlants.length <= 3) {
                shouldSpawn = true;
            }
            // Ansonsten greifen die normalen Regeln für langsames/schnelles Nachwachsen
            else if (isStartup) {
                // STARTUP-BOOST
                if (e.isSuper && nearbyPlants.length < 10 && Math.random() < 0.5) shouldSpawn = true;
                if (!e.isSuper && nearbyPlants.length < 5 && Math.random() < 0.2) shouldSpawn = true;
            } else {
                // NORMALER MODUS
                if (e.isSuper) {
                    if (nearbyPlants.length < 10 && Math.random() < 0.05) shouldSpawn = true;
                } else {
                    if (nearbyPlants.length < 5 && Math.random() < 0.05) shouldSpawn = true;
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

function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Ein leuchtendes, helles Cyan/Blaugrün
    ctx.fillStyle = '#1a4466';

    planktons.forEach(p => {
        // Sanftes Driften + leichtes Wackeln durch Sinus
        p.x += p.baseVx + Math.sin(Date.now() * p.wobbleSpeed + p.wobbleOffset) * 0.2;
        p.y += p.baseVy;

        // Nahtloser Übergang am Spielfeldrand (Pac-Man-Effekt)
        // Das ist extrem ressourcenschonend, da wir keine neuen Arrays/Objekte erzeugen müssen!
        if (p.x < 0) p.x = WORLD_WIDTH;
        if (p.x > WORLD_WIDTH) p.x = 0;
        if (p.y < 0) p.y = WORLD_HEIGHT;
        if (p.y > WORLD_HEIGHT) p.y = 0;

        // Partikel zeichnen
        // ctx.beginPath();
        // ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        // ctx.fill();

        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    });



    // 1. Durchlauf: Hintergrund-Elemente (Sichtfenster, Pflanzen und Schwänze)
    entities.forEach(e => {

        // Pflanzen, Steine und Schwänze
        if (e.type === 'plant' || e.type === 'tail' || e.type === 'stone') {
            ctx.save();
            if (e.type === 'plant') {
                ctx.globalAlpha = e.opacity;
            }

            // NEU: Pulsieren für Super-Steine berechnen
            let drawSize = e.size;
            if (e.type === 'plant') {
                // Rhythmus: Date.now() * 0.002 bestimmt die Geschwindigkeit
                // * 0.15 bestimmt die Stärke (15% größer/kleiner)
                const pulse = 1.0 + Math.sin((Date.now() * e.pulseSpeed) + e.pulseOffset) * 0.1;
                drawSize = e.size * pulse;
            }

            ctx.fillStyle = e.color || 'white';
            // ctx.beginPath();
            // ctx.arc(e.x, e.y, Math.max(1, drawSize), 0, Math.PI * 2);
            // ctx.fill();

            const radius = Math.max(1, drawSize);
            ctx.fillRect(e.x - radius, e.y - radius, radius * 2, radius * 2);

            ctx.restore();

            // --- NEU: Den farbigen Punkt auf den Schwanz zeichnen ---
            if (e.type === 'tail' && e.dotColor) {
                // Hier KEIN save(), restore() oder 'lighter' Blending mehr!
                ctx.fillStyle = e.dotColor;
                // ctx.beginPath();
                // ctx.arc(e.x, e.y, Math.max(1, e.size * 0.4), 0, Math.PI * 2);
                // ctx.fill();

                const dotRadius = Math.max(1, e.size * 0.4);
                ctx.fillRect(e.x - dotRadius, e.y - dotRadius, dotRadius * 2, dotRadius * 2);
            }
        }
    });

    // 2. Durchlauf: Vordergrund-Elemente (Tierköpfe und Ziellinien)
    entities.forEach(e => {
        if (e.type === 'animal') {

            // --- NEUER KOPF (Gedreht in Blickrichtung) ---
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.angle);

            // 1. Der Haupt-Kopf (die Ellipse)
            // ctx.beginPath();
            // ctx.ellipse(0, 0, e.size, e.size * 0.7, 0, 0, Math.PI * 2);
            // ctx.fill();
            // ctx.closePath();

            ctx.fillStyle = e.color || 'white';

            const bodyWidth = e.size;
            const bodyHeight = e.size * 0.7;
            ctx.fillRect(-bodyWidth, -bodyHeight, bodyWidth * 2, bodyHeight * 2);

            // 2. NEU: Der "Mund" / die Zangen für Fleischfresser
            if (e instanceof CarnivoreCell) {
                ctx.strokeStyle = '#a00000'; // Ein etwas dunkleres Rot für die Mandibeln
                ctx.lineWidth = Math.max(2, e.size * 0.15); // Stärke skaliert mit der Größe
                ctx.lineCap = 'round'; // Abgerundete Enden

                const offsetX = e.size * 0.2; // Startpunkt am Kopf (leicht nach vorne versetzt)
                const offSetY = Math.max(3, e.size * 0.3); // Halbe Lückenbreite
                const length = e.size * 0.8; // Länge der "Zangen"

                // Oberer Strich
                ctx.beginPath();
                ctx.moveTo(offsetX, -offSetY);
                ctx.lineTo(offsetX + length, -offSetY);
                ctx.stroke();

                // Unterer Strich
                ctx.beginPath();
                ctx.moveTo(offsetX, offSetY);
                ctx.lineTo(offsetX + length, offSetY);
                ctx.stroke();
            }

            // 3. Die Augen
            ctx.fillStyle = (e instanceof CarnivoreCell) ? 'black' : 'white';

            // ctx.beginPath();
            // ctx.arc(e.size * 0.4, -e.size * 0.3, Math.max(1, e.size * 0.15), 0, Math.PI * 2);
            // ctx.fill();
            // ctx.beginPath();
            // ctx.arc(e.size * 0.4, e.size * 0.3, Math.max(1, e.size * 0.15), 0, Math.PI * 2);
            // ctx.fill();

            const eyeRadius = Math.max(1, e.size * 0.15);
            ctx.fillRect(e.size * 0.4 - eyeRadius, -e.size * 0.3 - eyeRadius, eyeRadius * 2, eyeRadius * 2); // Linkes Auge
            ctx.fillRect(e.size * 0.4 - eyeRadius, e.size * 0.3 - eyeRadius, eyeRadius * 2, eyeRadius * 2);  // Rechtes Auge

            ctx.restore();
            // --- KOPF ENDE ---

            // --- Debug-Linien für Fluchtverhalten ---
            if (showDebugLines) {
                if (e.threat && e.threat.alive) {
                    // Rote gestrichelte Linie zum Räuber (vor wem flieht es?)
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.threat.x, e.threat.y);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset
                }

                if (e.currentFleeTarget) {
                    // Blaue Linie zum Fluchtziel (wohin will es?)
                    const angle = Math.atan2(e.currentFleeTarget.y - e.y, e.currentFleeTarget.x - e.x);
                    ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)'; // Hellblau
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.x + Math.cos(angle) * window.SETTINGS.FLEE_TARGET_DISTANCE, e.y + Math.sin(angle) * window.SETTINGS.FLEE_TARGET_DISTANCE);
                    ctx.stroke();
                }
            }
        }
    });

    // 3. Durchlauf: Fress-Krümel zeichnen (ganz im Vordergrund)
    particles.forEach(p => {
        //ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;

        // Lighter Blending lässt auch die Krümel leicht leuchten
        //ctx.globalCompositeOperation = 'lighter';

        // ctx.beginPath();
        // ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        // ctx.fill();

        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    });

    // Alles auf Standard zurücksetzen für den nächsten Frame
    //ctx.globalCompositeOperation = 'source-over';
    //ctx.globalAlpha = 1.0;
}

function animate() {
    update();
    draw();
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