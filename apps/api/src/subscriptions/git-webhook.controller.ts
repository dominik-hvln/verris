import { Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { GitDeployService } from './git-deploy.service';

/**
 * C-27 — publiczny adres webhooka wdrożenia (GitHub/GitLab/Bitbucket: „Push events”).
 * Bez logowania; tajny token w adresie (w bazie tylko skrót). Treści żądania nie czytamy —
 * każde wywołanie to „pobierz zmiany”, więc sfałszowany payload niczego nie zmieni.
 */
@Controller('hooks/git')
export class GitWebhookController {
  constructor(private readonly git: GitDeployService) {}

  @Post(':token')
  @HttpCode(202)
  @RateLimit({ limit: 30, windowMs: 60 * 1000, scope: 'hooks:git' })
  async wyzwol(@Param('token') token: string) {
    if (!(await this.git.wyzwolWebhook(token))) throw new NotFoundException();
    return { ok: true };
  }
}
