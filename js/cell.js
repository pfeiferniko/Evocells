class Genome {
    constructor(data = {}) {
        this.speed = data.speed || 1;
        this.maxSize = data.maxSize || 10;
        this.sightRange = data.sightRange || 50;
        this.sightAngle = data.sightAngle || Math.PI / 4;
        this.metabolism = data.metabolism || 0.05;
        this.maxEnergy = data.maxEnergy || 100;
        this.minAgeForReproduction = data.minAgeForReproduction || 500;
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
    constructor(x, y, parent = null) {
        super(x, y, null);
        this.type = 'plant';
        this.color = 'green';
        this.parent = parent;
        this.age = 0;
        this.shouldGrow = false;
    }

    update() {
        this.age++;
        if (this.size < 10) {
            this.size += 0.005;
        }
        if (this.age > 200 && Math.random() < 0.05) {
            this.shouldGrow = true;
        }
    }
}

class StoneCell extends BaseCell {
    constructor(x, y, size) {
        super(x, y, null);
        this.type = 'stone';

        // Zufälligen Grauwert zwischen 60 (sehr dunkel) und 140 (heller) generieren
        const gray = Math.floor(60 + Math.random() * 80);
        this.color = `rgb(${gray}, ${gray}, ${gray})`;

        this.size = size;
    }

    update() {
        // Steine tun nichts, sie sind einfach nur da.
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
        this.metabolismMultiplier = 1.0;
        this.speedMultiplier = 1.0;

        // NEU: Tracking für festgesteckte Zellen
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
        return this.genome.maxEnergy * (this.size / 2);
    }

    getMetabolismMultiplier() {
        return this.metabolismMultiplier;
    }

    updateBase(grid) {
        this.age++;
        if (this.speedMultiplier < 1.0) this.speedMultiplier += 0.001;

        // Check, ob die Zelle bereit ist
        if (this.energy >= this.getMaxEnergy() && this.age > this.genome.minAgeForReproduction && !this.reproducing) {
            this.reproducing = true;
            this.reproTimer = 0;
        }

        // Der Geburtstanz & Spawnen
        if (this.reproducing) {
            this.reproTimer++;
            const reproFrames = 120; // 1 Sekunde Tanz

            // 1. Drehung für den Tanz
            this.angle += (Math.PI * 4) / reproFrames;

            // 2. NEU: Im Kreis schwimmen!
            // Wir schieben die Zelle jeden Frame in ihre aktuelle Blickrichtung.
            // Ein Wert von 3 oder 4 sorgt für einen schönen, sichtbaren Kreis.
            const danceSpeed = 1.5;
            this.x += Math.cos(this.angle) * danceSpeed;
            this.y += Math.sin(this.angle) * danceSpeed;

            // Wenn der Timer abgelaufen ist: EINMALIG Kind spawnen und resetten
            if (this.reproTimer >= reproFrames) {

                // Winkel normalisieren, damit sie danach nicht verwirrt ist
                this.angle = this.angle % (Math.PI * 2);

                this.energy /= 2;
                this.reproducing = false;
                this.hasReproduced = true;
                this.reproTimer = 0;

                return 'reproduce';
            }

            // 'stationary' verhindert die normale Jagd/Wegfindung,
            // aber wir haben sie ja gerade manuell im Kreis schwimmen lassen!
            return 'stationary';
        }

        // Normaler Energieverbrauch, wenn sie NICHT gerade tanzt/gebiert
        this.energy -= (this.genome.metabolism / (this.size / 2)) * this.getMetabolismMultiplier();

        return 'moving';
    }

    move(food) {
        let targetAngle = this.angle;
        if (food) {
            targetAngle = Math.atan2(food.y - this.y, food.x - this.x);
        } else {
            targetAngle = this.angle + (Math.random() - 0.5) * 0.1;
        }
        const diff = (targetAngle - this.angle + Math.PI) % (2 * Math.PI) - Math.PI;
        const maxTurn = 0.2; // Keep turn speed
        this.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

        // ANGEPASST: Der Bonus wächst jetzt viel langsamer!
        // 0.03 bedeutet: Nur noch +3% Geschwindigkeit pro Schwanzsegment (statt 10%)
        const tailBonus = 1 + (this.tailSegments.length * 0.03);

        // Den Bonus auf die Endgeschwindigkeit aufrechnen
        const currentSpeed = this.genome.speed * this.speedMultiplier * tailBonus;

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
            this.targetTimer++;

            // Distanz berechnen, die seit dem letzten Frame zurückgelegt wurde
            const dx = this.x - this.lastX;
            const dy = this.y - this.lastY;
            const distMovedSq = dx * dx + dy * dy;

            // Wenn die Zelle sich kaum bewegt (z. B. drückt sie gegen einen Stein)
            if (distMovedSq < 0.1) {
                this.stuckTimer++;
            } else {
                this.stuckTimer = 0; // Zelle bewegt sich wieder, Timer zurücksetzen
            }

            // NEU: Dynamische Jagd-Zeit!
            // Fleischfresser jagen bis zu 15 Sekunden (900 Frames),
            // Pflanzenfresser geben schon nach ca. 6.5 Sekunden (400 Frames) auf.
            const maxChaseTime = (this instanceof CarnivoreCell) ? 900 : 400;

            // Wenn der Jäger am Stein feststeckt, darf er auch etwas länger probieren (3 statt 2 Sek)
            const maxStuckTime = (this instanceof CarnivoreCell) ? 180 : 120;

            // Abbruch-Bedingung
            if (this.stuckTimer > maxStuckTime || this.targetTimer > maxChaseTime) {
                this.target = null; // Ziel verwerfen
                this.stuckTimer = 0;
                this.targetTimer = 0;

                // Zelle drastisch wegdrehen, um aus der Sackgasse/Ecke zu entkommen
                this.angle += (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random());
            }
        }

        // Aktuelle Position für den nächsten Frame merken
        this.lastX = this.x;
        this.lastY = this.y;
    }
}

class HerbivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);
        this.color = 'orange';
        this.metabolismMultiplier = 1.0;
        this.target = null;
    }

    getMetabolismMultiplier() {
        let multiplier = this.metabolismMultiplier;
        if (!this.hasReproduced) multiplier *= 1.5;
        multiplier -= (this.tailSegments.length * 0.1);
        return Math.max(0.5, multiplier);
    }

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        this.checkTargetTimeout(); // <--- NEU: Überprüfen, ob sie feststeckt

        if (!this.target || !this.target.alive) {
            const potentialFood = grid.getEntitiesInArea(this.x, this.y, this.genome.sightRange * 5);
            const plants = potentialFood.filter(e => e.type === 'plant' && e.alive);
            this.target = this.findClosestInSight(plants);

            this.targetTimer = 0; // <--- NEU: Timer reset bei neuem Ziel
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
