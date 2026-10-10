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
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KbService } from './kb.service.js';
import { ArtykulKbDto, BanerKbDto, KategoriaKbDto, ZmianaArtykuluKbDto, ZmianaKategoriiKbDto } from './kb.dto.js';

/**
 * KB-CMS — autoring Bazy Wiedzy. CRUD kategorii/podkategorii i artykułów (Markdown + status + SEO).
 * Odczyt: ADMIN + każdy STAFF. Zapis (POST/PATCH/DELETE): ADMIN albo STAFF z KB_MANAGE (B2) —
 * to treść pokazywana klientom i indeksowana przez asystenta.
 */
@Controller('admin/kb')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class KbAdminController {
  constructor(
    private readonly kb: KbService,
    private readonly prisma: PrismaService,
  ) {}

  private async authorOf(userId: string): Promise<{ userId: string; name: string | null }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || u?.email || null;
    return { userId, name };
  }

  // ------- categories
  @Get('categories')
  categories() {
    return this.kb.listCategories();
  }

  @Post('categories')
  @StaffPerm('KB_MANAGE')
  createCategory(@Body() body: KategoriaKbDto) {
    return this.kb.createCategory(body);
  }

  @Patch('categories/:id')
  @StaffPerm('KB_MANAGE')
  updateCategory(@Param('id') id: string, @Body() body: ZmianaKategoriiKbDto) {
    return this.kb.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @StaffPerm('KB_MANAGE')
  deleteCategory(@Param('id') id: string) {
    return this.kb.deleteCategory(id);
  }

  // ------- articles
  @Get('articles')
  articles(
    @Query('categoryId') categoryId?: string,
    @Query('status') status?: 'DRAFT' | 'PUBLISHED',
    @Query('q') q?: string,
  ) {
    return this.kb.listArticles({ categoryId, status, q });
  }

  @Get('articles/:id')
  article(@Param('id') id: string) {
    return this.kb.getArticle(id);
  }

  @Post('articles')
  @StaffPerm('KB_MANAGE')
  async createArticle(@Body() body: ArtykulKbDto, @CurrentUser() actor: { userId: string }) {
    return this.kb.createArticle(body, await this.authorOf(actor.userId));
  }

  @Patch('articles/:id')
  @StaffPerm('KB_MANAGE')
  updateArticle(@Param('id') id: string, @Body() body: ZmianaArtykuluKbDto) {
    return this.kb.updateArticle(id, body);
  }

  @Delete('articles/:id')
  @StaffPerm('KB_MANAGE')
  deleteArticle(@Param('id') id: string) {
    return this.kb.deleteArticle(id);
  }

  // ------- baner CTA (KB-SEO-4) — jedno miejsce edycji
  @Get('cta')
  getCta() {
    return this.kb.getCtaConfig();
  }

  @Patch('cta')
  @StaffPerm('KB_MANAGE')
  setCta(@Body() body: BanerKbDto, @CurrentUser() actor: { userId: string }) {
    return this.kb.setCtaConfig(body, actor.userId);
  }
}
