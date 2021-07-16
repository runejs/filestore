import { RuneNumber, RuneTypes } from '../codec';

export class ItemRenderingData {

    @RuneNumber({ opcode: 110, ...RuneTypes.short })
    public resizeX: number;

    @RuneNumber({ opcode: 111, ...RuneTypes.short })
    public resizeY: number;

    @RuneNumber({ opcode: 112, ...RuneTypes.short })
    public resizeZ: number;

    @RuneNumber({ opcode: 113, ...RuneTypes.byte })
    public ambient: number;

    @RuneNumber({ opcode: 113, ...RuneTypes.byte })
    public contrast: number;

}
