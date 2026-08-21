import { Module } from '@nestjs/common';
import { ServersModule } from '../servers/servers.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

/** P-4 — in-panel file manager (DirectAdmin file manager via impersonation). */
@Module({
  imports: [ServersModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
