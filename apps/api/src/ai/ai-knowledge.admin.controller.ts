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
  Req,
  UseGuards,
} from '@nestjs/common';
import { AiKnowledgeAudience, AiKnowledgeStatus, Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CreateKnowledgeDocDto, UpdateKnowledgeDocDto } from './dto/ai.dto';

/** Admin/Staff management of the AI knowledge base ("train the AI"). */
@Controller('admin/ai/knowledge')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
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
  create(@Body() dto: CreateKnowledgeDocDto, @Req() req) {
    return this.kb.createDoc(dto, req.user.principalUserId ?? req.user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKnowledgeDocDto, @Req() req) {
    return this.kb.updateDoc(id, dto, req.user.principalUserId ?? req.user.userId);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Req() req) {
    return this.kb.deleteDoc(id, req.user.principalUserId ?? req.user.userId);
  }
}
