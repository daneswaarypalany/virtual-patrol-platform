import { Module } from '@nestjs/common';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { StreamFilesController } from './stream-files.controller';
import { CameraAgentsModule } from '../camera-agents/camera-agents.module';

@Module({
  imports: [CameraAgentsModule],
  controllers: [StreamsController, StreamFilesController],
  providers: [StreamsService],
})
export class StreamsModule {}