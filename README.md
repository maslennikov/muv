# MUV

Modern migration javascript toolkit with schema versioning.

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

First, init project with `knex init`, add migrations with `knex migrate:make`, and then:

```
Usage: TBD
```

## Thank you

- [@sheerun](https://github.com/sheerun) for inspiration and starting point ([knex-migrate](https://github.com/sheerun/knex-migrate))

## License

MIT
