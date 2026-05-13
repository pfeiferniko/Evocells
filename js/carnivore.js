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

        // --- 2. SINGLE SOURCE OF TRUTH (Grid-Abfrage) ---
        const maxRadius = Math.max(panicRadius + 50, this.genome.sightRange, 60);
        const maxRadiusSq = maxRadius * maxRadius;
        const panicRadiusSq = panicRadius * panicRadius;

        const allDynamic = dynamicGrid.getEntitiesInArea(this.x, this.y, maxRadius);
        const allStatic = staticGrid.getEntitiesInArea(this.x, this.y, maxRadius);

        const entitiesInArea = [];
        const huntEntities = [];
        const localObstacles = [];
        const moveObstacles = [];

        for (let i = 0; i < allStatic.length; i++) {
            const e = allStatic[i];
            if (e.alive !== false && (e.type === 'plant' || e.type === 'stone')) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq <= maxRadiusSq) {
                    if (distSq <= panicRadiusSq) localObstacles.push(e);
                    if (distSq <= 3600) moveObstacles.push(e);
                }
            }
        }

        for (let i = 0; i < allDynamic.length; i++) {
            const e = allDynamic[i];
            if (e.alive !== false && e !== this) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq <= maxRadiusSq) {
                    if (distSq <= (panicRadius + 50) * (panicRadius + 50)) entitiesInArea.push(e);
                    if (distSq <= this.genome.sightRange * this.genome.sightRange) huntEntities.push(e);
                }
            }
        }

        // =========================================================
        // --- 4. FLUCHTVERHALTEN ---
        // =========================================================
        const previousThreats = this.activeThreats || [];
        let activeThreats = [];

        if (this.berserkTimer <= 0) {

            // --- NEU: Verletzungs-Check ---
            // Wenn die Energie unter 50% fällt, gilt das Tier als verletzt/schwach
            const isInjured = this.energy < this.getMaxEnergy() * 0.5;

            // Ich habe 'largerPredators' zu 'threateningPredators' umbenannt, da es jetzt genauer passt
            const threateningPredators = entitiesInArea.filter(e =>
                e instanceof CarnivoreCell && e.alive && e !== this &&

                // --- NEU: Die erweiterte Größen-Logik ---
                // Flucht wenn: Gegner ist GRÖSSER -> ODER -> (Gegner ist GLEICH GROSS und wir sind verletzt)
                (e.size > this.size || (isInjured && e.size >= this.size)) &&

                !e.isResting && e.reproductionCount < e.maxReproductions &&
                (e.constructor !== this.constructor || (e.constructor === this.constructor && this.isAdult()))
            );

            for (let i = 0; i < threateningPredators.length; i++) {
                const p = threateningPredators[i];
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                if ((dx * dx + dy * dy) <= panicRadiusSq) {
                    if (this.hasLineOfSight(p, localObstacles) || previousThreats.includes(p)) {
                        activeThreats.push(p);
                    }
                }
            }

            this.activeThreats = activeThreats;
            if (activeThreats.length > 0) {
                this.threat = activeThreats[0];
                this.flee(activeThreats, staticGrid);
                return status; // Bricht hier ab, Tier flieht und kämpft nicht!
            }
        } else {
            this.berserkTimer--;
        }

        // =========================================================
        // --- 5. KRIEG & REVIERVERHALTEN (Höchste Priorität) ---
        // =========================================================
        let rivalTarget = null;

        // Tier muss gesund genug für Kämpfe sein (>80%)
        const isHealthyForFight = this.energy > this.getMaxEnergy() * 0.8;

        if (this.isAdult() && this.attacksCarnivores && isHealthyForFight) {
            const aggroRadiusSq = aggroRadius * aggroRadius;
            let minDistSq = Infinity;

            // 1. Suche nach Rivalen oder verfeindeten Rassen
            for (let i = 0; i < huntEntities.length; i++) {
                const e = huntEntities[i];
                if (e instanceof CarnivoreCell && e.alive && e !== this) {

                    const isSameSpecies = (e.constructor === this.constructor);
                    let isValidTarget = false;
                    let effectiveAggroRadiusSq = aggroRadiusSq;

                    if (isSameSpecies) {
                        // --- ARTGENOSSE (Revierkampf) ---
                        // Nur erwachsene Tiere bekämpfen, die eine ähnliche Größe haben (keine Babys mobben)
                        if (e.isAdult() && e.size <= this.size && e.size >= this.size * 0.7) {
                            isValidTarget = true;
                            effectiveAggroRadiusSq = aggroRadiusSq * 0.64; // 80% Radius (0.8 * 0.8 = 0.64)
                        }
                    } else {
                        // --- ANDERE RASSE (Vernichtungskrieg) ---
                        // Voller Radius! Alles angreifen, was schwächer ist, um die Konkurrenz auszurotten (auch Babys!)
                        if (e.size <= this.size) {
                            isValidTarget = true;
                            effectiveAggroRadiusSq = aggroRadiusSq; // 100% Radius
                        }
                    }

                    if (isValidTarget) {
                        const dx = e.x - this.x;
                        const dy = e.y - this.y;
                        const distSq = dx * dx + dy * dy;

                        // Ist er in dem für ihn gültigen Radius und haben wir Sichtlinie?
                        if (distSq <= effectiveAggroRadiusSq && distSq < minDistSq) {
                            if (this.hasLineOfSight(e, localObstacles)) {
                                minDistSq = distSq;
                                rivalTarget = e;
                            }
                        }
                    }
                }
            }

            // 2. Bestehendes Ziel validieren (Muss LEBEN, nah genug sein und Sichtlinie haben)
            if (!rivalTarget && this.target && this.target instanceof CarnivoreCell && this.target.alive) {
                // Welchen Radius nutzen wir fürs Loslassen? (1.5x des normalen Radius)
                const isSameSpeciesTarget = (this.target.constructor === this.constructor);
                const dropRadiusSq = isSameSpeciesTarget ? (aggroRadiusSq * 1.5) : (aggroRadiusSq * 2.25);

                const dx = this.target.x - this.x;
                const dy = this.target.y - this.y;
                const distSq = dx * dx + dy * dy;

                // Verfolgung abbrechen, wenn er zu weit flieht oder sich versteckt
                if (distSq <= dropRadiusSq && this.hasLineOfSight(this.target, localObstacles)) {
                    rivalTarget = this.target;
                } else {
                    this.target = null;
                }
            }
        }

        // Rivalen-Priorität anwenden
        if (rivalTarget) {
            this.target = rivalTarget;
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
                // --- 7. JAGD (Pflanzenfresser) ---
                // =========================================================
                if ((this.ignoreTargetTimer || 0) <= 0) {
                    const timeOfDay = typeof window.dayTime !== 'undefined' ? (window.dayTime % 1) : 0.5;
                    const isNight = (timeOfDay < 0.25 || timeOfDay > 0.75);

                    // --- NEU: Darf das Tier jetzt jagen? ---
                    // Ja, wenn es NICHT Nacht ist ODER wenn das Tier nachtaktiv ist!
                    const canHuntNow = !isNight || this.huntsAtNight;

                    if (canHuntNow && (!this.target || !this.target.alive || this.age % 60 === 0)) {
                        const herbivores = [];
                        for (let i = 0; i < huntEntities.length; i++) {
                            const e = huntEntities[i];
                            if (e instanceof HerbivoreCell && e.alive && e.size <= this.size) {
                                herbivores.push(e);
                            }
                        }
                        let newTarget = this.findBestPreyInSight ? this.findBestPreyInSight(herbivores, dynamicGrid, staticGrid, this.target) : herbivores[0];

                        if (newTarget) {
                            this.target = newTarget;
                            this.targetTimer = 0;
                        } else if (!this.target || !this.target.alive) {
                            this.target = null;
                        }
                    } else if (!canHuntNow && (!this.target || !this.target.alive)) {
                        // Wenn das Tier jetzt nicht jagen darf (weil es Nacht ist und es KEIN huntsAtNight hat)
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
        this.move(this.target || this.waypoint, false, moveObstacles);
        return status;
    }
}