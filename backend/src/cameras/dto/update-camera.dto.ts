import { IsString, IsOptional, MaxLength } from "class-validator";

export class UpdateCameraDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  cameraCode?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  streamUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;
}