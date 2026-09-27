import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CommunicationChannelType } from '@prisma/client';

export class CreateCommunicationChannelDto {
  @IsEnum(CommunicationChannelType)
  channelType: CommunicationChannelType;

  @IsString()
  @IsNotEmpty()
  destination: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
