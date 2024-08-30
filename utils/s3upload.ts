import fs from "fs";
import AWS from "aws-sdk";

export default function s3upload({
  s3,
  databaseType,
  databaseName,
  fileName,
  bucketName,
}: {
  s3: AWS.S3;
  databaseType: "mysql" | "postgresql";
  databaseName: string;
  fileName: string;
  bucketName: string;
}): Promise<AWS.S3.ManagedUpload.SendData> {
  return new Promise((resolve, reject) => {
    s3.upload(
      {
        Bucket: bucketName,
        Key: `backup/${databaseType}_${databaseName}/${fileName}`,
        Body: fs.readFileSync(fileName),
        ACL: "private",
      },
      (err, data) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          console.info(data);
          resolve(data);
        }
      },
    );
  });
}
