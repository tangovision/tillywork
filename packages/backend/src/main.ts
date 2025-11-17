import "./tracing";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
    FastifyAdapter,
    NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app/app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import metadata from "./metadata";
import { FastifyAdapter as BullFastifyAdapter } from "@bull-board/fastify";
import { getQueueToken } from "@nestjs/bull";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ConfigService } from "@nestjs/config";
import { contentParser } from "fastify-multer";
import { trace, context } from "@opentelemetry/api";
import { TillyLogger } from "./app/common/logger/tilly.logger";
import { JwtService } from "@nestjs/jwt";
import helmet from "@fastify/helmet";

async function bootstrap() {
    const logger = new TillyLogger("main.ts");
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter(),
        {
            logger: logger,
        }
    );
    const configService = app.get(ConfigService);
    const port = configService.get("PORT");
    const environment = configService.get("NODE_ENV");
    const frontendUrl = configService.get("TW_FRONTEND_URL");

    // Configure CORS to only allow the frontend URL
    app.enableCors({
        origin: frontendUrl || "http://localhost:4200",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    });

    // Add security headers with Helmet
    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        crossOriginEmbedderPolicy: false, // Allow embedding for Swagger UI
    });

    // Enable API URI Versioning
    app.enableVersioning({
        type: VersioningType.URI,
    });

    // Add Global Validation Pipe
    app.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            transformOptions: {
                enableImplicitConversion: true,
            },
        })
    );

    app.register(contentParser);

    // Only enable Swagger documentation in development or if explicitly enabled
    // In production, API docs expose internal structure and should be restricted
    if (
        environment !== "production" ||
        configService.get("TW_ENABLE_SWAGGER") === "true"
    ) {
        await SwaggerModule.loadPluginMetadata(metadata);
        const config = new DocumentBuilder()
            .setTitle("tillywork API")
            .setVersion("1.0")
            .addBearerAuth()
            .addBasicAuth()
            .build();
        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup("docs", app, document);
        logger.log("📚 Swagger documentation enabled at /docs");
    } else {
        logger.log("🔒 Swagger documentation disabled in production");
    }

    const serverAdapter = new BullFastifyAdapter();
    serverAdapter.setBasePath("/bullmq");

    const automationQueue = app.get(getQueueToken("automations"));
    const notificationQueue = app.get(getQueueToken("notifications"));
    const queues = [
        new BullAdapter(automationQueue),
        new BullAdapter(notificationQueue),
    ];

    if (configService.get("TW_MAIL_ENABLE")) {
        const emailQueue = app.get(getQueueToken("emails"));
        queues.push(new BullAdapter(emailQueue));
    }

    createBullBoard({
        queues,
        serverAdapter,
    });

    // Add authentication middleware for BullMQ dashboard
    const jwtService = app.get(JwtService);
    app.getHttpAdapter()
        .getInstance()
        .register(serverAdapter.registerPlugin(), {
            basePath: "/bullmq",
            prefix: "/bullmq",
            preHandler: async (request, reply) => {
                const authHeader = request.headers.authorization;
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    reply.code(401).send({ message: "Unauthorized: No token provided" });
                    return;
                }

                const token = authHeader.substring(7);
                try {
                    await jwtService.verifyAsync(token);
                } catch (error) {
                    reply.code(401).send({ message: "Unauthorized: Invalid token" });
                    return;
                }
            },
        });

    // Add OpenTelemetry context middleware
    app.use((req, res, next) => {
        const span = trace.getSpan(context.active());
        if (span) {
            span.setAttribute("http.request_id", req.id);
            span.setAttribute("http.route", req.url);
        }
        next();
    });

    await app.listen(port, "0.0.0.0");

    logger.log(`🚀 tillywork API is running on: http://localhost:${port}`);
    logger.log(`Environment: ${environment}`);
}

bootstrap().catch((error) => {
    const logger = new TillyLogger("bootstrap");
    logger.error("Failed to start application", error.stack);
    logger.error(`Error: ${error.message}`);
    process.exit(1);
});
