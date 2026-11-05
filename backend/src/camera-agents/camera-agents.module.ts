import { Module } from '@nestjs/common';
import {
  CameraAgentRuntimeController,
  CameraAgentsController,
} from './camera-agents.controller';
import { CameraAgentsService } from './camera-agents.service';

@Module({
  controllers: [CameraAgentsController, CameraAgentRuntimeController],
  providers: [CameraAgentsService],
  exports: [CameraAgentsService],
})
export class CameraAgentsModule {}
