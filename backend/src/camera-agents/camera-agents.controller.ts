import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CameraAgentsService } from './camera-agents.service';
import { CreateCameraAgentDto } from './dto/create-camera-agent.dto';
import { AgentHeartbeatDto } from './dto/agent-heartbeat.dto';
import { AgentJobResultDto } from './dto/agent-job-result.dto';

@Controller('camera-agents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CameraAgentsController {
  constructor(private readonly agents: CameraAgentsService) {}

  @Post()
  @Header('Cache-Control', 'no-store, private')
  create(@Body() dto: CreateCameraAgentDto) {
    return this.agents.createAgent(dto);
  }

  @Get()
  list(@Query('siteId') siteId?: string) {
    return this.agents.listAgents(siteId);
  }
}

@Controller('camera-agent')
export class CameraAgentRuntimeController {
  constructor(private readonly agents: CameraAgentsService) {}

  @Post('heartbeat')
  @Header('Cache-Control', 'no-store, private')
  heartbeat(@Req() req: Request, @Body() dto: AgentHeartbeatDto) {
    return this.agents.heartbeat(req.headers.authorization, dto.playbackBaseUrl);
  }

  @Get('jobs/next')
  @Header('Cache-Control', 'no-store, private')
  nextJob(@Req() req: Request) {
    return this.agents.nextJob(req.headers.authorization);
  }

  @Post('jobs/:jobId/result')
  @Header('Cache-Control', 'no-store, private')
  completeJob(
    @Req() req: Request,
    @Param('jobId') jobId: string,
    @Body() dto: AgentJobResultDto,
  ) {
    return this.agents.completeJob(req.headers.authorization, jobId, dto);
  }
}
