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

        // --- Verknüpfungen für die Ranke ---
        this.parent = parent;
        this.prev = parent;
        this.next = [];

        this.isSuper = isSuper;
        this.baseColor = baseColor;
        // Flag für abgetrennte Äste
        this.isDisconnected = false;

        if (this.isSuper) {
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_SUPER_BASE + Math.random() * 3;
        } else {
            this.maxSize = window.SETTINGS.PLANT_MAX_SIZE_NORMAL;
        }

        if (this.baseColor) {
            const r = Math.max(0, Math.min(255, this.baseColor.r + Math.floor((Math.random() - 0.5) * 80)));
            const g = Math.max(0, Math.min(255, this.baseColor.g + Math.floor((Math.random() - 0.5) * 80)));
            const b = Math.max(0, Math.min(255, this.baseColor.b + Math.floor((Math.random() - 0.5) * 80)));
            this.color = `rgb(${r}, ${g}, ${b})`;
        } else if (this.isSuper) {
            const lightness = Math.floor(25 + Math.random() * 40);
            this.color = `hsl(282, 100%, ${lightness}%)`;
        } else {
            const hue = Math.floor(110 + Math.random() * 20);
            const lightness = Math.floor(25 + Math.random() * 20);
            this.color = `hsl(${hue}, 90%, ${lightness}%)`;
        }

        this.age = 0;
        this.shouldGrow = false;
        this.isTip = true;

        this.pulseOffset = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.001 + Math.random() * 0.002;
    }

    // --- NEU: Clevere Trennungs-Logik ---
    unlink() {
        // 1. Dem Vorgänger (Stumpf) mitteilen, dass wir weg sind
        if (this.prev) {
            const idx = this.prev.next.indexOf(this);
            if (idx > -1) {
                this.prev.next.splice(idx, 1);

                // WICHTIG: Wenn der Vorgänger jetzt keine Kinder mehr hat,
                // wird er zur neuen Spitze und kann wieder wachsen!
                if (this.prev.next.length === 0) {
                    this.prev.isTip = true;
                }
            }
        }

        // 2. Den Nachfolgern (dem abgetrennten Ast) sagen, dass die Verbindung zur Wurzel fehlt
        this.next.forEach(child => {
            child.prev = null;
            child.parent = null;
            // Rekursiv alle Blätter dieses abgetrennten Astes zum Verrotten markieren
            child.setDisconnectedRecursive();
        });

        this.next = [];
        this.prev = null;
        this.parent = null;
    }

    // Hilfsfunktion: Wandert die ganze abgetrennte Ranke ab
    setDisconnectedRecursive() {
        this.isDisconnected = true;
        this.next.forEach(child => child.setDisconnectedRecursive());
    }

    update(isStartup = false) {
        this.age++;

        // --- NEU: Abgetrennte Äste verrotten ganz langsam ---
        if (this.isDisconnected) {
            // 0.005 ist extrem langsam (dauert ewig, bis es ganz verschwindet)
            this.size -= 0.005;
            return; // Abgetrennte Äste wachsen nicht mehr weiter
        }

        // Normales Wachstum für lebende Pflanzen
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

        let root = parent;
        while (root && root.type === 'tail') {
            root = root.parent;
        }
        this.rootAnimal = root;
    }

    update() {
        if (this.parent) {
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

            // --- DER FIX: Lazy Loading ---
            // Wir suchen das Haupt-Tier exakt 1x im ganzen Leben des Schwanzes.
            // Sobald es gefunden wurde, wird diese Schleife nie wieder ausgeführt!
            if (!this.rootAnimal) {
                let root = this.parent;
                while (root && root.type === 'tail') {
                    root = root.parent;
                }
                this.rootAnimal = root;
            }

            // Variable für den restlichen Code definieren
            const rootAnimal = this.rootAnimal;

            let wiggleOffset = 0;
            if (rootAnimal && rootAnimal.wigglePhase !== undefined) {
                // Versatz der Welle: Sorgt dafür, dass die Welle nach hinten durchläuft
                const phaseDelay = this.depth * 0.6;
                const effectiveWiggleDepth = Math.min(this.depth, 5);
                const amplitude = effectiveWiggleDepth * 1.2;

                wiggleOffset = Math.sin(rootAnimal.wigglePhase - phaseDelay) * amplitude;
            }

            const perpAngle = angle + Math.PI / 2; // 90 Grad Winkel zur Wirbelsäule

            if (this.branch !== 0) {
                const spreadStopDepth = 8;
                const effectiveDepth = Math.min(this.depth, spreadStopDepth);
                const branchProgress = Math.max(0, effectiveDepth - 3);
                const spread = Math.sqrt(branchProgress) * 4.5;

                this.x = this.spineX + Math.cos(perpAngle) * ((spread * this.branch) + wiggleOffset);
                this.y = this.spineY + Math.sin(perpAngle) * ((spread * this.branch) + wiggleOffset);
            } else {
                this.x = this.spineX + Math.cos(perpAngle) * wiggleOffset;
                this.y = this.spineY + Math.sin(perpAngle) * wiggleOffset;
            }
        }
    }
}
