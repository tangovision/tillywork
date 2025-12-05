import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDateTimeToFieldTypeEnums1735211235572
    implements MigrationInterface
{
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "field_type_enum" ADD VALUE IF NOT EXISTS 'date_time';
            ALTER TYPE "field_type_enum" ADD VALUE IF NOT EXISTS 'percentage';
        `);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    public async down(_queryRunner: QueryRunner): Promise<void> {}
}
