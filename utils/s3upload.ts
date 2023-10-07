import fs from 'fs';
import AWS from 'aws-sdk';

export default function s3upload({
  s3,
  databaseName,
  fileName,
  bucketName,
}: {
  s3: AWS.S3,
  databaseName: string,
  fileName: string,
  bucketName: string,
}) {
  s3.upload({
    Bucket: bucketName,
    Key: `backup/mysql_${databaseName}/${fileName}`,
    Body: fs.readFileSync(fileName),
    ACL: 'private',
  }, (err, data) => {
    if (err) {
      console.error(err);
    }
    console.info(data);
  });
}
