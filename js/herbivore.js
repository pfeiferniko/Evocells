class HerbivoreCell extends AnimalCell {
    constructor(x, y, genome) {
        super(x, y, genome);

        const r = Math.floor(200 + Math.random() * 55);
        const g = Math.floor(100 + Math.random() * 80);
        const b = Math.floor(Math.random() * 40);
        this.color = `rgb(${r}, ${g}, ${b})`;

        const hue = Math.floor(180 + Math.random() * 120);
        // Helligkeit auf 20% bis 35% setzen (schön dunkel) und Sättigung minimal runter
        const lightness = Math.floor(20 + Math.random() * 15);
        this.dotColor = `hsl(${hue}, 80%, ${lightness}%)`;

        // --- NEU: 5% Chance auf nicht-vererbbaren Riesenwuchs ---
        if (Math.random() < 0.05) {
            this.isGiant = true;
            this.maxSize = this.genome.maxSize + 5;
            this.size = 5;
            // Die Riesen leuchten auffällig Gold/Gelb, damit du sie sofort erkennst
            this.color = `rgb(255, 255, 0)`;
            this.dotColor = `rgb(0, 0, 0)`;
        }

        this.metabolismMultiplier = 1.0;
        this.target = null;
        this.threat = null;
        this.maxReproductions = window.SETTINGS.HERB_MAX_REPRODUCTIONS;
        this.genome.sightRange = window.SETTINGS.HERB_SIGHT_RANGE_MULTIPLIER;
        this.birthCooldown = window.SETTINGS.HERB_COOLDOWN_REPRO;
    }

    /*getMetabolismMultiplier() {
        let multiplier = this.metabolismMultiplier;
        if (!this.hasReproduced) multiplier *= 1.2;
        multiplier -= (this.tailSegments.length * 0.05);
        return Math.max(0.8, multiplier);
    }*/

    update(grid) {
        const status = this.updateBase(grid);
        if (status !== 'moving') return status;

        let panicRadius = this.genome.sightRange * window.SETTINGS.FLEE_PANIC_RADIUS_HERBIVORE;

        // --- HYSTERESE-BONUS ---
        // Wenn das Tier im letzten Frame bereits auf der Flucht war,
        // addieren wir den Bonus, damit es nicht sofort aufhört zu fliehen,
        // wenn der Räuber nur 1 Pixel außerhalb des normalen Radius ist.
        if (this.threat) {
            panicRadius += window.SETTINGS.FLEE_HYSTERESIS_BONUS;
        }

        const searchRadius = Math.max(this.genome.sightRange, panicRadius);
        const entitiesInArea = grid.getEntitiesInArea(this.x, this.y, searchRadius);


        const predators = entitiesInArea.filter(e =>
            e instanceof CarnivoreCell &&
            e.alive &&
            e.size >= this.size &&
            !e.isResting
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
            this.flee(activeThreats, grid); // Das gesamte Array an die Flucht-Funktion übergeben
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
                const plants = entitiesInArea.filter(e => e.type === 'plant' && e.alive);
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

        // Nutzt target (Essen). Wenn kein Essen da ist, nutzt es waypoint (freier Platz).
        // Wir übergeben 'entitiesInArea', damit die Boids-Ausweich-KI auch hier greift!
        this.move(this.target);
        return status;
    }
}