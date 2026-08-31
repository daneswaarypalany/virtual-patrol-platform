import { IsString, IsBoolean, IsOptional } from "class-validator";

export class SaveCheckpointDto {
  @IsString()
  checkpointId: string;

  // "true" / "false" as string because it comes via multipart form-data
  @IsString()
  allClear: string;

  // JSON string of checklist item states
  @IsOptional()
  @IsString()
  checklistState?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
