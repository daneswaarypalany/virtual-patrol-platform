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
}
