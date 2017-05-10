import _ from 'lodash'
import Migrator from '../../src/'
import Storage from '../../src/storage'

describe('Migrator', function() {
  class MockMigrator extends Migrator {
    constructor(options) {
      super(options)
    }
    _normalizedOptions(options) {return options}
    _initConnection() {return this.options.connection}
    _initUmzug() {return {
      storage: this.options.storage,
      ...this.options.umzug
    }}
  }

  describe('#pending', function() {
    const pending = (unrun, current, baseline) => {
      var migrator = new MockMigrator({
        umzug: {pending: async () => _.map(unrun, name => ({file: name}))},
        storage: {
          currentVersion: async () => current && {name: current},
          lastMigration: async () => baseline && {name: baseline},
          compareVersions: Storage.prototype.compareVersions,
          versionHigher: Storage.prototype.versionHigher,
          versionLower: Storage.prototype.versionLower
        }
      })
      return migrator.pending()
    }

    it('Returns whole list when no migrations run before', async function() {
      const unrun = ['1', '2']
      var migrations = await pending(unrun)
      expect(migrations).to.eql(unrun)

      migrations = await pending([])
      expect(migrations).to.eql([])
    })

    it('Cuts pending list above baseline', async function() {
      const unrun = ['1', '2', '3', '4', '5']
      var migrations = await pending(unrun, '3', '3')
      expect(migrations).to.eql(['4', '5'])

      migrations = await pending(unrun, '5', '5')
      expect(migrations).to.eql([])

      migrations = await pending(unrun, '9', '9')
      expect(migrations).to.eql([])
    })

    it('Bails out when pending version lower than current', async function() {
      const unrun = ['1', '2', '3', '4', '5']
      await expect(pending(unrun, '1')).to.be.rejectedWith(/must be higher than/)
      await expect(pending(unrun, '3')).to.be.rejectedWith(/must be higher than/)
      await expect(pending(unrun, '9')).to.be.rejectedWith(/must be higher than/)
      await expect(pending(unrun, '3', '2')).to.be.rejectedWith(/must be higher than/)

      await expect(pending(unrun, '3', '3')).to.eventually.eql(['4', '5'])
      await expect(pending(unrun, '3', '5')).to.eventually.eql([])
    })
  })

  describe('#executed', function() {
    const executed = (logged, revertible, baseline) => {
      var migrator = new MockMigrator({
        storage: {
          lastMigration: async () => baseline && {name: baseline},
          migrations: async () => _.map(logged, name => ({name})),
          compareVersions: Storage.prototype.compareVersions,
          versionHigher: Storage.prototype.versionHigher,
          versionLower: Storage.prototype.versionLower
        }
      })
      return migrator.executed(revertible)
    }

    it('Returns whole list when no baseline was logged', async function() {
      const logged = ['1', '2']
      var migrations = await executed(logged)
      expect(migrations).to.eql(logged)

      migrations = await executed(logged, false)
      expect(migrations).to.eql([])

      migrations = await executed([])
      expect(migrations).to.eql([])
    })

    it('Cuts revertible list above baseline', async function() {
      const logged = ['1', '2', '3', '4', '5']
      var migrations = await executed(logged, true, '3')
      expect(migrations).to.eql(['4', '5'])
      migrations = await executed(logged, false, '3')
      expect(migrations).to.eql(['1', '2', '3'])

      migrations = await executed(logged, true, '5')
      expect(migrations).to.eql([])
      migrations = await executed(logged, false, '5')
      expect(migrations).to.eql(logged)

      migrations = await executed(logged, true, '9')
      expect(migrations).to.eql([])
      migrations = await executed(logged, false, '9')
      expect(migrations).to.eql(logged)
    })
  })

  describe('#_uppable', function() {
    const uppable = (pending, to) => {
      var migrator = new MockMigrator({})
      migrator.pending = async () => pending || []
      return migrator._uppable(to)
    }

    it('Returns whole list when no "to" target given', async function() {
      const pending = ['1', '2']
      await expect(uppable([])).to.eventually.eql([])
      await expect(uppable(pending)).to.eventually.eql(pending)
    })

    it('Slices list when a valid "to" target given', async function() {
      const pending = ['1', '2', '3']
      await expect(uppable(pending, '1')).to.eventually.eql(['1'])
      await expect(uppable(pending, _.last(pending))).to.eventually.eql(pending)

      await expect(uppable([], '3')).to.be.rejectedWith(/No migration with name/)
      await expect(uppable(pending, '5')).to.be.rejectedWith(/No migration with name/)
    })

    it('Accepts "to" as a name prefix needle', async function() {
      const pending = ['1a', '2b', '3c', '3d']
      await expect(uppable(pending, '1')).to.eventually.eql(['1a'])
      await expect(uppable(pending, '3')).to.eventually.eql(['1a', '2b', '3c'])
      await expect(uppable(pending, '3d')).to.eventually.eql(pending)
    })
  })

  describe('#_downable', function() {
    const downable = (logged, to) => {
      var migrator = new MockMigrator({})
      migrator.executed = async () => logged || []
      return migrator._downable(to)
    }
    const reversed = arr => _.reverse([].concat(arr))

    it('Returns whole list when "to" target equals "0"', async function() {
      const logged = ['1', '2', '3']
      await expect(downable([])).to.eventually.eql([])
      await expect(downable([], '0')).to.eventually.eql([])
      await expect(downable(logged, '0')).to.eventually.eql(reversed(logged))
    })

    it('Returns last migration when no "to" target given', async function() {
      const logged = ['1', '2', '3']
      await expect(downable(logged)).to.eventually.eql([_.last(logged)])
    })

    it('Slices list when a valid "to" target given', async function() {
      const logged = ['1', '2', '3']
      await expect(downable(logged, '3')).to.eventually.eql([])
      await expect(downable(logged, '2')).to.eventually.eql(['3'])
      await expect(downable(logged, '1')).to.eventually.eql(['3', '2'])

      await expect(downable([], '5')).to.be.rejectedWith(/No executed migration/)
      await expect(downable(logged, '5')).to.be.rejectedWith(/No executed migration/)
    })

    it('Accepts "to" as a name prefix needle', async function() {
      const logged = ['1a', '2b', '3c', '3d']
      await expect(downable(logged, '3')).to.eventually.eql([])
      await expect(downable(logged, '3d')).to.eventually.eql([])
      await expect(downable(logged, '3c')).to.eventually.eql(['3d'])
      await expect(downable(logged, '2')).to.eventually.eql(['3d', '3c'])
      await expect(downable(logged, '1')).to.eventually.eql(['3d', '3c', '2b'])
    })
  })
})
