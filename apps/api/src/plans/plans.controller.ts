import { Controller, Get, Param } from '@nestjs/common';
import { PlansService } from './plans.service';
import { Plan } from '@ekohost/database';

/** Public catalog of active plans — no auth required (used on landing/pricing). */
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(): Promise<Plan[]> {
    return this.plans.listPublic();
  }

  @Get(':slug')
  get(@Param('slug') slug: string): Promise<Plan> {
    return this.plans.getBySlug(slug);
  }
}
