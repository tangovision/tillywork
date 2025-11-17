import {
    Controller,
    Get,
    MaxFileSizeValidator,
    NotFoundException,
    Param,
    ParseFilePipe,
    Post,
    Request,
    Response,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from "@nestjs/common";
import { FilesService } from "./files.service";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt.auth.guard";
import { FileInterceptor } from "@nest-lab/fastify-multer";
import { FileDto } from "./types";
import { UploadLimitInterceptor } from "./interceptors/upload.limit.interceptor";
import { FileTypeValidator } from "./validators/file-type.validator";
import { createReadStream, existsSync } from "fs";
import { join } from "path";
import { FastifyReply } from "fastify";

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
    @UseInterceptors(FileInterceptor("file"), UploadLimitInterceptor)
    @Post()
    async uploadFile(
        @Request() req,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({
                        maxSize: 5 * 1024 * 1024,
                        message: "FILE_SIZE_LIMIT",
                    }),
                    new FileTypeValidator({
                        allowedMimeTypes: ALLOWED_MIME_TYPES,
                    }),
                ],
            })
        )
        file: FileDto
    ) {
        const { user } = req;
        return this.filesService.uploadFile({
            file,
            createdBy: user,
        });
    }
}
