import { ArrayMinSize, IsArray, IsOptional, IsString } from "class-validator";

export class SummaryReportDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  jobIds: string[];

  @IsOptional()
  @IsString()
  templateId?: string;
}
