import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class SummaryReportTemplateFieldDto {
  // a fixed component key, or `block-<id>` for a Text / Divider / Spacer copy
  // (the service rejects unknown fixed keys)
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9-]{1,40}$/)
  key: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(1000)
  height?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  row?: number;

  @IsOptional()
  @IsIn(['text', 'divider', 'spacer'])
  variant?: 'text' | 'divider' | 'spacer';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;
}

export class UpdateSummaryReportTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryReportTemplateFieldDto)
  fields: SummaryReportTemplateFieldDto[];
}