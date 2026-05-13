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
    }

    update(staticGrid, dynamicGrid) {
        const status = super.update(staticGrid, dynamicGrid);
        if (status !== 'moving') return status;

        // --- 1. RADIEN BERECHNEN ---
        let panicRadius = this.genome.sightRange * window.SETTINGS.FLEE_PANIC_RADIUS_HERBIVORE;
        if (this.activeThreats && this.activeThreats.length > 0) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        // --- 2. SINGLE SOURCE OF TRUTH ---
        const maxRadius = Math.max(panicRadius, this.genome.sightRange, 60);
        const maxRadiusSq = maxRadius * maxRadius;
        const panicRadiusSq = panicRadius * panicRadius;
        const sightRangeSq = this.genome.sightRange * this.genome.sightRange;

        const allDynamic = dynamicGrid.getEntitiesInArea(this.x, this.y, maxRadius);
        const allStatic = staticGrid.getEntitiesInArea(this.x, this.y, maxRadius);

        const predators = [];
        const visiblePlants = [];
        const localObstacles = [];
        const moveObstacles = [];

        // Statische Objekte (Hindernisse & Futter) sortieren
        for (let i = 0; i < allStatic.length; i++) {
            const e = allStatic[i];
            if (e.alive !== false) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const distSq = dx * dx + dy * dy;

                if (distSq <= maxRadiusSq) {
                    if (distSq <= 3600) moveObstacles.push(e); // 60 * 60

                    if (e.type === 'plant' || e.type === 'stone') {
                        if (distSq <= panicRadiusSq) localObstacles.push(e);
                    }
                    if (e.type === 'plant' && distSq <= sightRangeSq) {
                        visiblePlants.push(e);
                    }
                }
            }
        }

        // Dynamische Objekte (Räuber) sortieren
        for (let i = 0; i < allDynamic.length; i++) {
            const e = allDynamic[i];
            if (e instanceof CarnivoreCell && e.alive && !e.isResting && e.reproductionCount < e.maxReproductions && e.size >= this.size) {
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const distSq = dx * dx + dy * dy;

                if (distSq <= panicRadiusSq) {
                    predators.push(e);
                }
            }
        }

        // --- 3. FLUCHT & LOGIK ---
        const previousThreats = this.activeThreats || [];
        this.threat = null;
        let activeThreats = [];

        for (let i = 0; i < predators.length; i++) {
            const p = predators[i];
            // Wir sparen uns hier Math.sqrt, da wir in der Sortierung schon geprüft haben, dass sie im Radius sind!
            if (this.hasLineOfSight(p, localObstacles) || previousThreats.includes(p)) {
                activeThreats.push(p);
            }
        }

        // Das gesamte Rudel für den nächsten Frame im Tier speichern!
        this.activeThreats = activeThreats;

        if (activeThreats.length > 0) {
            this.threat = activeThreats[0]; // Behalten wir für die rote Debug-Linie
            this.flee(activeThreats, staticGrid);
            return status;
        } else {
            this.threat = null;
            this.currentFleeTarget = null;
        }

        this.checkTargetTimeout();

        if (this.reproductionCount >= this.maxReproductions) {
            this.target = null; // Das alte Tier sucht nichts mehr
        } else if ((this.ignoreTargetTimer || 0) <= 0) {
            // Wir aktualisieren das Ziel regelmäßig (alle 15 Frames) oder wenn wir keins haben
            if (!this.target || !this.target.alive || this.age % 15 === 0) {
                const newTarget = this.findClosestInSight(visiblePlants, this.target);

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

        // Ziel und Hindernisse übergeben
        this.move(this.target, false, moveObstacles);
        return status;
    }
}