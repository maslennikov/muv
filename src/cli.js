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
    pending   Lists all pending migrations
    list      Lists all executed migrations
    up        Performs all pending migrations
    down      Rollbacks last migration
    rollback  Rollbacks last batch of migrations
    redo      Rollbacks last batch and performs all migrations

  Options for "up" and "down":
    --to, -t    Migrate upto (downto) specific version
    --from, -f  Start migration from specific version

  Global options:
    --cwd         Specify the working directory
    --knexfile    Specify the knexfile path ($cwd/knexfile.js)
    --migrations  Specify migrations path ($cwd/migrations)
    --env         Specify environment ($KNEX_ENV || $NODE_ENV || 'development')
    --verbose     Be more verbose

  As a convenience, you can skip --to flag, and just provide migration name.

  Examples
    $ muv up                  # migrate everytings
    $ muv up 20160905         # migrate upto given migration name
    $ muv up --to 20160905    # the same as above
    $ muv up --only 201609085 # migrate up single migration
    $ muv down --to 0         # rollback all migrations
    $ muv down                # rollback single migration
    $ muv rollback            # rollback previous "up"
    $ muv redo --verbose      # rollback and migrate everything
 `,
  {
    alias: {
      to: 't',
      from: 'f',
      only: 'o'
    },
    string: ['to', 'from', 'only']
  }
)

main().then(
  () => {
    process.exit(0)
  },
  err => {
    if (cli.flags.verbose) {
      console.error(err.stack)
    } else {
      console.error(err.message)
    }
    process.exit(1)
  }
)

async function main () {
  if (cli.input.length < 1 && !cli.flags.list) {
    help()
  }

  const flags = normalizedFlags(cli)
  const migrator = new Migrator(flags)

  if (migrator.options.verbose) {
    console.log(prettyjson.render(migrator.options, {noColor: true}))
  }

  await migrator.init()
  const api = createApi(process.stdout, migrator)

  const command = cli.input[0]

  switch (command) {
    case 'list':
      await api.history()
      break
    case 'pending':
      await api.pending()
      break
    case 'down':
      await api.down()
      break
    case 'up':
      await api.up()
      break
    case 'rollback':
      await api.rollback()
      break
    case 'redo':
      await api.redo()
      break
    default:
      console.log(cli.help)
  }
}

function normalizedFlags({flags, input}) {
  var normalized = {...flags}

  if (_.isNil(flags.to) && !_.isNil(input[1])) {
    normalized.to = cli.input[1]
  }

  if (flags.to === '0') {
    normalized.to = 0
  }

  if (flags.from === '0') {
    normalized.from = 0
  }

  return normalized
}

function help () {
  console.log(cli.help)
  process.exit(1)
}

function createApi (stdout, migrator) {
  const debug = createDebug(stdout)

  migrator._umzug
    .on('migrating', debug('migrate'))
    .on('reverting', debug('revert'))
    .on('debug', debug('debug'))

  const api = {
    history: () => {
      return migrator._umzug.storage.executed().then(lines => {
        stdout.write(`${lines.join('\n')}\n`)
      })
    },
    pending: () => {
      return migrator._umzug.pending().then(migrations => {
        stdout.write(`${migrations.map(mig => mig.file).join('\n')}\n`)
      })
    },
    rollback: async () => {
      return migrator._umzug.storage.migrations().then(async migrations => {
        if (migrations.length === 0) {
          return null
        }

        const maxBatch = _.maxBy(migrations, 'batch').batchb
        const lastBatch = _.filter(migrations, {batch: maxBatch})
        const firstFromBatch = _.minBy(lastBatch, 'migration_time')

        return updown(stdout, migrator, 'down')({to: firstFromBatch.name})
      })
    },
    redo: async () => {
      await api.rollback()
      await api.up()
    },
    up: updown(stdout, migrator, 'up'),
    down: updown(stdout, migrator, 'down')
  }

  return api
}

function updown (stdout, migrator, type) {
  return migrator._umzug[type](_.omitBy(_.pick(
    migrator.options, 'to', 'from'
  ), _.isNil))
}

function createDebug (stdout) {
  return function debug (type) {
    return function (message) {
      if (type === 'migrate') {
        stdout.write(`↑ ${message}...\n`)
      } else if (type === 'revert') {
        stdout.write(`↓ ${message}...\n`)
      } else {
        stdout.write(`${message}\n`)
      }
    }
  }
}
