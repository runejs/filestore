import { RuneNumber, RuneTypes } from '../codec';


export class ItemModel2d {

    @RuneNumber({ opcode: 1, ...RuneTypes.unsigned_short })
    public widgetModelId: number = -1;

    @RuneNumber({ opcode: 4, ...RuneTypes.short })
    public zoom: number;

    @RuneNumber({ opcode: 5, ...RuneTypes.short })
    public rotationX: number;

    @RuneNumber({ opcode: 6, ...RuneTypes.short })
    public rotationY: number;

    @RuneNumber({ opcode: 95, ...RuneTypes.short })
    public rotationZ: number;

    @RuneNumber({ opcode: 7, ...RuneTypes.short })
    public offsetX: number;

    @RuneNumber({ opcode: 8, ...RuneTypes.short })
    public offsetY: number;

}
