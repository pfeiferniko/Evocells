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
        const entitiesInArea = dynamicGrid.getEntitiesInArea(this.x, this.y, panicRadius + 50);

        // --- 1. FLUCHT VOR GRÖSSEREN RÄUBERN ---
        const previousThreat = this.threat; // <--- NEU: Alten Verfolger für diesen Frame kurz merken!
        this.threat = null;

        // --- NEU: Hindernisse für den Flucht-Sicht-Check laden ---
        const localObstacles = staticGrid.getEntitiesInArea(this.x, this.y, panicRadius).filter(e =>
            (e.type === 'plant' || e.type === 'stone') && e.alive !== false
        );

        // Fluchtinstinkt greift erst, wenn es kein Baby mehr ist
        if (this.berserkTimer <= 0) {
            const largerPredators = entitiesInArea.filter(e =>
                e instanceof CarnivoreCell &&
                e.alive &&
                e !== this &&
                e.size > this.size &&
                !e.isResting &&
                e.reproductionCount < e.maxReproductions &&
                (e.target === this || previousThreat === e || this.isAdult())
            );

            let activeThreats = [];

            for (const p of largerPredators) {
                const dx = p.x - this.x;
                const dy = p.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist <= panicRadius) {
                    if (this.hasLineOfSight(p, localObstacles)) {
                        activeThreats.push(p);
                    }
                }
            }

            if (activeThreats.length > 0) {
                this.threat = activeThreats[0]; // Für Hysterese/Debug-Linie
                this.flee(activeThreats, staticGrid); // Das gesamte Array übergeben
                return status;
            } else {
                this.threat = null;
                this.currentFleeTarget = null;
            }
        } else {
            this.currentFleeTarget = null;
            this.berserkTimer--;
        }

        // --- NEU: Verdauungspause mit Hysterese (An bei >90%, Aus bei <80%) ---
        // 1. Koma schaltet sich EIN, wenn das Tier extrem voll ist UND der Timer läuft
        if (this.energy > this.getMaxEnergy() * 0.9 && this.birthCooldown > 0 && this.isAdult()) {
            this.isResting = true;
        }
        // 2. Koma schaltet sich AUS, wenn die Energie unter 80% fällt ODER der Timer abläuft
        else if (this.energy < this.getMaxEnergy() * 0.7 || this.birthCooldown <= 0 || this.berserkTimer > 0) {
            this.isResting = false;
        }

        if (this.isResting) {
            // Tier ist im Fresskoma und entspannt sich: Lass die aktuelle Beute los!
            this.target = null;
            // --- NEU: Altersschwäche ---
        } else if (this.reproductionCount >= this.maxReproductions) {
            // Das Tier ist zu alt für Jagd und Revierkämpfe
            this.target = null;
        } else {

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

            // NEU: Prüfe, ob das Tier überhaupt Revierkämpfe macht
            if (isAdult && this.attacksCarnivores && (!this.target || !(this.target instanceof CarnivoreCell))) {
                const nearbyRivals = entitiesInArea.filter(e =>
                    e instanceof CarnivoreCell &&
                    e.alive &&
                    e !== this &&
                    e.size >= e.maxSize * 0.85 && // Geändert auf e.maxSize
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
                if (!this.target || !this.target.alive || this.age % 60 === 0) {
                    // Für die Jagd schauen wir wieder etwas weiter
                    const huntEntities = dynamicGrid.getEntitiesInArea(this.x, this.y, this.genome.sightRange);

                    const herbivores = huntEntities.filter(e =>
                        e instanceof HerbivoreCell &&
                        e.alive &&
                        e.size <= this.size
                    );
                    let newTarget = this.findBestPreyInSight(herbivores, dynamicGrid, staticGrid, this.target);

                    // Nur nach anderen Räubern suchen, wenn es erlaubt ist
                    if (!newTarget && this.attacksCarnivores) {
                        const smallerCarnivores = huntEntities.filter(e =>
                            e instanceof CarnivoreCell &&
                            e.alive &&
                            e !== this &&
                            e.size <= this.size
                        );
                        newTarget = this.findBestPreyInSight(smallerCarnivores, dynamicGrid, staticGrid, this.target);
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
        } // <--- ENDE DER VERDAUUNGSPAUSE (else-Block zu)

        // --- KORREKTUR: Hindernisse aus dem Static Grid holen! ---
        const obstacles = staticGrid.getEntitiesInArea(this.x, this.y, 60);

        // Nutzt target (Essen). Wenn kein Essen da ist, nutzt es waypoint (freier Platz).
        // Wir übergeben 'entitiesInArea', damit die Boids-Ausweich-KI auch hier greift!
        this.move(this.target || this.waypoint, false, obstacles);
        return status;
    }
}