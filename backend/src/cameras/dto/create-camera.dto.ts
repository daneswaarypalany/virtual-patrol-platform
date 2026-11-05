import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

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
  @MaxLength(2048)
  streamUrl?: string;
}