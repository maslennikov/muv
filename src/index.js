import {resolve, dirname, isAbsolute} from 'path'
import {existsSync} from 'fs'
import reqFrom from 'req-from'
import Umzug from 'umzug'
import _ from 'lodash'
import Promise from 'bluebird'


export default class Migrator {
  constructor(options) {
    this.options = this._normalizedOptions(options)

    this._knex = this._initKnex()
    this._umzug = this._initUmzug()
  }

  init() {
    return this._umzug.storage.ensureTable()
  }

  _initKnex() {
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
      storage: resolve(__dirname, 'storage'),
      storageOptions: {connection: this._knex},
      migrations: {
        params: [this._knex, Promise],
        path: this.options.migrations,
        pattern: /^\d+[\w-_]+\.js$/,
        wrap: fn => (knex, Promise) =>
          knex.transaction(tx => Promise.resolve(fn(tx, Promise)))
      }
    })
  }

  _normalizedOptions(raw) {
    var options = {
      knexfile: 'knexfile.js',
      migrations: 'migrations',
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
      options.migrations || _.get(options.knex, 'migrations.directory'))

    if (!existsSync(options.migrations)) {
      throw new Error(
        `No migrations directory at '${options.migrations}'
         Please create your first migration with 'knex migrate:make <name>'
        `)
    }

    return options
  }
}
