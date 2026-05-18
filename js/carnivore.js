class CarnivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);

        // --- NEU: Raubtier-Sinne (Adleraugen) ---
        // Wir vergrößern den Radius für Angriff (sightRange) und Flucht (panicRadius) um 50%
        if (this.genome && this.genome.sightRange) {
            this.genome.sightRange *= 1.5;
        }

        // Falls dein Flucht-Verhalten einen separaten Panic-Radius nutzt, vergrößern wir den auch:
        if (this.panicRadius) {
            this.panicRadius *= 1.5;
        } else if (this.genome && this.genome.panicRadius) {
            this.genome.panicRadius *= 1.5;
        }

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
        this.attacksCarnivores = true; // Rote Fleischfresser greifen Artgenossen an
        this.isResting = false;        // <--- NEU: Speichert den Verdauungs-Zustand
        this.birthCooldown = window.SETTINGS.CARN_COOLDOWN_REPRO;

        this.moveObstacles = [];
        this.activeThreats = [];
        this.localObstacles = [];
        this.herbivores = [];
    }

    update(staticGrid, dynamicGrid) {
        const status = super.update(staticGrid, dynamicGrid);
        if (status !== 'moving') return status;

        this.checkTargetTimeout(); // Überprüfen, ob sie feststeckt

        // --- 1. RADIEN BERECHNEN ---
        const aggroRadius = window.SETTINGS.CARN_AGGRO_RADIUS_BASE + (this.size * window.SETTINGS.CARN_AGGRO_RADIUS_PER_SIZE);
        let basePanicRadius = window.SETTINGS.CARN_PANIC_RADIUS_BASE + (this.size * window.SETTINGS.CARN_PANIC_RADIUS_PER_SIZE);

        const pMult = this.panicMultiplier !== undefined ? this.panicMultiplier : 1.0;
        let panicRadius = basePanicRadius * pMult;

        if (this.activeThreats && this.activeThreats.length > 0) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        const panicRadiusSq = panicRadius * panicRadius;
        const aggroRadiusSq = aggroRadius * aggroRadius;

        // =========================================================
        // --- 2. BEWEGUNGSHINDERNISSE (Jeden Frame, aber winziger Radius!) ---
        // =========================================================
        // Für das reine Schwimmen reicht es, 60 Pixel um das Tier zu scannen.
        // Das ist extrem schnell und verhindert Wand-Kollisionen.
        this.moveObstacles.length = 0;
        const smallStatic = staticGrid.getEntitiesInArea(this.x, this.y, 60);
        for (let i = 0; i < smallStatic.length; i++) {
            const e = smallStatic[i];
            if (e.alive !== false && (e.type === 'plant' || e.type === 'stone')) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                if (dx * dx + dy * dy <= 3600) this.moveObstacles.push(e);
            }
        }

        // =========================================================
        // --- 3. FLUCHT & REVIER SCAN (KI-Schlaf: Nur alle 10 Frames!) ---
        // =========================================================
        if (this.threatScanTimer === undefined) {
            this.threatScanTimer = Math.floor(Math.random() * 10);
            this.activeThreats.length = 0;
            this.rivalTarget = null;
        }
        this.threatScanTimer++;

        const isInjured = this.energy < this.getMaxEnergy() * 0.5;
        const isHealthyForFight = this.energy > this.getMaxEnergy() * 0.8;

        if (this.threatScanTimer > 10) {
            this.activeThreats.length = 0;
            this.rivalTarget = null;

            // ERST HIER rufen wir den großen Radius ab, und das nur alle 10 Frames!
            const scanRadius = Math.max(panicRadius, aggroRadius) + 50;
            const dynamicInArea = dynamicGrid.getEntitiesInArea(this.x, this.y, scanRadius);
            const staticInArea = staticGrid.getEntitiesInArea(this.x, this.y, scanRadius);

            this.localObstacles.length = 0;
            for (let i = 0; i < staticInArea.length; i++) {
                const e = staticInArea[i];
                if (e.alive !== false && (e.type === 'plant' || e.type === 'stone')) {
                    this.localObstacles.push(e);
                }
            }

            let minDistSq = Infinity;

            for (let i = 0; i < dynamicInArea.length; i++) {
                const e = dynamicInArea[i];
                if (e instanceof CarnivoreCell && e.alive && e !== this) {
                    const dx = e.x - this.x;
                    const dy = e.y - this.y;
                    const distSq = dx * dx + dy * dy;

                    // --- FLUCHT CHECK ---
                    if (distSq <= panicRadiusSq) {
                        if ((e.size > this.size || (isInjured && e.size >= this.size)) &&
                            !e.isResting && e.reproductionCount < e.maxReproductions &&
                            (e.constructor !== this.constructor || (e.constructor === this.constructor && this.isAdult()))) {

                            if (this.hasLineOfSight(e, this.localObstacles)) {
                                this.activeThreats.push(e);
                            }
                        }
                    }

                    // --- REVIER CHECK ---
                    if (this.isAdult() && this.attacksCarnivores && isHealthyForFight) {
                        const isSameSpecies = (e.constructor === this.constructor);
                        let isValidTarget = false;
                        let effectiveAggroRadiusSq = aggroRadiusSq;

                        if (isSameSpecies) {
                            if (e.isAdult() && e.size <= this.size && e.size >= this.size * 0.7) {
                                isValidTarget = true;
                                effectiveAggroRadiusSq = aggroRadiusSq * 0.64;
                            }
                        } else {
                            if (e.size <= this.size) {
                                isValidTarget = true;
                                effectiveAggroRadiusSq = aggroRadiusSq;
                            }
                        }

                        if (isValidTarget && distSq <= effectiveAggroRadiusSq && distSq < minDistSq) {
                            if (this.hasLineOfSight(e, this.localObstacles)) {
                                minDistSq = distSq;
                                this.rivalTarget = e;
                            }
                        }
                    }
                }
            }
            this.threatScanTimer = 0; // Timer zurücksetzen
        }

        // =========================================================
        // --- 4. FLUCHTVERHALTEN AUSFÜHREN ---
        // =========================================================
        if (this.berserkTimer <= 0) {
            if (this.activeThreats && this.activeThreats.length > 0) {
                this.threat = this.activeThreats[0];
                this.flee(this.activeThreats, staticGrid);
                return status; // Bricht hier ab, Tier flieht und kämpft nicht!
            }
        } else {
            this.berserkTimer--;
        }

        // =========================================================
        // --- 5. KRIEG & REVIERVERHALTEN AUSFÜHREN ---
        // =========================================================

        // Prüfen, ob das gespeicherte Ziel noch lebt
        if (this.rivalTarget && !this.rivalTarget.alive) this.rivalTarget = null;

        if (!this.rivalTarget && this.target && this.target instanceof CarnivoreCell && this.target.alive) {
            const isSameSpeciesTarget = (this.target.constructor === this.constructor);
            const dropRadiusSq = isSameSpeciesTarget ? (aggroRadiusSq * 1.5) : (aggroRadiusSq * 2.25);

            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            const distSq = dx * dx + dy * dy;

            if (distSq <= dropRadiusSq) {
                this.rivalTarget = this.target; // Weiter verfolgen!
            } else {
                this.target = null;
            }
        }

        if (this.rivalTarget) {
            this.target = this.rivalTarget;
            this.isResting = false;
            this.ignoreTargetTimer = 0;
            this.targetTimer = 0;
        }
        else {
            // =========================================================
            // --- 6. RUHEPHASEN & ALTER ---
            // =========================================================
            if (this.energy > this.getMaxEnergy() * 0.9 && this.birthCooldown > 0 && this.isAdult()) {
                this.isResting = true;
            } else if (this.energy < this.getMaxEnergy() * 0.7 || this.birthCooldown <= 0 || this.berserkTimer > 0) {
                this.isResting = false;
            }

            if (this.isResting || this.reproductionCount >= this.maxReproductions) {
                this.target = null;
            } else {
                // =========================================================
                // --- 7. JAGD (Beute suchen) ---
                // =========================================================
                if ((this.ignoreTargetTimer || 0) <= 0) {
                    const timeOfDay = typeof window.dayTime !== 'undefined' ? (window.dayTime % 1) : 0.5;
                    const isNight = (timeOfDay < 0.25 || timeOfDay > 0.75);
                    const canHuntNow = !isNight || this.huntsAtNight;

                    if (canHuntNow) {
                        if (this.huntSearchTimer === undefined) this.huntSearchTimer = Math.floor(Math.random() * 30);
                        this.huntSearchTimer++;

                        if (!this.target || !this.target.alive || this.huntSearchTimer > 30) {

                            // --- LAZY FETCHING FÜR DIE JAGD ---
                            // Nur alle 30 Frames wird das Grid nach Beute durchsucht!
                            const huntDynamic = dynamicGrid.getEntitiesInArea(this.x, this.y, this.genome.sightRange);
                            this.herbivores.length = 0;

                            for (let i = 0; i < huntDynamic.length; i++) {
                                const e = huntDynamic[i];
                                if (e instanceof HerbivoreCell && e.alive && e.size <= this.size) {
                                    this.herbivores.push(e);
                                }
                            }

                            if (this.herbivores.length > 0) {
                                let newTarget = this.findBestPreyInSight ? this.findBestPreyInSight(this.herbivores, dynamicGrid, staticGrid, this.target) : this.herbivores[0];

                                if (newTarget) {
                                    this.target = newTarget;
                                    this.targetTimer = 0;
                                } else if (!this.target || !this.target.alive) {
                                    this.target = null;
                                }
                            } else {
                                this.target = null;
                            }

                            this.huntSearchTimer = 0;
                        }

                    } else if (!canHuntNow && (!this.target || !this.target.alive)) {
                        this.target = null;
                    }
                } else {
                    this.target = null;
                }
            }
        }

        // =========================================================
        // --- 8. FINALE BEWEGUNG ---
        // =========================================================
        this.move(this.target || this.waypoint, false, this.moveObstacles);
        return status;
    }
}