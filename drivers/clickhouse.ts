import dayjs from "dayjs";
import { createClient } from "@clickhouse/client";
import {
  BackupDriver,
  DatabaseConfiguration,
  S3Configuration,
} from "./BackupDriver";

export default class ClickhouseBackupDriver implements BackupDriver {
  private s3Data: S3Configuration;

  constructor(s3Data: S3Configuration) {
    this.s3Data = s3Data;
  }

  async prepareBackup(config: {
    database: DatabaseConfiguration;
  }): Promise<void> {
    try {
      const client = createClient({
        host: `${config.database.host}:${config.database.port}`,
        username: config.database.user,
        password: config.database.password,
        database: config.database.name,
      });

      const s3Destination = `${this.s3Data.secure ? "https://" : "http://"}${this.s3Data.endpoint}/${this.s3Data.bucket}/backup/clickhouse_${config.database.name}/${dayjs().format("YYYY_MM_DD_HH_mm_ss")}`;
      client
        .exec({
          query: `BACKUP DATABASE ${config.database.name} TO S3('${s3Destination}', '${this.s3Data.accessKey}', '${this.s3Data.secretKey}');`,
        })
        .then(() => {
          console.info("Backup to S3 finished in");
        })
        .catch((err) => {
          console.error("Backup to S3 failed", err);
        });
    } catch (e) {
      console.error(e);
    }
  }
}
