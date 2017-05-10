module.exports = {
  development: {
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: {
      filename: './db/dev.sqlite3',
      // to allow executing raw sql batches
      multipleStatements: true
    },
    migrations: {
      tableName: 'migrations',
      directory: './db/migrations'
    }
  }
};
