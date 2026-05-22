import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CustomerIamService } from './customer-iam.service';
import {
  AcceptSubaccountInviteDto,
  InviteSubaccountDto,
  UpdateSubaccountDto,
} from './customer-iam.dto';

type CustomerPrincipal = {
  userId: string;
  principalUserId?: string;
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
