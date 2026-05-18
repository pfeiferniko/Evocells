class HerbivoreCell extends AnimalCell {
    constructor(x, y, genome, allowGiant = false) {
        super(x, y, genome);

        const r = Math.floor(200 + Math.random() * 55);
        const g = Math.floor(100 + Math.random() * 80);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        // Helligkeit auf 20% bis 35% setzen (schön dunkel) und Sättigung minimal runter
        const lightness = Math.floor(20 + Math.random() * 15);
        this.dotColor = `hsl(${hue}, 80%, ${lightness}%)`;

        this.maxReproductions = window.SETTINGS.HERB_MAX_REPRODUCTIONS;
        this.metabolismMultiplier = 1.0;
        this.target = null;
        this.threat = null;
        this.genome.sightRange = window.SETTINGS.HERB_SIGHT_RANGE_MULTIPLIER;
        this.genome.sightAngle = window.SETTINGS.HERB_SIGHT_ANGLE;
        this.birthCooldown = window.SETTINGS.HERB_COOLDOWN_REPRO;

        if (allowGiant) {
            this.isGiant = true;
            this.maxSize = 9;
            this.size = 5;
            // Die Riesen leuchten auffällig Gold/Gelb, damit du sie sofort erkennst
            this.color = `rgb(255, 255, 0)`;
            this.dotColor = `rgb(0, 0, 0)`;
            this.maxReproductions = Infinity;
        }

        this.tailLengthMultiplier = 0.8;
        this.tailLengthOffset = -2;
        this.moveObstacles = [];
        this.activeThreats = [];
        this.predators = [];
        this.visiblePlants = [];
        this.localObstacles = [];
    }

    update(staticGrid, dynamicGrid) {
        const status = super.update(staticGrid, dynamicGrid);
        if (status !== 'moving') return status;

        // --- 1. RADIEN BERECHNEN ---
        let panicRadius = this.genome.sightRange * window.SETTINGS.FLEE_PANIC_RADIUS_HERBIVORE;
        if (this.activeThreats && this.activeThreats.length > 0) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        const panicRadiusSq = panicRadius * panicRadius;
        const sightRangeSq = this.genome.sightRange * this.genome.sightRange;

        // =========================================================
        // --- 2. MOVEMENT HINDERNISSE (Jeden Frame, winziger Radius) ---
        // =========================================================
        this.moveObstacles.length = 0;
        const smallStatic = staticGrid.getEntitiesInArea(this.x, this.y, 60);
        for (let i = 0; i < smallStatic.length; i++) {
            const e = smallStatic[i];
            if (e.alive !== false && (e.type === 'plant' || e.type === 'stone')) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                if (dx * dx + dy * dy <= 3600) this.moveObstacles.push(e); // 60 * 60
            }
        }

        // =========================================================
        // --- 3. FEIND-SCAN (KI-Schlaf: Nur alle 5 Frames!) ---
        // =========================================================
        if (this.threatScanTimer === undefined) {
            this.threatScanTimer = Math.floor(Math.random() * 5); // Desynchronisation gegen Ruckler!
            this.activeThreats.length = 0;
        }
        this.threatScanTimer++;

        if (this.threatScanTimer > 5) {
            const previousThreats = this.activeThreats || [];
            this.activeThreats.length = 0;

            // Nur das dynamische Grid nach Feinden absuchen
            const dynamicInArea = dynamicGrid.getEntitiesInArea(this.x, this.y, panicRadius);
            this.predators.length = 0;

            for (let i = 0; i < dynamicInArea.length; i++) {
                const e = dynamicInArea[i];
                if (e instanceof CarnivoreCell && e.alive && !e.isResting && e.reproductionCount < e.maxReproductions && e.size >= this.size) {
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    if (dx * dx + dy * dy <= panicRadiusSq) {
                        this.predators.push(e);
                    }
                }
            }

            // --- OPTIMIERUNG: Sichtlinie & Steine nur laden, wenn Feinde existieren! ---
            if (this.predators.length > 0) {
                this.localObstacles.length = 0;
                const staticInArea = staticGrid.getEntitiesInArea(this.x, this.y, panicRadius);

                for (let i = 0; i < staticInArea.length; i++) {
                    const e = staticInArea[i];
                    if (e.alive !== false && (e.type === 'plant' || e.type === 'stone')) {
                        // Minimalistischer Distanz-Check für Hindernisse
                        const dx = e.x - this.x;
                        const dy = e.y - this.y;
                        if (dx * dx + dy * dy <= panicRadiusSq) this.localObstacles.push(e);
                    }
                }

                for (let i = 0; i < this.predators.length; i++) {
                    const p = this.predators[i];
                    if (this.hasLineOfSight(p, this.localObstacles) || previousThreats.includes(p)) {
                        this.activeThreats.push(p);
                    }
                }
            }
            this.threatScanTimer = 0;
        }

        // --- FLUCHT AUSFÜHREN ---
        if (this.activeThreats.length > 0) {
            this.threat = this.activeThreats[0];
            this.flee(this.activeThreats, staticGrid);
            return status;
        } else {
            this.threat = null;
            this.currentFleeTarget = null;
        }

        this.checkTargetTimeout();

        // =========================================================
        // --- 4. FUTTERSUCHE (Lazy Fetching: Nur alle 15 Frames!) ---
        // =========================================================
        if (this.reproductionCount >= this.maxReproductions) {
            this.target = null;
        } else if ((this.ignoreTargetTimer || 0) <= 0) {

            if (this.foodSearchTimer === undefined) {
                this.foodSearchTimer = Math.floor(Math.random() * 15);
            }
            this.foodSearchTimer++;

            // Suche nur, wenn kein Ziel vorhanden, Ziel tot oder 15 Frames vergangen sind
            if (!this.target || !this.target.alive || this.foodSearchTimer > 15) {

                this.visiblePlants.length = 0;
                // Das Grid NUR DANN abfragen, wenn wir wirklich Hunger haben!
                const staticInArea = staticGrid.getEntitiesInArea(this.x, this.y, this.genome.sightRange);

                for (let i = 0; i < staticInArea.length; i++) {
                    const e = staticInArea[i];
                    if (e.alive !== false && e.type === 'plant') {
                        const dx = e.x - this.x;
                        const dy = e.y - this.y;
                        if (dx * dx + dy * dy <= sightRangeSq) {
                            this.visiblePlants.push(e);
                        }
                    }
                }

                if (this.visiblePlants.length > 0) {
                    const newTarget = this.findClosestInSight(this.visiblePlants, this.target);
                    if (newTarget) {
                        this.target = newTarget;
                        this.targetTimer = 0;
                    } else if (!this.target || !this.target.alive) {
                        this.target = null;
                    }
                } else {
                    this.target = null;
                }

                this.foodSearchTimer = 0;
            }
        } else {
            this.target = null;
        }

        // =========================================================
        // --- 5. FINALE BEWEGUNG ---
        // =========================================================
        this.move(this.target, false, this.moveObstacles);
        return status;
    }
}