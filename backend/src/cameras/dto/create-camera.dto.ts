import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class CreateCameraDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  cameraCode: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  streamUrl?: string;
}