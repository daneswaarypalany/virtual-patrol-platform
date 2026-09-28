import { Module } from "@nestjs/common";
import { PatrolController } from "./patrol.controller";
import { PatrolService } from "./patrol.service";
import { ReportTemplateModule } from "../report-template/report-template.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [ReportTemplateModule, NotificationsModule],
  controllers: [PatrolController],
  providers: [PatrolService],
})
export class PatrolModule {}