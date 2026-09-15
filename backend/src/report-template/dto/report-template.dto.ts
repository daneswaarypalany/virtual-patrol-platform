import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
import { REPORT_FIELD_KEYS } from '../report-fields';

class ReportTemplateFieldDto {
  @IsString()
  @IsIn(REPORT_FIELD_KEYS)
  key: string;

  @IsBoolean()
  enabled: boolean;
}

export class UpdateReportTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateFieldDto)
  fields: ReportTemplateFieldDto[];
}