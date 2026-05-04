// js/shop.js

let isShopOpen = false;
let isPlacementMode = false;
let pendingItem = null;
let isDeleteMode = false;

const SHOP_ITEMS = [
    { id: 'plant', name: 'Pflanze', color: '#2ecc71' },
    { id: 'super_plant', name: 'Super Pflanze', color: '#8e44ad' },
    { id: 'stone', name: 'Normaler Stein', color: '#777777' },
    { id: 'super_stone', name: 'Super Stein', color: '#ff00ff' },
    { id: 'herbivore', name: 'Pflanzenfresser', color: '#f1c40f' },
    { id: 'giant', name: 'Riesen-Pflanzenfresser', color: '#e67e22' },
    { id: 'carnivore', name: 'Fleischfresser', color: '#e74c3c' },
    { id: 'snake', name: 'Schlange', color: '#9b59b6' },
    { id: 'delete', name: 'Element löschen', color: '#e74c3c' }
];

const SHOP_BTN = { x: 0, y: 15, w: 60, h: 60 };
const SHOP_WIN = { w: 400, h: 580 };

function drawShopUI() {
    // Button-Position rechts oben festlegen
    SHOP_BTN.x = WORLD_WIDTH - 75;

    // Button leuchtet rot, wenn ein Modus aktiv ist (zum Abbrechen)
    const isCancelState = isShopOpen || isPlacementMode || isDeleteMode;

    ctx.save();
    ctx.fillStyle = isCancelState ? '#ff5555' : 'rgba(255, 255, 255, 0.2)';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    drawRoundedRect(SHOP_BTN.x, SHOP_BTN.y, SHOP_BTN.w, SHOP_BTN.h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isCancelState ? '×' : '+', SHOP_BTN.x + SHOP_BTN.w/2, SHOP_BTN.y + SHOP_BTN.h/2 + 2);
    ctx.restore();

    // Nur zeichnen, wenn der Shop explizit offen ist
    if (isShopOpen) {
        drawShopWindow();
    }

    // Vorschau-Geister zeichnen
    if (isPlacementMode && pendingItem) drawPlacementPreview();
    if (isDeleteMode) drawDeletePreview();
}

function drawShopWindow() {
    const winX = (WORLD_WIDTH - SHOP_WIN.w) / 2;
    const winY = (WORLD_HEIGHT - SHOP_WIN.h) / 2;

    ctx.save();
    // Hintergrund abdunkeln
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Fensterrahmen
    ctx.fillStyle = '#2c3e50';
    ctx.strokeStyle = '#ecf0f1';
    ctx.lineWidth = 3;
    drawRoundedRect(winX, winY, SHOP_WIN.w, SHOP_WIN.h, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Labor-Werkzeuge', winX + SHOP_WIN.w/2, winY + 40);

    SHOP_ITEMS.forEach((item, index) => {
        const itemY = winY + 70 + (index * 55);
        const isHovered = (mouseX >= winX + 20 && mouseX <= winX + SHOP_WIN.w - 20 &&
            mouseY >= itemY && mouseY <= itemY + 45);

        ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)';
        drawRoundedRect(winX + 20, itemY, SHOP_WIN.w - 40, 45, 10);
        ctx.fill();

        // Icon
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(winX + 50, itemY + 22, 10, 0, Math.PI * 2);
        ctx.fill();

        // Name (Keine Preise mehr!)
        ctx.textAlign = 'left';
        ctx.fillStyle = isHovered ? '#fff' : '#eee';
        ctx.font = '16px sans-serif';
        ctx.fillText(item.name, winX + 80, itemY + 27);
    });
    ctx.restore();
}

function handleShopClick(canvasX, canvasY) {
    // 1. Klick auf den Plus/X-Button
    if (canvasX >= SHOP_BTN.x && canvasY <= SHOP_BTN.y + SHOP_BTN.h /*canvasX <= SHOP_BTN.x + SHOP_BTN.w &&
        canvasY >= SHOP_BTN.y && */) {

        if (isPlacementMode || isDeleteMode) {
            isPlacementMode = false;
            isDeleteMode = false;
            pendingItem = null;
        } else {
            isShopOpen = !isShopOpen;
        }
        return true;
    }

    // 2. Klick im Platzierungsmodus (irgendwo in der Welt)
    if (isPlacementMode && pendingItem) {
        executePlacement(canvasX, canvasY);
        // Nach dem Platzieren den Modus behalten für mehrere Objekte,
        // oder Modus beenden? Wir behalten ihn mal bei.
        return true;
    }

    // 3. Klick im Shop-Fenster
    if (isShopOpen) {
        const winX = (WORLD_WIDTH - SHOP_WIN.w) / 2;
        const winY = (WORLD_HEIGHT - SHOP_WIN.h) / 2;

        for (let i = 0; i < SHOP_ITEMS.length; i++) {
            const item = SHOP_ITEMS[i];
            const itemY = winY + 70 + (i * 55);

            if (canvasX >= winX + 20 && canvasX <= winX + SHOP_WIN.w - 20 &&
                canvasY >= itemY && canvasY <= itemY + 45) {

                if (item.id === 'delete') {
                    isDeleteMode = true;
                    isPlacementMode = false;
                } else {
                    isDeleteMode = false;
                    isPlacementMode = true;
                    pendingItem = item;
                }
                isShopOpen = false; // Fenster schließen nach Auswahl
                return true;
            }
        }

        // Klick außerhalb schließt den Shop
        if (canvasX < winX || canvasX > winX + SHOP_WIN.w || canvasY < winY || canvasY > winY + SHOP_WIN.h) {
            isShopOpen = false;
        }
        return true;
    }
    return false;
}

function executePlacement(x, y) {
    if (!pendingItem) return;
    let newEntity;

    switch(pendingItem.id) {
        case 'plant':
            newEntity = new PlantSegment(x, y, null, false);
            staticGrid.add(newEntity);
            break;
        case 'super_plant':
            newEntity = new PlantSegment(x, y, null, true);
            newEntity.isTip = true;
            staticGrid.add(newEntity);
            break;
        case 'stone':
            newEntity = new StoneCell(x, y, 20, false);
            staticGrid.add(newEntity);
            break;
        case 'super_stone':
            newEntity = new StoneCell(x, y, 25, true);
            staticGrid.add(newEntity);
            break;
        case 'herbivore':
            const initialGenome = new Genome();
            initialGenome.speed = window.SETTINGS.HERB_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.HERB_SPEED_VARIANCE * 2;
            initialGenome.maxSize = window.SETTINGS.HERB_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
            newEntity = new HerbivoreCell(x, y, initialGenome, false);
            newEntity.energy = newEntity.getMaxEnergy();
            addInitialTail(newEntity, entities);
            break;
        case 'giant':
            const initialGenomeG = new Genome();
            initialGenomeG.speed = window.SETTINGS.HERB_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.HERB_SPEED_VARIANCE * 2;
            initialGenomeG.maxSize = window.SETTINGS.HERB_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
            newEntity = new HerbivoreCell(x, y, initialGenomeG, true);
            newEntity.isGiant = true;
            newEntity.size = 8;
            newEntity.energy = newEntity.getMaxEnergy();
            addInitialTail(newEntity, entities);
            break;
        case 'carnivore':
            const initialGenomeC = new Genome();
            initialGenomeC.speed = window.SETTINGS.CARN_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.CARN_SPEED_VARIANCE * 2;
            initialGenomeC.maxSize = window.SETTINGS.CARN_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
            newEntity = new CarnivoreCell(x, y, initialGenomeC);
            newEntity.size = 3;
            newEntity.energy = newEntity.getMaxEnergy();
            addInitialTail(newEntity, entities);
            break;
        case 'snake':
            const initialGenomeS = new Genome();
            initialGenomeS.speed = window.SETTINGS.SNAKE_BASE_SPEED + (Math.random() - 0.5) * window.SETTINGS.SNAKE_SPEED_VARIANCE * 2;
            initialGenomeS.maxSize = window.SETTINGS.SNAKE_MAX_SIZE_BASE + (Math.random() - 0.5) * 2;
            newEntity = new SnakeCell(x, y, initialGenomeS);
            newEntity.size = 3;
            newEntity.energy = newEntity.getMaxEnergy();
            addInitialTail(newEntity, entities, 8);
            break;
    }

    if (newEntity) entities.push(newEntity);
}

function drawPlacementPreview() {
    if (typeof mouseX === 'undefined') return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = pendingItem.color;
    ctx.strokeStyle = 'white';
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Klicken zum Platzieren", mouseX, mouseY - 25);
    ctx.restore();
}

function drawDeletePreview() {
    ctx.save();
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mouseX, mouseY, 20, 0, Math.PI * 2);
    ctx.moveTo(mouseX - 25, mouseY);
    ctx.lineTo(mouseX + 25, mouseY);
    ctx.moveTo(mouseX, mouseY - 25);
    ctx.lineTo(mouseX, mouseY + 25);
    ctx.stroke();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Löschen aktiv", mouseX, mouseY - 35);
    ctx.restore();
}

function drawRoundedRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

window.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        isPlacementMode = false;
        isDeleteMode = false;
        isShopOpen = false;
        pendingItem = null;
    }
});