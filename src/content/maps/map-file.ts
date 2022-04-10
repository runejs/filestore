export type TileDataArray = (Uint8Array[])[];


export class MapTileData {

    heights: number[][][] = MapTileData.initArray();
    settings: TileDataArray = MapTileData.initArray();
    overlayIds: TileDataArray = MapTileData.initArray();
    overlayPaths: TileDataArray = MapTileData.initArray();
    overlayOrientations: TileDataArray = MapTileData.initArray();
    underlayIds: TileDataArray = MapTileData.initArray();

    static initArray<T extends number[][][] | TileDataArray>(): T {
        return new Array(4)
            .map(() => new Array(64)
                .map(() => new Array(64)
                    .fill(0))) as unknown as T;
    }

}


export class MapFile {

    key: number;
    x: number;
    y: number;
    tiles: MapTileData = new MapTileData();

    private _name: string;

    constructor(key: number, name: string) {
        this.key = key;
        this.name = name;
    }

    get name(): string {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
        if(value && value.includes('_')) {
            const [ x, y ] = value.substring(1)
                .split('_')
                .map(s => Number(s));
            if(x !== undefined && x !== null && !isNaN(x)) {
                this.x = x;
            }
            if(y !== undefined && y !== null && !isNaN(y)) {
                this.y = y;
            }
        }
    }

}
