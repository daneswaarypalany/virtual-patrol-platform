import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AgentHeartbeatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  playbackBaseUrl: string;
}
