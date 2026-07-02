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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { KbService, type UpsertArticleInput, type UpsertCategoryInput } from './kb.service';

/**
 * KB-CMS — autoring Bazy Wiedzy. Dostęp: ADMIN + STAFF (treść pomocy, nieinwazyjne
 * dla klientów). CRUD kategorii/podkategorii i artykułów (Markdown + status + SEO).
 */
@Controller('admin/kb')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  createCategory(@Body() body: UpsertCategoryInput) {
    return this.kb.createCategory(body);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() body: Partial<UpsertCategoryInput>) {
    return this.kb.updateCategory(id, body);
  }

  @Delete('categories/:id')
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
  async createArticle(@Body() body: UpsertArticleInput, @CurrentUser() actor: { userId: string }) {
    return this.kb.createArticle(body, await this.authorOf(actor.userId));
  }

  @Patch('articles/:id')
  updateArticle(@Param('id') id: string, @Body() body: Partial<UpsertArticleInput>) {
    return this.kb.updateArticle(id, body);
  }

  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.kb.deleteArticle(id);
  }
}
