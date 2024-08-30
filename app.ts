import "dotenv/config";
import { CronJob } from "cron";
import {
  DatabaseConfiguration,
  DriverMap,
  S3Configuration,
} from "./drivers/BackupDriver";
import MySQLBackupDriver from "./drivers/mysql";
import ClickhouseBackupDriver from "./drivers/clickhouse";
import validate from "./utils/validate";
import PostgreSQLBackupDriver from "./drivers/postgresql";

const {
  S3_BUCKET,
  DB_NUMBER,
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_ENDPOINT,
  S3_SSL,
  S3_FORCE_PATH_STYLE,
  RUN_ON_START,
} = process.env;

if (
  !validate([
    S3_BUCKET,
    DB_NUMBER,
    S3_ACCESS_KEY,
    S3_SECRET_KEY,
    S3_ENDPOINT,
    S3_SSL,
    S3_FORCE_PATH_STYLE,
  ])
) {
  console.error("Missing env properties! Check documentation and try again.");
  process.exit(1);
}

const s3Config: S3Configuration = {
  endpoint: S3_ENDPOINT || "",
  secure: S3_SSL === "true",
  secretKey: S3_SECRET_KEY || "",
  accessKey: S3_ACCESS_KEY || "",
  bucket: S3_BUCKET || "",
  forcePathStyle: S3_FORCE_PATH_STYLE === "true",
};

const driverMap: DriverMap = {
  mysql: new MySQLBackupDriver(s3Config),
  clickhouse: new ClickhouseBackupDriver(s3Config),
  postgresql: new PostgreSQLBackupDriver(s3Config),
};

for (let i = 0; i < Number(DB_NUMBER || 1); i++) {
  if (
    !validate([
      process.env[`DB_NAME_${i}`],
      process.env[`DB_HOST_${i}`],
      process.env[`DB_PORT_${i}`],
      process.env[`DB_USER_${i}`],
      process.env[`DB_PASS_${i}`],
      process.env[`DB_CRON_PATTERN_${i}`],
      process.env[`DB_TYPE_${i}`],
    ])
  ) {
    console.error(
      `Missing env properties for database (${i})! Check documentation and try again.`,
    );
    continue;
  }

  const name = process.env[`DB_NAME_${i}`] || "";
  const host = process.env[`DB_HOST_${i}`] || "";
  const port = Number(process.env[`DB_PORT_${i}`]);
  const user = process.env[`DB_USER_${i}`] || "";
  const password = process.env[`DB_PASS_${i}`] || "";
  const cronPattern = process.env[`DB_CRON_PATTERN_${i}`] || "0 */6 * * *";
  const databaseType = process.env[`DB_TYPE_${i}`] || "";

  const dbConfig: DatabaseConfiguration = {
    name,
    password,
    user,
    port,
    host,
  };

  if (!driverMap.hasOwnProperty(databaseType)) {
    console.error("Invalid database type! Check documentation and try again.");
    process.exit(1);
  }

  const backup = () => {
    driverMap[databaseType]
      .prepareBackup({ database: dbConfig })
      .catch((err) => {
        console.error("Error while preparing backup", err);
      });
  };

  const cron = new CronJob(cronPattern, backup);
  cron.start();

  if (RUN_ON_START === "true") {
    backup();
  }

  console.info(
    `Starting backup worker. Cron set to "${cronPattern}" for database ${databaseType}:"${name}" and S3 bucket: "${s3Config.bucket}". Next backup at ${cron.nextDate()}`,
  );
}
