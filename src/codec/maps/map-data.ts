export default class MapData {

    public tileHeights: Uint8Array[][] = new Array(4);
    public tileSettings: Uint8Array[][] = new Array(4);
    public tileOverlayIds: Int8Array[][] = new Array(4);
    public tileOverlayPaths: Int8Array[][] = new Array(4);
    public tileOverlayOrientations: Int8Array[][] = new Array(4);
    public tileOverlayOpcodes: Uint8Array[][] = new Array(4);
    public tileUnderlayIds: Int8Array[][] = new Array(4);

    public constructor() {
        Object.keys(this).forEach(key => {
            if(!this[key] || !Array.isArray(this[key])) {
                return;
            }

            const tileInfoArray: Uint8Array[][] | Int8Array[][] = this[key];
            for(let plane = 0; plane < 4; plane++) {
                tileInfoArray[plane] = new Array(64);
                for(let x = 0; x < 64; x++) {
                    tileInfoArray[plane][x] = (tileInfoArray instanceof Uint8Array) ?
                        new Uint8Array(64) : new Int8Array(64);
                }
            }
        });
    }

    /**
     * Iterates over each individual tile space within this map file, calling the provided callback
     * function with the plane index, x coordinate, and y coordinate of the current tile in the loop.
     * @param callback The function to be called for each individual map tile.
     */
    public forEach(callback: (mapData: MapData, plane: number, x: number, y: number) => void): MapData {
        for(let plane = 0; plane < 4; plane++) {
            for(let x = 0; x < 64; x++) {
                for(let y = 0; y < 64; y++) {
                    callback(this, plane, x, y);
                }
            }
        }

        return this;
    }

}
