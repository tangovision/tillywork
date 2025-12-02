import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddResetTokenToUserTable1733140500000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            "user",
            new TableColumn({
                name: "resetToken",
                type: "varchar",
                length: "255",
                isNullable: true,
            })
        );

        await queryRunner.addColumn(
            "user",
            new TableColumn({
                name: "resetTokenExpiry",
                type: "timestamp",
                isNullable: true,
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("user", "resetTokenExpiry");
        await queryRunner.dropColumn("user", "resetToken");
    }
}
