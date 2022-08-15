import { Column, Entity, PrimaryColumn } from 'typeorm';


@Entity('jag_game_interface')
export class JagGameInterfaceEntity {

    @PrimaryColumn('integer', { nullable: false, unique: true })
    id: number;

    @Column('integer', { name: 'parent_id', nullable: false, default: -1 })
    parentId: number = -1;

    @Column('integer', { nullable: false })
    type: number;

    @Column('integer', { nullable: false })
    actionType: number;

    @Column('integer', { nullable: false })
    contentType: number;

    @Column('integer', { nullable: false })
    width: number;

    @Column('integer', { nullable: false })
    height: number;

    @Column('integer', { nullable: false })
    alpha: number;

    @Column('integer', { nullable: false })
    hoveredPopup: number;

    @Column('simple-json', { nullable: true })
    conditionTypes?: number[];

    @Column('simple-json', { nullable: true })
    conditionValues?: number[];

    @Column('simple-json', { nullable: true })
    cs1Opcodes?: number[][];

    @Column('integer', { nullable: true })
    scrollLimit?: number;

    @Column('boolean', { nullable: true })
    hiddenUntilHovered?: boolean;

    @Column('simple-json', { nullable: true })
    children?: number[];

    @Column('simple-json', { nullable: true })
    childrenX?: number[];

    @Column('simple-json', { nullable: true })
    childrenY?: number[];

    @Column('integer', { nullable: true })
    unknownServerAttribute1?: number;

    @Column('boolean', { nullable: true })
    unknownServerAttribute2?: boolean;

    @Column('simple-json', { nullable: true })
    items?: number[];

    @Column('simple-json', { nullable: true })
    itemAmounts?: number[];

    @Column('boolean', { nullable: true })
    itemsSwappable?: boolean;

    @Column('boolean', { nullable: true })
    isInventory?: boolean;

    @Column('boolean', { nullable: true })
    itemsUsable?: boolean;

    @Column('boolean', { nullable: true })
    deleteDraggedItems?: boolean;

    @Column('integer', { nullable: true })
    itemSpritesPadX?: number;

    @Column('integer', { nullable: true })
    itemSpritesPadY?: number;

    @Column('simple-json', { nullable: true })
    images?: string[];

    @Column('simple-json', { nullable: true })
    imagesX?: number[];

    @Column('simple-json', { nullable: true })
    imagesY?: number[];

    @Column('simple-json', { nullable: true })
    options?: string[];

    @Column('boolean', { nullable: true })
    filled?: boolean;

    @Column('boolean', { nullable: true })
    textCentered?: boolean;

    @Column('integer', { nullable: true })
    fontType?: number;

    @Column('boolean', { nullable: true })
    textShadowed?: boolean;

    @Column('text', { nullable: true })
    disabledText?: string;

    @Column('text', { nullable: true })
    enabledText?: string;

    @Column('integer', { nullable: true })
    disabledColor?: number;

    @Column('integer', { nullable: true })
    enabledColor?: number;

    @Column('integer', { nullable: true })
    disabledHoverColor?: number;

    @Column('integer', { nullable: true })
    enabledHoverColor?: number;

    @Column('text', { nullable: true })
    disabledImage?: string;

    @Column('text', { nullable: true })
    enabledImage?: string;

    @Column('integer', { nullable: true })
    disabledModelType?: number;

    @Column('integer', { nullable: true })
    disabledModelId?: number;

    @Column('integer', { nullable: true })
    enabledModelType?: number;

    @Column('integer', { nullable: true })
    enabledModelId?: number;

    @Column('integer', { nullable: true })
    disabledAnimationId?: number;

    @Column('integer', { nullable: true })
    enabledAnimationId?: number;

    @Column('integer', { nullable: true })
    modelZoom?: number;

    @Column('integer', { nullable: true })
    modelRotationX?: number;

    @Column('integer', { nullable: true })
    modelRotationY?: number;

    @Column('text', { nullable: true })
    actionAdditions?: string;

    @Column('text', { nullable: true })
    actionText?: string;

    @Column('integer', { nullable: true })
    actionAttributes?: number;

    @Column('text', { nullable: true })
    tooltip?: string;
}
