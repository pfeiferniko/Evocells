const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;
const GRID_SIZE = 50;
const grid = new Grid(WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

let entities = [];
let startTime = 0; // NEU: Merkt sich den Startzeitpunkt

function init() {
    console.log("Initializing...");
    startTime = Date.now(); // NEU: Stoppuhr starten

    // 1. Steine generieren und in einer extra Liste kurz merken
    const stones = [];

    // 3 SUPER-Steine
    for (let i = 0; i < 1; i++) {
        const spawnX = Math.random() * WORLD_WIDTH;
        const spawnY = Math.random() * WORLD_HEIGHT;
        const size = 20 + Math.random() * 30;
        const stone = new StoneCell(spawnX, spawnY, size, true); // true = isSuper
        stones.push(stone);
        entities.push(stone);
    }

    // 7 NORMALE Steine
    for (let i = 0; i < 15; i++) {
        const spawnX = Math.random() * WORLD_WIDTH;
        const spawnY = Math.random() * WORLD_HEIGHT;
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

    // 3. Tiere generieren (wie bisher)
    for (let i = 0; i < 100; i++) {
        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, new Genome());
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }
    for (let i = 0; i < 3; i++) {
        let carnivore = new CarnivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, new Genome());
        entities.push(carnivore);
        addInitialTail(carnivore, entities);
    }

    console.log("Entities created:", entities.length);
    animate();
}

// NEU: Hängt einem neuen Tier sofort 3 Schwanzsegmente an
function addInitialTail(animal, targetArray) {
    for (let i = 0; i < 3; i++) {
        // Das erste Glied hängt am Tier selbst, die restlichen hängen am jeweils vorherigen Glied
        let parentNode = (i === 0) ? animal : animal.tailSegments[i - 1];

        // Neues Schwanzsegment erstellen (Startgröße ist z.B. 80% der Tiergröße)
        let tail = new TailSegment(animal.x, animal.y, parentNode, animal.size * 0.8);

        // In die Arrays eintragen
        animal.tailSegments.push(tail);
        targetArray.push(tail);
    }
}

function update() {
    grid.clear();
    entities.forEach(e => grid.add(e));

    const newEntities = [];
    const survivingEntities = [];

    const isStartup = (Date.now() - startTime) < 6000;

    entities.forEach(e => {
        let isAlive = true;

        if (e.type === 'animal') {
            const status = e.update(grid);

            // Update tail segments
            if (e.tailSegments && e.tailSegments.length > 0) {
                const headSize = e.size;
                const numTails = e.tailSegments.length;

                // Wir berechnen die Stufen entweder auf die aktuelle Länge (wenn < 10)
                // oder kappen es bei 10 Elementen ab.
                const targetSteps = Math.min(10, numTails);

                const step = (headSize - 1) / targetSteps;

                e.tailSegments.forEach((t, index) => {
                    // Größe berechnen und wie gehabt bei 1 nach unten abriegeln
                    t.size = Math.max(1, headSize - (index + 1) * step);
                    t.update();
                });
            }

            if (e.type === 'animal' && e.shouldGrowTail) {
                e.shouldGrowTail = false; // Wunsch erfüllt, Flag zurücksetzen

                // Wir suchen das aktuell letzte Glied der Kette
                const lastNode = e.tailSegments[e.tailSegments.length - 1];

                // Neues Segment erstellen (es wird etwas kleiner als das Haupttier)
                const newTail = new TailSegment(e.x, e.y, lastNode, e.size * 0.8);

                // Beim Tier und in der Welt registrieren
                e.tailSegments.push(newTail);
                newEntities.push(newTail);
            }

            // Reproduktion
            if (status === 'reproduce') {
                const newGenome = new Genome(e.genome);
                newGenome.mutate();
                
                const childX = Math.max(0, Math.min(WORLD_WIDTH, e.x + 10));
                const childY = Math.max(0, Math.min(WORLD_HEIGHT, e.y + 10));
                
                const child = (e instanceof HerbivoreCell) ? new HerbivoreCell(childX, childY, newGenome) : new CarnivoreCell(childX, childY, newGenome);

                addInitialTail(child, newEntities);
                // ALT:
                // child.energy = Math.min(e.energy, child.genome.maxEnergy - 1);

                // NEU:
                child.energy = Math.min(e.energy, child.getMaxEnergy() - 1);
                newEntities.push(child);
                
                // Add tail element
                const parent = e.tailSegments.length > 0 ? e.tailSegments[e.tailSegments.length - 1] : e;
                const tailSize = Math.max(1, parent.size - 1);
                const tail = new TailSegment(parent.x, parent.y, parent, tailSize);
                e.tailSegments.push(tail);
                newEntities.push(tail);
            }

            // Animal collision & Eat check
            // Suchradius erhöht (+ 50), damit auch sehr große Steine frühzeitig erkannt werden
            const nearby = grid.getEntitiesInArea(e.x, e.y, e.size * 2 + 50);
            for (const other of nearby) {
                if (other === e || other.type === 'tail' || !other.alive) continue;

                const dx = other.x - e.x;
                const dy = other.y - e.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const minDist = e.size + (other.size || 2);

                if (dist < minDist && dist > 0) {

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
                        // Carnivore eats Herbivore
                        else if (e instanceof CarnivoreCell && other instanceof HerbivoreCell) {
                            other.energy -= 1;
                            other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                            e.energy += 0.05;

                            if (other.energy <= 0) {
                                e.energy = Math.min(e.getMaxEnergy(), e.energy + 80);
                                other.alive = false;
                                e.energy += Math.floor(other.size * 3);

                                // NEU: Jäger wachsen massiv durch einen Kill (von 0.2 auf 0.5 erhöht)
                                if (e.size < e.genome.maxSize) e.size += 0.5;

                                if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);
                            }
                            eaten = true;
                        }
                        // Carnivore isst Carnivore (Kannibalismus)
                        else if (e instanceof CarnivoreCell && other instanceof CarnivoreCell && e.size > other.size) {
                            if (e.target === other) {
                                other.energy -= 1;
                                other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                                e.energy += 0.05;

                                if (other.energy <= 0) {
                                    e.energy = Math.min(e.getMaxEnergy(), e.energy + 80);
                                    other.alive = false;
                                    e.energy += Math.floor(other.size * 3);

                                    // NEU: Auch Kannibalismus gibt einen fetten Wachstums-Schub
                                    if (e.size < e.genome.maxSize) e.size += 0.5;

                                    if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);
                                }
                                eaten = true;
                            }
                        }
                    }

                    // NEUE KOLLISIONS-LOGIK MIT GESTRÜPP-WIDERSTAND
                    if (!eaten) {
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
                isAlive = false;
                e.alive = false;
                if (e.tailSegments) e.tailSegments.forEach(t => t.alive = false);
                if (Math.random() < 0.1) newEntities.push(new PlantSegment(e.x, e.y));
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

                // NEU: Abprall-Logik (Bounce) am Spielfeldrand!
                let bounced = false;

                // Trifft die Ranke den linken oder rechten Rand? -> Horizontal spiegeln
                if (spawnX < 50 || spawnX > WORLD_WIDTH - 50) {
                    angle = Math.PI - angle;
                    bounced = true;
                }

                // Trifft die Ranke den oberen oder unteren Rand? -> Vertikal spiegeln
                if (spawnY < 50 || spawnY > WORLD_HEIGHT - 50) {
                    angle = -angle;
                    bounced = true;
                }

                // Wenn sie abgeprallt ist, berechnen wir die Position mit dem neuen Winkel neu!
                if (bounced) {
                    spawnX = e.x + Math.cos(angle) * dist;
                    spawnY = e.y + Math.sin(angle) * dist;
                }

                // Absolute Sicherheitsgrenze beibehalten
                spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
                spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

                const rocksInWay = grid.getEntitiesInArea(spawnX, spawnY, 10).filter(n => n.type === 'stone');

                if (rocksInWay.length === 0) {
                    e.isTip = false;
                    // NEU: Die neue Pflanze erbt den Super-Status der Elternpflanze (e.isSuper)
                    newEntities.push(new PlantSegment(spawnX, spawnY, e, e.isSuper));
                }
            }

            e.x = Math.max(1, Math.min(WORLD_WIDTH - 1, e.x));
            e.y = Math.max(1, Math.min(WORLD_HEIGHT - 1, e.y));
        }

        // NEU: Super-Steine vs Normale Steine Spawning
        if (e.type === 'stone') {
            const nearbyPlants = grid.getEntitiesInArea(e.x, e.y, e.size + 100).filter(n => n.type === 'plant' && n.alive !== false);

            let shouldSpawn = false;

            if (e.isSuper) {
                // SUPER-STEIN: Spawnt rasend schnell, bis ein dichter Busch von max. 25 Pflanzen entsteht
                if (nearbyPlants.length < 10 && Math.random() < 0.05) {
                    shouldSpawn = true;
                }
            } else {
                // NORMALER STEIN: Spawnt EXTREM langsam (oder zur Rettung sofort, wenn 0 da sind). Max. 8 Pflanzen.
                if (nearbyPlants.length === 0 || (nearbyPlants.length < 8 && Math.random() < 0.001)) {
                    shouldSpawn = true;
                }
            }

            if (shouldSpawn) {
                const angle = Math.random() * Math.PI * 2;
                const dist = e.size + 5 + Math.random() * 20;

                let spawnX = e.x + Math.cos(angle) * dist;
                let spawnY = e.y + Math.sin(angle) * dist;

                spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
                spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

                newEntities.push(new PlantSegment(spawnX, spawnY, null, e.isSuper));
            }
        }

        if (e.x < 0) { e.x = 0; if (e.type === 'animal') e.angle = Math.PI - e.angle; }
        if (e.x > WORLD_WIDTH) { e.x = WORLD_WIDTH; if (e.type === 'animal') e.angle = Math.PI - e.angle; }
        if (e.y < 0) { e.y = 0; if (e.type === 'animal') e.angle = -e.angle; }
        if (e.y > WORLD_HEIGHT) { e.y = WORLD_HEIGHT; if (e.type === 'animal') e.angle = -e.angle; }

        if (isAlive && e.alive !== false) survivingEntities.push(e);
    });

    entities = [...survivingEntities.filter(ent => ent.alive !== false), ...newEntities];
}

function draw() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 1. Durchlauf: Hintergrund-Elemente (Sichtfenster, Pflanzen und Schwänze)
    entities.forEach(e => {
        // Sichtlinien der Tiere UNTER dem Kopf zeichnen
        if (e.type === 'animal') {
            const sightLength = e.size + 5;
            const angleLeft = e.angle - e.genome.sightAngle;
            const angleRight = e.angle + e.genome.sightAngle;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x + Math.cos(angleLeft) * sightLength, e.y + Math.sin(angleLeft) * sightLength);
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x + Math.cos(angleRight) * sightLength, e.y + Math.sin(angleRight) * sightLength);
            ctx.stroke();
        }

        // Pflanzen, Steine und Schwänze
        if (e.type === 'plant' || e.type === 'tail' || e.type === 'stone') {
            ctx.fillStyle = e.color || 'white';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // 2. Durchlauf: Vordergrund-Elemente (Tierköpfe und Ziellinien)
    entities.forEach(e => {
        if (e.type === 'animal') {
            // Kopf zeichnen
            ctx.fillStyle = e.color || 'white';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            ctx.fill();

            // Dünne graue Linie zum Target
            if (e.target && e.target.alive) {
                ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.target.x, e.target.y);
                ctx.stroke();
            }

            // --- NEU: Rote gestrichelte Warn-Linie bei Flucht ---
            if (e.threat && e.threat.alive) {
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; // Sichtbares Rot
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]); // Macht die Linie gestrichelt
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.threat.x, e.threat.y);
                ctx.stroke();
                ctx.setLineDash([]); // Reset, damit andere Linien normal bleiben
            }
        }
    });
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