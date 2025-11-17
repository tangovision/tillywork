import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "./common/common.module";
import typeorm from "../config/typeorm";
import { validationSchema } from "../config/validation.schema";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { APP_INTERCEPTOR, APP_GUARD, APP_FILTER } from "@nestjs/core";
import { TracingInterceptor } from "./common/interceptors/tracing.interceptor";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [typeorm],
            validationSchema,
            isGlobal: true,
        }),
        TypeOrmModule.forRootAsync({
            useFactory: async (configService: ConfigService) =>
                configService.get("typeorm"),
            inject: [ConfigService],
            imports: [ConfigModule],
        }),
        EventEmitterModule.forRoot({
            wildcard: true,
        }),
        ThrottlerModule.forRoot([
            {
                name: 'short',
                ttl: 1000, // 1 second
                limit: 10, // 10 requests per second
            },
            {
                name: 'medium',
                ttl: 10000, // 10 seconds
                limit: 50, // 50 requests per 10 seconds
            },
            {
                name: 'long',
                ttl: 60000, // 1 minute
                limit: 100, // 100 requests per minute
            },
        ]),
        CommonModule,
    ],
    controllers: [],
    providers: [
        {
            provide: APP_FILTER,
            useClass: HttpExceptionFilter,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: TracingInterceptor,
        },
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
    exports: [],
})
export class AppModule {}
