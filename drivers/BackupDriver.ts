export type DatabaseConfiguration = {
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
};

export type S3Configuration = {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  secure: boolean;
  forcePathStyle: boolean;
};

export interface BackupDriver {
  prepareBackup(config: { database: DatabaseConfiguration }): Promise<void>;
}

export type DriverMap = {
  [key: string]: BackupDriver;
};
