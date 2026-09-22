import { IsIn, IsUUID } from 'class-validator';

/** PB-17 — v1 naprawia wyłącznie rekordy SPF i DMARC (odwracalne). */
export class NaprawaAsystentaDto {
  @IsIn(['spf', 'dmarc'])
  key!: 'spf' | 'dmarc';
}

export class CofniecieNaprawyDto {
  @IsUUID()
  undoId!: string;
}
