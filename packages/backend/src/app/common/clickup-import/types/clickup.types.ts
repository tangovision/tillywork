/**
 * Types representing ClickUp's CSV export data structure.
 * Based on ClickUp's task data export format.
 */

/**
 * Represents a single row from ClickUp's CSV export.
 * Fields match ClickUp's export columns.
 */
export interface ClickUpTaskRow {
    // Core task fields
    "Task ID"?: string;
    "Task Name": string;
    "Task Content"?: string; // Description
    Status?: string;
    Priority?: string;

    // Dates - ClickUp exports both Unix and text formats
    "Date Created"?: string;
    "Date Created (Unix)"?: string;
    "Date Updated"?: string;
    "Date Updated (Unix)"?: string;
    "Start Date"?: string;
    "Start Date (Unix)"?: string;
    "Due Date"?: string;
    "Due Date (Unix)"?: string;
    "Date Closed"?: string;
    "Date Closed (Unix)"?: string;

    // Organization
    "Space Name"?: string;
    "Folder Name"?: string;
    "List Name"?: string;
    "Parent ID"?: string; // For subtasks

    // People
    Assignees?: string; // JSON array: [John Smith, Mary Smith]
    Creator?: string;
    Watchers?: string;

    // Tags and Labels
    Tags?: string; // JSON array: [tag1, tag2]

    // Time tracking
    "Time Estimated"?: string;
    "Time Spent"?: string;

    // Comments and Checklists
    "Assigned Comments"?: string;
    Checklists?: string;

    // Attachments - JSON format
    Attachments?: string; // JSON: [{"title":"file.png","url":"<hyperlink>"}]

    // Custom fields - these are dynamic columns that start with "Custom Field:"
    // or are just additional columns beyond the standard ones
    [key: string]: string | undefined;
}

/**
 * Parsed attachment from ClickUp export
 */
export interface ClickUpAttachment {
    title: string;
    url: string;
}

/**
 * Parsed checklist item from ClickUp export
 */
export interface ClickUpChecklistItem {
    name: string;
    checked: boolean;
}

/**
 * Result of parsing a ClickUp CSV file
 */
export interface ClickUpParseResult {
    tasks: ClickUpTaskRow[];
    spaces: string[];
    folders: string[];
    lists: string[];
    statuses: string[];
    customFields: string[];
    errors: string[];
}

/**
 * Mapping configuration for importing ClickUp data
 */
export interface ClickUpImportMapping {
    // Maps ClickUp status names to TillyWork stage IDs
    statusToStageMap: Record<string, number>;

    // Maps ClickUp custom field names to TillyWork field slugs
    customFieldMap: Record<string, string>;

    // Maps ClickUp priority to TillyWork label/dropdown value
    priorityMap?: Record<string, string>;
}

/**
 * Options for the import process
 */
export interface ClickUpImportOptions {
    workspaceId: number;
    spaceId?: number;
    listId?: number;
    cardTypeId: number;

    // Whether to create missing structures (spaces, lists, stages)
    createMissingStructures: boolean;

    // Whether to import subtasks as child cards
    importSubtasks: boolean;

    // Custom mapping configuration
    mapping?: ClickUpImportMapping;
}

/**
 * Result of an import operation
 */
export interface ClickUpImportResult {
    success: boolean;
    totalTasks: number;
    importedCards: number;
    skippedTasks: number;
    createdSpaces: number;
    createdLists: number;
    createdStages: number;
    errors: ImportError[];
    warnings: string[];
    cardIdMap: Record<string, number>; // Maps ClickUp Task ID to TillyWork Card ID
}

/**
 * Detailed error from import
 */
export interface ImportError {
    taskId?: string;
    taskName?: string;
    row?: number;
    message: string;
    field?: string;
}

/**
 * Preview of what will be imported (before actual import)
 */
export interface ClickUpImportPreview {
    totalTasks: number;
    spacesToCreate: string[];
    listsToCreate: string[];
    stagesToCreate: string[];
    customFieldsDetected: string[];
    warnings: string[];
    sampleTasks: ClickUpTaskRow[];
}
