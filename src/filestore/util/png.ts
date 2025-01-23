import type { PNG } from 'pngjs';


export const pngToBase64 = async (png: PNG): Promise<string> => {
    const chunks = [];

    png.pack();
    png.on('data', chunk => chunks.push(chunk));

    return await new Promise(resolve => {
        png.on('end', () =>
            resolve(Buffer.concat(chunks).toString('base64')));
    });
};
