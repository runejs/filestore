import { RuneNumber, RuneTypes } from './codec';

export class Replacement {

    @RuneNumber(RuneTypes.unsigned_short)
    origValue: number;

    @RuneNumber(RuneTypes.unsigned_short)
    newValue: number;

}
