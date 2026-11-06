/**
 * Ewaluacja asystenta AI www (1.11.2026) — RĘCZNIE, nie w CI: woła prawdziwy model Anthropic i kosztuje
 * (76 pytań ≈ kilkadziesiąt centów na Sonnecie 5.5). Wymaga DATABASE_URL (ceny z bazy, baza wiedzy) i ANTHROPIC_API_KEY.
 * Omija wyłącznik, captchę i limity dobowe asystenta (tryb ewaluacji), ale nie budżet AI platformy.
 * Rozmowy z ewaluacji są kasowane na końcu.
 *
 * USAGE:  pnpm --filter api cli:ewaluacja-asystenta [--id q01,q07] [--limit 10]
 */
import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import { KnowledgeBaseService } from '../ai/knowledge-base.service.js';
import { AsystentWwwService } from '../ai/asystent-www/asystent-www.service.js';
import { ocen, type PytanieEwaluacji } from '../ai/asystent-www/ewaluacja/ocena.js';

function argument(nazwa: string): string | undefined {
  const i = process.argv.indexOf(`--${nazwa}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sciezka = new URL('../../src/ai/asystent-www/ewaluacja/pytania.json', import.meta.url);
  const { pytania } = JSON.parse(readFileSync(sciezka, 'utf8')) as { pytania: PytanieEwaluacji[] };
  const wybrane = argument('id')?.split(',');
  const limit = Number(argument('limit')) || pytania.length;
  const lista = pytania.filter((p) => !wybrane || wybrane.includes(p.id)).slice(0, limit);

  const config = new ConfigService();
  const prisma = new PrismaService();
  await prisma.$connect();
  const provider = new AiProviderService(config, prisma);
  const wiedza = new KnowledgeBaseService(prisma, provider, { record: async () => undefined } as never);
  const asystent = new AsystentWwwService(prisma, provider, wiedza, config);

  let zaliczone = 0;
  let koszt = 0;
  const rozmowy: string[] = [];
  for (const p of lista) {
    try {
      const w = await asystent.zapytaj({ pytanie: p.pytanie }, {}, { ewaluacja: true });
      rozmowy.push(w.rozmowaId);
      koszt += w.kosztUsd;
      const bledy = ocen(p, w);
      if (!bledy.length) zaliczone++;
      console.log(`\n${bledy.length ? '✗' : '✓'} ${p.id} [${p.kategoria}] ${p.pytanie}`);
      console.log(`  → ${w.odpowiedz}`);
      console.log(`  źródła: ${w.zrodla.map((z) => z.id).join(', ') || '–'} · nieWiem: ${w.nieWiem} · koszt: $${w.kosztUsd.toFixed(5)}`);
      for (const b of bledy) console.log(`  ! ${b}`);
      if (p.uwaga) console.log(`  (uwaga: ${p.uwaga})`);
    } catch (e) {
      console.log(`\n✗ ${p.id} ${p.pytanie}\n  ! błąd: ${(e as Error).message}`);
    }
  }
  await prisma.asystentRozmowa.deleteMany({ where: { id: { in: rozmowy } } });
  console.log(`\nWynik: ${zaliczone}/${lista.length} zaliczonych · koszt łącznie $${koszt.toFixed(4)} (średnio $${(koszt / Math.max(lista.length, 1)).toFixed(5)} na pytanie)`);
  await prisma.$disconnect();
  process.exit(zaliczone === lista.length ? 0 : 1);
}

void main();
