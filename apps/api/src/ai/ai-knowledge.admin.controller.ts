import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiKnowledgeAudience, AiKnowledgeStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeDocDto, UpdateKnowledgeDocDto } from './dto/ai.dto';

/** Tożsamość z JWT: `principalUserId` = człowiek za subkontem albo impersonacją. */
type Uzytkownik = { userId: string; principalUserId?: string };

/** Admin/Staff management of the AI knowledge base ("train the AI"). */
@Controller('admin/ai/knowledge')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('DASHBOARD_VIEW')
export class AiKnowledgeAdminController {
  constructor(private readonly kb: KnowledgeBaseService) {}

  @Get()
  list(
    @Query('audience') audience?: AiKnowledgeAudience,
    @Query('status') status?: AiKnowledgeStatus,
  ) {
    return this.kb.listDocs({
      audience: audience && audience in AiKnowledgeAudience ? audience : undefined,
      status: status && status in AiKnowledgeStatus ? status : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.kb.getDoc(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateKnowledgeDocDto, @CurrentUser() user: Uzytkownik) {
    return this.kb.createDoc(dto, user.principalUserId ?? user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDocDto, @CurrentUser() user: Uzytkownik) {
    return this.kb.updateDoc(id, dto, user.principalUserId ?? user.userId);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @CurrentUser() user: Uzytkownik) {
    return this.kb.deleteDoc(id, user.principalUserId ?? user.userId);
  }
}
