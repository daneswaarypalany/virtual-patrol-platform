import { ArrayMinSize, IsArray, IsIn, IsString } from "class-validator";

export class BulkReportDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  jobIds: string[];

  @IsIn(["pdf", "zip"])
  format: "pdf" | "zip";
}