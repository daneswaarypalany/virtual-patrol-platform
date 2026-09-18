import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsString, ValidateNested } from 'class-validator';
import { SUMMARY_REPORT_FIELD_KEYS } from '../summary-report-fields';

class SummaryReportTemplateFieldDto {
  @IsString()
  @IsIn(SUMMARY_REPORT_FIELD_KEYS)
  key: string;

  @IsBoolean()
  enabled: boolean;
}

export class UpdateSummaryReportTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SummaryReportTemplateFieldDto)
  fields: SummaryReportTemplateFieldDto[];
}
