#!/usr/bin/env node

import meow from 'meow'
import _ from 'lodash'
import * as prettyjson from 'prettyjson'
import Migrator from '.'


const cli = meow(
  `
  Usage
    $ muv <command> [options]

  Commands
    status         Shows current schema-, baseline version, and pending migrations
    log            Lists executed migrations since baseline (pass -v to show all)
    baseline       Move baseline to a specified migration
    up             Performs all pending migrations
    down           Rollbacks last migration
    make           Makes a migration with a given name in migrations directory

  Options for "up" and "down":
    up --to, -t <name>      Migrate upto specific version
    down --to, -t <name|0>  Migrate downto specific version or to baseline if 0
    (up|down) --dry-run, d  Only show list of potential changes without exeuting

  Options for "baseline:
    baseline                  Query current schema version and baseline
    baseline --to, -t <name>  Move baseline to a specified version

  Options for "make:
    make <name>  Make a timestamped migration file with a given name

  Global options:
    --cwd          Specify the working directory
    --knexfile     Specify the knexfile path ($cwd/knexfile.js)
    --migrations   Specify migrations path ($cwd/migrations)
    --env          Specify environment ($KNEX_ENV || $NODE_ENV || 'development')
    --verbose, -v  Be more verbose

  Examples
    $ muv status                # query current status
    $ muv up                    # migrate everyting
    $ muv up --to 20160905      # migrate to a given version
    $ muv down --to 0           # rollback all migrations (downto baseline)
    $ muv down                  # rollback single migration
    $ muv baseline              # shows current version and baseline
    $ muv baseline --to 201701  # sets baseline to a new version
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
  case 'status':
    assertArgs(!cli.input[1])
    await api.schemaVersion()
    await api.pending()
    break
  case 'log':
    assertArgs(!cli.input[1])
    await api.executed()
    break
  case 'baseline':
    assertArgs(!cli.input[1])
    if (cli.flags.to) {
      await api.baseline(cli.flags.to)
    }
    await api.schemaVersion()
    break
  case 'up':
  case 'down':
    assertArgs(!cli.input[1])
    await api.updown(command, cli.flags.to, cli.flags.dryRun)
    if (!cli.flags.dryRun) {
      await api.schemaVersion()
      await api.pending()
    }
    break
  case 'make':
    assertArgs(cli.input[1])
    await api.make(cli.input[1])
    break
  default:
    console.log(cli.help)
  }

  function assertArgs(condition) {
    if (!condition) help()
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
      print(`Schema version ${v || '0'} (${b ? `baseline ${b}` : 'no baseline'})`)
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
    },

    make: async (name) => {
      var filename = await migrator.make(name)
      print(`Created migration file ${filename}`)
    }
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
