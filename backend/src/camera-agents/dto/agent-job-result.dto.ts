import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentJobResultDto {
  @IsIn(['APPLIED', 'FAILED'])
  status: 'APPLIED' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;
}
