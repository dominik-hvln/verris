import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { PartnersModule } from '../partners/partners.module.js';
import { BadgesService } from './badges.service.js';
import { BadgesController } from './badges.controller.js';
import { PublicBadgesController } from './public-badges.controller.js';

@Module({
  imports: [PrismaModule, UsersModule, PartnersModule],
  providers: [BadgesService],
  controllers: [BadgesController, PublicBadgesController],
})
export class BadgesModule {}
