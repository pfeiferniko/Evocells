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
    for (let i = 0; i < 2; i++) {
        const spawnX = Math.max(60, Math.random() * (WORLD_WIDTH - 60));
        const spawnY = Math.max(60, Math.random() * (WORLD_HEIGHT - 60));
        const size = 20 + Math.random() * 30;
        const stone = new StoneCell(spawnX, spawnY, size, true); // true = isSuper
        stones.push(stone);
        entities.push(stone);
    }

    // 7 NORMALE Steine
    for (let i = 0; i < 15; i++) {
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
    for (let i = 0; i < 30; i++) {
        const initialGenome = new Genome();
        // Pflanzenfresser: Basis-Speed ca. 1.0 (schwankt zwischen 0.9 und 1.1)
        initialGenome.speed = 0.9 + Math.random() * 0.2;

        let herbivore = new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
        entities.push(herbivore);
        addInitialTail(herbivore, entities);
    }
    for (let i = 0; i < 3; i++) {
        const initialGenome = new Genome();
        // Fleischfresser: Basis-Speed ca. 1.3 (schwankt zwischen 1.2 und 1.4) -> Etwas schneller!
        initialGenome.speed = 1.2 + Math.random() * 0.2;

        let carnivore = new CarnivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, initialGenome);
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

    const isStartup = (Date.now() - startTime) < 4000;

    entities.forEach(e => {
        let isAlive = true;

        if (e.type === 'animal') {
            const status = e.update(grid);

            // Update tail segments (Größe anpassen)
            if (e.tailSegments && e.tailSegments.length > 0) {
                const headSize = e.size;

                // NEU: Wir richten uns nach der maximalen Tiefe für einen sauberen Übergang
                const maxDepth = Math.max(...e.tailSegments.map(t => t.depth));
                const targetSteps = Math.min(10, maxDepth);
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
                const numChildren = (e instanceof HerbivoreCell) ? 5 : 1;

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

                // WICHTIG: Die alten Zeilen, die dem Elternteil hier einen neuen Schwanz
                // angehängt haben, sind jetzt komplett gelöscht!
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
                        else if (e instanceof CarnivoreCell && other instanceof HerbivoreCell && e.size >= other.size) {
                            other.energy -= 1;
                            other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                            e.energy += 0.05;

                            if (other.energy <= 0) {
                                other.isEaten = true;
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
                        else if (e instanceof CarnivoreCell && other instanceof CarnivoreCell && e.size >= other.size) {
                            if (e.target === other) {
                                other.energy -= 1;
                                other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.15);

                                e.energy += 0.05;

                                if (other.energy <= 0) {
                                    other.isEaten = true;
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

                // Spawne IMMER eine Super-Pflanze, wenn es verhungert ist
                if (!e.isEaten && Math.random() < 0.3) { // 30% Chance
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
        // if (e.type === 'animal') {
        //     const sightLength = e.size + 5;
        //     const angleLeft = e.angle - e.genome.sightAngle;
        //     const angleRight = e.angle + e.genome.sightAngle;
        //
        //     ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        //     ctx.lineWidth = 1;
        //     ctx.beginPath();
        //     ctx.moveTo(e.x, e.y);
        //     ctx.lineTo(e.x + Math.cos(angleLeft) * sightLength, e.y + Math.sin(angleLeft) * sightLength);
        //     ctx.moveTo(e.x, e.y);
        //     ctx.lineTo(e.x + Math.cos(angleRight) * sightLength, e.y + Math.sin(angleRight) * sightLength);
        //     ctx.stroke();
        // }

        // Pflanzen, Steine und Schwänze
        if (e.type === 'plant' || e.type === 'tail' || e.type === 'stone') {

            ctx.save(); // Kontext speichern
            if (e.type === 'plant') {
                ctx.globalAlpha = e.opacity;
            }

            ctx.fillStyle = e.color || 'white';
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore(); //

            // --- NEU: Den farbigen Punkt auf den Schwanz zeichnen ---
            if (e.type === 'tail' && e.dotColor) {
                ctx.fillStyle = e.dotColor;
                ctx.beginPath();
                // Der Punkt ist 40% so groß wie das jeweilige Schwanzsegment
                ctx.arc(e.x, e.y, Math.max(1, e.size * 0.4), 0, Math.PI * 2);
                ctx.fill();
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
            ctx.beginPath();
            ctx.ellipse(0, 0, e.size, e.size * 0.7, 0, 0, Math.PI * 2);
            ctx.fillStyle = e.color || 'white';
            ctx.fill();
            ctx.closePath();

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
            ctx.beginPath();
            ctx.arc(e.size * 0.4, -e.size * 0.3, Math.max(1, e.size * 0.15), 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(e.size * 0.4, e.size * 0.3, Math.max(1, e.size * 0.15), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            // --- KOPF ENDE ---


            // Dünne graue Linie zum Target
            // if (e.target && e.target.alive) {
            //     ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
            //     ctx.lineWidth = 1;
            //     ctx.beginPath();
            //     ctx.moveTo(e.x, e.y);
            //     ctx.lineTo(e.target.x, e.target.y);
            //     ctx.stroke();
            // }

            // --- Rote gestrichelte Warn-Linie bei Flucht ---
            // if (e.threat && e.threat.alive) {
            //     ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; // Sichtbares Rot
            //     ctx.lineWidth = 1;
            //     ctx.setLineDash([5, 5]); // Macht die Linie gestrichelt
            //     ctx.beginPath();
            //     ctx.moveTo(e.x, e.y);
            //     ctx.lineTo(e.threat.x, e.threat.y);
            //     ctx.stroke();
            //     ctx.setLineDash([]); // Reset, damit andere Linien normal bleiben
            // }
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