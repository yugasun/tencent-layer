const test = require('tape')

const Component = require('../serverless')

test('layerStateChange()', (t) => {
  t.plan(7)

  const comp = new Component()
  const newState = {
    region: 'na-toronto',
    name: 'test',
    description: 'test project layer',
    runtimes: ['Nodejs8.9'],
    hash: 'd41cdf04bd33315be0d87e8562de9dd8',
    licenseInfo: 'MIT'
  }

  const oldState = {
    region: 'na-toronto',
    name: 'test',
    description: 'test project layer',
    runtimes: ['Nodejs8.9'],
    hash: 'd41cdf04bd33315be0d87e8562de9dd8',
    licenseInfo: 'MIT'
  }

  // no change
  t.equal(comp.layerStateChange({ newState, oldState }), false)

  // code hash change
  oldState.hash += 'xxx'
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.hash += newState.hash

  // function name change
  oldState.name += 'xxx'
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.name += newState.name

  // region change
  oldState.region = 'ap-chengdu'
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.region = newState.region

  // runtimes change
  oldState.runtimes = ['Php7']
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.runtimes = newState.runtimes

  // licenseInfo change
  oldState.licenseInfo = 'Apache'
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.licenseInfo = newState.licenseInfo

  // description change
  oldState.description = 'new description'
  t.equal(comp.layerStateChange({ newState, oldState }), true)
  oldState.description = newState.description
})
