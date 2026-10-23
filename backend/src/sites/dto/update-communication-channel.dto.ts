import { IsBoolean, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class UpdateCommunicationChannelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  destination?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
  @IsOptional()
  @IsBoolean()
  includeDate?: boolean;

  @IsOptional()
  @IsBoolean()
  includeTime?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSite?: boolean;

  @IsOptional()
  @IsBoolean()
  includePatrolRoute?: boolean;

  @IsOptional()
  @IsBoolean()
  includeComment?: boolean;

  @IsOptional()
  @IsBoolean()
  includeScreenshot?: boolean;

}
