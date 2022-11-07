# database-backup-worker
Backend worker to periodically dump full mysql or clickhouse database and upload to S3

### Setup
Config in ``.env`` file should look like following:
```shell
# number of db to backup
DB_NUMBER=0

# Cron time pattern, use https://crontab.guru/
# e.g. "0 */6 * * *" means "At minute 0 past every 6th hour."
# leave it default if you don't know what you are doing.
DB_CRON_PATTERN_<INDEX>="0 */6 * * *"

# Database type "mysql" or "clickhouse"
DB_TYPE_<INDEX>=

# Database host
DB_HOST_<INDEX>=

# Database port, default 3306
DB_PORT_<INDEX>=

# Database name
DB_NAME_<INDEX>=

# Database user name
DB_USER_<INDEX>=

# Database user password
DB_PASS_<INDEX>=

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
