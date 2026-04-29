import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersAdminController } from './users.admin.controller';
import { EcoPublicController } from './eco-public.controller';
import { UsersService } from './users.service';
import { UsersAdminService } from './users.admin.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: (config.get<string>('jwtExpiresIn') ?? '1d') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [UsersController, UsersAdminController, EcoPublicController],
  providers: [UsersService, UsersAdminService],
  exports: [UsersService, UsersAdminService],
})
export class UsersModule {}
