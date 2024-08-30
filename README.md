# database-backup-worker

Backend worker to periodically dump full **MySQL**, **PostgreSQL** or **ClickHouse** database and upload to S3. You can setup multiple databases on a single instance.

### Getting started

```shell
git clone https://github.com/pilotpirxie/database-backup-worker.git
cd database-backup-worker
yarn
yarn build
yarn start
```

### Setup

Config in `.env` file should look like following:

```shell
# Number of databases to backup
# For each database setup environment variables prefixed with DB_
# Index for database config is 0-based
DB_NUMBER=1

# Whether to run backup on start without
# waiting for the cron time
RUN_ON_START=false

# Cron time pattern, use https://crontab.guru/
# e.g. "0 */6 * * *" means "At minute 0 past every 6th hour."
# leave it default if you don't know what you are doing.
DB_CRON_PATTERN_<INDEX>="0 */6 * * *"

# Database type "mysql", "clickhouse" or "postgresql"
DB_TYPE_<INDEX>=

# Database host
# For MySQL use just host
# For ClickHouse prefix with https:// or http:// protocol
DB_HOST_<INDEX>=

# Database port
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

```
MIT
```
