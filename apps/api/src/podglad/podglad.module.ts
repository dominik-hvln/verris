import { Module } from '@nestjs/common';
import { PodgladService } from './podglad.service.js';
import { PodgladPublicController } from './podglad-publiczny.controller.js';
import { PodgladKlientController } from './podglad-klient.controller.js';
import { PodgladZespolController } from './podglad-zespol.controller.js';

@Module({
  controllers: [PodgladPublicController, PodgladKlientController, PodgladZespolController],
  providers: [PodgladService],
  exports: [PodgladService],
})
export class PodgladModule {}
