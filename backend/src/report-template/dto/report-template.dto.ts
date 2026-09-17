import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { REPORT_FIELD_KEYS } from '../report-fields';

class ReportTemplateFieldDto {
  @IsString()
  @IsIn(REPORT_FIELD_KEYS)
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
}

export class UpdateReportTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateFieldDto)
  fields: ReportTemplateFieldDto[];
}