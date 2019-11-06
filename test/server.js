const test = require('tape')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const { buildMessage } = require('../lib/run')
const { NO_PULL_REQUESTS } = require('../lib/messages')

const SlackbotsMock = function SlackbotsMock () {}
SlackbotsMock.prototype.on = sinon.stub()
SlackbotsMock.prototype.on.withArgs('start').yields(true)

const envMock = {
  SLACK_TOKEN: 'foo',
  GH_TOKEN: 'foo',
  SLACK_CHANNELS: 'foo',
  GH_REPOS: 'foo',
  CHECK_INTERVAL: '1'
}

const exampleLabelsProp = [
  {
    id: 123456789,
    node_id: 'ABECxc_QSDFE/',
    url: 'https://api.github.com/repos/example/myrepo/labels/on%20hold',
    name: 'on hold',
    color: 'ccef7a',
    default: false
  }
]
const examplePr = {
  title: 'My PR',
  html_url: 'https://github.com/octocat/Hello-World/pull/1347',
  labels: exampleLabelsProp
}

const pullhubMock = sinon.stub().resolves([])
const clock = sinon.useFakeTimers()

const server = proxyquire('../lib/server', {
  slackbots: SlackbotsMock,
  pullhub: pullhubMock
})

test('it throws error on missing required env var', (t) => {
  t.plan(1)

  t.throws(server, Error)
})

test('it calls slackbots onStart handler', (t) => {
  t.plan(1)

  process.env = envMock

  server()
  clock.tick(envMock.CHECK_INTERVAL)
  t.ok(SlackbotsMock.prototype.on.calledWith('start'))
})

test('it matches labels (1/1)', (t) => {
  t.plan(1)
  const message = buildMessage(new Set(['on hold']), [examplePr])
  t.equals(message, NO_PULL_REQUESTS)
})

test('it matches labels (1/3)', (t) => {
  t.plan(1)
  const nonExcluded = { ...examplePr, labels: [] }
  const message = buildMessage(new Set(['on hold']), [nonExcluded, examplePr, nonExcluded])
  t.equals(message.split('\n\n\n')[1].split('\n').length, 2)
})
