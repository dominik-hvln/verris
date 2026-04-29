import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InvoicesService } from './invoices.service';

@Controller('billing/invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @HttpCode(200)
  list(
    @CurrentUser() user: { userId: string },
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.invoices.listForUser(user.userId, { limit, offset });
  }

  @Get(':id')
  @HttpCode(200)
  get(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.invoices.getForUser(user.userId, id);
  }
}
