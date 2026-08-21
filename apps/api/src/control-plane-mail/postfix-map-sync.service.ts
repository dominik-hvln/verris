import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ControlPlaneMailboxKind, ControlPlaneMailboxStatus } from '@verris/database';
import { CONTROL_PLANE_MAIL_DOMAIN } from './control-plane-mail.constants';

export interface GeneratedMailMaps {
  virtualMailbox: string;
  virtualAlias: string;
  dovecotPasswd: string;
  mailboxCount: number;
  aliasCount: number;
}

@Injectable()
export class PostfixMapSyncService {
  private readonly logger = new Logger(PostfixMapSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  mailDataRoot(): string {
    return (
      this.config.get<string>('CONTROL_PLANE_MAIL_DATA_ROOT') ??
      '/var/mail/vhosts'
    );
  }

  mapsOutputDir(): string | null {
    const dir = this.config.get<string>('CONTROL_PLANE_MAIL_MAPS_DIR')?.trim();
    return dir || null;
  }

  async generateMaps(): Promise<GeneratedMailMaps> {
    const domain =
      this.config.get<string>('CONTROL_PLANE_MAIL_DOMAIN') ?? CONTROL_PLANE_MAIL_DOMAIN;
    const root = this.mailDataRoot();

    const mailboxes = await this.prisma.controlPlaneMailbox.findMany({
      where: {
        status: ControlPlaneMailboxStatus.ACTIVE,
        kind: { not: ControlPlaneMailboxKind.ALIAS_ONLY },
      },
      include: { aliases: true, forwards: { where: { confirmedAt: { not: null } } } },
      orderBy: { email: 'asc' },
    });

    const mailboxLines: string[] = [];
    const aliasLines: string[] = [];
    const dovecotLines: string[] = [];

    for (const mb of mailboxes) {
      const maildir = path.join(root, domain, mb.localPart);
      mailboxLines.push(`${mb.email}\t${domain}/${mb.localPart}/`);

      if (mb.imapEnabled && mb.passwordHash && mb.kind === ControlPlaneMailboxKind.STAFF) {
        dovecotLines.push(`${mb.email}:${mb.passwordHash}`);
      }

      for (const a of mb.aliases) {
        aliasLines.push(`${a.aliasEmail}\t${mb.email}`);
      }

      for (const f of mb.forwards) {
        const dest = f.keepCopy ? `${mb.email}, ${f.forwardTo}` : f.forwardTo;
        aliasLines.push(`${mb.email}\t${dest}`);
      }
    }

    return {
      virtualMailbox: `${mailboxLines.join('\n')}\n`,
      virtualAlias: `${aliasLines.join('\n')}\n`,
      dovecotPasswd: `${dovecotLines.join('\n')}\n`,
      mailboxCount: mailboxes.length,
      aliasCount: aliasLines.length,
    };
  }

  async writeMapsToDisk(): Promise<{ ok: boolean; dir: string | null; message?: string }> {
    const dir = this.mapsOutputDir();
    if (!dir) {
      return {
        ok: false,
        dir: null,
        message: 'CONTROL_PLANE_MAIL_MAPS_DIR nie jest ustawione — mapy wygenerowane tylko w pamięci.',
      };
    }

    const maps = await this.generateMaps();
    await fs.mkdir(dir, { recursive: true });

    const files: Array<[string, string]> = [
      ['virtual_mailbox_maps', maps.virtualMailbox],
      ['virtual_alias_maps', maps.virtualAlias],
      ['dovecot-passwd', maps.dovecotPasswd],
    ];

    for (const [name, body] of files) {
      const filePath = path.join(dir, name);
      const mode = name === 'dovecot-passwd' ? 0o644 : 0o640;
      await fs.writeFile(filePath, body, { encoding: 'utf8', mode });
      this.logger.log(`Wrote ${filePath} (${body.length} bytes)`);
    }

    // Dovecot must traverse the maps dir (default postfix perms are 750 root:root).
    try {
      await fs.chmod(dir, 0o755);
    } catch {
      this.logger.warn(`Could not chmod ${dir} to 0755 — set manually on host for Dovecot`);
    }

    return { ok: true, dir };
  }
}
