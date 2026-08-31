import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class CheckpointDto {
  @IsString()
  @IsNotEmpty()
  cameraId: string;

  @IsString()
  @IsNotEmpty()
  checklistTemplateId: string;
}

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints: CheckpointDto[];
}

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckpointDto)
  checkpoints?: CheckpointDto[];
}
