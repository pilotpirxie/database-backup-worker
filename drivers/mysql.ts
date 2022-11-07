import AWS from 'aws-sdk';
import dayjs from 'dayjs';
import mysqldump from 'mysqldump';
import fs from 'fs';
import { BackupDriver, DatabaseConfiguration, S3Configuration } from './BackupDriver';

export default class MySQLBackupDriver implements BackupDriver {
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
      const fileName = `dump_${dayjs().format('DD_MM_YYYY_hh_mm_ss')}.sql`;

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
      });

      console.info(`Uploading database backup ${fileName}`);
      this.s3.upload({
        Bucket: this.s3Data.bucket,
        Key: `backup/${config.database.name}/${fileName}`,
        Body: fs.readFileSync(fileName),
        ACL: 'private',
      }, (err, data) => {
        if (err) {
          console.error(err);
        }
        console.info(data);

        console.info(`Unlinking local database backup ${fileName}`);
        fs.unlinkSync(fileName);

        console.info(`Backup finished ${fileName}`);
      });
    } catch (e) {
      console.error(e);
    }
  }
}
