class Grid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols * this.rows).fill(null).map(() => []);
    }

    _getIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return col + row * this.cols;
    }

    add(entity) {
        const index = this._getIndex(entity.x, entity.y);
        if (index !== -1) {
            this.grid[index].push(entity);
            entity._gridIndex = index; // Speichert die Position für schnelles Entfernen
        }
    }

    remove(entity) {
        if (entity._gridIndex === undefined || entity._gridIndex === -1) return;
        const cell = this.grid[entity._gridIndex];
        const i = cell.indexOf(entity);
        if (i !== -1) {
            cell.splice(i, 1);
        }
        entity._gridIndex = -1;
    }

    getEntitiesInArea(x, y, radius) {
        const entities = [];
        const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
        const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));

        for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
                const index = col + row * this.cols;
                const cell = this.grid[index];
                for (let i = 0; i < cell.length; i++) {
                    entities.push(cell[i]);
                }
            }
        }
        return entities;
    }

    clear() {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i].length = 0;
        }
    }
}