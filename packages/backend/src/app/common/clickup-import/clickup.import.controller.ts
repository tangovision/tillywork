import {
    Controller,
    Post,
    Body,
    UseGuards,
    UseInterceptors,
    BadRequestException,
    Logger,
    Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { FastifyRequest } from "fastify";

import { JwtAuthGuard } from "../auth/guards/jwt.auth.guard";
import { ClickUpImportService } from "./services/clickup.import.service";
import { ClickUpImportDto, ClickUpPreviewDto } from "./dto/import.dto";
import {
    ClickUpImportResult,
    ClickUpImportPreview,
} from "./types/clickup.types";
import {
    FastifyFileInterceptor,
    UploadedFileInfo,
} from "../files/interceptors/fastify-file.interceptor";

/**
 * Controller for ClickUp import operations
 */
@ApiBearerAuth()
@ApiTags("clickup-import")
@UseGuards(JwtAuthGuard)
@Controller({
    path: "clickup-import",
    version: "1",
})
export class ClickUpImportController {
    private readonly logger = new Logger("ClickUpImportController");

    constructor(private readonly importService: ClickUpImportService) {}

    /**
     * Preview a ClickUp CSV import without making changes.
     * Upload a CSV file and get a summary of what will be imported.
     */
    @Post("preview")
    @UseInterceptors(FastifyFileInterceptor("file", { maxFileSize: 50 * 1024 * 1024 }))
    @ApiConsumes("multipart/form-data")
    @ApiBody({
        schema: {
            type: "object",
            properties: {
                file: {
                    type: "string",
                    format: "binary",
                    description: "ClickUp CSV export file",
                },
                workspaceId: {
                    type: "number",
                    description: "Target workspace ID",
                },
            },
            required: ["file", "workspaceId"],
        },
    })
    async preview(
        @Req() request: FastifyRequest,
        @Body() previewDto: ClickUpPreviewDto
    ): Promise<ClickUpImportPreview> {
        // File is attached to request by FastifyFileInterceptor
        const file = (request as any).file as UploadedFileInfo;

        this.logger.log(
            `Previewing ClickUp import for workspace ${previewDto.workspaceId}`
        );

        if (!file || !file.buffer) {
            throw new BadRequestException("CSV file is required");
        }

        // Handle workspaceId as string from form data
        const workspaceId =
            typeof previewDto.workspaceId === "string"
                ? parseInt(previewDto.workspaceId, 10)
                : previewDto.workspaceId;

        if (isNaN(workspaceId)) {
            throw new BadRequestException("Invalid workspace ID");
        }

        return this.importService.previewImport(file.buffer, workspaceId);
    }

    /**
     * Execute a ClickUp CSV import.
     * Upload a CSV file and import tasks into the specified workspace.
     */
    @Post("import")
    @UseInterceptors(FastifyFileInterceptor("file", { maxFileSize: 50 * 1024 * 1024 }))
    @ApiConsumes("multipart/form-data")
    @ApiBody({
        schema: {
            type: "object",
            properties: {
                file: {
                    type: "string",
                    format: "binary",
                    description: "ClickUp CSV export file",
                },
                workspaceId: {
                    type: "number",
                    description: "Target workspace ID",
                },
                spaceId: {
                    type: "number",
                    description:
                        "Optional: Target space ID. If not provided, spaces will be created from CSV data",
                },
                listId: {
                    type: "number",
                    description:
                        "Optional: Target list ID. If not provided, lists will be created from CSV data",
                },
                cardTypeId: {
                    type: "number",
                    description: "Card type ID to use for imported cards",
                },
                createMissingStructures: {
                    type: "boolean",
                    description:
                        "Create missing spaces, lists, and stages automatically",
                    default: true,
                },
                importSubtasks: {
                    type: "boolean",
                    description: "Import subtasks as child cards",
                    default: true,
                },
            },
            required: ["file", "workspaceId", "cardTypeId"],
        },
    })
    async import(
        @Req() request: FastifyRequest,
        @Body() importDto: ClickUpImportDto
    ): Promise<ClickUpImportResult> {
        // File is attached to request by FastifyFileInterceptor
        const file = (request as any).file as UploadedFileInfo;

        this.logger.log(
            `Starting ClickUp import for workspace ${importDto.workspaceId}`
        );

        if (!file || !file.buffer) {
            throw new BadRequestException("CSV file is required");
        }

        // Parse numeric fields from form data
        const options = {
            workspaceId: this.parseNumber(importDto.workspaceId, "workspaceId"),
            spaceId: importDto.spaceId
                ? this.parseNumber(importDto.spaceId, "spaceId")
                : undefined,
            listId: importDto.listId
                ? this.parseNumber(importDto.listId, "listId")
                : undefined,
            cardTypeId: this.parseNumber(importDto.cardTypeId, "cardTypeId"),
            createMissingStructures: this.parseBoolean(
                importDto.createMissingStructures,
                true
            ),
            importSubtasks: this.parseBoolean(importDto.importSubtasks, true),
            mapping: importDto.mapping,
        };

        const result = await this.importService.executeImport(
            file.buffer,
            options
        );

        this.logger.log(
            `ClickUp import completed: ${result.importedCards}/${result.totalTasks} tasks imported`
        );

        return result;
    }

    /**
     * Parse a number from form data (which comes as string)
     */
    private parseNumber(value: any, fieldName: string): number {
        const parsed = typeof value === "string" ? parseInt(value, 10) : value;
        if (isNaN(parsed)) {
            throw new BadRequestException(`Invalid ${fieldName}`);
        }
        return parsed;
    }

    /**
     * Parse a boolean from form data
     */
    private parseBoolean(value: any, defaultValue: boolean): boolean {
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
            return value.toLowerCase() === "true" || value === "1";
        }
        return defaultValue;
    }
}
