import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SitesModule } from './sites/sites.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { RoutesModule } from './routes/routes.module';
import { CamerasModule } from './cameras/cameras.module';
import { PatrolModule } from './patrol/patrol.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { StreamsModule } from './streams/streams.module';
import { ReportTemplateModule } from './report-template/report-template.module';
import { SummaryTemplateModule } from './summary-template/summary-template.module';
import { LogsModule } from './logs/logs.module';
import { PresenceModule } from './presence/presence.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    SitesModule,
    ChecklistsModule,
    RoutesModule,
    CamerasModule,
    PatrolModule,
    DashboardModule,
    StreamsModule,
    ReportTemplateModule,
    SummaryTemplateModule,
    LogsModule,
    PresenceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}