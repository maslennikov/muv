exports.up = function (knex) {
  return knex('users').insert([
    {name: 'Jonny'},
    {name: 'Igor'}
  ])
}

exports.down = function (knex) {
  return knex('users').del()
}
