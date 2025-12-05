import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    BadRequestException,
    Type,
    mixin,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { FastifyRequest } from "fastify";

// Type definitions for @fastify/multipart (augments FastifyRequest when registered)
interface MultipartFile {
    type: "file";
    fieldname: string;
    filename: string;
    encoding: string;
    mimetype: string;
    file: AsyncIterable<Buffer>;
}

interface MultipartField {
    type: "field";
    fieldname: string;
    value: unknown;
}

type MultipartPart = MultipartFile | MultipartField;

// Extend FastifyRequest to include multipart methods added by @fastify/multipart
interface MultipartRequest extends FastifyRequest {
    isMultipart: () => boolean;
    parts: () => AsyncIterableIterator<MultipartPart>;
}

export interface UploadedFileInfo {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    buffer: Buffer;
    size: number;
}

export interface FastifyFileInterceptorOptions {
    fieldName?: string;
    maxFileSize?: number;
}

/**
 * Creates a file interceptor for Fastify 5 using @fastify/multipart.
 * This replaces @nest-lab/fastify-multer's FileInterceptor which doesn't support Fastify 5.
 *
 * Usage:
 * @UseInterceptors(FastifyFileInterceptor('file', { maxFileSize: 50 * 1024 * 1024 }))
 */
export function FastifyFileInterceptor(
    fieldName = "file",
    options: FastifyFileInterceptorOptions = {}
): Type<NestInterceptor> {
    @Injectable()
    class MixinInterceptor implements NestInterceptor {
        async intercept(
            context: ExecutionContext,
            next: CallHandler
        ): Promise<Observable<any>> {
            const request = context
                .switchToHttp()
                .getRequest<MultipartRequest>();

            // Check if this is a multipart request
            if (!request.isMultipart()) {
                throw new BadRequestException(
                    "Request must be multipart/form-data"
                );
            }

            try {
                // Parse the multipart data
                const parts = request.parts();
                const fields: Record<string, any> = {};
                let uploadedFile: UploadedFileInfo | null = null;

                for await (const part of parts) {
                    if (part.type === "file") {
                        if (part.fieldname === fieldName) {
                            // Check file size if limit is set
                            const maxSize =
                                options.maxFileSize || 50 * 1024 * 1024; // Default 50MB
                            const chunks: Buffer[] = [];
                            let totalSize = 0;

                            for await (const chunk of part.file) {
                                totalSize += chunk.length;
                                if (totalSize > maxSize) {
                                    throw new BadRequestException(
                                        `File size exceeds maximum allowed size of ${maxSize} bytes`
                                    );
                                }
                                chunks.push(Buffer.from(chunk as unknown as ArrayBuffer));
                            }

                            uploadedFile = {
                                fieldname: part.fieldname,
                                originalname: part.filename,
                                encoding: part.encoding,
                                mimetype: part.mimetype,
                                buffer: Buffer.concat(chunks as unknown as Uint8Array[]),
                                size: totalSize,
                            };
                        }
                    } else {
                        // It's a field
                        fields[part.fieldname] = part.value;
                    }
                }

                // Attach file to request (for @UploadedFile decorator compatibility)
                (request as any).file = uploadedFile;

                // Merge fields into body
                const existingBody = (request.body as Record<string, unknown>) || {};
                (request as any).body = {
                    ...existingBody,
                    ...fields,
                };
            } catch (error) {
                if (error instanceof BadRequestException) {
                    throw error;
                }
                throw new BadRequestException(
                    `Failed to parse multipart data: ${error.message}`
                );
            }

            return next.handle();
        }
    }

    return mixin(MixinInterceptor);
}
