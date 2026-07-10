import { IsBoolean, IsInt, Max, Min } from 'class-validator';

/**
 * #11 — polityka kredytów SLA (admin).
 *
 * Rekompensata liczona z DOSTĘPNOŚCI W MIESIĄCU wg progów §15 (5/25/50/100%).
 * Pola `multiplier` i `capPercent` z poprzedniego modelu (proporcja per incydent)
 * zostały usunięte — progi wynikają wprost z regulaminu, nie z konfiguracji.
 */
export class UpdateSlaCreditPolicyDto {
  @IsBoolean()
  enabled!: boolean;

  /** Próg wykrywalności w minutach — łączny przestój krótszy nie generuje kredytu. */
  @IsInt()
  @Min(0)
  @Max(1440)
  graceMinutes!: number;

  /** Limit minut okien konserwacyjnych odliczanych od przestoju (§15 ust. 7: 8 h = 480 min). */
  @IsInt()
  @Min(0)
  @Max(44640)
  maintenanceCapMinutes!: number;
}
