class AnimalCell extends BaseCell {
    constructor(x, y, genome) {
        super(x, y, genome);
        this.type = 'animal';
        this.maxSize = genome.maxSize;
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
        this.startTailLength = 3;
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
        return this.size >= this.maxSize * 0.85; // Geändert: Nutzt jetzt die persönliche Maximalgröße
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
        let currentDepth = 0;
        for (let i = 0; i < this.tailSegments.length; i++) {
            if (this.tailSegments[i].depth > currentDepth) {
                currentDepth = this.tailSegments[i].depth;
            }
        }

        if (currentDepth < targetTailDepth) {
            this.shouldGrowTail = true;
        }

        // Differenzierung zwischen Herbivoren und Carnivoren für die Vermehrung
        const isHerbivore = this instanceof HerbivoreCell;

        const energyRequired = isHerbivore ? window.SETTINGS.HERB_ENERGY_REQUIRED_REPRO : window.SETTINGS.CARN_ENERGY_REQUIRED_REPRO;
        const minAgeRequired = isHerbivore ? window.SETTINGS.HERB_MIN_AGE_REPRO : window.SETTINGS.CARN_MIN_AGE_REPRO;
        const reproFrames = isHerbivore ? window.SETTINGS.HERB_REPRO_FRAMES : window.SETTINGS.CARN_REPRO_FRAMES;

        // --- NEU: Eigener Cooldown für Schlangen ---
        let cooldown;
        if (this instanceof HerbivoreCell) {
            cooldown = window.SETTINGS.HERB_COOLDOWN_REPRO;
        } else if (this instanceof SnakeCell) {
            cooldown = window.SETTINGS.SNAKE_COOLDOWN_REPRO;
        } else {
            cooldown = window.SETTINGS.CARN_COOLDOWN_REPRO;
        }

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
            // --- KORREKTUR: Jäger im Ruhemodus verbrauchen Energie! ---
            // Wenn er weder jagt (!this.target) noch flieht (!this.threat),
            // drosseln wir den Stoffwechsel, aber setzen ihn NICHT auf 0.
            if (!this.target && !this.threat) {
                consumption *= 0.4; // Verbraucht beim entspannten Dümpeln nur 40% der normalen Energie
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

        // 4. Einen freien Platz auf der GESAMTEN Karte suchen!
        if (nearEdge || crowded) {
            let bestSpot = null;
            let minObstacles = Infinity;

            // Performante Stichproben-Suche: Wir testen einfach 5 komplett zufällige Orte!
            const attempts = 10;

            for (let i = 0; i < attempts; i++) {
                // Irgendwo auf der Karte, aber mit einem sicheren Puffer zum Rand (100 Pixel)
                const tx = 50 + Math.random() * (window.WORLD_WIDTH - 100);
                const ty = 50 + Math.random() * (window.WORLD_HEIGHT - 100);

                // Wie viele Hindernisse (Pflanzen/Steine) sind an diesem zufälligen Ort?
                const spotObstacles = grid.getEntitiesInArea(tx, ty, 60).filter(e => e.type === 'plant' || e.type === 'stone').length;

                // Je weniger Hindernisse, desto besser!
                if (spotObstacles < minObstacles) {
                    minObstacles = spotObstacles;
                    bestSpot = { x: tx, y: ty, size: 1 };
                }

                // PERFORMANZ-BOOST: Wenn wir einen komplett leeren Spot finden,
                // nehmen wir ihn SOFORT und brechen die Suche ab!
                if (minObstacles === 0) break;
            }

            // Wegpunkt setzen (Falls wirklich ALLES blockiert ist, schwimmt er stur in die Mitte)
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
        // --- NEU: Wir prüfen, ob das Tier überhaupt IRGENDEIN Ziel hat (Futter oder Wegpunkt) ---
        const destination = this.target || this.waypoint;

        if (destination) {
            // 1. Ziel-Check (Berührt?)
            const tx = destination.x - this.x;
            const ty = destination.y - this.y;
            const distToTargetSq = tx * tx + ty * ty;
            const targetSize = destination.size || 5;
            const eatRadius = this.size + targetSize + 5;

            if (distToTargetSq < eatRadius * eatRadius || this.reproducing) {
                // Wir sind dicht genug am Ziel, alles zurücksetzen
                this.stuckTimer = 0;
                this.anchorX = this.x;
                this.anchorY = this.y;
                this.accumulatedDist = 0;

                // --- NEU: Wenn es nur ein Wegpunkt war, können wir ihn jetzt löschen, da wir angekommen sind ---
                if (!this.target) {
                    this.waypoint = null;
                }
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
                    const minMovement = window.SETTINGS.STUCK_MIN_MOVEMENT * this.agingFactor;

                    // Checken die echte zurückgelegte Strecke
                    if (this.accumulatedDist < minMovement) {

                        // --- AUSBRUCH-LOGIK ---
                        this.target = null;
                        this.waypoint = null; // <--- NEU: Auch den Wegpunkt vergessen, er ist unerreichbar!

                        this.stuckTimer = 0;
                        this.anchorX = undefined;
                        this.accumulatedDist = 0;
                        this.ignoreTargetTimer = 60; // Set ignore timer

                        // Wilde Drehung zum Befreien
                        const r = Math.random();
                        if (r < 0.45) {
                            this.angle += (Math.PI * 0.5) + Math.random() * Math.PI;
                        } else if (r < 0.9) {
                            this.angle -= (Math.PI * 0.5) + Math.random() * Math.PI;
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
            // Weder Essen noch Wegpunkt -> Alles auf Null
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