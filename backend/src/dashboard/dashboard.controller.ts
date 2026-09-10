import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  get(@Req() req: Request) {
    return this.dashboardService.getData(req.user as any);
  }

  @Get("issues")
  getIssues(@Req() req: Request) {
    return this.dashboardService.getIssues(req.user as any);
  }
}