export class LandscapeObject {
    gameObjectKey: number;
    x: number;
    y: number;
    level: number;
    type: number;
    orientation: number;

    constructor(gameObjectKey?: number, x?: number, y?: number,
                level?: number, type?: number, orientation?: number) {
        this.gameObjectKey = gameObjectKey;
        this.x = x;
        this.y = y;
        this.level = level;
        this.type = type;
        this.orientation = orientation;
    }
}


export class LandscapeFile {
    key: number;
    x: number;
    y: number;
    objects: LandscapeObject[] = [];

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
