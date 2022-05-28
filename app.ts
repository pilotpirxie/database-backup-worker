import 'dotenv/config';
import { CronJob } from 'cron';
import mysqldump from 'mysqldump';
import dayjs from 'dayjs';
import fs from 'fs';
import AWS from 'aws-sdk';

const {
  DB_HOST, DB_PORT,
  DB_USER, DB_PASS, DB_NAME,
  S3_BUCKET, CRON_PATTERN,
  S3_ACCESS_KEY, S3_SECRET_KEY,
  S3_ENDPOINT, S3_SSL,
  S3_FORCE_PATH_STYLE,
} = process.env;

if (
  !DB_HOST || !DB_PORT
  || !DB_USER || !DB_PASS || !DB_NAME
  || !S3_BUCKET || !CRON_PATTERN
  || !S3_ACCESS_KEY || !S3_SECRET_KEY
  || !S3_ENDPOINT || !S3_SSL
  || !S3_FORCE_PATH_STYLE
) {
  console.error('Missing env properties! Check documentation and try again.');
  process.exit(1);
}

/**
 * AWS S3 config
 */
AWS.config.update({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    sslEnabled: process.env.S3_SSL === 'true',
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
});

const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

/**
 * Export database backup and safety upload
 *
 * @returns {Promise<void>}
 */
async function prepareDatabaseBackup() {
  try {
    const fileName = `dump_${dayjs().format('DD_MM_YYYY_hh_mm_ss')}.sql`;

    console.info(`Preparing database backup ${fileName}`);
    await mysqldump({
      connection: {
        host: DB_HOST,
        port: Number(DB_PORT),
        user: DB_USER || '',
        password: DB_PASS || '',
        database: DB_NAME || '',
      },
      dumpToFile: fileName,
    });

    console.info(`Uploading database backup ${fileName}`);
    s3.upload({
      Bucket: S3_BUCKET || '',
      Key: `backup/${DB_NAME}/${fileName}`,
      Body: fs.readFileSync(fileName),
      ACL: 'private',
    }, (err, data) => {
      if (err) {
        console.error(err);
      }
      console.info(data);

      console.info(`Unlinking database backup ${fileName}`);
      fs.unlinkSync(fileName);

      console.info(`Backup finished ${fileName}`);
    });
  } catch (e) {
    console.error(e);
  }
}

new CronJob(CRON_PATTERN, (async () => {
  await prepareDatabaseBackup();
})).start();
