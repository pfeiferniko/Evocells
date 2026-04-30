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
        // Die Änderung berechnet sich aus (Zufall 0-1 minus 0.5) * Schrittweite
        // Bei einem Step von 2.0 ergibt das einen Bereich von -1.0 bis +1.0
        const sizeChange = (Math.random() - 0.5) * window.SETTINGS.MUTATION_SIZE_STEP;
        this.maxSize += sizeChange;

        // Sicherstellen, dass die Tiere nicht kleiner als 5 werden
        if (this.maxSize < 5) this.maxSize = 5;

        // Absoluter Deckel aus den Settings
        if (this.maxSize > window.SETTINGS.MUTATION_MAX_SIZE_CAP) {
            this.maxSize = window.SETTINGS.MUTATION_MAX_SIZE_CAP;
        }

        this.maxEnergy += (Math.random() - 0.5) * 10;
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
    constructor(x, y, parent = null, isSuper = false, baseColor = null) {
        super(x, y, null);
        this.type = 'plant';

        // NEU: Ist es eine Super-Pflanze?
        this.isSuper = isSuper;
        this.baseColor = baseColor;
        // --- NEU: Variable Maximalgröße ---
        if (this.isSuper) {
            // Super-Pflanzen: Zufallswert um die Basisgröße herum
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_SUPER_BASE + Math.random() * 3;
        } else {
            // Normale Pflanzen: Fixe Größe
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_NORMAL;
        }

        // --- NEUE FARB-LOGIK ---
        if (this.baseColor) {
            // Wenn eine Farbe übergeben wurde, variieren wir die RGB-Werte leicht (+/- 20)
            const r = Math.max(0, Math.min(255, this.baseColor.r + Math.floor((Math.random() - 0.5) * 40)));
            const g = Math.max(0, Math.min(255, this.baseColor.g + Math.floor((Math.random() - 0.5) * 40)));
            const b = Math.max(0, Math.min(255, this.baseColor.b + Math.floor((Math.random() - 0.5) * 40)));
            this.color = `rgb(${r}, ${g}, ${b})`;
        } else if (this.isSuper) {
            const lightness = Math.floor(35 + Math.random() * 20);
            this.color = `hsl(282, 100%, ${lightness}%)`;
        } else {
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

class DiamondCell extends BaseCell {
    constructor(x, y, size, points, color) {
        super(x, y, null);
        this.type = 'diamond';
        this.size = size;
        this.points = points;
        this.color = color;
        this.maxLife = window.SETTINGS.DIAMOND_LIFETIME || 600;
        this.life = this.maxLife;
        this.angle = 0; // Für die Rotations-Animation
    }

    update() {
        this.life--;
        this.angle += 0.03; // Dreht sich elegant

        if (this.life <= 0) {
            this.alive = false;
        }
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
