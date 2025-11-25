import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ClickUpImportController } from "./clickup.import.controller";
import { ClickUpImportService } from "./services/clickup.import.service";
import { ClickUpParserService } from "./services/clickup.parser.service";

import { Card } from "../cards/card.entity";
import { CardList } from "../cards/card-lists/card.list.entity";
import { List } from "../lists/list.entity";
import { ListStage } from "../lists/list-stages/list.stage.entity";
import { Space } from "../spaces/space.entity";
import { Workspace } from "../workspaces/workspace.entity";
import { CardType } from "../card-types/card.type.entity";
import { Field } from "../fields/field.entity";
import { AuthModule } from "../auth/auth.module";

@Module({
    imports: [
        TypeOrmModule.forFeature([
            Card,
            CardList,
            List,
            ListStage,
            Space,
            Workspace,
            CardType,
            Field,
        ]),
        AuthModule,
    ],
    controllers: [ClickUpImportController],
    providers: [ClickUpImportService, ClickUpParserService],
    exports: [ClickUpImportService, ClickUpParserService],
})
export class ClickUpImportModule {}
