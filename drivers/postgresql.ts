import AWS from 'aws-sdk';
import dayjs from 'dayjs';
import fs from 'fs';
import pgp from 'pg-promise';
import { BackupDriver, DatabaseConfiguration, S3Configuration } from './BackupDriver';
import s3upload from '../utils/s3upload';
import unlinking from '../utils/unlinking';

export default class PostgreSQLBackupDriver implements BackupDriver {
  private s3: AWS.S3;

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

    this.s3 = new AWS.S3({ apiVersion: '2006-03-01' });
  }

  async prepareBackup(config: { database: DatabaseConfiguration; }): Promise<void> {
    try {
      const fileName = `dump_${dayjs().format('YYYY_MM_DD_hh_mm_ss')}.sql`;

      console.info(`Preparing database backup ${fileName}`);
      const db = pgp()({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
        ssl: {
          rejectUnauthorized: false,
        },
      });

      const tables = await db.any("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");

      await fs.writeFileSync(fileName, '', { flag: 'w' });

      for (let i = 0; i < tables.length; i++) {
        let sql = `-- ${tables[i].table_name} \n`;

        const table = tables[i];
        const tableName = table.table_name;
        const data = await db.any(`SELECT * FROM ${tableName}`);

        let keys: string = '';
        data.forEach((row) => {
          if (!keys.length) {
            keys = Object.keys(row).join(', ');
          }

          const values = Object.values(row).map((value) => {
            if (value === undefined) return 'NULL';
            if (value === null) return 'NULL';
            if (typeof value === 'number') return value;
            if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
            if (value instanceof Date) return `'${value.toISOString()}'`;
            if (Array.isArray(value)) return `ARRAY[${value.map((val) => `'${val}'`).join(',')}]`;
            if (Buffer.isBuffer(value)) return `E'\\\\x${value.toString('hex')}'`;
            return `'${value.toString().replace(/'/g, "''")}'`;
          }).join(', ');

          sql += `INSERT INTO ${tableName} (${keys}) VALUES (${values});\n`;
        });

        await fs.writeFileSync(fileName, `${sql}\n`, { flag: 'a' });
      }


      console.info(`Uploading database backup ${fileName}`);
      s3upload({
        s3: this.s3,
        databaseName: config.database.name,
        bucketName: this.s3Data.bucket,
        fileName,
        databaseType: 'postgresql',
      });
      // unlinking({ fileName });
      console.info(`Backup finished ${fileName}`);
    } catch (e) {
      console.error(e);
    }
  }
}
