import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LogsService } from './logs.service';

@Controller('logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class LogsController {
  constructor(private logsService: LogsService) {}

  // Roster of users with online status (from live socket presence).
  @Get('active-users')
  activeUsers() {
    return this.logsService.activeUsers();
  }

  // Distinct action names, used to populate the filter dropdown.
  @Get('actions')
  actions() {
    return this.logsService.actions();
  }

  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.logsService.list({
      page,
      pageSize,
      action,
      userId,
      search,
      from,
      to,
    });
  }
}