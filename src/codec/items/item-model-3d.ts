import { RuneNumber, RuneTypes } from '../codec';

export class ItemModel3d {

    @RuneNumber({ opcode: 23, ...RuneTypes.unsigned_short })
    public masculineModel1: number;

    @RuneNumber({ opcode: 23, ...RuneTypes.byte })
    public masculineModelOffset: number;

    @RuneNumber({ opcode: 24, ...RuneTypes.unsigned_short })
    public masculineModel2: number;

    @RuneNumber({ opcode: 25, ...RuneTypes.unsigned_short })
    public feminineModel1: number;

    @RuneNumber({ opcode: 25, ...RuneTypes.byte })
    public feminineModelOffset: number;

    @RuneNumber({ opcode: 26, ...RuneTypes.unsigned_short })
    public feminineModel2: number;

    @RuneNumber({ opcode: 78, ...RuneTypes.unsigned_short })
    public masculineModel3: number;

    @RuneNumber({ opcode: 79, ...RuneTypes.unsigned_short })
    public feminineModel3: number;

    @RuneNumber({ opcode: 90, ...RuneTypes.unsigned_short })
    public masculineHeadModel1: number;

    @RuneNumber({ opcode: 91, ...RuneTypes.unsigned_short })
    public feminineHeadModel1: number;

}
