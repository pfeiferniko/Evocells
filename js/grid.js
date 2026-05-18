class Grid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols * this.rows).fill(null).map(() => []);
        this.queryResult = [];
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
            // --- OPTIMIERUNG: Swap and Pop statt splice() ---
            const lastEntity = cell[cell.length - 1];
            cell[i] = lastEntity; // Das letzte Element rutscht auf die Lücke
            cell.pop();           // Das nun doppelte Ende wird blitzschnell abgeschnitten
        }
        entity._gridIndex = -1;
    }

    _getIndex(x, y) {
        // --- OPTIMIERUNG: Bitwise NOT statt Math.floor ---
        const col = ~~(x / this.cellSize);
        const row = ~~(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return col + row * this.cols;
    }

    getEntitiesInArea(x, y, radius) {
        let resultCount = 0;

        // --- OPTIMIERUNG: Bitwise NOT für rasend schnelle Berechnung ---
        const minCol = Math.max(0, ~~((x - radius) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, ~~((x + radius) / this.cellSize));
        const minRow = Math.max(0, ~~((y - radius) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, ~~((y + radius) / this.cellSize));

        for (let col = minCol; col <= maxCol; col++) {
            for (let row = minRow; row <= maxRow; row++) {
                const index = col + row * this.cols;
                const cell = this.grid[index];
                for (let i = 0; i < cell.length; i++) {
                    this.queryResult[resultCount++] = cell[i];
                }
            }
        }
        this.queryResult.length = resultCount;
        return this.queryResult;
    }

    clear() {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i].length = 0;
        }
    }
}