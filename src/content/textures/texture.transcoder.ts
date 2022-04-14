import { ByteBuffer, logger } from '@runejs/common';
import { Texture } from './texture';
import { ArchiveTranscoder } from 'content/archive-transcoder';
import { TexturePack } from './texture-pack';


export class TextureTranscoder extends ArchiveTranscoder<TexturePack, Texture> {

    override decodeGroup(groupKeyOrName: string | number): TexturePack | null {
        throw new Error('Method not implemented.');
    }

    override encodeGroup(groupKeyOrName: string | number): ByteBuffer | null {
        throw new Error('Method not implemented.');
    }

    override decodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): Texture | null {
        const group = this.findGroup(groupKeyOrName);
        if(!group?.files?.size) {
            logger.error(`Group ${groupKeyOrName} is empty.`);
            return null;
        }

        const file = group.get(flatFileKey);
        if(!file?.data?.length) {
            logger.error(`File ${flatFileKey} is empty in group ${groupKeyOrName}.`);
            return null;
        }

        const fileData = file.data.clone();
        const texture = new Texture();

        texture.id = flatFileKey;
        texture.rgb = fileData.get('short', 'u');
        texture.opaque = fileData.get('byte', 'u') === 1;
        
        const spriteCount = fileData.get('byte', 'u');

        if(spriteCount < 1 || spriteCount > 4) {
            logger.error(`Invalid texture sprite count: ${spriteCount}`);
            return null;
        }

        texture.spriteKeys = new Array<number>(spriteCount);

        for(let i = 0; i < spriteCount; i++) {
            texture.spriteKeys[i] = fileData.get('short', 'u');
        }

        if(spriteCount > 1) {
            texture.renderTypes = new Array<number>(spriteCount - 1);
            for(let i = 0; i < spriteCount - 1; i++) {
                texture.renderTypes[i] = fileData.get('byte', 'u');
            }
        }

        if(spriteCount > 1) {
            texture.anIntArray2138 = new Array<number>(spriteCount - 1);
            for(let i = 0; i < spriteCount - 1; i++) {
                texture.anIntArray2138[i] = fileData.get('byte', 'u');
            }
        }

        texture.colors = new Array<number>(spriteCount);

        for(let i = 0; i < spriteCount; i++) {
            texture.colors[i] = fileData.get('int');
        }

        texture.direction = fileData.get('byte', 'u');
        texture.speed = fileData.get('byte', 'u');
        
        return texture;
    }

    override encodeFlatFile(groupKeyOrName: string | number, flatFileKey: number): ByteBuffer | null {
        throw new Error('Method not implemented.');
    }

}
