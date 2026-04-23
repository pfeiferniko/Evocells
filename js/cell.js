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
        if (this.maxSize > 15) {
            this.maxSize = 15;
        }
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
        this.energy = genome.maxEnergy;
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
        this.berserkTimer = 0;
        this.tailLengthMultiplier = 1.0; // Wie viele Glieder pro Größen-Einheit? (Standard: 1)
        this.tailLengthOffset = 0;       // Basis-Bonus an Gliedern (Standard: 0)
    }

    // NEU: Berechnet die maximale Energie dynamisch nach Körpergröße
    getMaxEnergy() {
        // Startgröße ist 2 (also 2/2 = Faktor 1).
        // Bei Größe 10 braucht sie 5x so viel Essen (10/2 = Faktor 5).
        return this.genome.maxEnergy * (this.size / 2);
    }

    getMetabolismMultiplier() {
        return this.metabolismMultiplier;
    }

    isAdult() {
        return this.size >= this.genome.maxSize * 0.85;
    }

    updateBase(grid) {
        this.age++;

        // --- NEU: Dynamische Erholung & variables Bluten ---
        if (this.speedMultiplier < 1.0) {
            this.speedMultiplier += 0.001; // Tier erholt sich langsam

            // Berechne die Schwere der Verletzung (0.0 = gesund, 0.9 = schwer verletzt)
            const injury = 1.0 - this.speedMultiplier;

            // NEU: Die Chance wird von der Schwere der Wunde UND der Körpergröße bestimmt!
            // Faktor 0.05 sorgt dafür, dass es nicht zu extrem wird.
            // Ein großes Tier (Größe 10) mit schwerer Wunde: 0.9 * 0.05 * 10 = 45% Chance pro Frame.
            // Ein Baby (Größe 2) mit gleicher Wunde: 0.9 * 0.05 * 2 = 9% Chance pro Frame.
            const bleedChance = injury * 0.05 * this.size;

            if (Math.random() < bleedChance) {

                // Die Tropfengröße wächst ebenfalls dezent mit der Körpergröße mit
                const dropSize = Math.max(1.5, this.size * 0.2);

                if (typeof createParticles === 'function') {
                    // Immer nur exakt 1 Tropfen
                    createParticles(this.x, this.y, this.color, 1, dropSize);
                }
            }
        }

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

        const trueSize = this.reproducing ? this.originalSizeBeforeBirth : this.size;

        // --- NEU: Dynamische Ziel-Länge basierend auf den Tier-Parametern ---
        const targetTailDepth = Math.floor(trueSize * this.tailLengthMultiplier) + this.tailLengthOffset;

        // Wir messen die echte "Länge" (Tiefe) des Schwanzes
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
            this.isAdult() &&
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
        let consumption = this.genome.metabolism * (1 + (this.size * 0.1)) * this.getMetabolismMultiplier();

        // Pflanzenfresser sind effizienter und verlieren weniger Energie
        if (isHerbivore) {
            consumption *= window.SETTINGS.HERB_METABOLISM_DISCOUNT;
        } else {
            // --- NEU: Fleischfresser ohne Ziel verbrauchen KEINE Energie ---
            // Wenn er weder jagt (!this.target) noch vor einem anderen flieht (!this.threat),
            // dann wird der Energieverbrauch für diesen Frame auf 0 gesetzt.
            if (!this.target && !this.threat) {
                consumption = 0;
            }
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
                this.energy = 0.01;
            }
        }

        if (!isHerbivore) {
            this.handleWaypoints(grid);
        }

        return 'moving';
    }

    // NEU: Dritter Parameter 'avoidEntities' für die Wegfindung
    move(food, isFleeing = false, avoidEntities = null) {
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

        // --- NEU: Boids Hindernis-Vermeidung (Sehr performant) ---
        let avoidX = 0;
        let avoidY = 0;
        let avoiding = false;

        if (avoidEntities) {
            for (const entity of avoidEntities) {
                // Sich selbst und das Essen ignorieren wir (wir wollen das Essen ja nicht umfahren!)
                if (entity === this || entity === food) continue;

                const isStone = entity.type === 'stone';
                const isPlant = entity.type === 'plant';

                if (isStone || isPlant) {
                    const dx = this.x - entity.x;
                    const dy = this.y - entity.y;
                    const distSq = dx * dx + dy * dy;

                    // Die Vorrausschau-Aura verkleinert:
                    // Steine von 60 auf 30 reduziert, damit er erst später reagiert.
                    const lookAhead = isStone ? 40 : 30;
                    const avoidRadius = this.size + (entity.size || 10) + lookAhead;

                    if (distSq < avoidRadius * avoidRadius && distSq > 0) {
                        const dist = Math.sqrt(distSq);

                        // GEWICHTUNG MASSIV REDUZIERT:
                        // Das Essen zieht mit einer Stärke von 2.5.
                        // Der Stein drückt jetzt nur noch mit 1.8 (statt 6.0).
                        // So gleitet er am Stein ab, kann aber sein Ziel erreichen!
                        const weight = isStone ? 10 : 1.8;

                        // Kraft: Je näher das Hindernis, desto panischer der Ausweichversuch
                        const force = (avoidRadius - dist) / avoidRadius;

                        // Abstoßung berechnen
                        avoidX += (dx / dist) * force * weight;
                        avoidY += (dy / dist) * force * weight;
                        avoiding = true;
                    }
                }
            }
        }

        // --- NEU: Spielfeldrand-Abstoßung ---
        // Ab 60 Pixeln Entfernung zum Rand beginnt das Tier gegenzulenken
        const wallLookAhead = 30;

        // Die Wand ist stark! Sie drückt mit Stärke 3.0 (Steine haben 1.8, Essen zieht mit 2.5)
        // So weicht das Tier definitiv nicht über den Rand aus.
        const wallWeight = 6.0;

        // Linker Rand (drückt nach rechts, also +X)
        if (this.x < wallLookAhead) {
            const force = (wallLookAhead - this.x) / wallLookAhead;
            avoidX += force * wallWeight;
            avoiding = true;
        }
        // Rechter Rand (drückt nach links, also -X)
        if (this.x > window.WORLD_WIDTH - wallLookAhead) {
            const dist = window.WORLD_WIDTH - this.x;
            const force = (wallLookAhead - dist) / wallLookAhead;
            avoidX -= force * wallWeight;
            avoiding = true;
        }
        // Oberer Rand (drückt nach unten, also +Y)
        if (this.y < wallLookAhead) {
            const force = (wallLookAhead - this.y) / wallLookAhead;
            avoidY += force * wallWeight;
            avoiding = true;
        }
        // Unterer Rand (drückt nach oben, also -Y)
        if (this.y > window.WORLD_HEIGHT - wallLookAhead) {
            const dist = window.WORLD_HEIGHT - this.y;
            const force = (wallLookAhead - dist) / wallLookAhead;
            avoidY -= force * wallWeight;
            avoiding = true;
        }

        // --- NEU: Vektor kappen (Normalisieren), falls die Kraft zu groß wird ---
        if (avoiding) {
            // 1. Die tatsächliche Stärke (Länge) der kombinierten Ausweichkraft berechnen
            const avoidMag = Math.sqrt(avoidX * avoidX + avoidY * avoidY);

            // 2. Maximales Limit setzen (wie du vorgeschlagen hast: max 2.0)
            const maxAvoidForce = 2.4;

            // 3. Wenn die Kraft das Limit überschreitet, kürzen wir den Vektor
            if (avoidMag > maxAvoidForce) {
                avoidX = (avoidX / avoidMag) * maxAvoidForce;
                avoidY = (avoidY / avoidMag) * maxAvoidForce;
            }

            // Wir speichern die gekappten Werte für die Debug-Linien
            this.debugAvoidX = avoidX;
            this.debugAvoidY = avoidY;

            // Wir nehmen den Vektor zu unserem eigentlichen Ziel (Stärke 2.5)
            const targetDx = Math.cos(targetAngle) * 2.5;
            const targetDy = Math.sin(targetAngle) * 2.5;

            // Und addieren unsere gedeckelten Ausweichkräfte einfach oben drauf
            targetAngle = Math.atan2(targetDy + avoidY, targetDx + avoidX);
        } else {
            this.debugAvoidX = 0;
            this.debugAvoidY = 0;
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

        // --- NEU: Patrouillen-Modus für Jäger ---
        // Wenn das Tier ein Fleischfresser ist, gerade NICHT flieht und KEIN Ziel hat (food ist null)
        if (this instanceof CarnivoreCell && !isFleeing && !this.target) {
            currentSpeed *= 0.35; // Drosselt die Geschwindigkeit auf 50%
        }

        if (distanceToTarget < currentSpeed) {
            currentSpeed = distanceToTarget;
        }

        // 4. Bewegen
        this.x += Math.cos(this.angle) * currentSpeed;
        this.y += Math.sin(this.angle) * currentSpeed;

        // Takt fließend anpassen
        const sizeWiggleFactor = 4 / Math.max(2, this.size);
        targetWiggleSpeed = 0.05 + Math.min(currentSpeed * sizeWiggleFactor, 1.2);

        this.currentWiggleSpeed += (targetWiggleSpeed - this.currentWiggleSpeed) * 0.1;
        this.wigglePhase += this.currentWiggleSpeed * 0.3;
    }

    handleWaypoints(grid) {
        // 1. Wenn wir jagen, fliehen oder gebären, brauchen wir keinen Wegpunkt
        if (this.target || this.threat || this.reproducing) {
            this.waypoint = null;
            return;
        }

        // 2. Haben wir schon einen Wegpunkt? Dann prüfen, ob wir da sind.
        if (this.waypoint) {
            const dx = this.waypoint.x - this.x;
            const dy = this.waypoint.y - this.y;
            if (dx * dx + dy * dy < 900) { // Auf 30 Pixel genähert
                this.waypoint = null; // Ziel erreicht, wir können wieder dümpeln!
            } else {
                return; // Wegpunkt noch nicht erreicht -> Weiter schwimmen
            }
        }

        // 3. Klaustrophobie-Check: Sind wir am Rand oder eingeklemmt?
        const edge = 50;
        const nearEdge = this.x < edge || this.x > window.WORLD_WIDTH - edge ||
            this.y < edge || this.y > window.WORLD_HEIGHT - edge;

        let crowded = false;
        if (!nearEdge) {
            // Nur Algen und Steine im ganz nahen Umfeld zählen
            const obstacles = grid.getEntitiesInArea(this.x, this.y, 80).filter(e => e.type === 'plant' || e.type === 'stone');
            if (obstacles.length > 15) {
                crowded = true;
            }
        }

        // 4. Einen freien Platz suchen (Radar)!
        if (nearEdge || crowded) {
            const searchDist = 250; // Wir schauen 250 Pixel in die Ferne
            let bestSpot = null;
            let minObstacles = Infinity;

            // Wir testen 8 Richtungen (Fächersuche)
            for (let i = 0; i < 8; i++) {
                const angle = i * (Math.PI / 4);
                const tx = this.x + Math.cos(angle) * searchDist;
                const ty = this.y + Math.sin(angle) * searchDist;

                // Der Zielpunkt MUSS weit genug vom Rand weg sein
                if (tx < 50 || tx > window.WORLD_WIDTH - 50 || ty < 50 || ty > window.WORLD_HEIGHT - 50) continue;

                // Wie viele Hindernisse sind an diesem Zielpunkt?
                const spotObstacles = grid.getEntitiesInArea(tx, ty, 50).filter(e => e.type === 'plant' || e.type === 'stone').length;

                // Je weniger Hindernisse, desto besser!
                if (spotObstacles < minObstacles) {
                    minObstacles = spotObstacles;
                    bestSpot = { x: tx, y: ty, size: 1 };
                }

                // Wenn wir einen komplett leeren Spot finden, sofort nehmen und Suche abbrechen!
                if (minObstacles === 0) break;
            }

            // Wegpunkt setzen (Falls wirklich ALLES blockiert ist, schwimmt er als Notfall stur in die Mitte)
            if (bestSpot) {
                this.waypoint = bestSpot;
            } else {
                this.waypoint = { x: window.WORLD_WIDTH / 2, y: window.WORLD_HEIGHT / 2, size: 1 };
            }
        }
    }

    findClosestInSight(candidates, currentTarget = null) {
        let closestTarget = null;
        let minDistance = Infinity;
        const maxRadius = this.genome.sightRange;

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

    // NEU: Sucht das beste Ziel basierend auf Distanz und GRÖSSE der Beute
    findBestPreyInSight(candidates, grid, currentTarget = null) {
        let bestTarget = null;
        let bestScore = Infinity; // Der niedrigste Score gewinnt
        const maxRadius = this.genome.sightRange;

        const isAdultCarnivore = (this instanceof CarnivoreCell) && this.isAdult();
        let nearbyHunters = [];

        if (grid) {
            const avoidRadius = window.SETTINGS.HUNT_RIVAL_AVOID_RADIUS;
            nearbyHunters = grid.getEntitiesInArea(this.x, this.y, maxRadius + avoidRadius).filter(e =>
                e instanceof CarnivoreCell &&
                e.alive &&
                e !== this
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

                // --- NEUE SCORE-BERECHNUNG (Distanz vs. Ähnlichkeit der Größe) ---
                // Wir berechnen den absoluten Unterschied zwischen Jäger und Beute
                const sizeDiff = Math.abs(this.size - entity.size);

                // Strafe für Größenunterschied:
                // Jede Einheit Unterschied zählt so viel wie 25 Pixel zusätzliche Distanz.
                // Ein Tier, das genau so groß ist wie der Jäger (Diff 0), hat den besten Score!
                const sizePenalty = sizeDiff * 25;
                let score = distance + sizePenalty;


                // --- NEU: Rudelbildung verhindern & Rivalitäts-Strafe ---
                for (const hunter of nearbyHunters) {

                    // 1. ZIEL-MONOPOL: Jagt dieser andere Jäger genau dieses Beutetier?
                    if (hunter.target === entity) {
                        // Massive Strafe von 400! Das wirkt auf unseren Jäger so, als wäre
                        // dieses Beutetier 400 Pixel weiter weg. Er sucht sich sofort etwas anderes.
                        score += 400;
                    }

                    // 2. RIVALEN-AURA (Nur für erwachsene Jäger wie vorher):
                    // Generelles Meiden von Orten, wo dicke Konkurrenten rumhängen
                    if (isAdultCarnivore && hunter.isAdult()) {
                        const rdx = entity.x - hunter.x;
                        const rdy = entity.y - hunter.y;
                        const distToRival = Math.sqrt(rdx * rdx + rdy * rdy);

                        if (distToRival < window.SETTINGS.HUNT_RIVAL_AVOID_RADIUS) {
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

    // NEU: Bekommt jetzt ein ARRAY von Gefahren ('threats') anstelle von einem einzigen 'threat'
    flee(threats, grid) {
        this.target = null;
        this.targetTimer = 0;

        let combinedFleeX = 0;
        let combinedFleeY = 0;

        // 1. Alle Fluchtvektoren addieren (gewichtet nach Distanz)
        for (const threat of threats) {
            const dx = this.x - threat.x;
            const dy = this.y - threat.y;
            const distSq = dx * dx + dy * dy;

            if (distSq > 0) {
                const dist = Math.sqrt(distSq);

                // Je näher der Jäger, desto panischer der Drang, genau IHM auszuweichen
                // Die 100 ist ein Multiplikator, der die Kraft schön weich skaliert
                const force = 100 / dist;

                combinedFleeX += (dx / dist) * force;
                combinedFleeY += (dy / dist) * force;
            }
        }

        // 2. Idealer Fluchtwinkel aus der GEMEINSAMEN Summe berechnen
        // Die atan2 Funktion macht aus den X/Y Werten wieder einen perfekten Winkel
        const idealFleeAngle = Math.atan2(combinedFleeY, combinedFleeX);

        // 3. Zielpunkt setzen (stur in diese berechnete, optimale Richtung)
        const fleeTarget = {
            x: this.x + Math.cos(idealFleeAngle) * window.SETTINGS.FLEE_TARGET_DISTANCE,
            y: this.y + Math.sin(idealFleeAngle) * window.SETTINGS.FLEE_TARGET_DISTANCE
        };

        this.currentFleeTarget = fleeTarget;

        // 4. Mikro-Navigation (Ausweichen): Hindernisse laden
        const avoidEntities = grid.getEntitiesInArea(this.x, this.y, 60);

        // 5. Loslaufen!
        this.move(fleeTarget, true, avoidEntities);
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
        this.genome.sightRange = window.SETTINGS.HERB_SIGHT_RANGE_MULTIPLIER;
    }

    /*getMetabolismMultiplier() {
        let multiplier = this.metabolismMultiplier;
        if (!this.hasReproduced) multiplier *= 1.2;
        multiplier -= (this.tailSegments.length * 0.05);
        return Math.max(0.8, multiplier);
    }*/

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

        const searchRadius = Math.max(this.genome.sightRange, panicRadius);
        const entitiesInArea = grid.getEntitiesInArea(this.x, this.y, searchRadius);

        // --- NEU: Größen-Check bei der Feinderkennung ---
        const predators = entitiesInArea.filter(e =>
            e instanceof CarnivoreCell &&
            e.alive //&&
            //e.size >= this.size // <-- NEU: Der Jäger MUSS größer sein als der Pflanzenfresser
        );

        this.threat = null;
        let activeThreats = [];

        for (const p of predators) {
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= panicRadius) {
                activeThreats.push(p); // Alle gefährlichen Jäger in die Liste packen!
            }
        }

        if (activeThreats.length > 0) {
            this.threat = activeThreats[0]; // Behalten wir für die Hysterese und die rote Debug-Linie
            this.flee(activeThreats, grid); // Das gesamte Array an die Flucht-Funktion übergeben
            return status;
        } else {
            this.threat = null;
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

        // Nutzt target (Essen). Wenn kein Essen da ist, nutzt es waypoint (freier Platz).
        // Wir übergeben 'entitiesInArea', damit die Boids-Ausweich-KI auch hier greift!
        this.move(this.target);
        return status;
    }
}

class CarnivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);

        const r = Math.floor(200 + Math.random() * 56); // Immer ein sehr starkes Rot (200 bis 255)
        const g = Math.floor(5 + Math.random() * 10);  // Mehr Grün-Anteil (60 bis 120)
        const b = Math.floor(5 + Math.random() * 100);  // Mehr Blau-Anteil (60 bis 120)
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        // Helligkeit auf 20% bis 35% setzen (schön dunkel) und Sättigung minimal runter
        const lightness = Math.floor(20 + Math.random() * 15);
        this.dotColor = `hsl(${hue}, 80%, ${lightness}%)`;

        this.metabolismMultiplier = 0.5;
        this.genome.sightRange = window.SETTINGS.CARN_SIGHT_RANGE_MULTIPLIER;
        this.genome.sightAngle = window.SETTINGS.CARN_SIGHT_ANGLE;
        this.maxReproductions = window.SETTINGS.CARN_MAX_REPRODUCTIONS;
        this.size = 3;
    }

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        this.checkTargetTimeout(); // Überprüfen, ob sie feststeckt

        // // Ziel aufgeben, falls die Beute inzwischen wächst und plötzlich größer ist
        // if (this.target && this.target.size > this.size && !(this.target instanceof CarnivoreCell)) {
        //     this.target = null;
        // }

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
        const isBaby = !this.isAdult();

        // Fluchtinstinkt greift erst, wenn es kein Baby mehr ist
        if (!isBaby && this.berserkTimer <= 0) {
            const largerPredators = entitiesInArea.filter(e =>
                e instanceof CarnivoreCell &&
                e.alive &&
                e !== this &&
                e.size > this.size
            );

            let activeThreats = [];

            for (const p of largerPredators) {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= panicRadius) {
                    activeThreats.push(p); // Alle größeren Jäger sammeln
                }
            }

            if (activeThreats.length > 0) {
                this.threat = activeThreats[0]; // Für Hysterese/Debug-Linie
                this.flee(activeThreats, grid); // Das gesamte Array übergeben
                return status;
            } else {
                this.threat = null;
                this.currentFleeTarget = null;
            }
        } else {
            this.currentFleeTarget = null;
            this.berserkTimer--;
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
                e.size >= e.genome.maxSize * 0.85 && // isAdult
                e.size <= this.size &&
                e.size >= this.size * 0.7
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
                const huntEntities = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange);

                const herbivores = huntEntities.filter(e =>
                    e instanceof HerbivoreCell &&
                    e.alive
                    //e.size <= this.size // <--- Hier ist deine eingebaute Sperre, dass Opfer nie größer sein dürfen!
                );
                let newTarget = this.findBestPreyInSight(herbivores, grid, this.target);

                if (!newTarget) {
                    const smallerCarnivores = huntEntities.filter(e =>
                        e instanceof CarnivoreCell &&
                        e.alive &&
                        e !== this &&
                        e.size <= this.size
                    );
                    newTarget = this.findBestPreyInSight(smallerCarnivores, grid, this.target);
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

        // Nutzt target (Essen). Wenn kein Essen da ist, nutzt es waypoint (freier Platz).
        // Wir übergeben 'entitiesInArea', damit die Boids-Ausweich-KI auch hier greift!
        this.move(this.target || this.waypoint, false, entitiesInArea);
        return status;
    }
}

class SnakeCell extends CarnivoreCell {
    constructor(x, y, genome) {
        super(x, y, genome); // Erbt alles vom normalen Fleischfresser

        // Ein leuchtendes Cyan (viel Blau und Grün, wenig Rot)
        const r = Math.floor(Math.random() * 40);       // 0 - 40
        const g = Math.floor(180 + Math.random() * 75); // 180 - 255
        const b = Math.floor(180 + Math.random() * 75); // 180 - 255
        this.color = `rgb(${r}, ${g}, ${b})`;

        // Die Pünktchen auf dem Rücken machen wir dunkelblau für Kontrast
        this.dotColor = `hsl(200, 80%, 20%)`;

        // Optional: Schlangen haben vielleicht einen etwas effizienteren Stoffwechsel
        this.metabolismMultiplier = 0.4;

        // --- NEU: Schlangen haben einen längeren Schwanz ---
        // (Größe * 2) + 2 -> Bei Größe 3 sind das 8 Glieder.
        this.tailLengthMultiplier = 2.0;
        this.tailLengthOffset = 2;
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

                // --- NEU: Amplitude für lange Schwänze deckeln ---
                // Die Schwung-Stärke steigt nur bis zum 5. Glied an.
                // Alle weiteren Glieder schwingen mit dieser Maximalkraft gleichmäßig weiter.
                const effectiveWiggleDepth = Math.min(this.depth, 5);
                const amplitude = effectiveWiggleDepth * 1.2;

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
