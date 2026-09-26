import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller.js';

@Module({ controllers: [BrandController] })
export class BrandModule {}
