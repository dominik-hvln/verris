import { IsUUID } from 'class-validator';

export class PreviewPlanChangeDto {
  @IsUUID()
  targetPlanId!: string;
}

export class ChangePlanDto {
  @IsUUID()
  targetPlanId!: string;
}
