#!/usr/bin/env node

import meow from 'meow'
import _ from 'lodash'
import * as prettyjson from 'prettyjson'
import Promise from 'bluebird'
import Migrator from '.'


const cli = meow(
  `
  Usage
    $ muv <command> [options]

  Commands
    schema-version Shows current schema and baseline version
    log            Lists all executed migrations since baseline
    baseline       Move baseline to a specified migration
    up             Performs all pending migrations
    down           Rollbacks last migration
    rollback       Rollbacks last batch of upward changes: migrations or baseline

  Options for "up" and "down":
    up --to, -t <name>      Migrate upto specific version
    down --to, -t <name|0>  Migrate downto specific version or baseline if 0

  Options for "up", "down", and "rollback":
    --dry-run, d            Only show list of potential changes without exeuting

  Options for "baseline:
    <name>  Move baseline to a specified version

  Global options:
    --cwd         Specify the working directory
    --knexfile    Specify the knexfile path ($cwd/knexfile.js)
    --migrations  Specify migrations path ($cwd/migrations)
    --env         Specify environment ($KNEX_ENV || $NODE_ENV || 'development')
    --verbose     Be more verbose

  Examples
    $ muv up                  # migrate everyting
    $ muv up --to 20160905    # migrate to a given version
    $ muv down --to 0         # rollback all migrations (downto baseline)
    $ muv down                # rollback single migration
    $ muv rollback            # rollback previous "up"
 `,
  {
    alias: {
      to: 't',
      verbose: 'v',
      dryRun: 'd'
    },
    string: ['to']
  }
)

main().then(
  () => {
    process.exit(0)
  },
  err => {
    console.error('Migration error:', err.message)
    if (cli.flags.verbose) {
      console.error(err.stack)
    }
    process.exit(1)
  }
)

async function main () {
  if (cli.input.length < 1) {
    help()
  }

  const migrator = new Migrator(cli.flags)

  if (migrator.options.verbose) {
    console.log('Created migrator with environment:');
    console.log('======');
    console.log(prettyjson.render(migrator.options, {noColor: true}))
    console.log('======\n');
  }

  await migrator.init()
  const api = createApi(process.stdout, migrator)

  const command = cli.input[0]

  switch (command) {
  case 'schema-version':
    await api.schemaVersion()
    break
  case 'log':
    await api.executed()
    break
  case 'baseline':
    if (!cli.input[1]) return help()
    await api.baseline(cli.input[1])
    await api.schemaVersion()
    break
  case 'up':
  case 'down':
    await api.updown(command, cli.flags.to, cli.flags.dryRun)
    if (!cli.flags.dryRun) {
      await api.schemaVersion()
      await api.pending()
    }
    break
    // case 'rollback':
    //   await api.rollback()
    //   break
    // case 'redo':
    //   await api.redo()
    //   break
  default:
    console.log(cli.help)
  }
}

function createApi (stdout, migrator) {
  const printer = printerFactory(stdout)
  const print = printer()

  migrator._umzug
    .on('migrating', printer('up'))
    .on('reverting', printer('down'))
    .on('debug', printer('debug'))

  const api = {

    schemaVersion: async () => {
      const [v, b] = await Promise.all([
        migrator.currentVersion(),
        migrator.currentBaseline()
      ])
      print(`Schema version ${v || '0'} ${b ? `(baseline ${b})` : ''}`)
    },

    executed: async () => {
      const verbose = migrator.options.verbose
      var [above, below, base] = await Promise.all([
        migrator.executed(),
        migrator.executed(false),
        migrator.currentBaseline()
      ])
      below = verbose ? below : []
      base = base ? ['------', `Baseline: ${base}`, '------'] : []

      print(`${below.concat(base).concat(above).join('\n')}`)
    },

    pending: async () => {
      const m = await migrator.pending()
      print(`Pending ${m.length} migration${m.length == 1 ? '' : 's'}`)
      print(`${m.join('\n')}`)
    },

    baseline: async (name) => {
      const b = await migrator.currentBaseline()
      print(`Moving baseline ${b || 0} .. ${name}`)
      await migrator.baseline(name)
      print(`✓ ok`)
    },

    updown: async (direction, to, dry) => {
      if (dry) {
        print(`Dry run for "${direction.toUpperCase()}":`)
        const method = direction == 'up' ? '_uppable' : '_downable'
        const migrations = await migrator[method](to)
        _.forEach(migrations, printer(direction))
      } else {
        await migrator[direction](to)
        print(`✓ ok`)
      }
    }

    // rollback: async () => {
    //   return migrator._storage.migrations().then(async migrations => {
    //     if (migrations.length === 0) {
    //       return null
    //     }

    //     const maxBatch = _.maxBy(migrations, 'batch').batch
    //     const lastBatch = _.filter(migrations, {batch: maxBatch})
    //     const firstFromBatch = _.minBy(lastBatch, 'migration_time')

    //     return updown(stdout, migrator, 'down')({to: firstFromBatch.name})
    //   })
    // },
  }

  return api
}

function printerFactory (stdout) {
  return function debug (type) {
    return function (message) {
      if (type === 'up') {
        stdout.write(`↑ ${message}\n`)
      } else if (type === 'down') {
        stdout.write(`↓ ${message}\n`)
      } else {
        stdout.write(`${message}\n`)
      }
    }
  }
}

function help () {
  console.log(cli.help)
  process.exit(1)
}
