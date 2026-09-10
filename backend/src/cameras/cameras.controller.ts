import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CamerasService } from "./cameras.service";
import { CreateCameraDto } from "./dto/create-camera.dto";
import { UpdateCameraDto } from "./dto/update-camera.dto";

@Controller("cameras")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class CamerasController {
  constructor(private camerasService: CamerasService) {}

  @Get()
  @Roles("ADMIN", "OPERATOR", "VIEWER")
  findAll(@Req() req: Request, @Query("siteId") siteId?: string) {
    return this.camerasService.findAll(req.user as any, siteId);
  }

  @Post()
  create(@Body() dto: CreateCameraDto) {
    return this.camerasService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCameraDto) {
    return this.camerasService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.camerasService.remove(id);
  }
}