const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1000;
const GRID_SIZE = 50;
const grid = new Grid(WORLD_WIDTH, WORLD_HEIGHT, GRID_SIZE);

let entities = [];

function init() {
    console.log("Initializing...");

    // 1. Steine generieren und in einer extra Liste kurz merken
    const stones = [];
    for (let i = 0; i < 50; i++) {
        const spawnX = Math.random() * WORLD_WIDTH;
        const spawnY = Math.random() * WORLD_HEIGHT;
        const size = 5 + Math.random() * 35; // Größe zwischen 15 und 50

        const stone = new StoneCell(spawnX, spawnY, size);
        stones.push(stone);
        entities.push(stone);
    }

    // 2. Pflanzen um die Steine herum spawnen
    for (let i = 0; i < 200; i++) {
        // Wähle zufällig einen der Steine als "Zentrum" aus
        const targetStone = stones[Math.floor(Math.random() * stones.length)];

        // Zufälliger Winkel rund um den Stein
        const angle = Math.random() * Math.PI * 2;

        // Distanz: Radius des Steins + kleiner Puffer + zufällige Streuung
        const dist = targetStone.size + 5 + Math.random() * 25;

        // Neue X und Y Koordinaten berechnen
        let spawnX = targetStone.x + Math.cos(angle) * dist;
        let spawnY = targetStone.y + Math.sin(angle) * dist;

        // Sicherstellen, dass die Pflanze nicht über den Kartenrand hinaus generiert wird
        spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
        spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

        entities.push(new PlantSegment(spawnX, spawnY));
    }

    // 3. Tiere generieren (wie bisher)
    for (let i = 0; i < 20; i++) {
        entities.push(new HerbivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, new Genome()));
    }
    for (let i = 0; i < 20; i++) {
        entities.push(new CarnivoreCell(Math.random() * WORLD_WIDTH, Math.random() * WORLD_HEIGHT, new Genome()));
    }

    console.log("Entities created:", entities.length);
    animate();
}

function update() {
    grid.clear();
    entities.forEach(e => grid.add(e));

    const newEntities = [];
    const survivingEntities = [];

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

            // Reproduktion
            if (status === 'reproduce') {
                const newGenome = new Genome(e.genome);
                newGenome.mutate();
                
                const childX = Math.max(0, Math.min(WORLD_WIDTH, e.x + 10));
                const childY = Math.max(0, Math.min(WORLD_HEIGHT, e.y + 10));
                
                const child = (e instanceof HerbivoreCell) ? new HerbivoreCell(childX, childY, newGenome) : new CarnivoreCell(childX, childY, newGenome);

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
                    // Interaction logic (Eat check) - BLEIBT UNVERÄNDERT
                    if (status !== 'reproduce' && status !== 'stationary' && e.energy < e.getMaxEnergy()) {
                        // ... (Dein bisheriger Fress-Code hier, den lassen wir unangetastet!)
                        // Herbivore eats Plant
                        if (e instanceof HerbivoreCell && other.type === 'plant') {
                            const energyMultiplier = 5 + (other.size * 0.5);

                            if (e.size > other.size) {
                                // Zelle frisst die Pflanze ganz
                                e.energy += Math.floor(other.size * energyMultiplier);
                                other.alive = false;

                                // NEU: Wachstum drastisch reduziert (von 0.5 auf 0.05)
                                if (e.size < e.genome.maxSize) e.size += 0.05;
                            } else {
                                // Zelle ist kleiner und beißt nur ein Stück ab
                                const biteAmount = Math.min(other.size * 0.1, other.size);
                                other.size -= biteAmount;
                                e.energy += Math.floor(biteAmount * energyMultiplier);

                                // NEU: Kontinuierliches, aber winziges Wachstum beim Knabbern
                                if (e.size < e.genome.maxSize) e.size += 0.01;

                                if (other.size < 0.5) other.alive = false;
                            }
                            eaten = true;
                        }
                        // Carnivore eats Herbivore
                        else if (e instanceof CarnivoreCell && other instanceof HerbivoreCell) {
                            other.energy -= 1; // Voller Schaden für die Beute
                            other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.01);

                            // NEU: Energie-Transfer ist ineffizient (Raubtier bekommt nur 50% der Energie)
                            e.energy += 0.5;

                            if (other.energy <= 0) {
                                other.alive = false;
                                // NEU: Tötungsbonus stark reduziert (von 10 auf 3)
                                e.energy += Math.floor(other.size * 3);
                                // NEU: Langsameres Wachstum (von 1.0 auf 0.2)
                                if (e.size < e.genome.maxSize) e.size += 0.2;
                                if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);
                            }
                            eaten = true;
                        }
                        // Carnivore isst Carnivore (Kannibalismus)
                        else if (e instanceof CarnivoreCell && other instanceof CarnivoreCell && e.size > other.size) {
                            other.energy -= 1;
                            other.speedMultiplier = Math.max(0.1, other.speedMultiplier - 0.01);

                            // NEU: Auch hier nur 10% Energie-Gewinn
                            e.energy += 0.1;

                            if (other.energy <= 0) {
                                other.alive = false;
                                e.energy += Math.floor(other.size * 3);
                                if (e.size < e.genome.maxSize) e.size += 0.2;
                                if (other.tailSegments) other.tailSegments.forEach(t => t.alive = false);
                            }
                            eaten = true;
                        }
                    }

                    // NEUE KOLLISIONS-LOGIK MIT STEINEN
                    if (!eaten) {
                        const angle = Math.atan2(dy, dx);
                        const overlap = minDist - dist;

                        let moveE = 0;
                        let moveOther = 0;

                        if (other.type === 'stone' || other.type === 'plant') {
                            // Steine und Pflanzen weichen nicht aus, das Tier (e) nimmt den vollen Rückstoß
                            moveE = overlap;
                        } else {
                            // Zwei Tiere prallen aufeinander: Größeres Tier bewegt sich weniger
                            const totalSize = e.size + other.size;
                            moveE = overlap * (other.size / totalSize);
                            moveOther = overlap * (e.size / totalSize);
                        }

                        e.x -= Math.cos(angle) * moveE;
                        e.y -= Math.sin(angle) * moveE;

                        if (other.type !== 'plant' && other.type !== 'stone') {
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
            e.update();

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
                const neighbors = grid.getEntitiesInArea(e.x, e.y, 50); 
                const plantNeighbors = neighbors.filter(n => n.type === 'plant' && n !== e);
                if (plantNeighbors.length < 8) {
                    e.shouldGrow = false;
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 15;
                    const newX = Math.max(50, Math.min(WORLD_WIDTH - 50, e.x + Math.cos(angle) * dist));
                    const newY = Math.max(50, Math.min(WORLD_HEIGHT - 50, e.y + Math.sin(angle) * dist));
                    newEntities.push(new PlantSegment(newX, newY, e));
                } else {
                    e.age -= 20; 
                    e.shouldGrow = false;
                }
            }
        }

        // NEU: Steine spawnen langsam neue Pflanzen
        if (e.type === 'stone') {
            // Mit einer geringen Wahrscheinlichkeit (ca. alle 3 Sekunden pro Stein) auslösen
            if (Math.random() < 0.005) {

                // Performance- und Balance-Check: Sind schon zu viele Pflanzen an diesem Stein?
                // Wir suchen im Umkreis des Steins (+ 60 Pixel Puffer) nach Pflanzen
                const nearbyPlants = grid.getEntitiesInArea(e.x, e.y, e.size + 60).filter(n => n.type === 'plant');

                // Nur spawnen, wenn weniger als 8 Pflanzen um den Stein wachsen
                if (nearbyPlants.length < 8) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = e.size + 5 + Math.random() * 20;

                    let spawnX = e.x + Math.cos(angle) * dist;
                    let spawnY = e.y + Math.sin(angle) * dist;

                    // Im Spielfeld halten
                    spawnX = Math.max(50, Math.min(WORLD_WIDTH - 50, spawnX));
                    spawnY = Math.max(50, Math.min(WORLD_HEIGHT - 50, spawnY));

                    newEntities.push(new PlantSegment(spawnX, spawnY));
                }
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
            // Mitwachsende Länge: z.B. eigene Größe + 15 Pixel
            const sightLength = e.size + 5;
            const angleLeft = e.angle - e.genome.sightAngle;
            const angleRight = e.angle + e.genome.sightAngle;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1; // 1 Pixel dick
            ctx.beginPath();

            // Linker Strich
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(
                e.x + Math.cos(angleLeft) * sightLength,
                e.y + Math.sin(angleLeft) * sightLength
            );

            // Rechter Strich
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(
                e.x + Math.cos(angleRight) * sightLength,
                e.y + Math.sin(angleRight) * sightLength
            );

            ctx.stroke();
        }

        // Pflanzen, Steine und Schwänze
        if (e.type === 'plant' || e.type === 'tail' || e.type === 'stone') { // HIER ERGÄNZT
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