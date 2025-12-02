import {
    Controller,
    Get,
    NotFoundException,
    Param,
    Post,
    Request,
    Response,
    UseGuards,
    UseInterceptors,
    BadRequestException,
} from "@nestjs/common";
import { FilesService } from "./files.service";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt.auth.guard";
import { UploadLimitInterceptor } from "./interceptors/upload.limit.interceptor";
import {
    FastifyFileInterceptor,
    UploadedFileInfo,
} from "./interceptors/fastify-file.interceptor";
import { validateFileType } from "./validators/file-type.validator";
import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { FastifyReply, FastifyRequest } from "fastify";

// Allowlist of safe MIME types - executables and scripts are explicitly excluded
const ALLOWED_MIME_TYPES = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    // Text
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    'application/xml',
    'text/xml',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/gzip',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    // Video
    'video/mp4',
    'video/mpeg',
    'video/webm',
    'video/ogg',
];

@ApiTags("files")
@Controller({
    path: "files",
    version: "1",
})
export class FilesController {
    constructor(private readonly filesService: FilesService) {}

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @Get(":id")
    async getFile(@Param("id") id: string, @Response() res: FastifyReply) {
        // Check if file entity exists in db
        const fileEntity = await this.filesService.findOneOrFail({
            id,
        });

        const filePath = join(
            this.filesService.getLocalStoragePath(),
            fileEntity.key
        );

        // Check if the file exists on disk
        if (!existsSync(filePath)) {
            throw new NotFoundException("File not found");
        }

        const file = createReadStream(filePath);

        res.send(file);
    }

    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FastifyFileInterceptor("file", { maxFileSize: 5 * 1024 * 1024 }),
        UploadLimitInterceptor
    )
    @Post()
    async uploadFile(@Request() req: FastifyRequest) {
        const file = (req as any).file as UploadedFileInfo;
        const user = (req as any).user;

        if (!file) {
            throw new BadRequestException("File is required");
        }

        // Validate file type using magic number verification
        await validateFileType(file, ALLOWED_MIME_TYPES);

        // Convert UploadedFileInfo to FileDto format expected by FilesService
        const fileDto = {
            fieldname: file.fieldname,
            originalname: file.originalname,
            encoding: file.encoding,
            mimetype: file.mimetype,
            buffer: file.buffer,
            size: file.size,
        };

        return this.filesService.uploadFile({
            file: fileDto,
            createdBy: user,
        });
    }
}
