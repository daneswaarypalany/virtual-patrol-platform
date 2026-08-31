import { IsString, IsOptional } from "class-validator";

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
  streamUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;
}