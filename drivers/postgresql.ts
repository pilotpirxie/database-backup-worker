import AWS from "aws-sdk";
import dayjs from "dayjs";
import fs from "fs";
import pgp from "pg-promise";
import {
  BackupDriver,
  DatabaseConfiguration,
  S3Configuration,
} from "./BackupDriver";
import s3upload from "../utils/s3upload";
import unlinking from "../utils/unlinking";

export default class PostgreSQLBackupDriver implements BackupDriver {
  private s3: AWS.S3 | null = null;
  private s3Configuration: S3Configuration;

  constructor(S3Configuration: S3Configuration) {
    this.s3Configuration = S3Configuration;
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

  private generateInsertStatement(
    tableName: string,
    row: Record<string, unknown>,
  ): string {
    const keys = Object.keys(row).join(", ");
    const values = Object.values(row).map(this.formatValue).join(", ");
    return `INSERT INTO ${tableName} (${keys}) VALUES (${values});`;
  }

  private async backupTable(
    db: pgp.IDatabase<unknown>,
    tableName: string,
  ): Promise<string> {
    const data = await db.any<Record<string, unknown>>(
      `SELECT * FROM ${tableName}`,
    );
    const insertStatements = data.map((row) =>
      this.generateInsertStatement(tableName, row),
    );
    return `-- ${tableName}\n${insertStatements.join("\n")}\n`;
  }

  async prepareBackup(config: {
    database: DatabaseConfiguration;
  }): Promise<void> {
    if (!this.s3) {
      console.error("S3 is not initialized");
      return;
    }

    try {
      const fileName = `dump_${dayjs().format("YYYY_MM_DD_hh_mm_ss")}.sql`;
      console.info(`Preparing database backup ${fileName}`);
      fs.writeFileSync(fileName, "", { flag: "w" });

      const db = await this.connectToDatabase(config.database);
      const tables = await this.getAllTables(db);

      for (const table of tables) {
        const backup = await this.backupTable(db, table);
        fs.appendFileSync(fileName, backup + "\n", { flag: "a" });
      }

      await this.disconnectFromDatabase(db);

      console.info(`Uploading database backup ${fileName}`);
      s3upload({
        s3: this.s3,
        databaseName: config.database.name,
        bucketName: this.s3Configuration.bucket,
        fileName,
        databaseType: "postgresql",
      });
      unlinking({ fileName });

      console.info(`Backup finished ${fileName}`);
    } catch (e) {
      console.error(e);
    }
  }
}
