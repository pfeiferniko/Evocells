function draw() {
    const currentTime = Date.now();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Ein leuchtendes, helles Cyan/Blaugrün
    ctx.fillStyle = '#1a4466';

    planktons.forEach(p => {
        // Sanftes Driften + leichtes Wackeln durch Sinus
        p.x += p.baseVx + Math.sin(currentTime * p.wobbleSpeed + p.wobbleOffset) * 0.2;
        p.y += p.baseVy;

        // Nahtloser Übergang am Spielfeldrand (Pac-Man-Effekt)
        // Das ist extrem ressourcenschonend, da wir keine neuen Arrays/Objekte erzeugen müssen!
        if (p.x < 0) p.x = WORLD_WIDTH;
        if (p.x > WORLD_WIDTH) p.x = 0;
        if (p.y < 0) p.y = WORLD_HEIGHT;
        if (p.y > WORLD_HEIGHT) p.y = 0;

        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    });

    // 1. Durchlauf: Hintergrund-Elemente (Sichtfenster, Pflanzen und Schwänze)
    entities.forEach(e => {

        // Pflanzen, Steine und Schwänze
        if (e.type === 'plant' || e.type === 'tail' || e.type === 'stone') {

            if (e.type === 'plant') {
                //ctx.globalAlpha = e.opacity;
            }

            // NEU: Pulsieren für Super-Steine berechnen
            let drawSize = e.size;
            if (e.type === 'plant') {
                // Rhythmus: Date.now() * 0.002 bestimmt die Geschwindigkeit
                // * 0.15 bestimmt die Stärke (15% größer/kleiner)
                const pulse = 1.0 + Math.sin((currentTime * e.pulseSpeed) + e.pulseOffset) * 0.1;
                drawSize = e.size * pulse;
            }

            ctx.fillStyle = e.color || 'white';
            ctx.beginPath();
            ctx.arc(e.x, e.y, Math.max(1, drawSize), 0, Math.PI * 2);
            ctx.fill();

            // const radius = Math.max(1, drawSize);
            // ctx.fillRect(e.x - radius, e.y - radius, radius * 2, radius * 2);


            // --- NEU: Den farbigen Punkt auf den Schwanz zeichnen (Lebensanzeige) ---
            if (e.type === 'tail' && e.dotColor) {

                // 1. Wir klettern den "Baum" hoch, um das Haupt-Tier (Kopf) zu finden
                let rootAnimal = e.parent;
                while (rootAnimal && rootAnimal.type === 'tail') {
                    rootAnimal = rootAnimal.parent;
                }

                let displayColor = e.dotColor; // Standard: Farbig

                // 2. Lebensanzeige berechnen
                if (rootAnimal && rootAnimal.tailSegments && typeof rootAnimal.getMaxEnergy === 'function') {
                    // Das wievielte Glied ist das hier im Schwanz? (0 ist direkt am Körper)
                    const index = rootAnimal.tailSegments.indexOf(e);
                    const total = rootAnimal.tailSegments.length;

                    // Energie des Tieres in Prozent (0.0 bis 1.0)
                    const energyRatio = rootAnimal.energy / rootAnimal.getMaxEnergy();

                    // Wenn die prozentuale Position dieses Punktes größer ist als die aktuelle Energie,
                    // bedeutet das: Dieser Teil der "Batterie" ist leer -> wir malen ihn weiß!
                    if ((index / total) >= energyRatio) {
                        displayColor = 'white'; // oder '#333' für ein ganz dunkles Grau, falls Weiß zu grell ist
                    }
                }

                ctx.fillStyle = displayColor;
                const dotRadius = Math.max(1, e.size * 0.4);
                ctx.fillRect(e.x - dotRadius, e.y - dotRadius, dotRadius * 2, dotRadius * 2);
            }
        }
    });

    // 2. Durchlauf: Vordergrund-Elemente (Tierköpfe und Ziellinien)
    entities.forEach(e => {
        if (e.type === 'animal') {

            // --- 1. DER HAUPT-KÖRPER (Jetzt ein perfekter Kreis) ---
            ctx.fillStyle = e.color || 'white';
            ctx.beginPath();

            // Damit Fleischfresser optisch weiterhin wuchtiger wirken, machen wir ihren Kreis etwas größer
            let drawSize;

            if (e instanceof SnakeCell) {
                drawSize = e.size * 0.9;
            }else if (e instanceof CarnivoreCell) {
                drawSize = e.size * 1.3;
            } else {
                drawSize = e.size * 0.7;
            }

            ctx.arc(e.x, e.y, drawSize, 0, Math.PI * 2);
            ctx.fill();

            // --- MATHEMATIK FÜR BLICKRICHTUNG (Ersetzt das teure Rotate!) ---
            const cosA = Math.cos(e.angle);
            const sinA = Math.sin(e.angle);

            // --- 2. DIE KIEFER FÜR FLEISCHFRESSER ---
            if (e.constructor === CarnivoreCell) {
                ctx.strokeStyle = e.color;
                ctx.lineWidth = Math.max(2, e.size * 0.25);
                ctx.lineCap = 'round';

                const offsetX = e.size * 1.15;
                const offsetY = Math.max(3, e.size * 0.4);
                const length = e.size * 0.5;

                // Oberer Strich (mit Rotations-Matrix berechnet)
                const topStartX = e.x + offsetX * cosA - (-offsetY) * sinA;
                const topStartY = e.y + offsetX * sinA + (-offsetY) * cosA;
                const topEndX = e.x + (offsetX + length) * cosA - (-offsetY) * sinA;
                const topEndY = e.y + (offsetX + length) * sinA + (-offsetY) * cosA;

                ctx.beginPath();
                ctx.moveTo(topStartX, topStartY);
                ctx.lineTo(topEndX, topEndY);
                ctx.stroke();

                // Unterer Strich
                const botStartX = e.x + offsetX * cosA - (offsetY) * sinA;
                const botStartY = e.y + offsetX * sinA + (offsetY) * cosA;
                const botEndX = e.x + (offsetX + length) * cosA - (offsetY) * sinA;
                const botEndY = e.y + (offsetX + length) * sinA + (offsetY) * cosA;

                ctx.beginPath();
                ctx.moveTo(botStartX, botStartY);
                ctx.lineTo(botEndX, botEndY);
                ctx.stroke();
            }

            // --- 3. DIE AUGEN ---
            ctx.fillStyle = (e instanceof CarnivoreCell || e.isGiant) ? 'black' : 'white';
            const eyeRadius = Math.max(1.5, e.size * 0.15);

            const eyeLocalX = e.size * 0.4;
            const eyeLocalY = e.size * 0.3;

            // Linkes Auge (y ist negativ)
            const eye1X = e.x + eyeLocalX * cosA - (-eyeLocalY) * sinA;
            const eye1Y = e.y + eyeLocalX * sinA + (-eyeLocalY) * cosA;

            // Rechtes Auge (y ist positiv)
            const eye2X = e.x + eyeLocalX * cosA - (eyeLocalY) * sinA;
            const eye2Y = e.y + eyeLocalX * sinA + (eyeLocalY) * cosA;

            // Wir zeichnen beide Augen in einem einzigen Pfad!
            ctx.beginPath();
            ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
            ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
            ctx.fill();

            // --- Debug-Linien für Fluchtverhalten ---
            if (showDebugLines) {
                if (e.threat && e.threat.alive) {
                    // Rote gestrichelte Linie zum Räuber (vor wem flieht es?)
                    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.threat.x, e.threat.y);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset
                }

                if (e.target && e instanceof CarnivoreCell) {
                    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.target.x, e.target.y);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset
                }

                if (e.currentFleeTarget) {
                    // Blaue Linie zum Fluchtziel (wohin will es?)
                    const angle = Math.atan2(e.currentFleeTarget.y - e.y, e.currentFleeTarget.x - e.x);
                    ctx.strokeStyle = 'rgba(0, 150, 255, 0.5)'; // Hellblau
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.x + Math.cos(angle) * window.SETTINGS.FLEE_TARGET_DISTANCE, e.y + Math.sin(angle) * window.SETTINGS.FLEE_TARGET_DISTANCE);
                    ctx.stroke();
                }

                // --- NEU: Magenta Linie zum Wegpunkt (Sicherer Hafen) ---
                if (e.waypoint) {
                    ctx.strokeStyle = 'magenta';
                    ctx.lineWidth = 1;
                    // Wir machen sie fein gestrichelt, damit sie sich von der
                    // durchgezogenen blauen Flucht-Linie unterscheidet
                    ctx.setLineDash([2, 4]);
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.waypoint.x, e.waypoint.y);
                    ctx.stroke();
                    ctx.setLineDash([]); // WICHTIG: Dash-Modus wieder ausschalten!
                }

                // --- NEU: Orange Linie für die Hindernis-Vermeidung ---
                // Wir fragen jetzt auf "undefined" ab, damit eine 0 nicht mehr zum Abbruch führt!
                if (e.debugAvoidX !== undefined && e.debugAvoidY !== undefined && (e.debugAvoidX !== 0 || e.debugAvoidY !== 0)) {
                    ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'; // Kräftiges Orange
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(e.x + e.debugAvoidX * 15, e.y + e.debugAvoidY * 15);
                    ctx.stroke();
                }
            }
        }
    });

    // 3. Durchlauf: Fress-Krümel zeichnen (ganz im Vordergrund)
    particles.forEach(p => {
        //ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;

        // Lighter Blending lässt auch die Krümel leicht leuchten
        //ctx.globalCompositeOperation = 'lighter';

        // ctx.beginPath();
        // ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        // ctx.fill();

        ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    });

    // --- NEU: SCORE-ANZEIGE OBEN LINKS ---
    // Wir zeichnen die Punkte NUR, wenn wir NICHT im Demo-Modus sind
    if (!window.isDemoMode) {
        ctx.save();

        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const scoreText = `Punkte: ${simScore}`;

        // Kasten-Hintergrund dynamisch an die Textbreite anpassen
        const textWidth = ctx.measureText(scoreText).width;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(10, 10, textWidth + 30, 40); // Die Box für die Punkte

        // Schicke Gold/Gelbe Schrift für die Punkte
        ctx.fillStyle = '#FFD700';
        ctx.fillText(scoreText, 25, 20);

        ctx.restore();
    }

    // --- NEU: PERFORMANCE- UND INFO-ANZEIGE ---
    if (showFps) {
        ctx.save();

        ctx.font = '16px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Die Box muss höher (135) und etwas breiter (220) werden
        const boxHeight = 135;
        const startY = WORLD_HEIGHT - boxHeight - 10;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(10, startY, 220, boxHeight);

        ctx.fillStyle = 'white';

        // Alle Infos sauber untereinander
        ctx.fillText(`FPS: ${currentFps}`, 20, startY + 10);
        ctx.fillText(`Process: ${Math.round(currentProcessTime)} ms`, 20, startY + 35);
        ctx.fillText(`Alle Objekte: ${entities.length}`, 20, startY + 60);

        // Die neuen Zähler
        ctx.fillStyle = '#f1c40f'; // Leicht gelblich für Pflanzenfresser
        ctx.fillText(`Pflanzenfresser: ${globalHerbivoreCount}`, 20, startY + 85);

        ctx.fillStyle = '#e74c3c'; // Rötlich für Fleischfresser
        ctx.fillText(`Fleischfresser: ${globalCarnivoreCount}`, 20, startY + 110);

        ctx.restore();
    }

    drawShopUI();
}