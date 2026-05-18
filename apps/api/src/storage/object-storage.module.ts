import { Global, Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';

/**
 * Global so any service can inject `ObjectStorageService` without explicitly
 * importing this module. Storage is core infrastructure (like `PrismaService`)
 * and used from many feature modules — global scope avoids boilerplate.
 */
@Global()
@Module({
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
