class SnakeCell extends CarnivoreCell {
    constructor(x, y, genome) {
        super(x, y, genome); // Erbt alles vom normalen Fleischfresser

        // Ein leuchtendes Cyan (viel Blau und Grün, wenig Rot)
        const r = Math.floor(Math.random() * 40);       // 0 - 40
        const g = Math.floor(180 + Math.random() * 75); // 180 - 255
        const b = Math.floor(180 + Math.random() * 75); // 180 - 255
        this.color = `rgb(${r}, ${g}, ${b})`;

        // Die Pünktchen auf dem Rücken machen wir dunkelblau für Kontrast
        this.dotColor = `hsl(200, 80%, 20%)`;

        // Optional: Schlangen haben vielleicht einen etwas effizienteren Stoffwechsel
        this.metabolismMultiplier = 0.4;

        // --- NEU: Schlangen haben einen längeren Schwanz ---
        // (Größe * 2) + 2 -> Bei Größe 3 sind das 8 Glieder.
        this.tailLengthMultiplier = 3.0;
        this.tailLengthOffset = 3;

        this.attacksCarnivores = false;

        this.maxReproductions = window.SETTINGS.SNAKE_MAX_REPRODUCTIONS;
        this.birthCooldown = window.SETTINGS.SNAKE_COOLDOWN_REPRO;
        this.startTailLength = 8; // Schlangenbabys sind sofort lang!
        this.speedMultiplier = 1.1;
    }
}