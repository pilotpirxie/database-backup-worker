import AWS from "aws-sdk";
import dayjs from "dayjs";
import mysqldump from "mysqldump";
import {
  BackupDriver,
  DatabaseConfiguration,
  S3Configuration,
} from "./BackupDriver";
import s3upload from "../utils/s3upload";
import unlinking from "../utils/unlinking";
import { compressFile } from "../utils/compress";

export default class MySQLBackupDriver implements BackupDriver {
  private readonly s3: AWS.S3;
  private s3Data: S3Configuration;

  constructor(s3Data: S3Configuration) {
    this.s3Data = s3Data;

    AWS.config.update({
      accessKeyId: this.s3Data.accessKey,
      secretAccessKey: this.s3Data.secretKey,
      s3: {
        endpoint: this.s3Data.endpoint,
        sslEnabled: this.s3Data.secure,
        s3ForcePathStyle: this.s3Data.forcePathStyle,
      },
    });

    this.s3 = new AWS.S3({ apiVersion: "2006-03-01" });
  }

  async prepareBackup(config: {
    database: DatabaseConfiguration;
  }): Promise<void> {
    try {
      const fileName = `dump_${dayjs().format("YYYY_MM_DD_hh_mm_ss")}.sql`;

      console.info(`Preparing database backup ${fileName}`);
      await mysqldump({
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.user,
          password: config.database.password,
          database: config.database.name,
        },
        dumpToFile: fileName,
        dump: {
          data: {
            format: false,
            maxRowsPerInsertStatement: 1000,
          },
          schema: {
            format: false,
          },
          excludeTables: true,
          tables: config.database.skipTables,
        },
      });

      const compressedFileName = await compressFile(fileName);

      console.info(`Uploading database backup ${compressedFileName}`);
      await s3upload({
        s3: this.s3,
        databaseName: config.database.name,
        bucketName: this.s3Data.bucket,
        fileName: compressedFileName,
        databaseType: "mysql",
      });

      unlinking({ fileName });
      unlinking({ fileName: compressedFileName });
      console.info(`Backup finished ${compressedFileName}`);
    } catch (e) {
      console.error(e);
    }
  }
}
