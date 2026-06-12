import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Notification } from '../entities/notification.entity';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Get user notifications with pagination' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async getNotifications(
    @Req() req: Request,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }> {
    return this.notificationsService.getNotifications(
      req.user!.id,
      +page,
      +limit,
    );
  }

  @ApiOperation({ summary: 'Get count of unread notifications' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async getUnreadCount(@Req() req: Request): Promise<{ unreadCount: number }> {
    return this.notificationsService.getUnreadCount(req.user!.id);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<Notification> {
    return this.notificationsService.markAsRead(id, req.user!.id);
  }
}
