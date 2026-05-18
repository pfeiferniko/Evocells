// ==========================================
// draw3d.js - Optimierte Version (Shared Geometries & Memory Leak Fix)
// ==========================================

let scene, camera, renderer, light;
let ambientLight; // <--- NEU: Global speichern, damit wir es dimmen können
let entityMeshes = new Map();
let particleMeshes = new Map(); // Für die Fress-Krümel/Todes-Partikel

// --- NEU: InstancedMesh Limits & Variablen ---
const MAX_PARTICLES = 3000;
const MAX_PLANTS = 2000;
const MAX_STONES = 500;
const MAX_TAILS = 5000;

let lastRenderedStoneCount = -1;

let particlesInstancedMesh;
let plantsInstancedMesh;
let stonesInstancedMesh;
let tailsInstancedMesh;

// --- NEU: Kamera-Tracking Variablen ---
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let currentLookAt = new THREE.Vector3();
let defaultCameraPos = new THREE.Vector3();
let defaultLookAt = new THREE.Vector3();
let isCameraInit = false;

let floorCanvas, floorCtx, floorTexture;
let normalStain, superStain; // Unsere vorgefertigten "Stempel"
const plantGlows = new Map(); // <--- NEU: Das Gedächtnis für unsere Lichter

// Hilfsfunktion: Wandelt den 2D-Mausklick in 3D-Bodenkoordinaten um
window.getClickTarget3D = function(ndcX, ndcY) {
    if (!camera) return null;
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, target);
    if (target) {
        return { x: target.x, y: target.z }; // Z-Achse in 3D ist Y-Achse im 2D-Grid
    }
    return null;
};

// --- PERFORMANCE OPTIMIERUNG 1: Globale Baupläne ---
// Wir erstellen jede Form nur ein einziges Mal für die Grafikkarte
const SHARED_GEOMETRIES = {
    plankton: new THREE.TetrahedronGeometry(1.5, 0),
    // Körper auf 12x12 (reicht für flüssige Rundung völlig aus)
    animalBody: new THREE.SphereGeometry(11, 12, 12),
    // Augen sind winzig, 6x6 reicht locker
    eye: new THREE.SphereGeometry(4.5, 5, 5),
    plant: new THREE.IcosahedronGeometry(12, 1),
    stone: new THREE.DodecahedronGeometry(15, 0),
    tail: new THREE.SphereGeometry(10, 8, 8),
    particle: new THREE.BoxGeometry(3, 3, 3)
};

// --- PERFORMANCE OPTIMIERUNG 3: Garbage Collection ---
// Ein einzelnes Farb-Objekt, das wir für die Schwanz-Animation immer wiederverwenden
const _tempColor = new THREE.Color();
const _dummy = new THREE.Object3D();

function init3D() {
    scene = new THREE.Scene();

    // 1. Hintergrund: Fast Schwarz mit einem Hauch von Kühle (0x020406).
    // Das ist dunkel genug, um absolut keinen Kontrast-Rahmen mehr zu erzeugen.
    //scene.background = new THREE.Color(0x020406);
    scene.background = new THREE.Color(0x000000);

    const aspect = WORLD_WIDTH / WORLD_HEIGHT;
    camera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);

    const maxDimension = Math.max(WORLD_WIDTH, WORLD_HEIGHT);
    const camHeight = (WORLD_HEIGHT > WORLD_WIDTH) ? maxDimension * 1.22 : maxDimension * 0.61;

    camera.position.set(WORLD_WIDTH / 2, camHeight, WORLD_HEIGHT / 2);
    camera.up.set(0, 0, -1);
    camera.lookAt(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);

    renderer = new THREE.WebGLRenderer({ canvas: canvas3D, antialias: true, alpha: true });
    // --- NEU: Knackscharfe Auflösung auf modernen Monitoren ---
    //renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(canvas3D.width, canvas3D.height, false);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// 2. Umgebungslicht in der Variable speichern
     ambientLight = new THREE.AmbientLight(0xffffff, 0.06);
     scene.add(ambientLight);

    // 3. Hauptlicht: Intensität 3.0 sorgt für starke Highlights auf den dunklen Oberflächen.
    light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(WORLD_WIDTH / 2, 700, -2000);
    light.target.position.set(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
    scene.add(light.target);

    light.castShadow = true;

    const dX = WORLD_WIDTH/1.9;
    const dY = WORLD_HEIGHT/1.9;
    light.shadow.camera.left = -dX;
    light.shadow.camera.right = dX;
    light.shadow.camera.top = dY;
    light.shadow.camera.bottom = -dY;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 6000;

    light.shadow.mapSize.width = 1500;
    light.shadow.mapSize.height = 1500;
    light.shadow.bias = -0.0005;

    scene.add(light);

    // 4. Bodenplatte
    // const floor = new THREE.Mesh(
    //     new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT),
    //     new THREE.MeshPhongMaterial({ color: 0x0205030 })
    // );
    // floor.rotation.x = -Math.PI / 2;
    // floor.position.set(WORLD_WIDTH / 2, -15, WORLD_HEIGHT / 2);
    // floor.receiveShadow = true;
    // scene.add(floor);

    // ... dein anderer Code in init3D (Kamera, Lichter etc.) ...

    initGlowSystem(); // Unser Lichtsystem starten (schwebt auf y = -14.5)

    // ==========================================
    // 1. DER BASIS-BODEN (Ganz unten)
    // ==========================================
    const floorGeometry = new THREE.PlaneGeometry(window.WORLD_WIDTH, window.WORLD_HEIGHT);
    const floorMaterial = new THREE.MeshPhongMaterial({
        color: 0x050508,
        shininess: 0
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(window.WORLD_WIDTH / 2, -15.0, window.WORLD_HEIGHT / 2);
    // WICHTIG: Der Boden selbst fängt keine Schatten mehr auf!
    floor.receiveShadow = false;
    scene.add(floor);


    // ==========================================
    // 2. DIE SCHATTEN-EBENE (Über dem Licht!)
    // ==========================================
    // ShadowMaterial ist komplett unsichtbar, malt aber alle Schatten
    // als halbtransparente schwarze Pixel auf alles, was darunter liegt.
    const shadowMaterial = new THREE.ShadowMaterial({
        opacity: 1 // Wie dunkel/stark soll der Schatten sein? (0.0 bis 1.0)
    });
    const shadowPlane = new THREE.Mesh(floorGeometry, shadowMaterial);
    shadowPlane.rotation.x = -Math.PI / 2;
    // WICHTIG: y = -14.0 liegt physikalisch über den Glows (die sind bei -14.5)
    shadowPlane.position.set(window.WORLD_WIDTH / 2, -14.0, window.WORLD_HEIGHT / 2);
    shadowPlane.receiveShadow = true; // HIER fangen wir den Schatten ein
    scene.add(shadowPlane);

    // --- NEU: AQUARIUM-KANTEN ---
    // Wie hoch das Aquarium-Glas sein soll
    const aquariumHeight = 50;

    // Wir bauen einen unsichtbaren Kasten in Welt-Größe
    const boxGeo = new THREE.BoxGeometry(WORLD_WIDTH, aquariumHeight, WORLD_HEIGHT);

    // EdgesGeometry filtert die Geometrie und behält NUR die äußeren Kanten (keine Diagonalen!)
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // Ein Material für die Linien
    const edgesMat = new THREE.LineBasicMaterial({
        color: 0x1a4496, // Das gleiche Cyan/Blaugrün wie dein Plankton
        transparent: true,
        opacity: 0.8     // Halbtransparent für einen echten Glas-Look
    });

    const aquarium = new THREE.LineSegments(edgesGeo, edgesMat);

    // Positionieren: X und Z in die Mitte der Welt.
    // Y wird so gesetzt, dass die untere Kante exakt auf der Bodenplatte (-15) aufliegt.
    aquarium.position.set(WORLD_WIDTH / 2, (aquariumHeight / 2) - 15, WORLD_HEIGHT / 2);

    scene.add(aquarium);
    // ----------------------------

    initPlankton3D();
    initInstancedMeshes();
}

const STAIN_SIZE = 200; // Mach den Wert größer (z.B. 128), wenn du noch mehr Farbe willst
const HALF_STAIN = STAIN_SIZE / 2;

function createStain(colorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = STAIN_SIZE;
    canvas.height = STAIN_SIZE;
    const ctx = canvas.getContext('2d');

    // Der Verlauf geht jetzt von der neuen Mitte bis zum neuen Rand
    const grad = ctx.createRadialGradient(HALF_STAIN, HALF_STAIN, 0, HALF_STAIN, HALF_STAIN, HALF_STAIN);

    // Kleiner Tipp: Wenn die Farbe in der Mitte zu schwach ist,
    // kannst du die Deckkraft hier im String erhöhen, z.B. auf 0.8 oder 0.9
    grad.addColorStop(0, colorStr);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, STAIN_SIZE, STAIN_SIZE);
    return canvas;
}

let glowInstancedMesh;
const MAX_GLOWS = 2500; // Genug Platz für 1500 lebende + sterbende Pflanzen


function initGlowSystem() {
    // 1. Eine einzige winzige Leucht-Textur generieren
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);

    // --- DER FIX FÜR SANFTES LICHT + SCHATTEN ---
    // Wir machen den Verlauf extrem schwach (max 20% Deckkraft).
    // Durch das AdditiveBlending wirkt es trotzdem wie ein toller Glow!
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)'); // Macht den Rand sehr weich
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const sharedGlowTexture = new THREE.CanvasTexture(canvas);

    // 2. Das Material (Wieder AdditiveBlending, ABER ohne Opacity-Limit!)
    const glowMat = new THREE.MeshBasicMaterial({
        map: sharedGlowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending

    });

    // 3. Die Geometrie (Flache Scheiben)
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    glowGeo.rotateX(-Math.PI / 2); // Flach auf den Boden legen

    glowInstancedMesh = new THREE.InstancedMesh(glowGeo, glowMat, MAX_GLOWS);
    glowInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Die Lichter minimal über den Boden heben (Boden ist bei -15)
    glowInstancedMesh.position.y = -14.5;
    scene.add(glowInstancedMesh);
}

function updateFloorStains() {
    if (!glowInstancedMesh) return;

    plantGlows.forEach(glow => glow.seenThisFrame = false);

    // 1. Gedächtnis aktualisieren
    entities.forEach(e => {
        if (e.type === 'plant' && e.alive) {
            let glow = plantGlows.get(e);
            if (!glow) {
                // Neues Licht beginnt unsichtbar (Alpha 0)
                glow = { alpha: 0, isSuper: e.isSuper, x: e.x, y: e.y, pulseOffset: e.pulseOffset };
                plantGlows.set(e, glow);
            }
            glow.seenThisFrame = true;
            glow.x = e.x;
            glow.y = e.y;

            // Einblenden
            if (glow.alpha < 1.0) {
                glow.alpha = Math.min(1.0, glow.alpha + 0.03);
            }
        }
    });

    let count = 0;
    const time = Date.now();

    // 2. An die Grafikkarte senden (Ohne neue Iterator-Objekte zu erzeugen!)
    plantGlows.forEach((glow, plant) => {
        if (!glow.seenThisFrame) {
            glow.alpha -= 0.02; // Sanftes Ausblenden für tote Pflanzen
        }

        if (glow.alpha <= 0) {
            plantGlows.delete(plant);
            return; // WICHTIG: In einem forEach nutzt man 'return' statt 'continue'
        }

        if (count < MAX_GLOWS) {
            const swayZ = Math.sin(time * 0.0005 + glow.pulseOffset) * 10;

            _dummy.position.set(glow.x, 0, glow.y + swayZ);

            const maxRadius = glow.isSuper ? 180 : 100;
            const currentRadius = maxRadius * glow.alpha;

            _dummy.scale.set(currentRadius, 1, currentRadius);
            _dummy.updateMatrix();
            glowInstancedMesh.setMatrixAt(count, _dummy.matrix);

            _tempColor.set(glow.isSuper ? '#8e44ad' : '#2ecc71');
            glowInstancedMesh.setColorAt(count, _tempColor);

            count++;
        }
    });

    // 3. Nur die Matrix-Daten rüberschieben
    glowInstancedMesh.count = count;
    glowInstancedMesh.instanceMatrix.needsUpdate = true;
    if (glowInstancedMesh.instanceColor) glowInstancedMesh.instanceColor.needsUpdate = true;
}

function updateTrackingCamera() {
    if (!camera) return;

    if (!isCameraInit) {
        defaultCameraPos.copy(camera.position);
        defaultLookAt.set(window.WORLD_WIDTH / 2, 0, window.WORLD_HEIGHT / 2);
        currentLookAt.copy(defaultLookAt);
        isCameraInit = true;

        if (light && light.shadow) {
            if (!light.target.parent) scene.add(light.target);
            light.target.position.set(window.WORLD_WIDTH / 2, 0, window.WORLD_HEIGHT / 2);
        }
    }

    if (window.trackedEntity && window.trackedEntity.alive) {
            const e = window.trackedEntity;

            // --- NEU: Dynamische Zoom-Höhe für Hochkant-Bildschirme ---
            const aspect = window.WORLD_WIDTH / window.WORLD_HEIGHT;
            let zoomHeight = 400; // Dein perfekter Standard-Abstand

            // Wenn das Bild hochkant ist (aspect < 1), ziehen wir die Kamera mathematisch exakt
            // weiter nach oben, damit links und rechts wieder genauso viel zu sehen ist!
            if (aspect < 1.0) {
                zoomHeight = 400 / aspect;
            }

                // 2. Sichtbaren Bereich berechnen (Trigonometrie für FOV 45)
                // Wie viel Welt sieht die Kamera von der Mitte bis zum oberen Rand?
                const fovRad = (camera.fov * Math.PI) / 180;
                const halfVisibleHeight = Math.tan(fovRad / 2) * zoomHeight;
                const halfVisibleWidth = halfVisibleHeight * aspect;

                // 3. Ziel-Koordinaten begrenzen (Clamping)
                // Wir lassen die Kamera nie näher an den Rand als halfVisibleWidth/Height
                const targetX = Math.max(halfVisibleWidth, Math.min(window.WORLD_WIDTH - halfVisibleWidth, e.x));
                const targetZ = Math.max(halfVisibleHeight, Math.min(window.WORLD_HEIGHT - halfVisibleHeight, e.y));

                // 4. Positionen setzen
                const targetPos = new THREE.Vector3(targetX, zoomHeight, targetZ + 1.0);
                const targetLookAt = new THREE.Vector3(targetX, 0, targetZ);

            camera.position.lerp(targetPos, 0.1);
            currentLookAt.lerp(targetLookAt, 0.1);
            camera.lookAt(currentLookAt);

            // SCHATTEN SCHARFSTELLEN (passt sich nun auch der Höhe an!)
            if (light && light.shadow) {
                 light.target.position.set(e.x, 0, e.y);
                 light.shadow.camera.left = -zoomHeight;
                 light.shadow.camera.right = zoomHeight;
                 light.shadow.camera.top = zoomHeight;
                 light.shadow.camera.bottom = -zoomHeight;
                 light.shadow.camera.updateProjectionMatrix();
            }

        } else {
        // Kamera zurück zur Übersicht
        camera.position.lerp(defaultCameraPos, 0.1);
        currentLookAt.lerp(defaultLookAt, 0.1);
        camera.lookAt(currentLookAt);

        // SCHATTEN WIEDER GROSS MACHEN
        if (light && light.shadow) {
            light.target.position.set(window.WORLD_WIDTH / 2, 0, window.WORLD_HEIGHT / 2);
            const dX = WORLD_WIDTH/1.9;
            const dY = WORLD_HEIGHT/1.9;
            light.shadow.camera.left = -dX;
            light.shadow.camera.right = dX;
            light.shadow.camera.top = dY;
            light.shadow.camera.bottom = -dY;
            light.shadow.camera.updateProjectionMatrix();
        }
    }
}

// --- OPTIMIERTER 3D Tagesablauf (Original-Position mit leichtem Pendeln) ---
function updateDayNight3D() {
    if (!light || !ambientLight) return;

    // timePhase schwingt sanft von 0.0 (Mitternacht) bis 1.0 (Mittag)
    const timePhase = (Math.cos(window.dayTime * Math.PI * 2) * -1 + 1) / 2;

    // 1. POSITION: Relativ zum Ziel (Target)!
    const targetX = (light.target && light.target.position.x) ? light.target.position.x : (window.WORLD_WIDTH / 2);
    const targetZ = (light.target && light.target.position.z) ? light.target.position.z : (window.WORLD_HEIGHT / 2);

    // X, Y und Z-Offset mal 4 genommen! Der Sonnen-Winkel bleibt dadurch absolut identisch.
    light.position.x = targetX + Math.sin(window.dayTime * Math.PI * 2) * 1600;
    light.position.y = 800;
    light.position.z = targetZ - 2000;

    // 2. HAUPTLICHT:
    // Intensität schwankt sanft zwischen 0.8 (Nacht) und 2.0 (Tag - das war dein Originalwert)
    light.intensity = 1.2 + (timePhase * 0.8);

    // Farbe: Von einem kühlen Blau-Weiß (Nacht) zu einem warmen, strahlenden Weiß (Tag)
    const sunR = 0x88 + (0x66 * timePhase);
    const sunG = 0xaa + (0x44 * timePhase);
    const sunB = 0xff; // Bleibt auf Maximum für sauberes Licht
    light.color.setRGB(sunR/255, sunG/255, sunB/255);

    // 3. UMGEBUNGSLICHT (Ambient):
    // Schwankt sehr dezent zwischen 0.4 (Nacht) und 0.6 (Tag)
    ambientLight.intensity = 0.2 + (timePhase * 0.2);

    // Ambient-Farbe (Kühlt nachts etwas ab)
    const ambR = 0x20 + (0x20 * timePhase);
    const ambG = 0x30 + (0x20 * timePhase);
    const ambB = 0x50 + (0x10 * timePhase);
    ambientLight.color.setRGB(ambR/255, ambG/255, ambB/255);

    // 4. HINTERGRUND: Pulsiert nur hauchzart mit
    const bgR = 0x03 + (0x04 * timePhase);
    const bgG = 0x03 + (0x06 * timePhase);
    const bgB = 0x05 + (0x0a * timePhase);
    scene.background.setRGB(bgR/255, bgG/255, bgB/255);
}

function initInstancedMeshes() {
    // Partikel (Krümel) - Jetzt mit Phong-Material für korrekte Beleuchtung
    const particleMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });
    particlesInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.particle, particleMat, MAX_PARTICLES);
    particlesInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particlesInstancedMesh.castShadow = false;
    particlesInstancedMesh.receiveShadow = false;
    scene.add(particlesInstancedMesh);

    // Pflanzen
    const plantMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });
    plantsInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.plant, plantMat, MAX_PLANTS);
    plantsInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    plantsInstancedMesh.castShadow = true;
    plantsInstancedMesh.receiveShadow = false;
    scene.add(plantsInstancedMesh);

    // Steine
    const stoneMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    stonesInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.stone, stoneMat, MAX_STONES);
    stonesInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stonesInstancedMesh.castShadow = true;
    stonesInstancedMesh.receiveShadow = false;
    scene.add(stonesInstancedMesh);

    // NEU: Schwänze als InstancedMesh
    const tailMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    tailsInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.tail, tailMat, MAX_TAILS);
    tailsInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    tailsInstancedMesh.castShadow = true; // Schwänze dürfen Schatten werfen
    tailsInstancedMesh.receiveShadow = true;
    scene.add(tailsInstancedMesh);

    // --- BUGFIX: Farb-Puffer für die Grafikkarte erzwingen ---
    // Wenn die Welt leer startet, muss die Engine trotzdem wissen,
    // dass diese Objekte später individuelle Farben bekommen.
    const dummyColor = new THREE.Color(0xffffff);
    if (plantsInstancedMesh) plantsInstancedMesh.setColorAt(0, dummyColor);
    if (stonesInstancedMesh) stonesInstancedMesh.setColorAt(0, dummyColor);
    if (particlesInstancedMesh) particlesInstancedMesh.setColorAt(0, dummyColor);
    if (tailsInstancedMesh) tailsInstancedMesh.setColorAt(0, dummyColor);
}

function initPlankton3D() {
    // Material für das Plankton (leicht glänzend)
    const mat = new THREE.MeshPhongMaterial({
        color: 0x1a4466,
        transparent: true,
        opacity: 0.7,
        flatShading: true
    });

    // Wir erstellen 150 Instanzen unserer 3D-Plankton-Form
    planktonMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.plankton, mat, PLANKTON_COUNT);

    // Plankton soll Schatten werfen und empfangen für maximale Tiefe
    planktonMesh.castShadow = true;
    planktonMesh.receiveShadow = false;

    scene.add(planktonMesh);
}

function draw3D() {
    if (!scene) init3D();

// --- Knackscharfe, dynamische Monitor-Auflösung ---
    const canvas = renderer.domElement;

    // 1. Hole den Pixel-Faktor aus deinem Menü in main.js (z. B. 1.0, 0.8 etc.)
    const factor = (typeof pixelModes !== 'undefined' && typeof currentPixelMode !== 'undefined')
        ? pixelModes[currentPixelMode].factor
        : 1.0;

    // 2. Native Pixeldichte des Monitors auslesen (Retina/4K-Displays haben hier 1.5, 2.0 etc.)
    const pixelRatio = window.devicePixelRatio || 1;

    // 3. Berechnen: Wie groß wird das Canvas GERADE in diesem Moment vom CSS gezeichnet?
    const displayWidth  = Math.floor(canvas.clientWidth * pixelRatio * factor);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio * factor);

    // 4. Hat sich die echte Fenstergröße geändert? Dann 3D-Engine anpassen!
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        // Das 'false' ist extrem wichtig, damit Three.js nicht das CSS-Layout sprengt
        renderer.setSize(displayWidth, displayHeight, false);
        camera.aspect = displayWidth / displayHeight;
        camera.updateProjectionMatrix();
    }

    updatePlanktonPositions();
    syncEntities();
    syncParticles();

    updateDayNight3D();

    updateTrackingCamera();

    if (frameCount % 3 === 0) {
        updateFloorStains();
    }

    renderer.render(scene, camera);
    drawUIOverlay();
}

function updatePlanktonPositions() {
    const currentTime = Date.now();

    planktons.forEach((p, i) => {
        // 1. Bewegung berechnen (wie in deinem 2D-Code)
        p.x += p.baseVx + Math.sin(currentTime * p.wobbleSpeed + p.wobbleOffset) * 0.2;
        p.y += p.baseVy;

        // Rand-Check (Pac-Man)
        if (p.x < 0) p.x = WORLD_WIDTH;
        if (p.x > WORLD_WIDTH) p.x = 0;
        if (p.y < 0) p.y = WORLD_HEIGHT;
        if (p.y > WORLD_HEIGHT) p.y = 0;

        // 2. 3D-Matrix für dieses Plankton-Teilchen setzen
        // Wir setzen es auf Y = -13 (knapp über dem Boden, der bei -15 liegt)
        _dummy.position.set(p.x, -10, p.y);

        // Jedes Teilchen bekommt eine eigene Drehung basierend auf seiner Zeit
        _dummy.rotation.set(currentTime * 0.001 + i, currentTime * 0.0012, 0);

        // Skalierung basierend auf der individuellen Plankton-Größe
        const s = p.size * 1.2;
        _dummy.scale.set(s, s, s);

        _dummy.updateMatrix();
        planktonMesh.setMatrixAt(i, _dummy.matrix);
    });

    // WICHTIG: Der Grafikkarte sagen, dass sich die Positionen geändert haben
    planktonMesh.instanceMatrix.needsUpdate = true;
}

// --- PERFORMANCE OPTIMIERUNG 2: Richtiges Löschen ---
function disposeMesh(mesh) {
    if (mesh.isGroup) {
        mesh.children.forEach(child => {
            // WICHTIG: Wir löschen nur die Materialien, da die Geometrien
            // jetzt in SHARED_GEOMETRIES liegen und von allen geteilt werden!
            if (child.material) child.material.dispose();
        });
    } else {
        if (mesh.material) mesh.material.dispose();
    }
}

const meshPool = {
    animal: [], plant: [], stone: [], tail: [], particle: []
};

function syncEntities() {
    const currentEntityIds = new Set();
    let plantCount = 0;
    let stoneCount = 0;
    let diamondCount = 0;
    let tailCount = 0; // NEU: Zähler für Schwanzsegmente

    entities.forEach(e => {
        if (!e.alive) return;

        if (e.type === 'plant') {
            if (plantCount < MAX_PLANTS) {
                // NEU: Pflanze bewegt sich nur jeden 2. Frame!
                if (frameCount % 2 === 0) {
                    const time = Date.now();
                    const pulse = 1.0 + Math.sin((time * e.pulseSpeed) + e.pulseOffset) * 0.1;
                    const s = (e.size / 10) * pulse;
                    // const swayZ = Math.sin(time * 0.0005 + e.pulseOffset) * 10;

                    // _dummy.position.set(e.x, 0, e.y + swayZ);
                    _dummy.position.set(e.x, 0, e.y);
                    _dummy.rotation.set(0, 0, 0);
                    _dummy.scale.set(s, s, s);
                    _dummy.updateMatrix();
                    plantsInstancedMesh.setMatrixAt(plantCount, _dummy.matrix);

                    _tempColor.set(e.color || '#ffffff');
                    plantsInstancedMesh.setColorAt(plantCount, _tempColor);
                }
                plantCount++;
            }
        } else if (e.type === 'stone') {
            if (stoneCount < MAX_STONES) stoneCount++;
        } else if (e.type === 'diamond') {
            if (diamondCount < MAX_DIAMONDS) {
                const shrink = e.life < e.maxLife * 0.3 ? Math.max(0.01, e.life / (e.maxLife * 0.3)) : 1.0;
                const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
                const s = (e.size / 10) * pulse * shrink;
                const hoverY = -2 + Math.sin(Date.now() * 0.003 + e.x) * 3;
                _dummy.position.set(e.x, hoverY, e.y);
                _dummy.scale.set(s, s, s);
                _dummy.rotation.set(0, e.angle, 0);
                _dummy.updateMatrix();
                diamondsInstancedMesh.setMatrixAt(diamondCount, _dummy.matrix);
                _tempColor.set(e.color);
                diamondsInstancedMesh.setColorAt(diamondCount, _tempColor);
                diamondCount++;
            }
        } else if (e.type === 'tail') {
            // NEU: Schwanzsegmente in das InstancedMesh packen
            if (tailCount < MAX_TAILS) {
                _dummy.position.set(e.x, -4, e.y);
                _dummy.scale.set(e.size / 10, e.size / 10, e.size / 10);
                _dummy.rotation.set(0, 0, 0);
                _dummy.updateMatrix();
                tailsInstancedMesh.setMatrixAt(tailCount, _dummy.matrix);

                // Energie-Farben Logik (Batterie-Effekt)
                let root = e.rootAnimal;

                let displayColor = e.color;
                if (root && root.tailSegments && typeof root.getMaxEnergy === 'function') {
                    const index = root.tailSegments.indexOf(e);
                    const total = root.tailSegments.length;
                    const energyRatio = root.energy / root.getMaxEnergy();
                    if ((index / total) >= energyRatio) {
                        displayColor = '#ffffff'; // Weiß, wenn leer
                    }
                }
                _tempColor.set(displayColor);
                tailsInstancedMesh.setColorAt(tailCount, _tempColor);
                tailCount++;
            }
        } else if (e.type === 'animal') {
            // Nur noch die Köpfe werden als Einzel-Objekte (Groups) behandelt
            currentEntityIds.add(e);

            if (!entityMeshes.has(e)) {
                let mesh;
                if (meshPool[e.type] && meshPool[e.type].length > 0) {
                    mesh = meshPool[e.type].pop();

                    // --- DER ECHTE FIX: Nur die Farbe des bestehenden Materials ändern! ---
                    const actualMesh = mesh.isGroup ? mesh.children[0] : mesh;
                    if (actualMesh && actualMesh.material) {
                        // Die Grafikkarte behält das Material, wir färben es nur um. Keine neuen Objekte!
                        actualMesh.material.color.set(e.color || '#ffffff');
                    }

                } else {
                    mesh = createMeshForEntity(e);
                }
                scene.add(mesh);
                entityMeshes.set(e, mesh);
            }

            const mesh = entityMeshes.get(e);
            mesh.position.set(e.x, -4, e.y);
            mesh.rotation.y = -e.angle;

            // Basis-Skalierung für 3D
            let s = e.size / 10;
            if (e instanceof HerbivoreCell) s *= 0.6;
            mesh.scale.set(s, s, s);
        }
    });

    // GPU-Updates für Instanced Meshes
    plantsInstancedMesh.count = plantCount;
    plantsInstancedMesh.instanceMatrix.needsUpdate = true;
    if (plantsInstancedMesh.instanceColor) plantsInstancedMesh.instanceColor.needsUpdate = true;

    tailsInstancedMesh.count = tailCount;
    tailsInstancedMesh.instanceMatrix.needsUpdate = true;
    if (tailsInstancedMesh.instanceColor) tailsInstancedMesh.instanceColor.needsUpdate = true;

    // Steine-Update (nur bei Bedarf)
    if (stoneCount !== lastRenderedStoneCount) {
        let currentStoneIndex = 0;
        entities.forEach(e => {
            if (e.alive && e.type === 'stone' && currentStoneIndex < MAX_STONES) {
                _dummy.position.set(e.x, 0, e.y);
                _dummy.scale.set(e.size / 15, e.size / 15, e.size / 15);
                _dummy.updateMatrix();
                stonesInstancedMesh.setMatrixAt(currentStoneIndex, _dummy.matrix);
                _tempColor.set(e.color || '#444444');
                stonesInstancedMesh.setColorAt(currentStoneIndex, _tempColor);
                currentStoneIndex++;
            }
        });
        stonesInstancedMesh.count = currentStoneIndex;
        stonesInstancedMesh.instanceMatrix.needsUpdate = true;
        if (stonesInstancedMesh.instanceColor) stonesInstancedMesh.instanceColor.needsUpdate = true;
        lastRenderedStoneCount = stoneCount;
    }

    // Aufräumen von alten Einzel-Meshes (nur Köpfe)
    for (let [e, mesh] of entityMeshes) {
        if (!currentEntityIds.has(e) || e.alive === false) {
            scene.remove(mesh);
            if (meshPool[e.type]) meshPool[e.type].push(mesh);
            entityMeshes.delete(e);
        }
    }
}

function syncParticles() {
    let count = 0;

    for (let i = 0; i < particles.length; i++) {
        if (count >= MAX_PARTICLES) break; // Limit nicht überschreiten
        let p = particles[i];

        _dummy.position.set(p.x, -4, p.y);

        // Da InstancedMesh kein p.life für Opacity kann, skalieren wir den Krümel
        // abhängig von seiner Lebenszeit. Er schrumpft weg!
        const lifeFactor = Math.max(0, p.life);
        const s = (p.size) * lifeFactor;

        _dummy.scale.set(s, s, s);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();

        particlesInstancedMesh.setMatrixAt(count, _dummy.matrix);

        _tempColor.set(p.color);
        particlesInstancedMesh.setColorAt(count, _tempColor);

        count++;
    }

    particlesInstancedMesh.count = count;
    particlesInstancedMesh.instanceMatrix.needsUpdate = true;
    if (particlesInstancedMesh.instanceColor) particlesInstancedMesh.instanceColor.needsUpdate = true;
}

// Globales Objekt zum Speichern der Materialien
const materialPool = {};

function getPooledMaterial(color, type) {
    // Ein Schlüssel aus Farbe und Typ (Phong für Tiere, Basic für Augen etc.)
    const key = `${color}_${type}`;
    if (!materialPool[key]) {
        if (type === 'basic') {
            materialPool[key] = new THREE.MeshBasicMaterial({ color: color });
        } else {
            // FlatShading nur für Pflanzen
            const isFlat = (type === 'plant');
            materialPool[key] = new THREE.MeshPhongMaterial({ color: color, flatShading: isFlat });
        }
    }
    return materialPool[key];
}

function createMeshForEntity(e) {
    const color = e.color || '#ffffff';

    // Tiere bekommen ein Gruppen-Mesh für Kopf + Augen
    if (e.type === 'animal') {
        // Einfach ein eigenes Material für diesen Körper erzeugen
        const material = new THREE.MeshPhongMaterial({ color: color });
        const group = new THREE.Group();

        const body = new THREE.Mesh(SHARED_GEOMETRIES.animalBody, material);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const eyeMat = getPooledMaterial(0xffffff, 'basic');
        const eye1 = new THREE.Mesh(SHARED_GEOMETRIES.eye, eyeMat);
        eye1.position.set(7.5, 4, 5.5);
        const eye2 = new THREE.Mesh(SHARED_GEOMETRIES.eye, eyeMat);
        eye2.position.set(7.5, 4, -5.5);

        group.add(eye1, eye2);
        return group;
    }

    // Fallback (sollte für tail nicht mehr aufgerufen werden)
    return new THREE.Group();
}

function drawUIOverlay() {
    if (typeof uiCtx !== 'undefined') {
        uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

        const originalCtx = window.ctx;
        window.ctx = uiCtx;

        drawScoreAndPerformance(uiCtx);

        if (typeof drawShopUI === 'function') drawShopUI();

        window.ctx = originalCtx;
    }
}

function drawScoreAndPerformance(c) {

    // --- NEU: FPS- und Performance-Overlay für den 3D-Modus ---
    if (typeof showFps !== 'undefined' && showFps) {
       c.save();
                   c.font = '16px sans-serif';
                   c.textAlign = 'left';
                   c.textBaseline = 'top';

                   // 1. Zeiten berechnen
                   const runSec = Math.floor((Date.now() - startTime) / 1000);
                   const rH = Math.floor(runSec / 3600).toString().padStart(2, '0');
                   const rM = Math.floor((runSec % 3600) / 60).toString().padStart(2, '0');
                   const rS = (runSec % 60).toString().padStart(2, '0');

                   const totalGameMin = Math.floor((window.dayTime || 0) * 24 * 60);
                   const gH = Math.floor(totalGameMin / 60).toString().padStart(2, '0');
                   const gM = (totalGameMin % 60).toString().padStart(2, '0');

                   // 2. Box zeichnen
                   const boxHeight = 185;
                   const startY = window.WORLD_HEIGHT - boxHeight - 10;

                   c.fillStyle = 'rgba(0, 0, 0, 0.6)';
                   c.fillRect(10, startY, 220, boxHeight);

                   // 3. Texte zeichnen
                   c.fillStyle = 'white';
                   c.fillText(`FPS: ${currentFps}`, 20, startY + 10);
                   c.fillText(`Process: ${Math.round(currentProcessTime)} ms`, 20, startY + 35);
                   c.fillText(`Alle Objekte: ${entities.length}`, 20, startY + 60);

                   c.fillStyle = '#f1c40f';
                   c.fillText(`Pflanzenfresser: ${globalHerbivoreCount}`, 20, startY + 85);

                   c.fillStyle = '#e74c3c';
                   c.fillText(`Fleischfresser: ${globalCarnivoreCount}`, 20, startY + 110);

                   // --- NEU: Die Zeiten ---
                   c.fillStyle = '#3498db';
                   c.fillText(`Laufzeit: ${rH}:${rM}:${rS}`, 20, startY + 135);

                   c.fillStyle = '#2ecc71';
                   c.fillText(`Labor-Zeit: ${gH}:${gM} Uhr`, 20, startY + 160);

                   c.restore();
    }
}