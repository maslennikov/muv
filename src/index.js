import {resolve, dirname, isAbsolute} from 'path'
import {existsSync} from 'fs'
import reqFrom from 'req-from'
import Umzug from 'umzug'
import _ from 'lodash'
import Promise from 'bluebird'


export default class Migrator {
  constructor(options) {
    this.options = this._normalizedOptions(options)

    this._connection = this._initConnection()
    this._umzug = this._initUmzug()
    this._storage = this._umzug.storage
  }

  init() {
    return this._umzug.storage.init()
  }

  async up() {
    var pending = await this.pending()
    if (!pending.length) return [];

    return this._umzug.execute({
      method: 'up',
      migrations: pending
    })
  }

  /**
   * @returns {Promise.<String[]>} migration names that will run upon 'up' call
   */
  async pending() {
    var [pending, current, baseline] = await Promise.all([
      this._umzug.pending(),
      this.currentVersion(),
      this.currentBaseline()
    ])

    pending = _.map(pending, m => ({name: m.file}))

    //dropping those below baseline
    pending = _.filter(pending, m => this._storage.compareVersions(m, baseline) > 0)

    //integrity check
    if (_.some(pending, m => this._storage.compareVersions(m, current) <= 0)) {
      throw new Error(`Pending migrations must be higher than ${current}`)
    }

    return _.map(pending, 'name')
  }

  async currentVersion() {
    var migration = await this._storage.currentVersion()
    return _.get(migration, 'name')
  }

  async currentBaseline() {
    var migration = await this._storage.lastMigration('baseline')
    return _.get(migration, 'name')
  }

  async executed(type='migration') {
    return this._storage.migrations(type).then(
      migrations => _.map(migrations, 'name'))
  }

  _initConnection() {
    const knex = reqFrom.silent(this.options.cwd, 'knex')
    if (_.isNil(knex)) {
      throw new Error(
        `Knex not found in '${this.options.cwd}'
         Please install it as local dependency with 'npm install --save knex'
        `)
    }
    return knex(this.options.knex)
  }

  _initUmzug() {
    return new Umzug({
      storage: this.options.storage,
      storageOptions: {connection: this._connection},
      migrations: {
        params: [this._connection, Promise],
        path: this.options.migrations,
        pattern: /^\d+_[\w-_]+\.js$/,
        wrap: fn => (knex, Promise) =>
          knex.transaction(tx => Promise.resolve(fn(tx, Promise)))
      }
    })
  }

  _normalizedOptions(raw) {
    var options = {
      knexfile: 'knexfile.js',
      migrations: 'migrations',
      storage: resolve(__dirname, 'storage'),
      env: process.env.KNEX_ENV || process.env.NODE_ENV || 'development',
      ...raw
    }

    options.cwd = options.cwd
      ? options.cwd
      : isAbsolute(options.knexfile || '') ? dirname(options.knexfile)
      : isAbsolute(options.migrations || '') ? dirname(options.migrations)
      : process.cwd()

    options.knexfile = resolve(options.cwd, options.knexfile)

    try {
      options.knex = require(options.knexfile)
    } catch (err) {
      if (/Cannot find module/.test(err.message)) {
        throw new Error(
          `No knexfile at '${options.knexfile}'
           Please create one or bootstrap using 'knex init'
          `)
      }
      throw err
    }

    options.knex = options.knex[options.env] || options.knex

    if (typeof options.knex !== 'object') {
      throw new Error(
        `Malformed knexfile.js:
         ${JSON.stringify(options.knex, null, 2)}
        `)
    }

    options.migrations = resolve(options.cwd,
      raw.migrations
        || _.get(options.knex, 'migrations.directory')
        || options.migrations)

    if (!existsSync(options.migrations)) {
      throw new Error(
        `No migrations directory at '${options.migrations}'
         Please create your first migration with 'knex migrate:make <name>'
        `)
    }

    return options
  }
}
