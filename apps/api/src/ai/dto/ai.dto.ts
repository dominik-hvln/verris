import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AiKnowledgeAudience, AiKnowledgeStatus } from '@verris/database';

export class AiChatTurnDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AiChatRequestDto {
  @IsString()
  @Length(1, 2000)
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AiChatTurnDto)
  history?: AiChatTurnDto[];

  @IsOptional()
  @IsString()
  subscriptionId?: string;
}

export class CreateKnowledgeDocDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsString()
  @Length(10, 200_000)
  content!: string;

  @IsOptional()
  @IsEnum(AiKnowledgeAudience)
  audience?: AiKnowledgeAudience;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceRef?: string;
}

export class UpdateKnowledgeDocDto {
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200_000)
  content?: string;

  @IsOptional()
  @IsEnum(AiKnowledgeAudience)
  audience?: AiKnowledgeAudience;

  @IsOptional()
  @IsEnum(AiKnowledgeStatus)
  status?: AiKnowledgeStatus;
}
