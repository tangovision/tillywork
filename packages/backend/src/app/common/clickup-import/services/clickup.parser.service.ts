import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import {
    ClickUpTaskRow,
    ClickUpParseResult,
    ClickUpAttachment,
} from "../types/clickup.types";

/**
 * Service for parsing ClickUp CSV export files
 */
@Injectable()
export class ClickUpParserService {
    private readonly logger = new Logger("ClickUpParserService");

    // Standard ClickUp CSV columns
    private readonly standardColumns = new Set([
        "Task ID",
        "Task Name",
        "Task Content",
        "Status",
        "Priority",
        "Date Created",
        "Date Created (Unix)",
        "Date Updated",
        "Date Updated (Unix)",
        "Start Date",
        "Start Date (Unix)",
        "Due Date",
        "Due Date (Unix)",
        "Date Closed",
        "Date Closed (Unix)",
        "Space Name",
        "Folder Name",
        "List Name",
        "Parent ID",
        "Assignees",
        "Creator",
        "Watchers",
        "Tags",
        "Time Estimated",
        "Time Spent",
        "Assigned Comments",
        "Checklists",
        "Attachments",
    ]);

    /**
     * Parse a ClickUp CSV file buffer
     */
    parseCSV(fileBuffer: Buffer, encoding: BufferEncoding = "utf-8"): ClickUpParseResult {
        const errors: string[] = [];
        let tasks: ClickUpTaskRow[] = [];

        try {
            const content = fileBuffer.toString(encoding);

            // Parse CSV with flexible options to handle ClickUp's format
            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true,
                bom: true, // Handle UTF-8 BOM
            }) as ClickUpTaskRow[];

            tasks = records;

            if (tasks.length === 0) {
                errors.push("No tasks found in the CSV file");
            }
        } catch (error) {
            this.logger.error("Failed to parse CSV", error);
            throw new BadRequestException(
                `Failed to parse CSV file: ${error instanceof Error ? error.message : "Unknown error"}`
            );
        }

        // Extract unique values for mapping
        const spaces = this.extractUniqueValues(tasks, "Space Name");
        const folders = this.extractUniqueValues(tasks, "Folder Name");
        const lists = this.extractUniqueValues(tasks, "List Name");
        const statuses = this.extractUniqueValues(tasks, "Status");
        const customFields = this.detectCustomFields(tasks);

        return {
            tasks,
            spaces,
            folders,
            lists,
            statuses,
            customFields,
            errors,
        };
    }

    /**
     * Extract unique non-empty values from a specific column
     */
    private extractUniqueValues(tasks: ClickUpTaskRow[], column: keyof ClickUpTaskRow): string[] {
        const values = new Set<string>();
        for (const task of tasks) {
            const value = task[column];
            if (value && typeof value === "string" && value.trim()) {
                values.add(value.trim());
            }
        }
        return Array.from(values).sort();
    }

    /**
     * Detect custom fields (columns not in standard ClickUp export)
     */
    private detectCustomFields(tasks: ClickUpTaskRow[]): string[] {
        if (tasks.length === 0) return [];

        const customFields = new Set<string>();
        const firstTask = tasks[0];

        for (const column of Object.keys(firstTask)) {
            if (!this.standardColumns.has(column)) {
                customFields.add(column);
            }
        }

        return Array.from(customFields).sort();
    }

    /**
     * Parse ClickUp's assignees format: [John Smith,Mary Smith]
     */
    parseAssignees(assigneesStr: string | undefined): string[] {
        if (!assigneesStr || assigneesStr.trim() === "") return [];

        try {
            // ClickUp format: [Name1,Name2] or [Name1, Name2]
            const trimmed = assigneesStr.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                const inner = trimmed.slice(1, -1);
                return inner
                    .split(",")
                    .map((name) => name.trim())
                    .filter(Boolean);
            }
            // Single assignee without brackets
            return [trimmed];
        } catch {
            this.logger.warn(`Failed to parse assignees: ${assigneesStr}`);
            return [];
        }
    }

    /**
     * Parse ClickUp's tags format: [tag1,tag2,tag3]
     */
    parseTags(tagsStr: string | undefined): string[] {
        return this.parseAssignees(tagsStr); // Same format as assignees
    }

    /**
     * Parse ClickUp's attachments JSON format
     */
    parseAttachments(attachmentsStr: string | undefined): ClickUpAttachment[] {
        if (!attachmentsStr || attachmentsStr.trim() === "") return [];

        try {
            const parsed = JSON.parse(attachmentsStr);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (item) =>
                        item &&
                        typeof item === "object" &&
                        typeof item.title === "string" &&
                        typeof item.url === "string"
                );
            }
            return [];
        } catch {
            this.logger.warn(`Failed to parse attachments JSON: ${attachmentsStr}`);
            return [];
        }
    }

    /**
     * Parse Unix timestamp to Date
     */
    parseUnixTimestamp(timestamp: string | undefined): Date | null {
        if (!timestamp) return null;

        try {
            const ts = parseInt(timestamp, 10);
            if (isNaN(ts)) return null;

            // ClickUp may use milliseconds or seconds
            const date = ts > 9999999999 ? new Date(ts) : new Date(ts * 1000);
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    /**
     * Parse date string (various formats)
     */
    parseDateString(dateStr: string | undefined): Date | null {
        if (!dateStr || dateStr.trim() === "") return null;

        try {
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }

    /**
     * Parse ClickUp time format (e.g., "10h 5m" or "10:05")
     */
    parseTimeEstimate(timeStr: string | undefined): number | null {
        if (!timeStr || timeStr.trim() === "") return null;

        try {
            // Format: "10h 5m" or "10h" or "5m"
            let totalMinutes = 0;

            const hoursMatch = timeStr.match(/(\d+)\s*h/i);
            const minutesMatch = timeStr.match(/(\d+)\s*m/i);

            if (hoursMatch) {
                totalMinutes += parseInt(hoursMatch[1], 10) * 60;
            }
            if (minutesMatch) {
                totalMinutes += parseInt(minutesMatch[1], 10);
            }

            // Format: "10:05" (hours:minutes)
            if (totalMinutes === 0 && timeStr.includes(":")) {
                const [hours, minutes] = timeStr.split(":").map(Number);
                if (!isNaN(hours) && !isNaN(minutes)) {
                    totalMinutes = hours * 60 + minutes;
                }
            }

            return totalMinutes > 0 ? totalMinutes : null;
        } catch {
            return null;
        }
    }

    /**
     * Normalize priority string to a standard format
     */
    normalizePriority(priority: string | undefined): string | null {
        if (!priority) return null;

        const normalized = priority.toLowerCase().trim();

        // ClickUp priorities
        const priorityMap: Record<string, string> = {
            urgent: "urgent",
            high: "high",
            normal: "normal",
            low: "low",
            "no priority": "none",
        };

        return priorityMap[normalized] || normalized;
    }

    /**
     * Validate that required columns exist
     */
    validateColumns(tasks: ClickUpTaskRow[]): string[] {
        const errors: string[] = [];

        if (tasks.length === 0) {
            errors.push("CSV file is empty");
            return errors;
        }

        const firstTask = tasks[0];

        // Task Name is the only required field
        if (!("Task Name" in firstTask)) {
            errors.push('Required column "Task Name" is missing');
        }

        return errors;
    }
}
