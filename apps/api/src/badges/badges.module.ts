import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PartnersModule } from '../partners/partners.module';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { PublicBadgesController } from './public-badges.controller';

@Module({
  imports: [PrismaModule, UsersModule, PartnersModule],
  providers: [BadgesService],
  controllers: [BadgesController, PublicBadgesController],
})
export class BadgesModule {}
