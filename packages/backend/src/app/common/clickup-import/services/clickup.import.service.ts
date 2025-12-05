import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { ClsService } from "nestjs-cls";
import slugify from "slugify";

import { ClickUpParserService } from "./clickup.parser.service";
import {
    ClickUpTaskRow,
    ClickUpImportOptions,
    ClickUpImportResult,
    ClickUpImportPreview,
    ImportError,
} from "../types/clickup.types";

import { Card } from "../../cards/card.entity";
import { CardList } from "../../cards/card-lists/card.list.entity";
import { List } from "../../lists/list.entity";
import { ListStage } from "../../lists/list-stages/list.stage.entity";
import { Space } from "../../spaces/space.entity";
import { Workspace } from "../../workspaces/workspace.entity";
import { CardType } from "../../card-types/card.type.entity";
import { Field } from "../../fields/field.entity";
import { AccessControlService } from "../../auth/services/access.control.service";
import { AclContext } from "../../auth/context/acl.context";
import { FieldTypes, ListType, PermissionLevel } from "@tillywork/shared";

/**
 * Service for importing ClickUp data into TillyWork
 */
@Injectable()
export class ClickUpImportService {
    private readonly logger = new Logger("ClickUpImportService");

    // Default stage colors for auto-created stages
    private readonly defaultStageColors = [
        "#808080", // Gray (To Do)
        "#3b82f6", // Blue (In Progress)
        "#f59e0b", // Amber (Review)
        "#10b981", // Green (Done)
        "#ef4444", // Red (Blocked)
        "#8b5cf6", // Purple
        "#ec4899", // Pink
        "#06b6d4", // Cyan
    ];

    constructor(
        @InjectRepository(Card)
        private cardsRepository: Repository<Card>,
        @InjectRepository(CardList)
        private cardListsRepository: Repository<CardList>,
        @InjectRepository(List)
        private listsRepository: Repository<List>,
        @InjectRepository(ListStage)
        private listStagesRepository: Repository<ListStage>,
        @InjectRepository(Space)
        private spacesRepository: Repository<Space>,
        @InjectRepository(Workspace)
        private workspacesRepository: Repository<Workspace>,
        @InjectRepository(CardType)
        private cardTypesRepository: Repository<CardType>,
        @InjectRepository(Field)
        private fieldsRepository: Repository<Field>,
        private parserService: ClickUpParserService,
        private accessControlService: AccessControlService,
        private clsService: ClsService,
        private aclContext: AclContext,
        private dataSource: DataSource
    ) {}

    /**
     * Preview the import without making changes
     */
    async previewImport(
        fileBuffer: Buffer,
        workspaceId: number
    ): Promise<ClickUpImportPreview> {
        const user = this.clsService.get("user");

        // Verify workspace access
        await this.accessControlService.authorize(
            user,
            "workspace",
            workspaceId,
            PermissionLevel.EDITOR
        );

        const parseResult = this.parserService.parseCSV(fileBuffer);
        const warnings: string[] = [...parseResult.errors];

        // Check for existing structures
        const existingSpaces = await this.spacesRepository.find({
            where: { workspaceId },
            select: ["name"],
        });
        const existingSpaceNames = new Set(
            existingSpaces.map((s) => s.name.toLowerCase())
        );

        const spacesToCreate = parseResult.spaces.filter(
            (s) => !existingSpaceNames.has(s.toLowerCase())
        );

        // Get existing lists in workspace
        const existingLists = await this.listsRepository.find({
            where: { workspaceId },
            select: ["name"],
        });
        const existingListNames = new Set(
            existingLists.map((l) => l.name.toLowerCase())
        );

        const listsToCreate = parseResult.lists.filter(
            (l) => !existingListNames.has(l.toLowerCase())
        );

        // Add warnings for subtasks without parent
        const taskIds = new Set(
            parseResult.tasks.map((t) => t["Task ID"]).filter(Boolean)
        );
        for (const task of parseResult.tasks) {
            if (task["Parent ID"] && !taskIds.has(task["Parent ID"])) {
                warnings.push(
                    `Task "${task["Task Name"]}" references parent ID ${task["Parent ID"]} which is not in the export`
                );
            }
        }

        return {
            totalTasks: parseResult.tasks.length,
            spacesToCreate,
            listsToCreate,
            stagesToCreate: parseResult.statuses,
            customFieldsDetected: parseResult.customFields,
            warnings,
            sampleTasks: parseResult.tasks.slice(0, 5),
        };
    }

    /**
     * Execute the import
     */
    async executeImport(
        fileBuffer: Buffer,
        options: ClickUpImportOptions
    ): Promise<ClickUpImportResult> {
        const user = this.clsService.get("user");

        // Verify workspace access
        await this.accessControlService.authorize(
            user,
            "workspace",
            options.workspaceId,
            PermissionLevel.EDITOR
        );

        // Verify workspace exists
        const workspace = await this.workspacesRepository.findOne({
            where: { id: options.workspaceId },
        });
        if (!workspace) {
            throw new NotFoundException(
                `Workspace with ID ${options.workspaceId} not found`
            );
        }

        // Verify card type exists
        const cardType = await this.cardTypesRepository.findOne({
            where: { id: options.cardTypeId },
            relations: ["fields"],
        });
        if (!cardType) {
            throw new NotFoundException(
                `Card type with ID ${options.cardTypeId} not found`
            );
        }

        // Parse CSV
        const parseResult = this.parserService.parseCSV(fileBuffer);

        if (parseResult.tasks.length === 0) {
            throw new BadRequestException("No tasks found in the CSV file");
        }

        // Initialize result tracking
        const result: ClickUpImportResult = {
            success: false,
            totalTasks: parseResult.tasks.length,
            importedCards: 0,
            skippedTasks: 0,
            createdSpaces: 0,
            createdLists: 0,
            createdStages: 0,
            errors: [],
            warnings: parseResult.errors,
            cardIdMap: {},
        };

        // Run import in a transaction
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Step 1: Create/map spaces
            const spaceMap = await this.getOrCreateSpaces(
                parseResult.spaces,
                options,
                result,
                queryRunner
            );

            // Step 2: Create/map lists
            const listMap = await this.getOrCreateLists(
                parseResult.lists,
                parseResult.tasks,
                spaceMap,
                options,
                cardType,
                result,
                queryRunner
            );

            // Step 3: Create/map stages for each list
            const stageMap = await this.getOrCreateStages(
                parseResult.statuses,
                listMap,
                options,
                result,
                queryRunner
            );

            // Step 4: Get title field for the card type
            const titleField = await this.getTitleField(cardType.id);
            const descriptionField = await this.getDescriptionField(cardType.id);

            // Step 5: Import cards (non-subtasks first)
            const nonSubtasks = parseResult.tasks.filter(
                (t) => !t["Parent ID"]
            );
            const subtasks = parseResult.tasks.filter((t) => t["Parent ID"]);

            // Import parent tasks
            for (const task of nonSubtasks) {
                await this.importTask(
                    task,
                    null,
                    listMap,
                    stageMap,
                    titleField,
                    descriptionField,
                    options,
                    result,
                    queryRunner
                );
            }

            // Import subtasks if enabled
            if (options.importSubtasks && subtasks.length > 0) {
                for (const task of subtasks) {
                    const parentClickUpId = task["Parent ID"];
                    const parentCardId = parentClickUpId
                        ? result.cardIdMap[parentClickUpId]
                        : null;

                    await this.importTask(
                        task,
                        parentCardId ?? null,
                        listMap,
                        stageMap,
                        titleField,
                        descriptionField,
                        options,
                        result,
                        queryRunner
                    );
                }
            }

            await queryRunner.commitTransaction();
            result.success = true;

            this.logger.log(
                `Import completed: ${result.importedCards}/${result.totalTasks} tasks imported`
            );
        } catch (error) {
            await queryRunner.rollbackTransaction();
            this.logger.error("Import failed, transaction rolled back", error);

            result.errors.push({
                message: `Import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
        } finally {
            await queryRunner.release();
        }

        return result;
    }

    /**
     * Get or create spaces from ClickUp space names
     */
    private async getOrCreateSpaces(
        spaceNames: string[],
        options: ClickUpImportOptions,
        result: ClickUpImportResult,
        queryRunner: any
    ): Promise<Map<string, Space>> {
        const spaceMap = new Map<string, Space>();

        // If a specific space is provided, use it for all
        if (options.spaceId) {
            const space = await this.spacesRepository.findOne({
                where: { id: options.spaceId },
            });
            if (space) {
                for (const name of spaceNames) {
                    spaceMap.set(name.toLowerCase(), space);
                }
                // Also set empty string mapping for tasks without space
                spaceMap.set("", space);
                return spaceMap;
            }
        }

        // Get existing spaces
        const existingSpaces = await this.spacesRepository.find({
            where: { workspaceId: options.workspaceId },
        });

        for (const space of existingSpaces) {
            spaceMap.set(space.name.toLowerCase(), space);
        }

        // Create missing spaces if option enabled
        if (options.createMissingStructures) {
            for (const spaceName of spaceNames) {
                if (!spaceMap.has(spaceName.toLowerCase()) && spaceName.trim()) {
                    const newSpace = queryRunner.manager.create(Space, {
                        name: spaceName,
                        workspaceId: options.workspaceId,
                        icon: "mdi-folder",
                        color: "#6366f1",
                    });
                    await queryRunner.manager.save(newSpace);

                    // Apply access control
                    await this.aclContext.run(true, async () => {
                        await this.accessControlService.applyResourceAccess(
                            newSpace,
                            "space"
                        );
                    });

                    spaceMap.set(spaceName.toLowerCase(), newSpace);
                    result.createdSpaces++;
                }
            }
        }

        // Create a default space if none exist
        if (spaceMap.size === 0 || !spaceMap.has("")) {
            const defaultSpace =
                existingSpaces[0] ||
                (await this.createDefaultSpace(
                    options.workspaceId,
                    result,
                    queryRunner
                ));
            spaceMap.set("", defaultSpace);
        }

        return spaceMap;
    }

    /**
     * Create a default space for import
     */
    private async createDefaultSpace(
        workspaceId: number,
        result: ClickUpImportResult,
        queryRunner: any
    ): Promise<Space> {
        const newSpace = queryRunner.manager.create(Space, {
            name: "Imported from ClickUp",
            workspaceId,
            icon: "mdi-import",
            color: "#6366f1",
        });
        await queryRunner.manager.save(newSpace);

        await this.aclContext.run(true, async () => {
            await this.accessControlService.applyResourceAccess(
                newSpace,
                "space"
            );
        });

        result.createdSpaces++;
        return newSpace;
    }

    /**
     * Get or create lists from ClickUp list names
     */
    private async getOrCreateLists(
        listNames: string[],
        tasks: ClickUpTaskRow[],
        spaceMap: Map<string, Space>,
        options: ClickUpImportOptions,
        cardType: CardType,
        result: ClickUpImportResult,
        queryRunner: any
    ): Promise<Map<string, List>> {
        const listMap = new Map<string, List>();

        // If a specific list is provided, use it for all
        if (options.listId) {
            const list = await this.listsRepository.findOne({
                where: { id: options.listId },
                relations: ["listStages"],
            });
            if (list) {
                for (const name of listNames) {
                    listMap.set(this.getListKey("", name), list);
                }
                listMap.set(this.getListKey("", ""), list);
                return listMap;
            }
        }

        // Get existing lists in workspace
        const existingLists = await this.listsRepository.find({
            where: { workspaceId: options.workspaceId },
            relations: ["listStages", "space"],
        });

        for (const list of existingLists) {
            const key = this.getListKey(
                list.space?.name || "",
                list.name
            );
            listMap.set(key, list);
        }

        // Create missing lists if option enabled
        if (options.createMissingStructures) {
            // Build unique space-list combinations from tasks
            const spaceListPairs = new Set<string>();
            for (const task of tasks) {
                const spaceName = task["Space Name"] || "";
                const listName = task["List Name"] || "";
                if (listName) {
                    spaceListPairs.add(`${spaceName}|||${listName}`);
                }
            }

            for (const pair of spaceListPairs) {
                const [spaceName, listName] = pair.split("|||");
                const key = this.getListKey(spaceName, listName);

                if (!listMap.has(key) && listName.trim()) {
                    const space =
                        spaceMap.get(spaceName.toLowerCase()) ||
                        spaceMap.get("");

                    if (space) {
                        const slug = await this.generateListSlug(
                            listName,
                            options.workspaceId,
                            space.id
                        );

                        const newList = queryRunner.manager.create(List, {
                            name: listName,
                            slug,
                            workspaceId: options.workspaceId,
                            spaceId: space.id,
                            type: ListType.LIST,
                            defaultCardType: cardType,
                        });
                        await queryRunner.manager.save(newList);

                        // Apply access control
                        await this.aclContext.run(true, async () => {
                            await this.accessControlService.applyResourceAccess(
                                newList,
                                "list"
                            );
                        });

                        newList.listStages = [];
                        listMap.set(key, newList);
                        result.createdLists++;
                    }
                }
            }
        }

        // Ensure we have at least one list
        if (listMap.size === 0) {
            const defaultSpace = spaceMap.get("") || spaceMap.values().next().value;
            if (defaultSpace) {
                const slug = await this.generateListSlug(
                    "Imported Tasks",
                    options.workspaceId,
                    defaultSpace.id
                );

                const defaultList = queryRunner.manager.create(List, {
                    name: "Imported Tasks",
                    slug,
                    workspaceId: options.workspaceId,
                    spaceId: defaultSpace.id,
                    type: ListType.LIST,
                    defaultCardType: cardType,
                });
                await queryRunner.manager.save(defaultList);

                await this.aclContext.run(true, async () => {
                    await this.accessControlService.applyResourceAccess(
                        defaultList,
                        "list"
                    );
                });

                defaultList.listStages = [];
                listMap.set(this.getListKey("", ""), defaultList);
                result.createdLists++;
            }
        }

        return listMap;
    }

    /**
     * Get or create stages for lists
     */
    private async getOrCreateStages(
        statusNames: string[],
        listMap: Map<string, List>,
        options: ClickUpImportOptions,
        result: ClickUpImportResult,
        queryRunner: any
    ): Promise<Map<string, Map<string, ListStage>>> {
        // Map: listId -> (statusName -> ListStage)
        const stageMap = new Map<string, Map<string, ListStage>>();

        // Process each list
        for (const [key, list] of listMap.entries()) {
            const listStageMap = new Map<string, ListStage>();
            stageMap.set(String(list.id), listStageMap);

            // Add existing stages
            if (list.listStages) {
                for (const stage of list.listStages) {
                    listStageMap.set(stage.name.toLowerCase(), stage);
                }
            }

            // Create missing stages if option enabled
            if (options.createMissingStructures) {
                let order = list.listStages?.length || 0;

                for (const statusName of statusNames) {
                    if (
                        !listStageMap.has(statusName.toLowerCase()) &&
                        statusName.trim()
                    ) {
                        const isCompleted = this.isCompletedStatus(statusName);
                        const color =
                            this.defaultStageColors[
                                order % this.defaultStageColors.length
                            ];

                        const newStage = queryRunner.manager.create(ListStage, {
                            name: statusName,
                            listId: list.id,
                            order: order++,
                            color,
                            isCompleted,
                        });
                        await queryRunner.manager.save(newStage);

                        listStageMap.set(statusName.toLowerCase(), newStage);
                        result.createdStages++;
                    }
                }
            }

            // Ensure at least one default stage exists
            if (listStageMap.size === 0) {
                const defaultStage = queryRunner.manager.create(ListStage, {
                    name: "To Do",
                    listId: list.id,
                    order: 0,
                    color: "#808080",
                    isCompleted: false,
                });
                await queryRunner.manager.save(defaultStage);
                listStageMap.set("to do", defaultStage);
                result.createdStages++;
            }
        }

        return stageMap;
    }

    /**
     * Import a single task
     */
    private async importTask(
        task: ClickUpTaskRow,
        parentCardId: number | null,
        listMap: Map<string, List>,
        stageMap: Map<string, Map<string, ListStage>>,
        titleField: Field | null,
        descriptionField: Field | null,
        options: ClickUpImportOptions,
        result: ClickUpImportResult,
        queryRunner: any
    ): Promise<void> {
        try {
            const taskName = task["Task Name"];
            if (!taskName || !taskName.trim()) {
                result.skippedTasks++;
                result.errors.push({
                    taskId: task["Task ID"],
                    row: result.importedCards + result.skippedTasks,
                    message: "Task name is empty",
                });
                return;
            }

            // Find the target list
            const spaceName = task["Space Name"] || "";
            const listName = task["List Name"] || "";
            const listKey = this.getListKey(spaceName, listName);

            let list = listMap.get(listKey);
            if (!list) {
                // Try fallback to default
                list =
                    listMap.get(this.getListKey("", "")) ||
                    listMap.values().next().value;
            }

            if (!list) {
                result.skippedTasks++;
                result.errors.push({
                    taskId: task["Task ID"],
                    taskName,
                    message: `Could not find list for task`,
                });
                return;
            }

            // Find the stage
            const listStageMap = stageMap.get(String(list.id));
            const statusName = task["Status"] || "";
            const stage =
                listStageMap?.get(statusName.toLowerCase()) ||
                listStageMap?.values().next().value;

            // Build card data
            const cardData: Record<string, any> = {};

            if (titleField) {
                cardData[titleField.slug] = taskName;
            }

            if (descriptionField && task["Task Content"]) {
                // Store description as TipTap-compatible format
                cardData[descriptionField.slug] = {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph",
                            content: [
                                {
                                    type: "text",
                                    text: task["Task Content"],
                                },
                            ],
                        },
                    ],
                };
            }

            // Parse dates
            const dueDate =
                this.parserService.parseUnixTimestamp(task["Due Date (Unix)"]) ||
                this.parserService.parseDateString(task["Due Date"]);
            const startDate =
                this.parserService.parseUnixTimestamp(
                    task["Start Date (Unix)"]
                ) || this.parserService.parseDateString(task["Start Date"]);

            // Add dates to card data if fields exist
            if (dueDate) {
                cardData["due_date"] = dueDate.toISOString();
            }
            if (startDate) {
                cardData["start_date"] = startDate.toISOString();
            }

            // Add priority if exists
            const priority = this.parserService.normalizePriority(
                task["Priority"]
            );
            if (priority) {
                cardData["priority"] = priority;
            }

            // Add tags
            const tags = this.parserService.parseTags(task["Tags"]);
            if (tags.length > 0) {
                cardData["tags"] = tags;
            }

            // Store original ClickUp data for reference
            cardData["_clickup_import"] = {
                taskId: task["Task ID"],
                spaceName: task["Space Name"],
                folderName: task["Folder Name"],
                listName: task["List Name"],
                importedAt: new Date().toISOString(),
            };

            // Create the card
            const card = queryRunner.manager.create(Card, {
                workspaceId: options.workspaceId,
                type: { id: options.cardTypeId },
                data: cardData,
                createdByType: "system",
                parent: parentCardId ? { id: parentCardId } : undefined,
            });
            await queryRunner.manager.save(card);

            // Create card list association
            if (stage) {
                const cardList = queryRunner.manager.create(CardList, {
                    cardId: card.id,
                    listId: list.id,
                    listStageId: stage.id,
                    order: result.importedCards,
                });
                await queryRunner.manager.save(cardList);
            }

            // Track mapping for subtasks
            if (task["Task ID"]) {
                result.cardIdMap[task["Task ID"]] = card.id;
            }

            result.importedCards++;
        } catch (error) {
            result.skippedTasks++;
            result.errors.push({
                taskId: task["Task ID"],
                taskName: task["Task Name"],
                message:
                    error instanceof Error ? error.message : "Unknown error",
            });
            this.logger.error(
                `Failed to import task: ${task["Task Name"]}`,
                error
            );
        }
    }

    /**
     * Get list key from space and list names
     */
    private getListKey(spaceName: string, listName: string): string {
        return `${spaceName.toLowerCase()}|||${listName.toLowerCase()}`;
    }

    /**
     * Check if a status indicates completion
     */
    private isCompletedStatus(status: string): boolean {
        const completedKeywords = [
            "done",
            "complete",
            "completed",
            "closed",
            "resolved",
            "finished",
        ];
        return completedKeywords.some((keyword) =>
            status.toLowerCase().includes(keyword)
        );
    }

    /**
     * Generate a unique slug for a list
     */
    private async generateListSlug(
        name: string,
        workspaceId: number,
        spaceId: number
    ): Promise<string> {
        const slug = slugify(name, { lower: true, strict: true });

        const existingSlugs = await this.listsRepository.find({
            where: { workspaceId, spaceId },
            select: ["slug"],
        });

        const slugSet = new Set(existingSlugs.map((l) => l.slug));
        let counter = 1;
        let finalSlug = slug;

        while (slugSet.has(finalSlug)) {
            finalSlug = `${slug}-${counter}`;
            counter++;
        }

        return finalSlug;
    }

    /**
     * Get the title field for a card type
     */
    private async getTitleField(cardTypeId: number): Promise<Field | null> {
        return this.fieldsRepository.findOne({
            where: {
                cardType: { id: cardTypeId },
                isTitle: true,
            },
        });
    }

    /**
     * Get the description field for a card type
     */
    private async getDescriptionField(cardTypeId: number): Promise<Field | null> {
        return this.fieldsRepository.findOne({
            where: {
                cardType: { id: cardTypeId },
                isDescription: true,
            },
        });
    }
}
