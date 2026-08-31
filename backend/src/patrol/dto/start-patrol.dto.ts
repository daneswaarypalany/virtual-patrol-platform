import { IsString, IsNotEmpty } from "class-validator";

export class StartPatrolDto {
  @IsString()
  @IsNotEmpty()
  routeId: string;
}
