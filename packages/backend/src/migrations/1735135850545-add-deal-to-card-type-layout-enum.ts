import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDealToCardTypeLayoutEnum1735135850545
    implements MigrationInterface
{
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TYPE "card_type_layout_enum" ADD VALUE IF NOT EXISTS 'deal';
        `);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    public async down(_queryRunner: QueryRunner): Promise<void> {}
}
