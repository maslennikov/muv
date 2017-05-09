import {resolve} from 'path'
import _ from 'lodash'
import knex from 'knex'
import Storage from '../../src/storage'

describe('Storage', function() {
  const connection = knex({
    client: 'sqlite3',
    connection: {
      filename: resolve(__dirname, 'storage.test.db')
    }
  })
  var storage
  var query


  beforeEach(function() {
    storage = new Storage({storageOptions: {connection}})
    query = () => connection(storage.tableName)

    return connection.schema.dropTableIfExists(storage.tableName).then(() => {
      return storage.init()
    }).then(() => {
      return expect(query().select()).to.eventually.have.length(0)
    })
  })


  it('Compares migration versions as filename strings', function() {
    expect(storage.compareVersions({name: ''}, {name: ''})).to.eql(0)
    expect(storage.compareVersions({name: '1'}, {name: ''})).to.eql(1)
    expect(storage.compareVersions({name: '1'}, {name: '9'})).to.eql(-1)
    expect(storage.compareVersions({name: '10'}, {name: '9'})).to.eql(-1)
    expect(storage.compareVersions({name: '10'}, {name: 'v9'})).to.eql(-1)
    expect(storage.compareVersions({name: 'v10'}, {name: 'v9'})).to.eql(-1)
    expect(storage.compareVersions({name: 'v10'}, {name: 'v09'})).to.eql(1)
  })


  describe('Logs migrations', function() {

    it('Logs simple migration', async function() {
      await storage.logMigration('123_hello')

      var records = await query().select()
      expect(records).to.have.length(1)

      expect(_.pick(records[0], 'type', 'name', 'batch')).to.eql({
        type: 'migration',
        name: '123_hello',
        batch: 1
      })
    })

    it('Logs baseline migration', async function() {
      await storage.logMigration('123_hello', 'baseline')

      var records = await query().select()
      expect(records).to.have.length(1)

      expect(_.pick(records[0], 'type', 'name', 'batch')).to.eql({
        type: 'baseline',
        name: '123_hello',
        batch: 1
      })
    })

    it('Logs multiple migrations in a single batch', async function() {
      await storage.logMigration('1_hello')
      await storage.logMigration('2_hello')
      await storage.logMigration('3_hello')

      var records = await query().select()
      expect(records).to.have.length(3)
      expect(_.every(records, {batch: 1})).to.be.ok
    })

    it('Increments batches for new storage instances', async function() {
      var storage2 = new Storage({storageOptions: {connection}})

      await storage.logMigration('1_m')
      await storage.logMigration('2_m')
      await storage2.logMigration('3_m')

      var records = await query().select()
      expect(records).to.have.length(3)

      expect(_.filter(records, {batch: 1})).to.have.length(2)
      expect(_.filter(records, {batch: 2})).to.have.length(1)
      expect(_.find(records, {batch: 2})).to.shallowDeepEqual({name: '3_m'})
    })

    it('Logs with ascending ids and migration time', async function() {
      await storage.logMigration('1_hello')
      await storage.logMigration('2_hello')
      await storage.logMigration('3_hello')

      var migrations = await query().orderBy('migration_time', 'desc')
      expect(_.map(migrations, 'id')).to.eql([3, 2, 1])
      expect(_.map(migrations, 'name')).to.eql(['3_hello', '2_hello', '1_hello'])
    })
  })

  describe('Queries past migrations', function() {

    beforeEach(async function() {
      await storage.logMigration('01_m')
      await storage.logMigration('02_m')
      await storage.logMigration('03_b', 'baseline')
      await storage.logMigration('04_m')
      await storage.logMigration('06_m')
      await storage.logMigration('05_b', 'baseline')
    })

    it('Returns past migrations by type', async function() {
      var migrations = await storage.migrations()
      expect(_.map(migrations, 'name')).to.eql(['01_m', '02_m', '04_m', '06_m'])

      var baselines = await storage.migrations('baseline')
      expect(_.map(baselines, 'name')).to.eql(['03_b', '05_b'])
    })

    it('Returns schema version according to baseline and migration', async function() {
      var ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '06_m'})

      await storage.logMigration('10_b', 'baseline')
      ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '10_b'})

      await storage.logMigration('11_m')
      await storage.logMigration('12_m')
      ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '12_m'})
    })

    it('Treats only latest migrations in version calculation', async function() {
      var ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '06_m'})

      await storage.logMigration('11_m')
      await storage.logMigration('12_m')
      ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '12_m'})

      // something happens and an earlier version arrives
      await storage.logMigration('07_m')
      ver = await storage.currentVersion()
      expect(ver).to.shallowDeepEqual({name: '07_m'})
    })
  })

})
