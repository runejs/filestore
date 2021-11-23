import path from 'path';
import fs from 'graceful-fs';
import { logger } from '@runejs/common';
import { ByteBuffer } from '@runejs/common/buffer';


export type XteaKey = [ number, number, number, number ];


export interface XteaConfig {
    archive: number;
    group: number;
    name_hash: number;
    name: string;
    mapsquare: number;
    key: XteaKey;
}


export interface XteaKeys {
    gameVersion: number;
    key: XteaKey;
}


const toInt = value => value | 0;


export class Xtea {

    public static loadKeys(xteaConfigPath: string): Map<string, XteaKeys[]> {
        if(!fs.existsSync(xteaConfigPath)) {
            logger.error(`Error loading XTEA keys: ${xteaConfigPath} was not found.`);
            return null;
        }

        const stats = fs.statSync(xteaConfigPath);
        
        if(!stats.isDirectory()) {
            logger.error(`Error loading XTEA keys: ${xteaConfigPath} is not a directory.`);
            return null;
        }

        const xteaKeys: Map<string, XteaKeys[]> = new Map<string, XteaKeys[]>();
        const xteaFileNames = fs.readdirSync(xteaConfigPath);
        for(const fileName of xteaFileNames) {
            try {
                const gameVersionString = fileName.substring(0, fileName.indexOf('.json'));
                if(!gameVersionString) {
                    logger.error(`Error loading XTEA config file ${fileName}: No game version supplied.`);
                    continue;
                }

                const gameVersion: number = Number(gameVersionString);
                if(!gameVersion || isNaN(gameVersion)) {
                    logger.error(`Error loading XTEA config file ${fileName}: Invalid game version supplied.`);
                    continue;
                }

                const fileContent = fs.readFileSync(path.join(xteaConfigPath, fileName), 'utf-8');
                const xteaConfigList = JSON.parse(fileContent) as XteaConfig[];

                if(!xteaConfigList?.length) {
                    logger.error(`Error loading XTEA config file ${fileName}: File is empty.`);
                    continue;
                }

                for(const xteaConfig of xteaConfigList) {
                    if(!xteaConfig?.name || !xteaConfig?.key?.length) {
                        continue;
                    }

                    const { name: fileName, key } = xteaConfig;
                    let fileKeys: XteaKeys[] = [];

                    if(xteaKeys.has(fileName)) {
                        fileKeys = xteaKeys.get(fileName);
                    }

                    fileKeys.push({ gameVersion, key });
                    xteaKeys.set(fileName, fileKeys);
                }
            } catch(error) {
                logger.error(`Error loading XTEA config file ${fileName}:`, error);
            }
        }

        return xteaKeys;
    }

    public static validKeys(keys?: number[] | undefined): boolean {
        if(!keys) {
            return false;
        }

        return keys?.length === 4 && (keys[0] !== 0 || keys[1] !== 0 || keys[2] !== 0 || keys[3] !== 0);
    }

    // @TODO unit testing
    public static encrypt(input: ByteBuffer, keys: number[], length: number): ByteBuffer {
        const encryptedBuffer = new ByteBuffer(length);
        const chunks = length / 8;
        input.readerIndex = 0;

        for(let i = 0; i < chunks; i++) {
            let v0 = input.get('int');
            let v1 = input.get('int');
            let sum = 0;
            const delta = -0x61c88647;

            let rounds = 32;
            while(rounds-- > 0) {
                v0 += ((sum + keys[sum & 3]) ^ (v1 + ((v1 >>> 5) ^ (v1 << 4))));
                sum += delta
                v1 += ((v0 + ((v0 >>> 5) ^ (v0 << 4))) ^ (keys[(sum >>> 11) & 3] + sum));
            }

            encryptedBuffer.put(v0, 'int');
            encryptedBuffer.put(v1, 'int');
        }

        return encryptedBuffer.flipWriter();
    }

    // @TODO unit testing
    public static decrypt(input: ByteBuffer, keys: number[], length: number): ByteBuffer {
        if(!keys?.length) {
            return input;
        }

        const output = new ByteBuffer(length);
        const numBlocks = Math.floor(length / 8);

        for(let block = 0; block < numBlocks; block++) {
            let v0 = input.get('int');
            let v1 = input.get('int');
            let sum = 0x9E3779B9 * 32;

            for(let i = 0; i < 32; i++) {
                v1 -= ((toInt(v0 << 4) ^ toInt(v0 >>> 5)) + v0) ^ (sum + keys[(sum >>> 11) & 3]);
                v1 = toInt(v1);

                sum -= 0x9E3779B9;

                v0 -= ((toInt(v1 << 4) ^ toInt(v1 >>> 5)) + v1) ^ (sum + keys[sum & 3]);
                v0 = toInt(v0);
            }

            output.put(v0, 'int');
            output.put(v1, 'int');
        }

        input.copy(output, output.writerIndex, input.readerIndex);
        return output;
    }

}
