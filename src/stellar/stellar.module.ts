import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { Tip } from '../entities/tip.entity';
import { TipsModule } from '../tips/tips.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Tip]),
    TipsModule,
    NotificationsModule,
  ],
  providers: [StellarService],
  controllers: [StellarController],
  exports: [StellarService],
})
export class StellarModule {}
