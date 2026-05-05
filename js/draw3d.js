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

const MAX_DIAMONDS = 300;
let diamondsInstancedMesh;

let lastRenderedStoneCount = -1;

let particlesInstancedMesh;
let plantsInstancedMesh;
let stonesInstancedMesh;

// --- NEU: Kamera-Tracking Variablen ---
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let currentLookAt = new THREE.Vector3();
let defaultCameraPos = new THREE.Vector3();
let defaultLookAt = new THREE.Vector3();
let isCameraInit = false;

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
    // Bei SHARED_GEOMETRIES:
    diamond: new THREE.OctahedronGeometry(12, 0), // Oktaeder ist die perfekte Diamantform!
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
    scene.background = new THREE.Color(0x020406);

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
    ambientLight = new THREE.AmbientLight(0x405060, 0.6);
    scene.add(ambientLight);

    // 3. Hauptlicht: Intensität 3.0 sorgt für starke Highlights auf den dunklen Oberflächen.
    light = new THREE.DirectionalLight(0xe0f0ff, 2);
    light.position.set(WORLD_WIDTH / 2, 200, -500);
    light.target.position.set(WORLD_WIDTH / 2, 0, WORLD_HEIGHT / 2);
    scene.add(light.target);

    light.castShadow = true;

    const dX = WORLD_WIDTH;
    const dY = WORLD_HEIGHT;
    light.shadow.camera.left = -dX;
    light.shadow.camera.right = dX;
    light.shadow.camera.top = dY;
    light.shadow.camera.bottom = -dY;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 2500;

    light.shadow.mapSize.width = 1500;
    light.shadow.mapSize.height = 1500;
    light.shadow.bias = -0.0005;

    scene.add(light);

    // 4. Bodenplatte: Abgedunkelt auf 0x080a0f.
    // Das ist deutlich dunkler als 0x121820, bietet aber im Vergleich zum
    // fast schwarzen Hintergrund (0x020406) immer noch genug Fläche für Schatten.
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT),
        new THREE.MeshPhongMaterial({ color: 0x0505060 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD_WIDTH / 2, -15, WORLD_HEIGHT / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    // --- NEU: AQUARIUM-KANTEN ---
    // Wie hoch das Aquarium-Glas sein soll (400 wirkt bei 2000er Breite sehr gut)
    const aquariumHeight = 50;

    // Wir bauen einen unsichtbaren Kasten in Welt-Größe
    const boxGeo = new THREE.BoxGeometry(WORLD_WIDTH, aquariumHeight, WORLD_HEIGHT);

    // EdgesGeometry filtert die Geometrie und behält NUR die äußeren Kanten (keine Diagonalen!)
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    // Ein Material für die Linien
    const edgesMat = new THREE.LineBasicMaterial({
        color: 0x1a4496, // Das gleiche Cyan/Blaugrün wie dein Plankton
        transparent: true,
        opacity: 0.7     // Halbtransparent für einen echten Glas-Look
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

            // Kamera-Position mit der neuen zoomHeight
            const targetPos = new THREE.Vector3(e.x, zoomHeight, e.y + 1.0);
            const targetLookAt = new THREE.Vector3(e.x, 0, e.y);

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
            light.shadow.camera.left = -1500;
            light.shadow.camera.right = 1500;
            light.shadow.camera.top = 1500;
            light.shadow.camera.bottom = -1500;
            light.shadow.camera.updateProjectionMatrix();
        }
    }
}

// --- OPTIMIERTER 3D Tagesablauf (Original-Position mit leichtem Pendeln) ---
function updateDayNight3D() {
    if (!light || !ambientLight) return;

    // timePhase schwingt sanft von 0.0 (Mitternacht) bis 1.0 (Mittag)
    const timePhase = (Math.cos(window.dayTime * Math.PI * 2) * -1 + 1) / 2;

    // 1. POSITION: Zurück zur Original-Ausrichtung (y = 200, z = -500)
    // Wandert nur leicht (z.B. +/- 400 Pixel) nach links und rechts
    // 1. POSITION: Relativ zum Ziel (Target)!
        // Damit bleiben die Schattenwinkel IMMER exakt gleich, egal wohin die Kamera schaut
        const targetX = (light.target && light.target.position.x) ? light.target.position.x : (window.WORLD_WIDTH / 2);
        const targetZ = (light.target && light.target.position.z) ? light.target.position.z : (window.WORLD_HEIGHT / 2);

        light.position.x = targetX + Math.sin(window.dayTime * Math.PI * 2) * 400;
        light.position.y = 200;
        light.position.z = targetZ - 500;

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
    ambientLight.intensity = 0.4 + (timePhase * 0.2);

    // Ambient-Farbe (Kühlt nachts etwas ab)
    const ambR = 0x20 + (0x20 * timePhase);
    const ambG = 0x30 + (0x20 * timePhase);
    const ambB = 0x50 + (0x10 * timePhase);
    ambientLight.color.setRGB(ambR/255, ambG/255, ambB/255);

    // 4. HINTERGRUND: Pulsiert nur hauchzart mit
    const bgR = 0x08 + (0x04 * timePhase);
    const bgG = 0x10 + (0x06 * timePhase);
    const bgB = 0x18 + (0x0a * timePhase);
    scene.background.setRGB(bgR/255, bgG/255, bgB/255);
}

function initInstancedMeshes() {
    // Partikel (Krümel) - Jetzt mit Phong-Material für korrekte Beleuchtung
    const particleMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });
    particlesInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.particle, particleMat, MAX_PARTICLES);
    particlesInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particlesInstancedMesh.castShadow = true; // Wie gewünscht beibehalten
    scene.add(particlesInstancedMesh);

    // Pflanzen
    const plantMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });
    plantsInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.plant, plantMat, MAX_PLANTS);
    plantsInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    plantsInstancedMesh.castShadow = true;
    scene.add(plantsInstancedMesh);

    // Steine
    const stoneMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    stonesInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.stone, stoneMat, MAX_STONES);
    stonesInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stonesInstancedMesh.castShadow = true;
    scene.add(stonesInstancedMesh);

    // Diamanten
    const diamondMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 100, flatShading: true });
    diamondsInstancedMesh = new THREE.InstancedMesh(SHARED_GEOMETRIES.diamond, diamondMat, MAX_DIAMONDS);
    diamondsInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    diamondsInstancedMesh.castShadow = true;
    scene.add(diamondsInstancedMesh);

    // --- BUGFIX: Farb-Puffer für die Grafikkarte erzwingen ---
        // Wenn die Welt leer startet, muss die Engine trotzdem wissen,
        // dass diese Objekte später individuelle Farben bekommen.
        const dummyColor = new THREE.Color(0xffffff);
        if (plantsInstancedMesh) plantsInstancedMesh.setColorAt(0, dummyColor);
        if (stonesInstancedMesh) stonesInstancedMesh.setColorAt(0, dummyColor);
        if (particlesInstancedMesh) particlesInstancedMesh.setColorAt(0, dummyColor);
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
    planktonMesh.receiveShadow = true;

    scene.add(planktonMesh);
}

function draw3D() {
    if (!scene) init3D();

    if (renderer.domElement.width !== canvas3D.width || renderer.domElement.height !== canvas3D.height) {
        renderer.setSize(canvas3D.width, canvas3D.height, false);
        camera.aspect = canvas3D.width / canvas3D.height;
        camera.updateProjectionMatrix();
    }

    updatePlanktonPositions();
    syncEntities();
    syncParticles();

    updateDayNight3D();

    updateTrackingCamera();

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

    entities.forEach(e => {
        if (!e.alive) return;

        if (e.type === 'plant') {
            if (plantCount < MAX_PLANTS) {
                const pulse = 1.0 + Math.sin((Date.now() * e.pulseSpeed) + e.pulseOffset) * 0.1;
                const s = (e.size / 10) * pulse;

                _dummy.position.set(e.x, 0, e.y);
                _dummy.scale.set(s, s, s);
                _dummy.rotation.set(0, 0, 0);
                _dummy.updateMatrix();

                plantsInstancedMesh.setMatrixAt(plantCount, _dummy.matrix);
                _tempColor.set(e.color || '#ffffff');
                plantsInstancedMesh.setColorAt(plantCount, _tempColor);

                plantCount++;
            }
        } else if (e.type === 'stone') {
            // Steine werden nur gezählt, Matrix-Updates machen wir unten!
            if (stoneCount < MAX_STONES) {
                stoneCount++;
            }
        } else if (e.type === 'diamond') {
            if (diamondCount < MAX_DIAMONDS) {
                // Schrumpft, wenn die Zeit abläuft
                const shrink = e.life < e.maxLife * 0.3 ? Math.max(0.01, e.life / (e.maxLife * 0.3)) : 1.0;
                const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.1;
                const s = (e.size / 10) * pulse * shrink;

                // Eleganter Schwebe-Effekt (auf und ab)
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
        } else {
            // --- TIERE UND SCHWÄNZE (Object Pooling) ---
            currentEntityIds.add(e);

            if (!entityMeshes.has(e)) {
                let mesh;
                if (meshPool[e.type] && meshPool[e.type].length > 0) {
                    mesh = meshPool[e.type].pop();
                    const color = e.color || '#ffffff';
                    const actualMesh = mesh.isGroup ? mesh.children[0] : mesh;

                    if (actualMesh.material) {
                        actualMesh.material = getPooledMaterial(color, 'phong');
                    }
                } else {
                    mesh = createMeshForEntity(e);
                }

                scene.add(mesh);
                entityMeshes.set(e, mesh);
            }

            const mesh = entityMeshes.get(e);
            let hoverHeight = -4;
            mesh.position.set(e.x, hoverHeight, e.y);
            mesh.rotation.y = -e.angle;

            if (e.type === 'tail') {
                updateTailColor(e, mesh);
            }

            // Basis-Skalierung für 3D
            let s = e.size / 10;

            // --- NEU: Nur den Kopf der Pflanzenfresser schrumpfen ---
            // "instanceof HerbivoreCell" trifft NUR den Kopf. Schwänze werden ignoriert!
            if (e instanceof HerbivoreCell) {
                s = s * 0.6; // Kopf auf 70% der Größe
            }

            mesh.scale.set(s, s, s);
        }
    });


    // Update Arrays an die Grafikkarte schicken
    plantsInstancedMesh.count = plantCount;
    plantsInstancedMesh.instanceMatrix.needsUpdate = true;
    if (plantsInstancedMesh.instanceColor) plantsInstancedMesh.instanceColor.needsUpdate = true;

    // --- NEU: Steine nur an die GPU schicken, wenn sich die Anzahl ändert! ---
    if (stoneCount !== lastRenderedStoneCount) {
        let currentStoneIndex = 0;
        entities.forEach(e => {
            if (e.alive && e.type === 'stone' && currentStoneIndex < MAX_STONES) {
                const s = e.size / 15;
                _dummy.position.set(e.x, 0, e.y);
                _dummy.scale.set(s, s, s);
                _dummy.rotation.set(0, 0, 0);
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

        lastRenderedStoneCount = stoneCount; // Merken, dass wir aktuell sind!
    }

    diamondsInstancedMesh.count = diamondCount;
    diamondsInstancedMesh.instanceMatrix.needsUpdate = true;
    if (diamondsInstancedMesh.instanceColor) diamondsInstancedMesh.instanceColor.needsUpdate = true;

    // Tote Tiere und Schwänze in den Pool räumen
    for (let [e, mesh] of entityMeshes) {
        if (!currentEntityIds.has(e) || e.alive === false) {
            scene.remove(mesh);

            if (meshPool[e.type]) {
                meshPool[e.type].push(mesh);
            }

            entityMeshes.delete(e);
        }
    }
}

function updateTailColor(segment, mesh) {
    let root = segment.parent;
    while (root && root.type === 'tail') root = root.parent;

    if (root && root.tailSegments) {
        const index = root.tailSegments.indexOf(segment);
        const total = root.tailSegments.length;

        // Verhindern, dass durch 0 geteilt wird
        const maxEnergy = typeof root.getMaxEnergy === 'function' ? root.getMaxEnergy() : 1;
        const energyRatio = root.energy / maxEnergy;

        const isEmpty = (index / total) >= energyRatio;

        const actualMesh = mesh.isGroup ? mesh.children[0] : mesh;

        // --- DER FIX: Material austauschen statt Farbe umfärben ---
        if (actualMesh) {
            if (isEmpty) {
                // Schwanzglied ist leer -> Wir weisen ein weißes gepooltes Material zu
                actualMesh.material = getPooledMaterial('#ffffff', 'phong');
            } else {
                // Schwanzglied hat Energie -> Wir weisen die Originalfarbe zu
                actualMesh.material = getPooledMaterial(segment.color, 'phong');
            }
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
    let finalMesh;

    if (e.type === 'animal') {
        const material = getPooledMaterial(color, 'phong');
        const group = new THREE.Group();

        const body = new THREE.Mesh(SHARED_GEOMETRIES.animalBody, material);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const eyeColor = 0xffffff; //(e.constructor.name === 'CarnivoreCell' || e.isGiant) ? 0x000000 : 0xffffff;
        const eyeMat = getPooledMaterial(eyeColor, 'basic');

        const eye1 = new THREE.Mesh(SHARED_GEOMETRIES.eye, eyeMat);
        eye1.position.set(7.5, 4, 5.5);
        const eye2 = new THREE.Mesh(SHARED_GEOMETRIES.eye, eyeMat);
        eye2.position.set(7.5, 4, -5.5);

        group.add(eye1, eye2);
        finalMesh = group;

    } else if (e.type === 'tail') {
        finalMesh = new THREE.Mesh(SHARED_GEOMETRIES.tail, getPooledMaterial(color, 'phong'));
        finalMesh.castShadow = true;
        finalMesh.receiveShadow = true;
    }

    return finalMesh;
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