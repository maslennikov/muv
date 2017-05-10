import assert from 'invariant'
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

  async baseline(name) {
    const [base, migration] = await Promise.all([
      this.currentBaseline(),
      this._umzug._findMigration(name)
    ])
    assert(this._storage.versionHigher(migration.file, base),
      `New baseline (${migration.file}) must be higher than current (${base})`)

    return this._storage.logMigration(migration.file, 'baseline')
  }

  /**
   * @param to name of migration to stop migration after
   */
  async up(to) {
    var pending = await this.pending()
    pending = sliceTo(pending, to)
    if (!pending.length) return [];

    return this._umzug.execute({
      method: 'up',
      migrations: pending
    })

    function sliceTo(list, to) {
      if (!to) return list
      const idx = list.indexOf(to)
      assert(idx >= 0, `No migration with name "${to}" pending`)
      return list.slice(0, idx + 1)
    }
  }

  async down(to) {
    // var executed = await this.executed()
  }

  /**
   * @returns list of migration names that will run upon 'up' call
   */
  async pending() {
    var [pending, current, baseline] = await Promise.all([
      this._umzug.pending(),
      this.currentVersion(),
      this.currentBaseline()
    ])

    pending = _.map(pending, m => ({name: m.file}))
    //dropping those below baseline
    pending = _.filter(pending, m => this._storage.versionHigher(m, baseline))
    assert(_.every(pending, m => this._storage.versionHigher(m, current)),
      `Pending migrations must be higher than ${current}`)

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

  /**
   * @returns a list of all migrations above (revertible=true) or below
   * (revertible=false) current baseline
   */
  async executed(revertible=true) {
    var [migrations, baseline] = await Promise.all([
      this._storage.migrations('migration'),
      this._storage.lastMigration('baseline')
    ])

    migrations = _.filter(migrations, m => {
      return revertible
        ? this._storage.versionHigher(m, baseline)
        : this._storage.versionLower(m, baseline, 'orEqual')
    })
    return _.map(migrations, 'name')
  }

  _initConnection() {
    const knex = reqFrom.silent(this.options.cwd, 'knex')
    assert(knex,
      `Knex not found in '${this.options.cwd}'
       Please install it as local dependency with 'npm install --save knex'
      `)
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
    assert(_.isObject(options.knex),
      `Malformed knexfile.js:
       ${JSON.stringify(options.knex, null, 2)}
      `)

    options.migrations = resolve(options.cwd,
      raw.migrations
        || _.get(options.knex, 'migrations.directory')
        || options.migrations)

    assert(existsSync(options.migrations),
      `No migrations directory at '${options.migrations}'
       Please create your first migration with 'knex migrate:make <name>'
      `)

    return options
  }
}
