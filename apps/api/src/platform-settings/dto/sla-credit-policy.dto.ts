import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/** #11 — polityka kredytów SLA (admin). */
export class UpdateSlaCreditPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  /** Próg w minutach — krótszy przestój nie generuje kredytu. */
  @IsInt()
  @Min(0)
  @Max(1440)
  graceMinutes!: number;

  /** Mnożnik kredytu względem czasu przestoju. */
  @IsInt()
  @Min(1)
  @Max(1000)
  multiplier!: number;

  /** Górny limit kredytu jako % miesięcznej ceny usługi na incydent. */
  @IsInt()
  @Min(1)
  @Max(1000)
  capPercent!: number;
}
