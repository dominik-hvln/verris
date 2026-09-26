import { Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

/** P-4 — in-panel file manager (DirectAdmin file manager via impersonation). */
@Module({
  imports: [ServersModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
