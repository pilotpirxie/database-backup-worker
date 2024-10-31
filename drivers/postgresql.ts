import AWS from "aws-sdk";
import dayjs from "dayjs";
import pgp from "pg-promise";
import {
  BackupDriver,
  DatabaseConfiguration,
  S3Configuration,
} from "./BackupDriver";
import s3upload from "../utils/s3upload";
import unlinking from "../utils/unlinking";
import { compressFile } from "../utils/compress";
import { appendFileSync, writeFileSync } from "node:fs";

const BATCH_SIZE = 10_000;
const INSERT_BATCH_SIZE = 1_000;

export default class PostgreSQLBackupDriver implements BackupDriver {
  private s3: AWS.S3 | null = null;
  private s3Configuration: S3Configuration;

  constructor(s3Configuration: S3Configuration) {
    this.s3Configuration = s3Configuration;
    this.initializeAWS();
  }

  private initializeAWS(): void {
    AWS.config.update({
      accessKeyId: this.s3Configuration.accessKey,
      secretAccessKey: this.s3Configuration.secretKey,
      s3: {
        endpoint: this.s3Configuration.endpoint,
        sslEnabled: this.s3Configuration.secure,
        s3ForcePathStyle: this.s3Configuration.forcePathStyle,
      },
    });
    this.s3 = new AWS.S3({ apiVersion: "2006-03-01" });
  }

  private async connectToDatabase(
    config: DatabaseConfiguration,
  ): Promise<pgp.IDatabase<unknown>> {
    return pgp()({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  private async disconnectFromDatabase(
    db: pgp.IDatabase<unknown>,
  ): Promise<void> {
    await db.$pool.end();
  }

  private async getAllTables(db: pgp.IDatabase<unknown>): Promise<string[]> {
    const result = await db.any<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
    );
    return result.map((row) => row.table_name);
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "NULL";
    }

    if (typeof value === "number") {
      return value.toString();
    }

    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE";
    }

    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }

    if (Array.isArray(value)) {
      return `ARRAY[${value.map((val) => `'${val}'`).join(",")}]`;
    }

    if (Buffer.isBuffer(value)) {
      return `E'\\\\x${value.toString("hex")}'`;
    }

    if (typeof value === "object") {
      return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
    }

    return `'${value.toString().replaceAll("'", "''")}'`;
  }

  private generateInsertStatements(
    tableName: string,
    rows: Record<string, unknown>[],
  ): string {
    let insertStatements = "";
    let currentRows = 0;

    for (const row of rows) {
      const values = Object.values(row).map(this.formatValue).join(", ");

      if (currentRows === 0) {
        const keys = Object.keys(row).join(", ");
        insertStatements += `INSERT INTO ${tableName} (${keys}) VALUES (${values})`;
      } else {
        insertStatements += `, (${values})`;
      }

      currentRows++;
      if (currentRows === INSERT_BATCH_SIZE) {
        insertStatements += ";\n";
        currentRows = 0;
      }
    }

    if (currentRows > 0 && insertStatements.endsWith(")")) {
      insertStatements += ";\n";
    }

    return insertStatements;
  }

  private async backupTableWithCursor(
    db: pgp.IDatabase<unknown>,
    tableName: string,
    fileName: string,
    rowsCount: number,
    cursorColumn: string,
  ) {
    let lastValue: number = 0;
    let processedRows = 0;

    while (processedRows < rowsCount) {
      const data = await db.any<Record<string, unknown>>(
        `SELECT * FROM ${tableName} WHERE ${cursorColumn} > $1 ORDER BY ${cursorColumn} LIMIT ${BATCH_SIZE}`,
        [lastValue],
      );

      if (data.length === 0) break;

      const insertStatements = this.generateInsertStatements(tableName, data);
      appendFileSync(fileName, insertStatements, { flag: "a" });

      lastValue = data[data.length - 1][cursorColumn] as number;
      processedRows += data.length;

      console.info(
        `Progress for ${tableName}: ${((processedRows / rowsCount) * 100).toFixed(2)}%`,
      );
    }
  }

  private async backupTableWithOffset(
    db: pgp.IDatabase<unknown>,
    tableName: string,
    fileName: string,
    rowsCount: number,
  ) {
    let offset = 0;

    while (offset < rowsCount) {
      const data = await db.any<Record<string, unknown>>(
        `SELECT * FROM ${tableName} OFFSET ${offset} LIMIT ${BATCH_SIZE}`,
      );

      const insertStatements = this.generateInsertStatements(tableName, data);
      appendFileSync(fileName, insertStatements + "\n", { flag: "a" });

      offset += BATCH_SIZE;

      console.info(
        `Progress for ${tableName}: ${((offset / rowsCount) * 100).toFixed(2)}%`,
      );
    }
  }

  private async getNumericPrimaryKeyColumn(
    db: pgp.IDatabase<unknown>,
    tableName: string,
  ): Promise<string | null> {
    const result = await db.oneOrNone<{ column_name: string }>(
      `
    SELECT 
      pg_attribute.attname AS column_name 
    FROM      
      pg_index 
    JOIN     
      pg_attribute ON pg_attribute.attrelid = pg_index.indrelid                  
      AND pg_attribute.attnum = ANY(pg_index.indkey) 
    JOIN
      information_schema.columns ON columns.table_name = $1
      AND columns.column_name = pg_attribute.attname
    WHERE      
      pg_index.indrelid = $1::regclass     
      AND pg_index.indisprimary
      AND columns.data_type IN ('smallint', 'integer', 'bigint', 'decimal', 'numeric', 'real', 'double precision', 'smallserial', 'serial', 'bigserial')
    `,
      [tableName],
    );
    return result ? result.column_name : null;
  }

  private async getAutoIncrementColumn(
    db: pgp.IDatabase<unknown>,
    tableName: string,
  ): Promise<string | null> {
    const result = await db.oneOrNone<{ column_name: string }>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
      AND column_default LIKE 'nextval%'
      `,
      [tableName],
    );
    return result ? result.column_name : null;
  }

  private async backupTable(
    db: pgp.IDatabase<unknown>,
    tableName: string,
    fileName: string,
  ) {
    appendFileSync(fileName, `\n-- ${tableName}\n`, { flag: "a" });

    const rowsResult = await db.one<{ count: number }>(
      `SELECT COUNT(*) FROM ${tableName}`,
    );
    const rowsCount = rowsResult.count;

    const numericPrimaryKeyColumn = await this.getNumericPrimaryKeyColumn(
      db,
      tableName,
    );
    const autoIncrementColumn = await this.getAutoIncrementColumn(
      db,
      tableName,
    );
    const cursorColumn = numericPrimaryKeyColumn || autoIncrementColumn;
    console.info(
      `Backing up table ${tableName}. Found ${rowsCount} rows. Using ${cursorColumn ? "cursor" : "offset"} method.`,
    );

    if (cursorColumn) {
      await this.backupTableWithCursor(
        db,
        tableName,
        fileName,
        rowsCount,
        cursorColumn,
      );
    } else {
      await this.backupTableWithOffset(db, tableName, fileName, rowsCount);
    }
  }

  async prepareBackup(config: {
    database: DatabaseConfiguration;
  }): Promise<void> {
    if (!this.s3) {
      throw new Error("S3 is not initialized");
    }

    try {
      const fileName = `dump_${dayjs().format("YYYY_MM_DD_hh_mm_ss")}.sql`;
      console.info(`Preparing database backup ${fileName}`);
      writeFileSync(fileName, "", { flag: "w" });

      const db = await this.connectToDatabase(config.database);
      const tables = await this.getAllTables(db);

      for (const table of tables) {
        if (config.database.skipTables.includes(table)) {
          console.info(`Skipping table ${table}...`);
          continue;
        }
        await this.backupTable(db, table, fileName);
      }
      await this.disconnectFromDatabase(db);

      const compressedFileName = await compressFile(fileName);

      console.info(`Uploading database backup ${compressedFileName}`);
      await s3upload({
        s3: this.s3,
        databaseName: config.database.name,
        bucketName: this.s3Configuration.bucket,
        fileName: compressedFileName,
        databaseType: "postgresql",
      });

      unlinking({ fileName });
      unlinking({ fileName: compressedFileName });
      console.info(`Backup finished ${compressedFileName}`);
    } catch (e) {
      console.error(e);
    }
  }
}
