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
            // Super-Pflanzen: Zufallswert zwischen 15 und 25
            this.maxSize = 10 + Math.random() * 3;
        } else {
            // Normale Pflanzen: Fixe Größe 10
            this.maxSize = 10;
        }
        this.color = isSuper ? '#b200ff' : 'green'; // Lila für Super, Grün für Normal
        this.opacity = 0.7 + Math.random() * 0.3;

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

        if (this.size < this.maxSize) {
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
        // Wenn das Tier keine Kinder mehr kriegen kann, wird es langsam alt
        if (this.reproductionCount >= this.maxReproductions) {
            // 0.0002 pro Frame bedeutet bei 60 FPS: Es dauert etwas über 1 Minute,
            // bis das Tier fast komplett stillsteht. Du kannst den Wert anpassen!
            if (this.agingFactor > 0.1) { // Wir kappen es bei 0.1, damit sie noch GANZ leicht kriechen
                this.agingFactor -= 0.0002;
            }
        }

        // Zieht in jedem Frame 1 ab, bis er wieder bei 0 ist, damit das Tier wieder bereit wird.
        if (this.birthCooldown > 0) {
            this.birthCooldown--;
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

        // Herbivoren: 60% Energie nötig, mind. 300 Alter, 30 Frames Dauer, 300 Cooldown
        // Carnivoren: 90% Energie nötig, mind. 600 Alter, 60 Frames Dauer, 1000 Cooldown
        const energyRequired = isHerbivore ? 0.7 : 0.9;
        const minAgeRequired = isHerbivore ? 300 : 600;
        const reproFrames = isHerbivore ? 90 : 90;
        const cooldown = isHerbivore ? 3000 : 10000;

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

            // 1. KEINE Drehung mehr. Nur ein ganz leichtes,
            // biologisches Zittern des Winkels.
            this.angle += (Math.random() - 0.5) * 0.02;

            // 2. Das Anschwellen berechnen.
            // Wir nutzen eine Sinus-Kurve, damit es weich anschwillt.
            // Am Höhepunkt (Mitte der Zeit) ist es 1.5x so groß.
            // Formel: Normalgröße + (Sinus-Welle von 0 auf 1 auf 0) * 50% Bonus
            if (this.originalSizeBeforeBirth) {
                const bloatFactor = 1.0 + (Math.sin(progress * Math.PI) * 1);
                this.size = this.originalSizeBeforeBirth * bloatFactor;
            }

            // 3. Fast keine Vorwärtsbewegung mehr.
            // Sie "konzentriert" sich auf die Geburt.
            const danceSpeed = this.originalSizeBeforeBirth * 0.05;
            this.x += Math.cos(this.angle) * danceSpeed;
            this.y += Math.sin(this.angle) * danceSpeed;

            // 4. Zusätzlicher Energieverbrauch durch die Anstrengung (Optional)
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

        // Pflanzenfresser sind effizienter und verlieren weniger Energie (nur 60% des normalen Werts)
        if (isHerbivore) {
            consumption *= 0.6; // Diesen Wert kannst du anpassen (z.B. 0.5 für noch weniger Verbrauch)
        }

        // --- NEU: Extremer Altersschwäche-Stoffwechsel ---
        // Durch die Division (1.0 / agingFactor) explodiert der Verbrauch am Ende:
        // Alter 0%  (Faktor 1.0) -> 1.0 / 1.0 = 1x (normaler Verbrauch)
        // Alter 50% (Faktor 0.5) -> 1.0 / 0.5 = 2x Verbrauch
        // Alter 90% (Faktor 0.1) -> 1.0 / 0.1 = 10x Verbrauch!
        consumption = consumption * (1.0 / this.agingFactor);

        this.energy -= consumption;

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

        // 3. Volle Geschwindigkeit berechnen (Genetik * Verletzung * Alter * Größen-Bonus)
        // Bonus: Jede Größeneinheit bringt 2% mehr Speed
        const sizeBonusMultiplier = 1 + (this.size * 0.02);

        let currentSpeed = this.genome.speed * this.speedMultiplier * this.agingFactor * sizeBonusMultiplier;

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

    // NEU: Sucht das beste Ziel basierend auf Distanz UND Geschwindigkeit
    findSlowestInSight(candidates) {
        let bestTarget = null;
        let bestScore = Infinity; // Der niedrigste Score gewinnt
        const maxRadius = this.genome.sightRange * 5;

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

                // --- NEU: Der Jagd-Score ---
                // Geschwindigkeit hat meist Werte zwischen 0.5 und 2.0.
                // Distanz liegt meist zwischen 10 und 500.
                // Indem wir die Geschwindigkeit mit zz.B. 150 multiplizieren, bringen wir beides ins Gleichgewicht.
                const speedWeight = 150;
                const score = distance + (currentSpeed * speedWeight);

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
                    const trueDistMovedSq = dx * dx + dy * dy;

                    // --- ANGEPASSTE LOGIK ---
                    // Wir nehmen den Basis-Schwellenwert (15 Pixel) und multiplizieren ihn
                    // mit dem agingFactor. Wenn ein Tier also nur noch 20% Speed hat,
                    // akzeptieren wir auch, dass es nur 20% der Strecke schafft,
                    // ohne es als "feststeckend" zu werten.
                    const minMovement = 15 * this.agingFactor;
                    const minMovementSq = minMovement * minMovement;

                    if (trueDistMovedSq < minMovementSq) {
                        this.target = null;
                        this.stuckTimer = 0;
                        this.anchorX = undefined;

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

        const r = Math.floor(200 + Math.random() * 55);
        const g = Math.floor(100 + Math.random() * 80);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        this.dotColor = `hsl(${hue}, 100%, 60%)`;

        this.metabolismMultiplier = 1.0;
        this.target = null;
        this.threat = null;
        // NEU: Hier stellst du ein, wie oft Pflanzenfresser werfen dürfen (z.B. 3 Mal)
        this.maxReproductions = 2;
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

        // --- NEU: Größen-Check bei der Feinderkennung ---
        const predators = entitiesInArea.filter(e =>
            e instanceof CarnivoreCell &&
            e.alive &&
            e.size >= this.size // <-- NEU: Der Jäger MUSS größer sein als der Pflanzenfresser
        );

        this.threat = null;
        let minPredatorDist = Infinity;
        const panicRadius = this.genome.sightRange * 3;

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

        const r = Math.floor(150 + Math.random() * 105);
        const g = Math.floor(Math.random() * 40);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        this.dotColor = `hsl(${hue}, 100%, 60%)`;

        this.metabolismMultiplier = 0.8; // Increased from 0.5 to starve faster
        this.genome.sightRange = 500;
        this.genome.sightAngle = Math.PI * 0.8;
        // NEU: Hier stellst du ein, wie oft Fleischfresser werfen dürfen (z.B. 1 oder 2 Mal)
        this.maxReproductions = 50;
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
        // Er sieht die Bedrohung nur etwas weiter (hier: 20% weiter) als seinen eigenen Angriffsradius
        const panicRadius = aggroRadius * 2;

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
                this.target = null;
                this.targetTimer = 0;

                let fleeAngle = Math.atan2(this.y - this.threat.y, this.x - this.threat.x);

                const testDist = 20;
                const testX = this.x + Math.cos(fleeAngle) * testDist;
                const testY = this.y + Math.sin(fleeAngle) * testDist;

                const obstacles = grid.getEntitiesInArea(testX, testY, 10)
                    .filter(e => e.type === 'plant' || e.type === 'stone');

                if (obstacles.length > 0) {
                    fleeAngle += Math.PI / 4;
                }

                const fleeTarget = {
                    x: this.x + Math.cos(fleeAngle) * 100,
                    y: this.y + Math.sin(fleeAngle) * 100
                };

                this.move(fleeTarget);
                this.energy -= 0.05;
                return status;
            }
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
        if ((this.ignoreTargetTimer || 0) <= 0 && (!this.target || !this.target.alive)) {
            // Für die Jagd schauen wir wieder etwas weiter
            const huntEntities = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange * 5);

            const herbivores = huntEntities.filter(e =>
                e instanceof HerbivoreCell &&
                e.alive &&
                e.size <= this.size
            );
            this.target = this.findSlowestInSight(herbivores);

            if (!this.target) {
                const smallerCarnivores = huntEntities.filter(e =>
                    e instanceof CarnivoreCell &&
                    e.alive &&
                    e !== this &&
                    e.size < this.size
                );
                this.target = this.findSlowestInSight(smallerCarnivores);
            }

            this.targetTimer = 0;
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

            // Das unsichtbare Rückgrat kerzengerade hinterherziehen
            if (dist > targetDist) {
                this.spineX = targetX - Math.cos(angle) * targetDist;
                this.spineY = targetY - Math.sin(angle) * targetDist;
            }

            // NEU: Stimmgabel-Effekt (erst biegen, dann parallel!)
            if (this.branch !== 0) {
                // Nach dem 8. Segment wächst der Abstand zur Mitte nicht mehr weiter
                const spreadStopDepth = 8;
                const effectiveDepth = Math.min(this.depth, spreadStopDepth);

                // Wie viele Segmente sind wir schon über dem Spaltpunkt (Tiefe 3)?
                // Verhindert negative Werte, falls die Tiefe kleiner als 3 ist.
                const branchProgress = Math.max(0, effectiveDepth - 3);

                // DIE MAGIE: Math.sqrt zieht die Glieder in einem sanften Bogen nach außen!
                // Der Faktor 4.5 (statt vorher 3.5 linear) macht den Schwanz insgesamt viel enger.
                const spread = Math.sqrt(branchProgress) * 4.5;

                const perpAngle = angle + Math.PI / 2; // 90 Grad Winkel zur Wirbelsäule

                this.x = this.spineX + Math.cos(perpAngle) * (spread * this.branch);
                this.y = this.spineY + Math.sin(perpAngle) * (spread * this.branch);
            } else {
                // Ein gerader Schwanz liegt exakt auf dem Rückgrat
                this.x = this.spineX;
                this.y = this.spineY;
            }
        }
    }
}
