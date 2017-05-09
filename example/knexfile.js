module.exports = {
  development: {
    client: 'sqlite3',
    useNullAsDefault: true,
    connection: {
      filename: './db/dev.sqlite3'
    },
    migrations: {
      tableName: 'migrations',
      directory: './db/migrations'
    }
  }
};
