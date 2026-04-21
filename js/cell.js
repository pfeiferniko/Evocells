class Genome {
    constructor(data = {}) {
        this.speed = data.speed || window.SETTINGS.GENOME_SPEED;
        this.maxSize = data.maxSize || window.SETTINGS.GENOME_MAX_SIZE;
        this.sightRange = data.sightRange || window.SETTINGS.GENOME_SIGHT_RANGE;
        this.sightAngle = data.sightAngle || window.SETTINGS.GENOME_SIGHT_ANGLE;
        this.metabolism = data.metabolism || window.SETTINGS.GENOME_METABOLISM;
        this.maxEnergy = data.maxEnergy || window.SETTINGS.GENOME_MAX_ENERGY;
        this.minAgeForReproduction = data.minAgeForReproduction || window.SETTINGS.GENOME_MIN_AGE_REPRO;
    }

    mutate() {
        //this.speed += (Math.random() - 0.5) * 0.2;
        this.maxSize += (Math.random() - 0.5) * 2.0;
        this.maxEnergy += (Math.random() - 0.5) * 10;
        //this.minAgeForReproduction += (Math.random() - 0.5) * 100;
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
        // --- NEU: Variable Maximalgröße ---
        if (this.isSuper) {
            // Super-Pflanzen: Zufallswert um die Basisgröße herum
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_SUPER_BASE + Math.random() * 3;
        } else {
            // Normale Pflanzen: Fixe Größe
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_NORMAL;
        }

        if (this.isSuper) {
            // Super-Pflanze: Lila (Farbton 282), Helligkeit variiert zufällig zwischen 35% und 55%
            const lightness = Math.floor(35 + Math.random() * 20);
            this.color = `hsl(282, 100%, ${lightness}%)`;
        } else {
            // Normale Pflanze: Grün (Farbton schwankt minimal zwischen 110 und 130), Helligkeit zwischen 25% und 45%
            const hue = Math.floor(110 + Math.random() * 20);
            const lightness = Math.floor(25 + Math.random() * 20);
            this.color = `hsl(${hue}, 90%, ${lightness}%)`;
        }

        this.parent = parent;
        this.age = 0;
        this.shouldGrow = false;
        this.isTip = true;

        this.pulseOffset = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.001 + Math.random() * 0.002;
    }

    // Nimmt jetzt den isStartup-Wert aus der main.js entgegen
    update(isStartup = false) {
        this.age++;

        let growthRate = isStartup ? window.SETTINGS.PLANT_GROWTH_RATE_STARTUP : window.SETTINGS.PLANT_GROWTH_RATE_NORMAL;

        if (this.isSuper) {
            growthRate *= window.SETTINGS.PLANT_GROWTH_RATE_SUPER_MULT;
        }

        if (this.size < this.maxSize) {
            this.size += growthRate;
        }

        const requiredAge = isStartup ? window.SETTINGS.PLANT_REQUIRED_AGE_STARTUP : (this.isSuper ? window.SETTINGS.PLANT_REQUIRED_AGE_SUPER : window.SETTINGS.PLANT_REQUIRED_AGE_NORMAL);
        const growChance = isStartup ? window.SETTINGS.PLANT_GROW_CHANCE_STARTUP : (this.isSuper ? window.SETTINGS.PLANT_GROW_CHANCE_SUPER : window.SETTINGS.PLANT_GROW_CHANCE_NORMAL);

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
            // Basis-Helligkeit berechnen (zwischen 50 und 110)
            const baseGray = Math.floor(50 + Math.random() * 60);

            // NEU: Der Grün-Wert wird um 30 bis 50 Punkte erhöht,
            // rot und blau bleiben auf dem Basis-Wert. Das ergibt den Grünstich (Moos-Effekt).
            const r = baseGray;
            const g = baseGray + Math.floor(30 + Math.random() * 20);
            const b = baseGray;

            this.color = `rgb(${r}, ${g}, ${b})`;
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
        this.reproductionCount = 0; // Wie oft hat das Tier schon Kinder bekommen?
        this.maxReproductions = 1;  // Standardwert (wird von Pflanzen-/Fleischfressern überschrieben)
        this.agingFactor = 1.0; // <--- NEU: Startet bei 100% Fitness
        this.isEaten = false;
        this.graceTimer = 0; // NEU: Wenn > 0, kann das Tier nicht durch reinen Energieverlust sterben
        this.wigglePhase = Math.random() * Math.PI * 2;
        this.currentWiggleSpeed = 0.05;
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

        // --- NEU: Altersschwäche ---
        if (this.reproductionCount >= this.maxReproductions) {
            if (this.agingFactor > window.SETTINGS.AGING_MIN_FACTOR) {
                this.agingFactor -= window.SETTINGS.AGING_DECAY_RATE;
            }
        }

        // Zieht in jedem Frame 1 ab, bis er wieder bei 0 ist, damit das Tier wieder bereit wird.
        if (this.birthCooldown > 0) {
            this.birthCooldown--;
        }
        
        if ((this.ignoreTargetTimer || 0) > 0) {
            this.ignoreTargetTimer--;
        }

        // FIX: Wir nutzen die "echte" Größe für den Schwanz.
        // Wenn das Tier gerade gebärt (und angeschwollen ist), nehmen wir die gemerkte Originalgröße.
        const trueSize = this.reproducing ? this.originalSizeBeforeBirth : this.size;
        const targetTailDepth = Math.floor(trueSize);

        // NEU: Wir messen die echte "Länge" (Tiefe) des Schwanzes, nicht mehr nur die Array-Größe
        const currentDepth = this.tailSegments.length > 0 ? Math.max(...this.tailSegments.map(t => t.depth)) : 0;

        if (currentDepth < targetTailDepth) {
            this.shouldGrowTail = true;
        }

        // Differenzierung zwischen Herbivoren und Carnivoren für die Vermehrung
        const isHerbivore = this instanceof HerbivoreCell;

        const energyRequired = isHerbivore ? window.SETTINGS.HERB_ENERGY_REQUIRED_REPRO : window.SETTINGS.CARN_ENERGY_REQUIRED_REPRO;
        const minAgeRequired = isHerbivore ? window.SETTINGS.HERB_MIN_AGE_REPRO : window.SETTINGS.CARN_MIN_AGE_REPRO;
        const reproFrames = isHerbivore ? window.SETTINGS.HERB_REPRO_FRAMES : window.SETTINGS.CARN_REPRO_FRAMES;
        const cooldown = isHerbivore ? window.SETTINGS.HERB_COOLDOWN_REPRO : window.SETTINGS.CARN_COOLDOWN_REPRO;

        // Die Zelle muss die Energie-Schwelle erreichen, um den Fortpflanzungs-Modus zu starten
        if (this.energy >= this.getMaxEnergy() * energyRequired &&
            this.size >= this.genome.maxSize * 0.8 &&
            this.age > minAgeRequired &&
            this.birthCooldown === 0 &&
            !this.reproducing &&
            this.reproductionCount < this.maxReproductions) { // <--- NEU: Check gegen das Limit

            this.reproducing = true;
            this.reproTimer = 0;
            this.originalSizeBeforeBirth = this.size;
        }

// --- ÜBERARBEITETE GEBURTS-ANIMATION (Anschwellen) ---
        if (this.reproducing) {
            this.reproTimer++;

            const progress = this.reproTimer / reproFrames; // 0.0 bis 1.0

            // 1. Das Tier bleibt KOMPLETT stehen. Keine Drehung, kein Rutschen mehr.
            // Die x/y Position bleibt exakt, wo sie ist.

            // 2. Das Anschwellen berechnen (Dezente 25% größer)
            if (this.originalSizeBeforeBirth) {
                const bloatFactor = 1.0 + (Math.sin(progress * Math.PI) * 0.25);
                this.size = this.originalSizeBeforeBirth * bloatFactor;
            }

            // --- NEU: Der Schwanz zappelt während der Geburt weiter! ---
            // Wir lassen das Tier etwas schneller und unruhiger wackeln ("Wehen"),
            // aber ohne dass es sich von der Stelle bewegt.
            const personalMultiplier = this.wiggleSpeedMultiplier || 1.0;
            const contractionSpeed = 0.2 * personalMultiplier; // Unruhiges Zappeln

            // Stoßdämpfer-Logik für einen weichen Übergang vom Schwimmen in die Wehen
            this.currentWiggleSpeed += (contractionSpeed - this.currentWiggleSpeed) * 0.1;
            this.wigglePhase += this.currentWiggleSpeed * 0.3;

            // 3. Zusätzlicher Energieverbrauch durch die Anstrengung
            this.energy -= 0.02;

            // --- MOMENT DER GEBURT ---
            if (this.reproTimer >= reproFrames) {
                // Ruckartig auf Originalgröße zurücksetzen! ("Pop"-Effekt)
                this.size = this.originalSizeBeforeBirth;
                this.originalSizeBeforeBirth = undefined; // Speicher leeren

                this.angle = this.angle % (Math.PI * 2);
                this.energy /= 1.5; // Energie-Verlust bei der Geburt
                this.reproducing = false;
                this.hasReproduced = true;
                this.reproductionCount++;
                this.reproTimer = 0;
                this.birthCooldown = cooldown;

                return 'reproduce';
            }
            // 'stationary' sorgt dafür, dass die KI kein neues Futter sucht
            return 'stationary';
        }

        // --- NEU: Angepasster Energieverbrauch ---
        // Basis-Verbrauch berechnen
        //let consumption = (this.genome.metabolism / (this.size / 2)) * this.getMetabolismMultiplier();
        let consumption = this.genome.metabolism * (1 + (this.size * 0.1)) * this.getMetabolismMultiplier();

        // Pflanzenfresser sind effizienter und verlieren weniger Energie
        if (isHerbivore) {
            consumption *= window.SETTINGS.HERB_METABOLISM_DISCOUNT;
        }

        // --- NEU: Extremer Altersschwäche-Stoffwechsel ---
        // Durch die Division (1.0 / agingFactor) explodiert der Verbrauch am Ende:
        consumption = consumption * (1.0 / this.agingFactor);

        this.energy -= consumption;

        // Wenn der Grace-Timer aktiv ist, darf die Energie nicht unter 0.1 fallen 
        // (das Tier stirbt erst, wenn es wirklich vom Räuber aufgegessen wurde)
        if (this.graceTimer > 0) {
            this.graceTimer--;
            if (this.energy <= 0) {
                this.energy = 0.1; 
            }
        }

        return 'moving';
    }

    move(food, isFleeing = false) {
        let targetAngle = this.angle;
        let distanceToTarget = Infinity;
        let targetWiggleSpeed = 0.05; // Ziel-Takt für diesen Frame (Standard: Ruhig)

        // 1. Zielwinkel und Distanz berechnen
        if (food) {
            const dx = food.x - this.x;
            const dy = food.y - this.y;
            distanceToTarget = Math.sqrt(dx * dx + dy * dy);

            const eatRadius = this.size + (food.size || 2);
            if (!isFleeing && distanceToTarget <= eatRadius) {
                // TIER FRISST: Steht still.
                // Wir glätten den Übergang zum ruhigen Wedeln und brechen die Vorwärtsbewegung ab.
                this.currentWiggleSpeed += (0.05 - this.currentWiggleSpeed) * 0.1;
                this.wigglePhase += this.currentWiggleSpeed * 0.3;
                return;
            }

            targetAngle = Math.atan2(dy, dx);
        } else {
            targetAngle = this.angle + (Math.random() - 0.5) * 0.1;
        }

        const diff = (targetAngle - this.angle + Math.PI) % (2 * Math.PI) - Math.PI;

        // 2. Wendigkeit
        let currentMaxTurn = window.SETTINGS.TURN_SPEED_NORMAL;
        if (!isFleeing && distanceToTarget < 30) {
            currentMaxTurn = window.SETTINGS.TURN_SPEED_COMBAT;
        }
        this.angle += Math.max(-currentMaxTurn, Math.min(currentMaxTurn, diff));

        // 3. Geschwindigkeit berechnen
        const sizeBonusMultiplier = 1 + (this.size * 0.02);
        let currentSpeed = this.genome.speed * this.speedMultiplier * this.agingFactor * sizeBonusMultiplier;

        if (distanceToTarget < currentSpeed) {
            currentSpeed = distanceToTarget;
        }

        // 4. Bewegen
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        // --- NEU: Takt fließend anpassen (Stoßdämpfer + Größen-Einfluss) ---

        // Die magische Zahl 4 sorgt dafür, dass ein großes Tier (Größe 10)
        // wieder bei deinem gewünschten Faktor von ca. 0.4 landet (4 / 10 = 0.4).
        // Ein Baby (Größe 2) hat hingegen einen Faktor von 2.0 (4 / 2 = 2.0) und wedelt viel schneller!
        const sizeWiggleFactor = 4 / Math.max(2, this.size);

        // Wir haben das absolute Limit von 0.8 auf 1.2 erhöht,
        // damit die kleinen Babys bei der Flucht auch wirklich richtig schnell zappeln dürfen.
        targetWiggleSpeed = 0.05 + Math.min(currentSpeed * sizeWiggleFactor, 1.2);

        this.currentWiggleSpeed += (targetWiggleSpeed - this.currentWiggleSpeed) * 0.1;
        this.wigglePhase += this.currentWiggleSpeed * 0.3;
    }

    findClosestInSight(candidates, currentTarget = null) {
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
                let effectiveDistance = distance;
                
                // Stickiness: Das aktuelle Ziel wird behandelt, als wäre es viel näher!
                if (entity === currentTarget) {
                    effectiveDistance -= window.SETTINGS.HUNT_TARGET_STICKINESS;
                }

                if (effectiveDistance < minDistance) {
                    minDistance = effectiveDistance;
                    closestTarget = entity;
                }
            }
        }

        return closestTarget;
    }

    // NEU: Sucht das beste Ziel basierend auf Distanz UND Geschwindigkeit
    findSlowestInSight(candidates, grid, currentTarget = null) {
        let bestTarget = null;
        let bestScore = Infinity; // Der niedrigste Score gewinnt
        const maxRadius = this.genome.sightRange * 5;

        // NEU: Sind wir ein erwachsener Räuber (kein Babyschutz mehr)?
        // Babyschutz ist bei Größe < maxSize * 0.5 (aus der update-Schleife)
        const isAdultCarnivore = (this instanceof CarnivoreCell) && (this.size >= this.genome.maxSize * 0.5);
        let rivals = [];

        // Wenn ja, suchen wir einmalig alle anderen großen Räuber in der Nähe,
        // um ihre Aura zu meiden
        if (isAdultCarnivore && grid) {
            const avoidRadius = window.SETTINGS.HUNT_RIVAL_AVOID_RADIUS;
            rivals = grid.getEntitiesInArea(this.x, this.y, maxRadius + avoidRadius).filter(e => 
                e instanceof CarnivoreCell && 
                e.alive && 
                e !== this && 
                e.size >= e.genome.maxSize * 0.5 // Nur andere erwachsene Räuber als Gefahr werten
            );
        }

        for (const entity of candidates) {
            const dx = entity.x - this.x;
            const dy = entity.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 1. Check: Ist das Ziel innerhalb der maximalen Sichtweite?
            if (distance > maxRadius) continue;

            // 2. Check: Ist das Ziel im Sichtkegel?
            const angleToEntity = Math.atan2(dy, dx);
            let angleDiff = Math.abs(angleToEntity - this.angle);
            angleDiff = angleDiff % (Math.PI * 2);
            if (angleDiff > Math.PI) {
                angleDiff = (Math.PI * 2) - angleDiff;
            }

            if (angleDiff <= this.genome.sightAngle) {
                // 3. Wie schnell ist das Ziel?
                const sizeBonusMultiplier = 1 + (entity.size * 0.02);
                const currentSpeed = entity.genome.speed * entity.speedMultiplier * entity.agingFactor * sizeBonusMultiplier;

                // --- Basis-Jagd-Score (Distanz + Geschwindigkeit) ---
                const speedWeight = window.SETTINGS.HUNT_SCORE_SPEED_WEIGHT;
                const distanceWeight = window.SETTINGS.HUNT_SCORE_DISTANCE_WEIGHT;
                let score = (distance * distanceWeight) + (currentSpeed * speedWeight);

                // --- STICKINESS-BONUS ---
                // Wenn dies unser aktuelles Ziel ist, ziehen wir Punkte ab, 
                // um es künstlich "attraktiver" zu machen als gleichwertige Alternativen
                if (entity === currentTarget) {
                    score -= window.SETTINGS.HUNT_TARGET_STICKINESS;
                }

                // --- NEU: Rivalitäts-Strafe ---
                // Wenn wir ein erwachsener Räuber sind, prüfen wir, ob dicke Konkurrenten beim Essen stehen
                if (isAdultCarnivore) {
                    for (const rival of rivals) {
                        const rdx = entity.x - rival.x;
                        const rdy = entity.y - rival.y;
                        const distToRival = Math.sqrt(rdx * rdx + rdy * rdy);

                        // Wenn das Essen näher als 300px an einem Rivalen dran ist...
                        if (distToRival < window.SETTINGS.HUNT_RIVAL_AVOID_RADIUS) {
                            // ...bekommt dieses Essen einen saftigen Straf-Score aufgedrückt.
                            // Je näher der Rivale am Essen ist, desto höher die Strafe.
                            // (Max Strafe wenn Rivale direkt draufsteht, 0 Strafe wenn 300px entfernt)
                            const penaltyFactor = 1.0 - (distToRival / window.SETTINGS.HUNT_RIVAL_AVOID_RADIUS);
                            score += penaltyFactor * window.SETTINGS.HUNT_SCORE_RIVAL_PENALTY;
                        }
                    }
                }

                // Ist dieser Score besser (niedriger) als unser bisheriger Bestwert?
                if (score < bestScore) {
                    bestScore = score;
                    bestTarget = entity;
                }
            }
        }

        return bestTarget;
    }

    checkTargetTimeout() {
        if (this.target) {
            // 1. Fress-Check (Ziel berührt?)
            const tx = this.target.x - this.x;
            const ty = this.target.y - this.y;
            const distToTargetSq = tx * tx + ty * ty;
            const targetSize = this.target.size || 5;
            const eatRadius = this.size + targetSize + 5;

            if (distToTargetSq < eatRadius * eatRadius || this.reproducing) {
                // Wir sind dicht genug am Ziel, alles zurücksetzen
                this.stuckTimer = 0;
                this.anchorX = this.x;
                this.anchorY = this.y;
                this.accumulatedDist = 0;
            } else {
                // 2. Echter Feststeck-Check ("Zappel"-Erkennung für BEIDE Typen)
                this.stuckTimer++;

                // Wenn wir noch keinen Anker haben, setzen wir ihn jetzt auf die aktuelle Position
                if (this.anchorX === undefined) {
                    this.anchorX = this.x;
                    this.anchorY = this.y;
                    this.accumulatedDist = 0;
                }

                if (this.lastX !== undefined) {
                    const frameDx = this.x - this.lastX;
                    const frameDy = this.y - this.lastY;
                    this.accumulatedDist += Math.sqrt(frameDx * frameDx + frameDy * frameDy);
                }
                this.lastX = this.x;
                this.lastY = this.y;

                // Nach X Frames prüfen wir unsere WIRKLICHE Position
                if (this.stuckTimer > window.SETTINGS.STUCK_TIMER_MAX) {
                    // --- ANGEPASSTE LOGIK ---
                    const minMovement = window.SETTINGS.STUCK_MIN_MOVEMENT * this.agingFactor;

                    // NEU: Wir checken die ECHTE zurückgelegte Strecke (Accumulator), nicht nur Start-End-Differenz.
                    // Wenn das Tier abprallt und zurückschwimmt, hat es sich bewegt!
                    if (this.accumulatedDist < minMovement) {
                        this.target = null;
                        this.stuckTimer = 0;
                        this.anchorX = undefined;
                        this.accumulatedDist = 0;
                        this.ignoreTargetTimer = 60; // Set ignore timer

                        // --- VERBESSERTE AUSBRUCH-LOGIK ---
                        const r = Math.random();
                        if (r < 0.45) {
                            // 45% Chance: Drehung nach links
                            this.angle += (Math.PI * 0.5) + Math.random() * Math.PI;
                        } else if (r < 0.9) {
                            // 45% Chance: Drehung nach rechts
                            this.angle -= (Math.PI * 0.5) + Math.random() * Math.PI;
                        } else {
                            // 10% Chance: Gar nicht drehen, einfach nur das Ziel vergessen
                            // (Hilft, wenn sie nur leicht schräg hängen)
                        }
                        return;
                    }

                    // Ansonsten: Alles ok, einfach weiter messen
                    this.stuckTimer = 0;
                    this.anchorX = this.x;
                    this.anchorY = this.y;
                    this.accumulatedDist = 0;
                }
            }
        } else {
            // Kein Ziel -> Alles auf Null
            this.stuckTimer = 0;
            this.anchorX = undefined;
            this.accumulatedDist = 0;
        }
    }

    flee(threat, grid) {
        this.target = null;
        this.targetTimer = 0;

        // Idealer Fluchtwinkel: direkt weg von der Gefahr
        let idealFleeAngle = Math.atan2(this.y - threat.y, this.x - threat.x);
        
        const testDist = window.SETTINGS.FLEE_TEST_DISTANCE; 
        let bestAngle = idealFleeAngle;
        let isPathClear = false;

        const validAngles = [];
        const step = window.SETTINGS.FLEE_ANGLE_STEP; 
        const maxOffset = window.SETTINGS.FLEE_MAX_OFFSET;

        // Fächersuche: Wir sammeln alle Winkel, die frei von Hindernissen sind
        for (let offset = 0; offset <= maxOffset; offset += step) {
            const anglesToTest = offset === 0 ? [idealFleeAngle] : [idealFleeAngle + offset, idealFleeAngle - offset];
            
            for (const testAngle of anglesToTest) {
                const testX = this.x + Math.cos(testAngle) * testDist;
                const testY = this.y + Math.sin(testAngle) * testDist;

                // Welt-Grenzen (Spielfeldrand) berücksichtigen
                const isOutOfBounds = testX < 30 || testX > (window.WORLD_WIDTH || 2000) - 30 || testY < 30 || testY > (window.WORLD_HEIGHT || 1000) - 30;
                
                if (!isOutOfBounds) {

                    const obstacles = grid.getEntitiesInArea(testX, testY, 15)
                        .filter(e => {
                            // Steine sind immer eine Wand, für alle Tiere
                            if (e.type === 'stone') return true;

                            // NEU: Pflanzen sind nur für Pflanzenfresser ein Hindernis auf der Flucht.
                            // Fleischfresser ignorieren sie bei der Wegfindung komplett!
                            if (e.type === 'plant' && !(this instanceof CarnivoreCell)) return true;

                            return false;
                        });
                    
                    if (obstacles.length === 0) {
                        validAngles.push(testAngle);
                    }
                }
            }
        }

        if (validAngles.length > 0) {
            // Wir suchen den Winkel, der:
            // 1. So nah wie möglich am "idealen Fluchtwinkel" ist (also weg vom Feind)
            // 2. Aber WENN mehrere Wege ähnlich gut sind, nehmen wir den, der unserer aktuellen Blickrichtung entspricht
            let bestScore = Infinity;
            
            for (const angle of validAngles) {
                // Differenz zum idealen Fluchtwinkel (wie weit weicht er von der perfekten Flucht ab?)
                let diffToIdeal = Math.abs(angle - idealFleeAngle) % (Math.PI * 2);
                if (diffToIdeal > Math.PI) diffToIdeal = (Math.PI * 2) - diffToIdeal;

                // Differenz zur aktuellen Blickrichtung (wie sehr muss sich das Tier drehen?)
                let diffToCurrent = Math.abs(angle - this.angle) % (Math.PI * 2);
                if (diffToCurrent > Math.PI) diffToCurrent = (Math.PI * 2) - diffToCurrent;

                // Score berechnen
                let score = (diffToIdeal * window.SETTINGS.FLEE_SCORE_IDEAL_WEIGHT) + (diffToCurrent * window.SETTINGS.FLEE_SCORE_CURRENT_WEIGHT);
                
                if (score < bestScore) {
                    bestScore = score;
                    bestAngle = angle;
                }
            }
            isPathClear = true;
        } else {
            // Wenn wirklich ALLES blockiert ist (Sackgasse), wollen wir zumindest
            // NICHT in den Gegner rennen. 
            // idealFleeAngle ist WEG vom Gegner.
            // Der alte Code (idealFleeAngle + Math.PI) hat den Winkel um 180 Grad gedreht,
            // was bedeutet, er hat ZUM Gegner gezeigt.
            bestAngle = idealFleeAngle; 
            
            // Notfall-Wackeln, um sich aus einer engen Ecke zu befreien
            bestAngle += (Math.random() - 0.5) * Math.PI; 
        }

        // Ziel für die Bewegung setzen.
        const fleeTarget = {
            x: this.x + Math.cos(bestAngle) * window.SETTINGS.FLEE_TARGET_DISTANCE,
            y: this.y + Math.sin(bestAngle) * window.SETTINGS.FLEE_TARGET_DISTANCE
        };

        this.currentFleeTarget = fleeTarget; // Für Debug-Linien speichern

        this.move(fleeTarget, true);
    }
}

class HerbivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);

        const r = Math.floor(200 + Math.random() * 55);
        const g = Math.floor(100 + Math.random() * 80);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        // Helligkeit auf 20% bis 35% setzen (schön dunkel) und Sättigung minimal runter
        const lightness = Math.floor(20 + Math.random() * 15);
        this.dotColor = `hsl(${hue}, 80%, ${lightness}%)`;

        this.metabolismMultiplier = 1.0;
        this.target = null;
        this.threat = null;
        this.maxReproductions = window.SETTINGS.HERB_MAX_REPRODUCTIONS;
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

        let panicRadius = this.genome.sightRange * window.SETTINGS.FLEE_PANIC_RADIUS_HERBIVORE;
        
        // --- HYSTERESE-BONUS ---
        // Wenn das Tier im letzten Frame bereits auf der Flucht war,
        // addieren wir den Bonus, damit es nicht sofort aufhört zu fliehen, 
        // wenn der Räuber nur 1 Pixel außerhalb des normalen Radius ist.
        if (this.threat) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        const searchRadius = Math.max(this.genome.sightRange * 5, panicRadius + 50);
        const entitiesInArea = grid.getEntitiesInArea(this.x, this.y, searchRadius);

        // --- NEU: Größen-Check bei der Feinderkennung ---
        const predators = entitiesInArea.filter(e =>
            e instanceof CarnivoreCell &&
            e.alive &&
            e.size >= this.size // <-- NEU: Der Jäger MUSS größer sein als der Pflanzenfresser
        );

        this.threat = null;
        let minPredatorDist = Infinity;

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
            this.flee(this.threat, grid);
            return status;
        } else {
            this.currentFleeTarget = null;
        }

        this.checkTargetTimeout();
        if ((this.ignoreTargetTimer || 0) <= 0) {
            // Wir aktualisieren das Ziel regelmäßig (alle 15 Frames) oder wenn wir keins haben
            if (!this.target || !this.target.alive || this.age % 15 === 0) {
                const plants = entitiesInArea.filter(e => e.type === 'plant' && e.alive);
                const newTarget = this.findClosestInSight(plants, this.target);
                
                if (newTarget) {
                    this.target = newTarget;
                    this.targetTimer = 0;
                } else if (!this.target || !this.target.alive) {
                    this.target = null;
                }
            }
        } else {
            this.target = null;
        }

        this.move(this.target);
        return status;
    }
}

class CarnivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);

        const r = Math.floor(150 + Math.random() * 105);
        const g = Math.floor(Math.random() * 40);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        // Helligkeit auf 20% bis 35% setzen (schön dunkel) und Sättigung minimal runter
        const lightness = Math.floor(20 + Math.random() * 15);
        this.dotColor = `hsl(${hue}, 80%, ${lightness}%)`;

        this.metabolismMultiplier = 0.8; // Increased from 0.5 to starve faster
        this.genome.sightRange = window.SETTINGS.CARN_SIGHT_RANGE_MULTIPLIER;
        this.genome.sightAngle = window.SETTINGS.CARN_SIGHT_ANGLE;
        this.maxReproductions = window.SETTINGS.CARN_MAX_REPRODUCTIONS;
        this.size = 3;
    }

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        this.checkTargetTimeout(); // Überprüfen, ob sie feststeckt

        // Ziel aufgeben, falls die Beute inzwischen wächst und plötzlich größer ist
        if (this.target && this.target.size > this.size && !(this.target instanceof CarnivoreCell)) {
            this.target = null;
        }

        // Wir berechnen den Aggro-Radius zuerst, da er die Basis für alles andere ist
        const aggroRadius = this.size * 4 + 50;

        // --- NEU: Fluchtradius gekoppelt an Aggro-Radius ---
        // Er sieht die Bedrohung nun DEUTLICH weiter weg (wird in den Settings eingestellt)
        let panicRadius = aggroRadius * window.SETTINGS.FLEE_PANIC_RADIUS_CARNIVORE;

        // --- HYSTERESE-BONUS ---
        if (this.threat) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        // Suchradius für das Grid (das größte von beiden)
        const entitiesInArea = grid.getEntitiesInArea(this.x, this.y, panicRadius + 50);

        // --- 1. FLUCHT VOR GRÖSSEREN RÄUBERN ---
        this.threat = null;
        let minPredatorDist = Infinity;

        // NEU: Ist das Tier noch ein Baby? (Unter 50% der Maximalgröße)
        const isBaby = this.size < this.genome.maxSize * 0.5;

        // Fluchtinstinkt greift erst, wenn es kein Baby mehr ist
        if (!isBaby) {
            const largerPredators = entitiesInArea.filter(e =>
                e instanceof CarnivoreCell &&
                e.alive &&
                e !== this &&
                e.size > this.size
            );

            for (const p of largerPredators) {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= panicRadius && dist < minPredatorDist) {
                    minPredatorDist = dist;
                    this.threat = p;
                }
            }

            if (this.threat) {
                this.flee(this.threat, grid);
                return status;
            } else {
                this.currentFleeTarget = null;
            }
        } else {
            this.currentFleeTarget = null;
        }

        // --- 2. REVIERVERHALTEN (Alpha-Kämpfe) ---
        const isAdult = this.size >= this.genome.maxSize * 0.85;

        // Wenn unser aktuelles Ziel ein Rivale ist, aber er flieht
        if (this.target && this.target instanceof CarnivoreCell) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > aggroRadius * 1.5) {
                this.target = null;
            }
        }

        if (isAdult && (!this.target || !(this.target instanceof CarnivoreCell))) {
            const nearbyRivals = entitiesInArea.filter(e =>
                e instanceof CarnivoreCell &&
                e.alive &&
                e !== this &&
                e.size <= this.size &&
                e.size >= this.size * 0.6
            );

            let closestRival = null;
            let minDist = Infinity;

            for (const rival of nearbyRivals) {
                const dist = Math.sqrt((rival.x - this.x)**2 + (rival.y - this.y)**2);
                if (dist <= aggroRadius && dist < minDist) {
                    minDist = dist;
                    closestRival = rival;
                }
            }

            if (closestRival) {
                this.target = closestRival;
                this.targetTimer = 0;
            }
        }

        // --- 3. NORMALE JAGD ---
        if ((this.ignoreTargetTimer || 0) <= 0) {
            // Wir suchen regelmäßig (alle 10 Frames) oder wenn wir kein Ziel haben
            if (!this.target || !this.target.alive || this.age % 10 === 0) {
                // Für die Jagd schauen wir wieder etwas weiter
                const huntEntities = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange * 5);

                const herbivores = huntEntities.filter(e =>
                    e instanceof HerbivoreCell &&
                    e.alive &&
                    e.size <= this.size
                );
                let newTarget = this.findSlowestInSight(herbivores, grid, this.target);

                if (!newTarget) {
                    const smallerCarnivores = huntEntities.filter(e =>
                        e instanceof CarnivoreCell &&
                        e.alive &&
                        e !== this &&
                        e.size < this.size
                    );
                    newTarget = this.findSlowestInSight(smallerCarnivores, grid, this.target);
                }

                if (newTarget) {
                    this.target = newTarget;
                    this.targetTimer = 0;
                } else if (!this.target || !this.target.alive) {
                    this.target = null;
                }
            }
        } else {
            this.target = null;
        }

        this.move(this.target);
        return status;
    }
}

class TailSegment extends BaseCell {
    // NEU: 'branch' statt 'sideOffset'
    constructor(x, y, parent, size, branch = 0, depth = 1) {
        super(x, y, null);
        this.type = 'tail';
        this.color = parent ? parent.color : 'grey';
        this.dotColor = parent ? parent.dotColor : 'white';
        this.parent = parent;
        this.size = size;
        this.branch = branch; // -1 für links, 1 für rechts, 0 für mittig
        this.depth = depth;

        this.spineX = x;
        this.spineY = y;
    }

    update() {
        if (this.parent) {
            // NEU: Das Segment folgt immer dem ZENTRALEN Rückgrat des Elternteils,
            // nicht dessen echter, zur Seite verschobener Position!
            const targetX = this.parent.spineX !== undefined ? this.parent.spineX : this.parent.x;
            const targetY = this.parent.spineY !== undefined ? this.parent.spineY : this.parent.y;

            const dx = targetX - this.spineX;
            const dy = targetY - this.spineY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const targetDist = this.parent.size + 2;
            let angle = Math.atan2(dy, dx);

            if (dist > targetDist) {
                this.spineX = targetX - Math.cos(angle) * targetDist;
                this.spineY = targetY - Math.sin(angle) * targetDist;
            }

            // --- NEU: Wiggle-Effekt berechnen ---
            // 1. Wir suchen das Haupt-Tier, um seinen Takt (wigglePhase) abzufragen
            let rootAnimal = this.parent;
            while (rootAnimal && rootAnimal.type === 'tail') {
                rootAnimal = rootAnimal.parent;
            }

            let wiggleOffset = 0;
            if (rootAnimal && rootAnimal.wigglePhase !== undefined) {
                // Versatz der Welle: Sorgt dafür, dass die Welle nach hinten durchläuft
                const phaseDelay = this.depth * 0.6;
                // Amplitude: Schwanzspitze wackelt stärker als der Ansatz
                const amplitude = this.depth * 1.2;

                wiggleOffset = Math.sin(rootAnimal.wigglePhase - phaseDelay) * amplitude;
            }

            const perpAngle = angle + Math.PI / 2; // 90 Grad Winkel zur Wirbelsäule

            // --- NEU: Wiggle auf die Position anwenden ---
            if (this.branch !== 0) {
                const spreadStopDepth = 8;
                const effectiveDepth = Math.min(this.depth, spreadStopDepth);
                const branchProgress = Math.max(0, effectiveDepth - 3);
                const spread = Math.sqrt(branchProgress) * 4.5;

                // Wir addieren den wiggleOffset zur bestehenden Stimmgabel-Spreizung
                this.x = this.spineX + Math.cos(perpAngle) * ((spread * this.branch) + wiggleOffset);
                this.y = this.spineY + Math.sin(perpAngle) * ((spread * this.branch) + wiggleOffset);
            } else {
                // Ein gerader Schwanz liegt auf dem Rückgrat PLUS dem Wiggle-Offset
                this.x = this.spineX + Math.cos(perpAngle) * wiggleOffset;
                this.y = this.spineY + Math.sin(perpAngle) * wiggleOffset;
            }
        }
    }
}
