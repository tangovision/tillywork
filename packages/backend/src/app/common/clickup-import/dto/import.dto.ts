import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
} from "class-validator";
import { ClickUpImportMapping } from "../types/clickup.types";

/**
 * DTO for initiating a ClickUp import
 */
export class ClickUpImportDto {
    @IsNotEmpty()
    @IsNumber()
    workspaceId: number;

    @IsOptional()
    @IsNumber()
    spaceId?: number;

    @IsOptional()
    @IsNumber()
    listId?: number;

    @IsNotEmpty()
    @IsNumber()
    cardTypeId: number;

    @IsOptional()
    @IsBoolean()
    createMissingStructures?: boolean = true;

    @IsOptional()
    @IsBoolean()
    importSubtasks?: boolean = true;

    @IsOptional()
    @IsObject()
    mapping?: ClickUpImportMapping;
}

/**
 * DTO for previewing a ClickUp import (before actual import)
 */
export class ClickUpPreviewDto {
    @IsNotEmpty()
    @IsNumber()
    workspaceId: number;
}

/**
 * DTO for mapping configuration
 */
export class ClickUpMappingDto {
    @IsOptional()
    @IsObject()
    statusToStageMap?: Record<string, number>;

    @IsOptional()
    @IsObject()
    customFieldMap?: Record<string, string>;

    @IsOptional()
    @IsObject()
    priorityMap?: Record<string, string>;
}
