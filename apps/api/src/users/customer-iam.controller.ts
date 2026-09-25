import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CustomerIamService } from './customer-iam.service';
import {
  AcceptExistingInviteDto,
  AcceptSubaccountInviteDto,
  InviteSubaccountDto,
  UpdateSubaccountDto,
} from './customer-iam.dto';

type CustomerPrincipal = {
  userId: string;
  principalUserId?: string;
  actingFor?: string;
};

@Controller('users/iam')
export class CustomerIamController {
  constructor(private readonly iam: CustomerIamService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  overview(@CurrentUser() user: CustomerPrincipal) {
    return this.iam.overview(user.userId, user.principalUserId ?? user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('audit')
  audit(@CurrentUser() user: CustomerPrincipal) {
    return this.iam.listAudit(user.userId, user.principalUserId ?? user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites')
  invite(@CurrentUser() user: CustomerPrincipal, @Body() dto: InviteSubaccountDto) {
    return this.iam.invite(user.userId, user.principalUserId ?? user.userId, dto);
  }

  @Post('invites/accept')
  accept(@Body() dto: AcceptSubaccountInviteDto) {
    return this.iam.accept(dto);
  }

  /** PB-20 — strona zaproszenia: czy adres ma już konto (wtedy „zaloguj się i przyjmij”). */
  @RateLimit({ limit: 30, windowMs: 60 * 1000, scope: 'iam:invite-info' })
  @Get('invites/info')
  info(@Query('token') token: string) {
    return this.iam.inviteInfo(String(token ?? ''));
  }

  /** PB-20 — przyjęcie zaproszenia zalogowanym, własnym kontem. */
  @UseGuards(JwtAuthGuard)
  @Post('invites/accept-existing')
  acceptExisting(@CurrentUser() user: CustomerPrincipal, @Body() dto: AcceptExistingInviteDto) {
    return this.iam.acceptExisting(user, dto.token);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('memberships/:id')
  updateMembership(@CurrentUser() user: CustomerPrincipal, @Param('id') id: string, @Body() dto: UpdateSubaccountDto) {
    return this.iam.updateMembership(user.userId, user.principalUserId ?? user.userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('memberships/:id')
  disableMembership(@CurrentUser() user: CustomerPrincipal, @Param('id') id: string) {
    return this.iam.disableMembership(user.userId, user.principalUserId ?? user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('members/:id')
  updateMember(
    @CurrentUser() user: CustomerPrincipal,
    @Param('id') memberId: string,
    @Body() dto: UpdateSubaccountDto,
  ) {
    return this.iam.updateMember(user.userId, user.principalUserId ?? user.userId, memberId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('members/:id')
  disableMember(@CurrentUser() user: CustomerPrincipal, @Param('id') memberId: string) {
    return this.iam.disableMember(user.userId, user.principalUserId ?? user.userId, memberId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('invites/:id')
  revokeInvite(@CurrentUser() user: CustomerPrincipal, @Param('id') inviteId: string) {
    return this.iam.revokeInvite(user.userId, user.principalUserId ?? user.userId, inviteId);
  }
}
