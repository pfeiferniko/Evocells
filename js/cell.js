class Genome {
    constructor(data = {}) {
        this.speed = data.speed || 1;
        this.maxSize = data.maxSize || 10;
        this.sightRange = data.sightRange || 50;
        this.sightAngle = data.sightAngle || Math.PI / 4;
        this.metabolism = data.metabolism || 0.05;
        this.maxEnergy = data.maxEnergy || 100;
        this.minAgeForReproduction = data.minAgeForReproduction || 1000;
    }

    mutate() {
        this.speed += (Math.random() - 0.5) * 0.2;
        this.maxSize += (Math.random() - 0.5) * 1.0;
        this.maxEnergy += (Math.random() - 0.5) * 10;
        this.minAgeForReproduction += (Math.random() - 0.5) * 100;
    }
}

class BaseCell {
    constructor(x, y, genome) {
        this.x = x;
        this.y = y;
        this.genome = genome || new Genome();
        this.size = 2;
        this.angle = Math.random() * Math.PI * 2;
        this.alive = true;
    }
}

class PlantSegment extends BaseCell {
    constructor(x, y, parent = null, isSuper = false) {
        super(x, y, null);
        this.type = 'plant';

        // NEU: Ist es eine Super-Pflanze?
        this.isSuper = isSuper;
        this.color = isSuper ? '#b200ff' : 'green'; // Lila für Super, Grün für Normal

        this.parent = parent;
        this.age = 0;
        this.shouldGrow = false;
        this.isTip = true;
    }

    // Nimmt jetzt den isStartup-Wert aus der main.js entgegen
    update(isStartup = false) {
        this.age++;

        // In der Startup-Phase wird die Pflanze 20x schneller dick
        let growthRate = isStartup ? 0.2 : 0.01;

        if (this.isSuper) {
            growthRate *= 5.0;
        }

        if (this.size < 10) {
            this.size += growthRate;
        }

        // In der Startup-Phase wachsen neue Ranken fast sofort
        const requiredAge = isStartup ? 10 : (this.isSuper ? 30 : 100);
        const growChance = isStartup ? 0.5 : (this.isSuper ? 0.5 : 0.1);

        if (this.isTip && this.age > requiredAge && Math.random() < growChance) {
            this.shouldGrow = true;
        }
    }
}

class StoneCell extends BaseCell {
    constructor(x, y, size, isSuper = false) {
        super(x, y, null);
        this.type = 'stone';

        // NEU: Super-Stein Eigenschaft
        this.isSuper = isSuper;

        if (this.isSuper) {
            // Super-Steine bekommen eine leicht mystische, dunkellila Färbung
            this.color = '#4a3060';
        } else {
            const gray = Math.floor(60 + Math.random() * 80);
            this.color = `rgb(${gray}, ${gray}, ${gray})`;
        }

        this.size = size;
    }

    update() {
    }
}

class AnimalCell extends BaseCell {
    constructor(x, y, genome) {
        super(x, y, genome);
        this.type = 'animal';
        this.energy = 50;
        this.tailSegments = [];
        this.age = 0;
        this.reproducing = false;
        this.reproTimer = 0;
        this.hasReproduced = false;
        this.birthCooldown = 0;
        this.metabolismMultiplier = 1.0;
        this.speedMultiplier = 1.0;
        this.target = null;
        this.targetTimer = 0;
        this.stuckTimer = 0;
        this.lastX = x;
        this.lastY = y;
    }

    // NEU: Berechnet die maximale Energie dynamisch nach Körpergröße
    getMaxEnergy() {
        // Startgröße ist 2 (also 2/2 = Faktor 1).
        // Bei Größe 10 braucht sie 5x so viel Essen (10/2 = Faktor 5).
        return this.genome.maxEnergy;// * (this.size / 2);
    }

    getMetabolismMultiplier() {
        return this.metabolismMultiplier;
    }

    updateBase(grid) {
        this.age++;
        if (this.speedMultiplier < 1.0) this.speedMultiplier += 0.001;

        // NEU: Differenzierung zwischen Herbivoren und Carnivoren für die Vermehrung
        const isHerbivore = this instanceof HerbivoreCell;

        // Herbivoren: 60% Energie nötig, mind. 300 Alter, 30 Frames Dauer, 300 Cooldown
        // Carnivoren: 90% Energie nötig, mind. 600 Alter, 60 Frames Dauer, 1000 Cooldown
        const energyRequired = isHerbivore ? 0.6 : 0.9;
        const minAgeRequired = isHerbivore ? 300 : 600;
        const reproFrames = isHerbivore ? 30 : 60;
        const cooldown = isHerbivore ? 300 : 1000;

        // Die Zelle muss die Energie-Schwelle erreichen, um den Fortpflanzungs-Modus zu starten
        if (this.energy >= this.getMaxEnergy() * energyRequired &&
            this.size >= this.genome.maxSize * 0.8 &&
            this.age > minAgeRequired &&
            this.birthCooldown === 0 &&
            !this.reproducing) {

            this.reproducing = true;
            this.reproTimer = 0;
        }

        // Der Geburtstanz & Spawnen
        if (this.reproducing) {
            this.reproTimer++;

            this.angle += (Math.PI * 4) / reproFrames;

            const danceSpeed = this.size * 0.5;
            this.x += Math.cos(this.angle) * danceSpeed;
            this.y += Math.sin(this.angle) * danceSpeed;

            if (this.reproTimer >= reproFrames) {
                this.angle = this.angle % (Math.PI * 2);
                this.energy /= 1.5; // Energie-Verlust bei der Geburt
                this.reproducing = false;
                this.hasReproduced = true;
                this.reproTimer = 0;
                this.birthCooldown = cooldown;

                return 'reproduce';
            }
            return 'stationary';
        }

        // Energieverbrauch (wird durch Größe/Stoffwechsel bestimmt)
        this.energy -= (this.genome.metabolism / (this.size / 2)) * this.getMetabolismMultiplier();

        return 'moving';
    }

    move(food) {
        let targetAngle = this.angle;
        let distanceToTarget = Infinity;

        // 1. Zielwinkel und Distanz berechnen
        if (food) {
            const dx = food.x - this.x;
            const dy = food.y - this.y;
            distanceToTarget = Math.sqrt(dx * dx + dy * dy);

            // --- NEU: ANTI-WACKEL-FIX ---
            // Wenn wir das Essen schon berühren, frieren wir die Bewegung ein!
            // So verhindern wir, dass die Zelle den Mittelpunkt überläuft und zittert.
            const eatRadius = this.size + (food.size || 2);
            if (distanceToTarget <= eatRadius) {
                return; // Keine weitere Bewegung und kein Drehen für diesen Frame
            }
            // ----------------------------

            targetAngle = Math.atan2(dy, dx);
        } else {
            targetAngle = this.angle + (Math.random() - 0.5) * 0.1;
        }

        const diff = (targetAngle - this.angle + Math.PI) % (2 * Math.PI) - Math.PI;

        // 2. Wendigkeit im Nahkampf
        let currentMaxTurn = 0.2;
        if (distanceToTarget < 30) {
            currentMaxTurn = 1.0;
        }

        this.angle += Math.max(-currentMaxTurn, Math.min(currentMaxTurn, diff));

        // 3. Volle Geschwindigkeit berechnen (inklusive Schwanz)
        const tailBonus = 1 + (this.tailSegments.length * 0.03);
        let currentSpeed = this.genome.speed * this.speedMultiplier * tailBonus;

        // 4. Die "Punktlandung"
        if (distanceToTarget < currentSpeed) {
            currentSpeed = distanceToTarget;
        }

        // 5. Bewegen
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;
    }

    findClosestInSight(candidates) {
        let closestTarget = null;
        let minDistance = Infinity;
        const maxRadius = this.genome.sightRange * 5;

        for (const entity of candidates) {
            const dx = entity.x - this.x;
            const dy = entity.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 1. Check: Ist das Ziel innerhalb der maximalen Sichtweite?
            if (distance > maxRadius) continue;

            // 2. Check: Ist das Ziel im Sichtkegel?
            const angleToEntity = Math.atan2(dy, dx);

            // Winkelunterschied berechnen und normalisieren (auf 0 bis PI)
            let angleDiff = Math.abs(angleToEntity - this.angle);
            angleDiff = angleDiff % (Math.PI * 2);
            if (angleDiff > Math.PI) {
                angleDiff = (Math.PI * 2) - angleDiff;
            }

            // Wenn der Unterschied kleiner/gleich dem halben Sichtfeld ist, sehen wir es!
            if (angleDiff <= this.genome.sightAngle) {
                // 3. Check: Ist es näher als das bisher nächste gefundene Ziel?
                if (distance < minDistance) {
                    minDistance = distance;
                    closestTarget = entity;
                }
            }
        }

        return closestTarget;
    }

    checkTargetTimeout() {
        if (this.target) {
            // 1. Fress-Check (Ziel berührt?)
            const tx = this.target.x - this.x;
            const ty = this.target.y - this.y;
            const distToTargetSq = tx * tx + ty * ty;
            const targetSize = this.target.size || 5;
            const eatRadius = this.size + targetSize + 5;

            if (distToTargetSq < eatRadius * eatRadius) {
                // Wir sind dicht genug am Ziel, alles zurücksetzen
                this.stuckTimer = 0;
                this.anchorX = this.x;
                this.anchorY = this.y;
            } else {
                // 2. Echter Feststeck-Check ("Zappel"-Erkennung für BEIDE Typen)
                this.stuckTimer++;

                // Wenn wir noch keinen Anker haben, setzen wir ihn jetzt auf die aktuelle Position
                if (this.anchorX === undefined) {
                    this.anchorX = this.x;
                    this.anchorY = this.y;
                }

                // Nach 40 Frames (weniger als 1 Sekunde) prüfen wir unsere WIRKLICHE Position
                if (this.stuckTimer > 40) {
                    const dx = this.x - this.anchorX;
                    const dy = this.y - this.anchorY;

                    // Satz des Pythagoras: Wie weit sind wir vom Anker entfernt?
                    const trueDistMovedSq = dx * dx + dy * dy;

                    // Sind wir in 40 Frames insgesamt weniger als 15 Pixel vorangekommen?
                    // (225 = 15 * 15). Das heißt: Wir zappeln nur oder stecken an einer Kante fest!
                    if (trueDistMovedSq < 225) {
                        this.target = null;
                        this.stuckTimer = 0;
                        this.anchorX = undefined;

                        // Stark wegdrehen, um aus der Sackgasse zu entkommen
                        this.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.8);
                        return; // Check hier sofort beenden
                    }

                    // Ansonsten: Wir haben freie Bahn und jagen weiter!
                    // Timer resetten und neuen Anker für die nächste Messung setzen.
                    this.stuckTimer = 0;
                    this.anchorX = this.x;
                    this.anchorY = this.y;
                }
            }
        } else {
            // Kein Ziel -> Alles auf Null
            this.stuckTimer = 0;
            this.anchorX = undefined;
        }
    }
}

class HerbivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);
        this.color = 'orange';
        this.metabolismMultiplier = 1.0;
        this.target = null;
        this.threat = null;
        this.genome.speed = this.genome.speed * 0.8;
    }

    getMetabolismMultiplier() {
        let multiplier = this.metabolismMultiplier;
        if (!this.hasReproduced) multiplier *= 1.2;
        multiplier -= (this.tailSegments.length * 0.05);
        return Math.max(0.8, multiplier);
    }

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        const entitiesInArea = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange * 5);
        const predators = entitiesInArea.filter(e => e instanceof CarnivoreCell && e.alive);

        this.threat = null;
        let minPredatorDist = Infinity;
        const panicRadius = this.genome.sightRange * 2;

        for (const p of predators) {
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= panicRadius && dist < minPredatorDist) {
                minPredatorDist = dist;
                this.threat = p;
            }
        }

        if (this.threat) {
            this.target = null;
            this.targetTimer = 0;

            // --- NEU: FLUCHT MIT KOLLISIONS-CHECK ---
            // Wir berechnen den idealen Fluchtweg
            let fleeAngle = Math.atan2(this.x - this.threat.x, this.y - this.threat.y);

            // Wir testen, ob der Weg frei ist
            const testDist = 20;
            const testX = this.x + Math.cos(fleeAngle) * testDist;
            const testY = this.y + Math.sin(fleeAngle) * testDist;

            const obstacles = grid.getEntitiesInArea(testX, testY, 10)
                .filter(e => e.type === 'plant' || e.type === 'stone');

            // Wenn wir gegen eine Wand rennen würden, drehen wir den Fluchtwinkel leicht zur Seite
            if (obstacles.length > 0) {
                fleeAngle += Math.PI / 4; // 45 Grad Ausweichmanöver
            }

            const fleeTarget = {
                x: this.x + Math.cos(fleeAngle) * 100,
                y: this.y + Math.sin(fleeAngle) * 100
            };

            this.move(fleeTarget);
            this.energy -= 0.05;
            return status;
        }

        this.checkTargetTimeout();
        if (!this.target || !this.target.alive) {
            const plants = entitiesInArea.filter(e => e.type === 'plant' && e.alive);
            this.target = this.findClosestInSight(plants);
            this.targetTimer = 0;
        }

        this.move(this.target);
        return status;
    }
}

class CarnivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);
        this.color = 'red';
        this.metabolismMultiplier = 0.8; // Increased from 0.5 to starve faster
        this.genome.sightRange = 500;
        this.genome.sightAngle = Math.PI * 0.5;
    }

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        this.checkTargetTimeout(); // <--- NEU: Überprüfen, ob sie feststeckt

        if (!this.target || !this.target.alive) {
            const potentialFood = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange * 5);

            const herbivores = potentialFood.filter(e => e instanceof HerbivoreCell && e.alive);
            this.target = this.findClosestInSight(herbivores);

            if (!this.target) {
                const smallerCarnivores = potentialFood.filter(e =>
                    e instanceof CarnivoreCell &&
                    e.alive &&
                    e !== this &&
                    this.size > e.size
                );
                this.target = this.findClosestInSight(smallerCarnivores);
            }

            this.targetTimer = 0; // <--- NEU: Timer reset bei neuem Ziel
        }

        this.move(this.target);
        return status;
    }
}

class TailSegment extends BaseCell {
    constructor(x, y, parent, size) {
        super(x, y, null);
        this.type = 'tail';
        this.color = parent ? parent.color : 'grey';
        this.parent = parent;
        this.size = size;
    }

    update() {
        if (this.parent) {
            const dx = this.parent.x - this.x;
            const dy = this.parent.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const targetDist = this.parent.size + 2; 
            if (dist > targetDist) {
                const angle = Math.atan2(dy, dx);
                this.x = this.parent.x - Math.cos(angle) * targetDist;
                this.y = this.parent.y - Math.sin(angle) * targetDist;
            }
        }
    }
}
