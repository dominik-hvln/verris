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
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { FilesService } from './files.service';

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

  @Post('write')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:write' })
  write(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { dir?: string; filename: string; content: string },
  ) {
    return this.files.write(id, user.userId, body.dir, body.filename, body.content);
  }

  @Post('mkdir')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:mkdir' })
  mkdir(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { dir?: string; name: string },
  ) {
    return this.files.mkdir(id, user.userId, body.dir, body.name);
  }

  @Post('rename')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:rename' })
  rename(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { dir?: string; oldName: string; newName: string },
  ) {
    return this.files.rename(id, user.userId, body.dir, body.oldName, body.newName);
  }

  @Post('delete')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'files:delete' })
  remove(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { dir?: string; names: string[] },
  ) {
    return this.files.remove(id, user.userId, body.dir, body.names);
  }

  @Post('upload')
  @RateLimit({ limit: 120, windowMs: 60 * 60 * 1000, scope: 'files:upload' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25_000_000 },
    }),
  )
  upload(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() body: { dir?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.files.upload(id, user.userId, body.dir, file?.originalname, file?.buffer);
  }
}
