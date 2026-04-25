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
        this.birthCooldown = window.SETTINGS.HERB_COOLDOWN_REPRO;

        // --- NEU: 5% Chance auf nicht-vererbbaren Riesenwuchs ---
        if (allowGiant && Math.random() < 0.05) {
            this.isGiant = true;
            this.maxSize = this.genome.maxSize + 6;
            this.size = 5;
            // Die Riesen leuchten auffällig Gold/Gelb, damit du sie sofort erkennst
            this.color = `rgb(255, 255, 0)`;
            this.dotColor = `rgb(0, 0, 0)`;
            this.maxReproductions = Infinity;
        }
    }

    update(staticGrid, dynamicGrid) {
        const status = super.update(staticGrid, dynamicGrid);
        if (status !== 'moving') return status;

        let panicRadius = this.genome.sightRange * window.SETTINGS.FLEE_PANIC_RADIUS_HERBIVORE;

        // --- HYSTERESE-BONUS ---
        // Wenn das Tier im letzten Frame bereits auf der Flucht war,
        // addieren wir den Bonus, damit es nicht sofort aufhört zu fliehen,
        // wenn der Räuber nur 1 Pixel außerhalb des normalen Radius ist.
        if (this.threat) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        const predators = dynamicGrid.getEntitiesInArea(this.x, this.y, panicRadius).filter(e =>
            e instanceof CarnivoreCell && e.alive && !e.isResting && e.reproductionCount < e.maxReproductions
        );

        this.threat = null;
        let activeThreats = [];

        for (const p of predators) {
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= panicRadius) {
                activeThreats.push(p); // Alle gefährlichen Jäger in die Liste packen!
            }
        }

        if (activeThreats.length > 0) {
            this.threat = activeThreats[0]; // Behalten wir für die Hysterese und die rote Debug-Linie
            this.flee(activeThreats, staticGrid); // Das gesamte Array an die Flucht-Funktion übergeben
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
                const plants = staticGrid.getEntitiesInArea(this.x, this.y, this.genome.sightRange).filter(e =>
                    e.type === 'plant' && e.alive
                );
                const newTarget = this.findClosestInSight(plants, this.target);

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

        // Hindernisse (Steine/Pflanzen) aus dem Static Grid laden
        const obstacles = staticGrid.getEntitiesInArea(this.x, this.y, 60);

        // Ziel und Hindernisse übergeben
        this.move(this.target, false, obstacles);
        return status;
    }
}