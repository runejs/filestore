import { RsNumber, RsString } from './codec';


export class ItemCodec {

    @RsNumber(1, { type: 'short', signedness: 'unsigned', optional: true })
    public widgetModel: number = -1;

    @RsString(2, { optional: true })
    public name: string = '';

    @RsNumber(4, { type: 'short' })
    public model2dZoom: number;

    @RsNumber(5, { type: 'short' })
    public model2dRotationX: number;

    @RsNumber(6, { type: 'short' })
    public model2dRotationY: number;

    @RsNumber(7, { type: 'short' })
    public model2dOffsetX: number;

    @RsNumber(8, { type: 'short' })
    public model2dOffsetY: number;

}
