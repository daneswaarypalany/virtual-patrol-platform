import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCameraAgentDto {
  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
