import { IsNumber, IsPositive, Max } from 'class-validator';

export class CreateTopupCheckoutDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(10000)
  amount!: number;
}
