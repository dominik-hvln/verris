import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDomainDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
