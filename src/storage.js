import invariant from 'invariant'
import _ from 'lodash'


class KnexStorage {

  static compareVersions(m1={name: ''}, m2={name: ''}) {
    m1 = _.isString(m1) ? {name: m1} : m1
    m2 = _.isString(m2) ? {name: m2} : m2

    return m1.name > m2.name ? 1
         : m1.name < m2.name ? -1
         : 0
  }

  static versionHigher(of, than, orEqual) {
    return orEqual
      ? (KnexStorage.compareVersions(of, than) >= 0)
      : (KnexStorage.compareVersions(of, than) > 0)
  }

  static versionLower(of, than, orEqual) {
    return orEqual
      ? (KnexStorage.compareVersions(of, than) <= 0)
      : (KnexStorage.compareVersions(of, than) < 0)
  }


  constructor (options) {
    this.knex = options.storageOptions.connection
    this.tableName = _.get(
      this.knex,
      'client.config.migrations.tableName',
      '_migrations'
    )
    invariant(
      this.knex, "The option 'options.storageOptions.connection' is required."
    )
  }

  init() {
    return this._ensureTable()
  }

  _query() {
    return this.knex(this.tableName)
  }

  _ensureTable() {
    return this.knex.schema.createTableIfNotExists(this.tableName, table => {
      table.increments()
      table.enum('type', ['migration', 'baseline'])
      table.string('name')
      table.integer('batch')
      table.dateTime('migration_time')
    })
  }

  async logMigration(name, type='migration') {
    if (typeof this._currentBatchP === 'undefined') {
      this._currentBatchP = this.currentBatch()
    }

    const currentBatch = await this._currentBatchP

    return this._query().insert({
      type,
      name,
      batch: currentBatch + 1,
      migration_time: new Date()
    })
  }

  unlogMigration(name) {
    return this._query().where({type: 'migration', name}).del()
  }

  logged(type='migration') {
    return type == 'all'
      ? this._query().orderBy('id', 'asc')
      : this._query().where({type}).orderBy('id', 'asc')
  }

  // method required by Umzug
  executed() {
    return this.logged().pluck('name')
  }

  currentBatch() {
    return this._query()
      .max('batch as max_batch')
      .then(obj => obj[0].max_batch || 0)
  }

  /**
   * A naive implementation without any caching or optimizations.
   * We need to handle baselines and migrations separately, as we can baseline
   * with an older schema ver than our current migration actually is.
   *
   * @returns migration obj or undefined if no migrations were previously run
   */
  currentVersion() {
    return Promise.all([
      this.lastMigration('migration'),
      this.lastMigration('baseline'),
    ]).then(migrations => {
      return _.last(_.compact(migrations).sort(KnexStorage.compareVersions))
    })
  }

  lastMigration(type='migration') {
    return this._query()
      .where({type}).orderBy('id', 'desc').limit(1)
      .then(m => m[0])
  }

  compareVersions(...args) {
    return KnexStorage.compareVersions(...args)
  }

  versionHigher(...args) {
    return KnexStorage.versionHigher(...args)
  }

  versionLower(...args) {
    return KnexStorage.versionLower(...args)
  }
}

module.exports = KnexStorage
