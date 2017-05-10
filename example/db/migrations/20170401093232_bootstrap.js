var _ = require('lodash')
var fs = require('fs');
var path = require('path')

exports.up = function (knex, Promise) {
  var sql = fs.readFileSync(
    path.resolve(__dirname, '../bootstrap-schema.sql')).toString();
  var statements = _.compact(sql.split('\n'))

  return statements.reduce(
    (p, s) => p.then(() => knex.raw(s)),
    Promise.resolve())
}

exports.down = function (knex) {
  throw new Error('Cannot rollback bootstrap')
}
