window.BLUEPRINTS = {
    // ==========================================
    // STATISCHE OBJEKTE (Pflanzen & Steine)
    // ==========================================
    "plant": {
        id: "plant",
        name: "Pflanze",
        type: "plant",
        shopColor: "#2ecc71",
        color: "rgb(46, 204, 113)",
        baseSize: 10,
        growthRate: 1.0,
        energyValue: 100, // Wie viel Energie gibt sie beim Essen?
        isObstacle: false
    },
    "super_plant": {
        id: "super_plant",
        name: "Super Pflanze",
        type: "plant",
        shopColor: "#8e44ad",
        color: "rgb(142, 68, 173)", // Lila
        baseSize: 15,
        growthRate: 3.0, // Wächst viel schneller
        energyValue: 250,
        isObstacle: false
    },
    "stone": {
        id: "stone",
        name: "Normaler Stein",
        type: "stone",
        shopColor: "#777777",
        color: "rgb(119, 119, 119)",
        baseSize: 20,
        isObstacle: true
    },
    "super_stone": {
        id: "super_stone",
        name: "Super Stein",
        type: "stone",
        shopColor: "#ff00ff",
        color: "rgb(255, 0, 255)", // Lila leuchtend
        baseSize: 30,
        isObstacle: true,
        glowEffect: true // Könnte z.B. das Grid beeinflussen
    },

    // ==========================================
    // DYNAMISCHE OBJEKTE (Tiere)
    // ==========================================
    "herbivore": {
        id: "herbivore",
        name: "Pflanzenfresser",
        type: "animal",
        shopColor: "#f1c40f",

        // KI & Verhalten
        diet: ["plant", "super_plant"],
        fleeFrom: ["carnivore", "snake"], // Vor wem flieht es?

        // Aussehen (Dynamische Farbbereiche wie im alten Konstruktor)
        colors: {
            r: { min: 200, max: 255 },
            g: { min: 100, max: 180 },
            b: { min: 0, max: 40 },
            dotHue: { min: 180, max: 300 },
            dotLightness: { min: 20, max: 35 }
        },
        tail: {
            type: "linear",
            lengthMultiplier: 1.0, // Normale Länge
            offset: 0
        },

        // Genetik & Basis-Stats
        baseStats: {
            speed: 0.9,
            speedVariance: 0.1,
            maxSize: 4,          // Normaler Pflanzenfresser ist klein
            metabolism: 1.2,     // 120% Effizienz (Verbraucht weniger)
            sightRange: 100,
            sightAngle: Math.PI * 0.5,
            panicRadiusMultiplier: 1.0 // Normaler Fluchtradius
        },

        // Fortpflanzung
        reproduction: {
            maxChildren: 2,
            minAge: 300,
            cooldownFrames: 600,
            gestationFrames: 90,
            energyRequired: 0.7 // 70% der Max-Energie nötig
        }
    },

    "giant": {
        id: "giant",
        name: "Riesen-Pflanzenfresser",
        type: "animal",
        shopColor: "#e67e22",

        diet: ["plant", "super_plant"],
        fleeFrom: ["carnivore", "snake"],

        colors: {
            // Gleich wie Herbivore, man könnte es aber etwas dunkler machen
            r: { min: 200, max: 255 },
            g: { min: 100, max: 180 },
            b: { min: 0, max: 40 },
            dotHue: { min: 180, max: 300 },
            dotLightness: { min: 20, max: 35 }
        },
        tail: { type: "linear", lengthMultiplier: 1.0, offset: 0 },

        baseStats: {
            speed: 0.9,
            speedVariance: 0.1,
            maxSize: 9, // <--- DAS ist der Hauptunterschied zum normalen!
            metabolism: 1.0,
            sightRange: 100,
            sightAngle: Math.PI * 0.5,
            panicRadiusMultiplier: 1.0
        },

        reproduction: {
            maxChildren: 2,
            minAge: 300,
            cooldownFrames: 600,
            gestationFrames: 90,
            energyRequired: 0.9 // Riesen brauchen 90% Energie für Babys
        }
    },

    "carnivore": {
        id: "carnivore",
        name: "Fleischfresser",
        type: "animal",
        shopColor: "#e74c3c",

        diet: ["herbivore", "giant"], // Isst nur Pflanzenfresser
        fleeFrom: ["snake"], // Könnte z.B. vor Schlangen fliehen!

        colors: {
            r: { min: 200, max: 255 }, // Starkes Rot
            g: { min: 5, max: 15 },
            b: { min: 5, max: 105 },
            dotHue: { min: 180, max: 300 },
            dotLightness: { min: 20, max: 35 }
        },
        tail: {
            type: "split", // <--- Gabelung am Ende des Schwanzes!
            lengthMultiplier: 1.0,
            offset: 0
        },

        baseStats: {
            speed: 1.3,
            speedVariance: 0.1,
            maxSize: 7,
            metabolism: 1.0,
            sightRange: 150, // 50% mehr als Pflanzenfresser (Adlerauge)
            sightAngle: Math.PI, // 180 Grad Sicht!
            panicRadiusMultiplier: 1.5
        },

        reproduction: {
            maxChildren: 20,
            minAge: 600,
            cooldownFrames: 1000,
            gestationFrames: 90,
            energyRequired: 0.9
        }
    },

    "snake": {
        id: "snake",
        name: "Schlange",
        type: "animal",
        shopColor: "#9b59b6",

        diet: ["herbivore", "giant", "carnivore"], // <--- Isst AUCH Fleischfresser!
        fleeFrom: [], // Spitzenprädator, flieht vor niemandem

        colors: {
            r: { min: 0, max: 40 },
            g: { min: 180, max: 255 }, // Cyan/Neon
            b: { min: 180, max: 255 },
            dotHue: { min: 200, max: 200 }, // Konstantes Dunkelblau
            dotLightness: { min: 20, max: 20 }
        },
        tail: {
            type: "linear",
            lengthMultiplier: 3.0, // <--- 3x so langer Schwanz!
            offset: 3
        },

        baseStats: {
            speed: 1.3,
            speedVariance: 0.1,
            maxSize: 7,
            metabolism: 0.4, // Extrem effizient (wie im alten Code)
            sightRange: 150,
            sightAngle: Math.PI,
            panicRadiusMultiplier: 1.5
        },

        reproduction: {
            maxChildren: 10,
            minAge: 600,
            cooldownFrames: 1000,
            gestationFrames: 90,
            energyRequired: 0.9
        }
    }
};