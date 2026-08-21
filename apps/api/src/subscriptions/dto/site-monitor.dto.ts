import { IsBoolean } from 'class-validator';

export class SetMonitoringDto {
  @IsBoolean()
  enabled!: boolean;
}
