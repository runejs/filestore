import { Response as ExpressResponse } from 'express';
import { Controller, Get, Params, Response } from '@decorators/express';
import { Js5Service } from './js5.service';
import { Inject } from '@decorators/di';


@Controller('/js5')
export class Js5Controller {

    constructor(@Inject(Js5Service) private js5Service: Js5Service) {
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups/:groupIdentifier/files/:fileIdentifier/data')
    async getArchiveGroupFileData(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number,
        @Params('groupIdentifier') groupIdentifier: string | number,
        @Params('fileIdentifier') fileIdentifier: string | number
    ) {
        const data = await this.js5Service.getArchiveGroupFileData(gameBuild, archiveIdentifier, groupIdentifier, fileIdentifier);

        res.writeHead(200, {
            'Content-Type': 'arraybuffer',
            'Content-Length': data.length,
            'Content-disposition': `attachment; filename=${fileIdentifier}`
        });

        res.end(data);
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups/:groupIdentifier/files/:fileIdentifier')
    async getArchiveGroupFile(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number,
        @Params('groupIdentifier') groupIdentifier: string | number,
        @Params('fileIdentifier') fileIdentifier: string | number
    ) {
        res.send(await this.js5Service.getArchiveGroupFile(gameBuild, archiveIdentifier, groupIdentifier, fileIdentifier));
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups/:groupIdentifier/files')
    async getArchiveGroupFileList(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number,
        @Params('groupIdentifier') groupIdentifier: string | number
    ) {
        res.send(await this.js5Service.getArchiveGroupFileList(gameBuild, archiveIdentifier, groupIdentifier));
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups/:groupIdentifier/data')
    async getArchiveGroupData(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number,
        @Params('groupIdentifier') groupIdentifier: string | number
    ) {
        const data = await this.js5Service.getArchiveGroupData(gameBuild, archiveIdentifier, groupIdentifier);

        res.writeHead(200, {
            'Content-Type': 'arraybuffer',
            'Content-Length': data.length,
            'Content-disposition': `attachment; filename=${groupIdentifier}`
        });

        res.end(data);
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups/:groupIdentifier')
    async getArchiveGroup(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number,
        @Params('groupIdentifier') groupIdentifier: string | number
    ) {
        res.send(await this.js5Service.getArchiveGroup(gameBuild, archiveIdentifier, groupIdentifier));
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/groups')
    async getArchiveGroupList(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number
    ) {
        res.send(await this.js5Service.getArchiveGroupList(gameBuild, archiveIdentifier));
    }

    @Get('/:gameBuild/archives/:archiveIdentifier/data')
    async getArchiveData(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number
    ) {
        const data = await this.js5Service.getArchiveData(gameBuild, archiveIdentifier);

        res.writeHead(200, {
            'Content-Type': 'arraybuffer',
            'Content-Length': data.length,
            'Content-disposition': `attachment; filename=${archiveIdentifier}`
        });

        res.end(data);
    }

    @Get('/:gameBuild/archives/:archiveIdentifier')
    async getArchive(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number,
        @Params('archiveIdentifier') archiveIdentifier: string | number
    ) {
        res.send(await this.js5Service.getArchive(gameBuild, archiveIdentifier));
    }

    @Get('/:gameBuild/archives')
    async getArchiveList(
        @Response() res: ExpressResponse,
        @Params('gameBuild') gameBuild: string | number
    ) {
        res.send(await this.js5Service.getArchiveList(gameBuild));
    }

}
