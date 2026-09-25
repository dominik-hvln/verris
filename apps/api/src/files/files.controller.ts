import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { opcjeUploaduDoPamieci } from '../common/upload/multer-limity';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { FilesService } from './files.service';
import {
  NowyKatalogDto,
  PrzeniesPlikiDto,
  RozpakujDto,
  SpakujDto,
  UprawnieniaDto,
  UsunPlikiDto,
  WgrajPlikDto,
  ZapiszPlikDto,
  ZmienNazweDto,
} from './files.dto';

/** P-4 — in-panel file manager, scoped to a single hosting subscription. */
@Controller('services/:id/files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('path') path?: string,
  ) {
    return this.files.list(id, user.userId, path);
  }

  @Get('read')
  read(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Query('path') path?: string,
  ) {
    return this.files.read(id, user.userId, path);
  }

  @Get('download')
  async download(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
    @Query('path') path?: string,
  ) {
    const { filename, data } = await this.files.download(id, user.userId, path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(data);
  }

  /** H-13 — duże pliki (archiwa kopii) strumieniem, bez limitu 100 MB i bez base64 w panelu. */
  @Get('download-stream')
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'files:download-stream' })
  async downloadStream(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Res() res: Response,
    @Query('path') path?: string,
  ) {
    const { filename, stream, size } = await this.files.downloadStream(id, user.userId, path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (size != null) res.setHeader('Content-Length', String(size));
    stream.on('error', () => res.destroy());
    res.on('close', () => (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.());
    stream.pipe(res);
  }

  @Post('write')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:write' })
  write(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ZapiszPlikDto,
  ) {
    return this.files.write(id, user.userId, body.dir, body.filename, body.content);
  }

  @Post('mkdir')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:mkdir' })
  mkdir(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: NowyKatalogDto,
  ) {
    return this.files.mkdir(id, user.userId, body.dir, body.name);
  }

  @Post('rename')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:rename' })
  rename(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: ZmienNazweDto,
  ) {
    return this.files.rename(id, user.userId, body.dir, body.oldName, body.newName);
  }

  @Post('delete')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:delete' })
  remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UsunPlikiDto,
  ) {
    return this.files.remove(id, user.userId, body.dir, body.names);
  }

  @Post('copy')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:copy' })
  copy(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: PrzeniesPlikiDto,
  ) {
    return this.files.transfer(id, user.userId, body.dir, body.names, body.dest, 'copy');
  }

  @Post('move')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:move' })
  move(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: PrzeniesPlikiDto,
  ) {
    return this.files.transfer(id, user.userId, body.dir, body.names, body.dest, 'move');
  }

  @Post('compress')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'files:compress' })
  compress(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: SpakujDto,
  ) {
    return this.files.compress(id, user.userId, body.dir, body.names, body.name);
  }

  @Post('extract')
  @RateLimit({ limit: 30, windowMs: 60 * 60 * 1000, scope: 'files:extract' })
  extract(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: RozpakujDto,
  ) {
    return this.files.extract(id, user.userId, body.path, body.dest);
  }

  @Post('chmod')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:chmod' })
  chmod(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: UprawnieniaDto,
  ) {
    return this.files.chmod(id, user.userId, body.dir, body.names, body.mode);
  }

  @Post('upload')
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'files:upload' })
  @UseInterceptors(
    // SEC-07 — jw., limity z jednego miejsca.
    FileInterceptor('file', opcjeUploaduDoPamieci(25_000_000)),
  )
  upload(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: WgrajPlikDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.files.upload(id, user.userId, body.dir, file?.originalname, file?.buffer);
  }
}
