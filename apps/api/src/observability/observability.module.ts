import { forwardRef, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { GrafanaAuthController } from './grafana-auth.controller';
import { HttpMetricsService } from './http-metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwtSecret'),
        signOptions: {
          expiresIn: (config.get<string>('jwtExpiresIn') ?? '1d') as unknown as number,
        },
      }),
    }),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [
    MetricsService,
    HttpMetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  controllers: [MetricsController, GrafanaAuthController],
  exports: [MetricsService, HttpMetricsService],
})
export class ObservabilityModule {}
