exports.up = function (knex) {
  return knex.schema.createTable('tags', table => {
    table.increments('id').primary()
    table.string('name').notNullable()
  })
}

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('tags')
}
