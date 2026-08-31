import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SitesModule } from './sites/sites.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { RoutesModule } from './routes/routes.module';
import { CamerasModule } from './cameras/cameras.module';
import { PatrolModule } from './patrol/patrol.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    PrismaModule,
    AuthModule,
    UsersModule,
    SitesModule,
    ChecklistsModule,
    RoutesModule,
    CamerasModule,
    PatrolModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
