window.SETTINGS = {
    // ==========================================
    // WELT & ENGINE
    // ==========================================
    WORLD_BASE_WIDTH: 2000,
    WORLD_BASE_HEIGHT: 1000,
    GRID_SIZE: 50,
    STARTUP_PHASE_DURATION: 4000, // Millisekunden für die anfängliche "Schnellwachstum"-Phase der Pflanzen

    // ==========================================
    // START-BEDINGUNGEN (SPAWN)
    // ==========================================
    SPAWN_HERBIVORES: 30, // Startanzahl Pflanzenfresser
    SPAWN_CARNIVORES: 3,  // Startanzahl Fleischfresser
    SPAWN_SUPER_STONES: 2, // Anzahl lila leuchtende Super-Steine (wachsen sehr schnell)
    SPAWN_NORMAL_STONES: 15, // Anzahl normale Steine

    // ==========================================
    // POPULATIONS-GRENZEN (GEBURTENKONTROLLE)
    // ==========================================
    MAX_CARNIVORES_FOR_BIRTH: 8, // Ab dieser Anzahl Räuber auf der Karte bekommen sie keine Kinder mehr
    HERBIVORE_OVERPOPULATION_START: 30, // Ab hier sinkt die Kinderzahl von Pflanzenfressern allmählich
    HERBIVORE_OVERPOPULATION_MAX: 100, // Ab hier bekommen Pflanzenfresser nur noch 1 Kind

    // ==========================================
    // FLUCHTVERHALTEN (FLEE)
    // ==========================================
    FLEE_TARGET_DISTANCE: 25, // Wie weit weg wird das virtuelle Fluchtziel gesetzt? (in Pixel)
    FLEE_TEST_DISTANCE: 20,   // Wie weit schaut das Tier bei der Fächersuche nach vorne, um Hindernisse zu erkennen?
    FLEE_ANGLE_STEP: Math.PI / 36, // In welchen Schritten (hier: 5 Grad) sucht das Tier nach Auswegen?
    FLEE_MAX_OFFSET: Math.PI * 0.75, // Wie weit darf der Ausweg maximal vom idealen Fluchtweg abweichen? (hier: 135 Grad)
    FLEE_SCORE_IDEAL_WEIGHT: 2.0, // Wie wichtig ist es dem Tier, exakt in die entgegengesetzte Richtung des Feindes zu schwimmen? (Höher = direkter Weg)
    FLEE_SCORE_CURRENT_WEIGHT: 1.0, // Wie wichtig ist es dem Tier, sich wenig drehen zu müssen? (Höher = weniger Wackeln)
    FLEE_PANIC_RADIUS_HERBIVORE: 3.0, // Multiplikator für die Sichtweite: Wann gerät ein Pflanzenfresser in Panik?
    FLEE_PANIC_RADIUS_CARNIVORE: 4.0, // Multiplikator für den Aggro-Radius: Wann gerät ein Räuber vor einem größeren Räuber in Panik?
    FLEE_HYSTERESIS_BONUS: 100, // Wie viele Pixel wird der Fluchtradius erweitert, während das Tier bereits flieht? (Verhindert hin- und herwechseln)
    
    // ==========================================
    // JAGD-VERHALTEN (HUNTING)
    // ==========================================
    HUNT_SCORE_DISTANCE_WEIGHT: 2.0, // Wie stark wird die Distanz gewertet? (Höher = bevorzugt nähere Ziele massiv)
    HUNT_SCORE_SPEED_WEIGHT: 30, // Wie stark wird die Geschwindigkeit der Beute bewertet? (Runtergesetzt, Distanz ist jetzt wichtiger)
    HUNT_SCORE_RIVAL_PENALTY: 200, // Straf-Score für Beute, die nah an anderen großen Räubern ist (Höher = meidet die Nähe anderer Räuber stärker)
    HUNT_RIVAL_AVOID_RADIUS: 300, // Wie weit schaut der Räuber nach Konkurrenten bei der Beutewahl?
    HUNT_TARGET_STICKINESS: 150, // Bonus-Score (Abzug) für das aktuell verfolgte Ziel, um ständiges hin- und herwechseln zu verhindern

    // ==========================================
    // BEWEGUNG & FESTSTECKEN (STUCK)
    // ==========================================
    STUCK_TIMER_MAX: 40,      // Wie viele Frames (ca. 60 pro Sek) wird gemessen, bevor das Tier als "feststeckend" gilt?
    STUCK_MIN_MOVEMENT: 15,   // Wie viele Pixel Strecke muss sich ein Tier in dieser Zeit insgesamt bewegt haben?
    TURN_SPEED_NORMAL: 0.2,   // Maximale Drehung pro Frame bei normaler Fortbewegung
    TURN_SPEED_COMBAT: 1.0,   // Maximale Drehung pro Frame im Nahkampf/beim Fressen (Distanz < 30)

    // ==========================================
    // ALTERUNG (AGING)
    // ==========================================
    AGING_DECAY_RATE: 0.0002, // Wie schnell der Speed-Faktor und die Effizienz im Alter sinken (pro Frame)
    AGING_MIN_FACTOR: 0.1,    // Das Tier wird maximal auf diesen Speed-Faktor (z.B. 10%) reduziert, stirbt aber nicht sofort

    // ==========================================
    // GENOME BASIS-WERTE
    // ==========================================
    GENOME_SPEED: 1,
    GENOME_MAX_SIZE: 10,
    GENOME_SIGHT_RANGE: 50,
    GENOME_SIGHT_ANGLE: Math.PI / 4,
    GENOME_METABOLISM: 0.05,
    GENOME_MAX_ENERGY: 100,
    GENOME_MIN_AGE_REPRO: 1000,

    // ==========================================
    // PFLANZEN-WACHSTUM
    // ==========================================
    PLANT_MAX_SIZE_SUPER_BASE: 10,
    PLANT_MAX_SIZE_NORMAL: 10,
    PLANT_GROWTH_RATE_STARTUP: 0.2,
    PLANT_GROWTH_RATE_NORMAL: 0.01,
    PLANT_GROWTH_RATE_SUPER_MULT: 5.0,
    PLANT_REQUIRED_AGE_STARTUP: 10,
    PLANT_REQUIRED_AGE_SUPER: 30,
    PLANT_REQUIRED_AGE_NORMAL: 100,
    PLANT_GROW_CHANCE_STARTUP: 0.5,
    PLANT_GROW_CHANCE_SUPER: 0.5,
    PLANT_GROW_CHANCE_NORMAL: 0.1,

    // ==========================================
    // PFLANZENFRESSER (HERBIVORE)
    // ==========================================
    HERB_BASE_SPEED: 1.0,
    HERB_SPEED_VARIANCE: 0.1, // Wird +/- dazugerechnet (0.9 bis 1.1)
    HERB_MAX_REPRODUCTIONS: 2,
    HERB_ENERGY_REQUIRED_REPRO: 0.7, // 70% der Maximalenergie
    HERB_MIN_AGE_REPRO: 300,
    HERB_REPRO_FRAMES: 90,
    HERB_COOLDOWN_REPRO: 3000,
    HERB_METABOLISM_DISCOUNT: 0.6, // Nur 60% des normalen Verbrauchs

    // ==========================================
    // FLEISCHFRESSER (CARNIVORE)
    // ==========================================
    CARN_BASE_SPEED: 1.3,
    CARN_SPEED_VARIANCE: 0.1, // Wird +/- dazugerechnet (1.2 bis 1.4)
    CARN_MAX_REPRODUCTIONS: 50,
    CARN_ENERGY_REQUIRED_REPRO: 0.9, // 90% der Maximalenergie
    CARN_MIN_AGE_REPRO: 600,
    CARN_REPRO_FRAMES: 90,
    CARN_COOLDOWN_REPRO: 10000,
    CARN_SIGHT_RANGE_MULTIPLIER: 500,
    CARN_SIGHT_ANGLE: Math.PI * 0.8,
};