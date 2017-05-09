import _ from 'lodash'

describe('Storage', function() {
  async function shallDeliver(val) {
    return val
  }

  describe('Test test', function() {

    it('Shall pass', function() {
      expect(shallDeliver('hello')).to.eventually.eql('hello')
    })
  })

})
