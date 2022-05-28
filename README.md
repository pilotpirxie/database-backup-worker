# mysql-backup-worker
Backend worker to periodically dump full mysql database and upload to S3

### Setup
Config in ``.env`` file should looks like following:
```shell
# Database host
DB_HOST=

# Database port, default 3306
DB_PORT=

# Database name
DB_NAME=

# Database user name
DB_USER=

# Database user password
DB_PASS=

# Cron time pattern, use https://crontab.guru/
# e.g. "0 */6 * * *" means "At minute 0 past every 6th hour."
# leave it default if you don't know what you are doing.
CRON_PATTERN="0 */6 * * *"

# S3 compatible bucket name
S3_BUCKET=

# S3 access key
S3_ACCESS_KEY=

# S3 secret key
S3_SECRET_KEY=

# Endpoint of the service without protocol
S3_ENDPOINT=

# Use secure connection, recommended
S3_SSL=true

# Use path-style addressing https://s3.amazonaws.com/BUCKET/KEY
S3_FORCE_PATH_STYLE=true
```

### License
```MIT```
