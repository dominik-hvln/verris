import { IsEnum } from 'class-validator';
import { WafMode } from '@verris/database';

export class SetWafModeDto {
  @IsEnum(WafMode, { message: 'Tryb WAF: OFF, DETECTION lub ON.' })
  mode!: WafMode;
}
