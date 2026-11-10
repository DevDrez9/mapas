import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminService, type ProjectInput } from './admin.service';

/** Administración de proyectos, API keys y consumo. Requiere el header x-admin-token. */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('projects')
  createProject(@Body() body: ProjectInput) {
    return this.admin.createProject(body);
  }

  @Get('projects')
  listProjects() {
    return this.admin.listProjects();
  }

  @Get('projects/:id')
  getProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getProject(id);
  }

  @Patch('projects/:id')
  updateProject(@Param('id', ParseUUIDPipe) id: string, @Body() body: ProjectInput) {
    return this.admin.updateProject(id, body);
  }

  @Delete('projects/:id')
  deleteProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.deleteProject(id);
  }

  @Post('projects/:id/keys')
  createKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: unknown } | undefined,
  ) {
    return this.admin.createKey(id, body?.name);
  }

  @Get('projects/:id/keys')
  listKeys(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.listKeys(id);
  }

  @Delete('keys/:keyId')
  @HttpCode(200)
  revokeKey(@Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.admin.revokeKey(keyId);
  }

  @Get('projects/:id/usage')
  usage(@Param('id', ParseUUIDPipe) id: string, @Query('days') days?: string) {
    return this.admin.usage(id, days);
  }
}
