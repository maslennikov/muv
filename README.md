# MUV

Migration toolkit for node.js with baselining and versioning integrity checks.

## Features

* Migrations depend on data schema versions
* Migrations running in transactions
* Baselining existing databases to skip duplicate migrations

## Installation

```
npm install --save muv
```

You should also install `knex` as it's a peer dependency of this package.

## Usage

First, init project with `knex init`, add migrations with `muv create`, and then:

```
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
```

## Thank you

- [@sheerun](https://github.com/sheerun) for inspiration and starting point ([knex-migrate](https://github.com/sheerun/knex-migrate))

## License

MIT
