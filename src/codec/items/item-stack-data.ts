import { RuneNumber, RuneTypes } from '../codec';


export class ItemStackData {

    @RuneNumber(RuneTypes.unsigned_short)
    public id: number;

    @RuneNumber(RuneTypes.unsigned_short)
    public amount: number;

}
