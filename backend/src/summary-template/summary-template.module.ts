import { Module } from '@nestjs/common'
import { SummaryTemplateService } from './summary-template.service'
import { SummaryTemplateController } from './summary-template.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [SummaryTemplateController],
  providers: [SummaryTemplateService],
  exports: [SummaryTemplateService],
})
export class SummaryTemplateModule {}