const Slackbot = require('slackbots')
const moment = require('moment')
const { run } = require('./run')
const {
  isDirectMessage,
  isBotMessage,
  isMessage,
  isBotCommand
} = require('./helpers')

function server () {
  if (process.argv.indexOf('--now') >= 0) {
    run().then(console.log).then(() => process.exit(0));
    return;
  }

  const env = process.env
  const requiredEnvs = ['SLACK_TOKEN', 'GH_TOKEN', 'GH_REPOS']

  if (!requiredEnvs.every((k) => !!env[k])) {
    throw (
      new Error('Missing one of this required ENV vars: ' + requiredEnvs.join(','))
    )
  }

  const rawDaysToRun = (env.DAYS_TO_RUN || 'Monday,Tuesday,Wednesday,Thursday,Friday').split(',')
  const daysToRun = new Set(rawDaysToRun.map((day) => day.toLowerCase()))

  const channels = env.SLACK_CHANNELS ? env.SLACK_CHANNELS.split(',') : []
  const timesToRun = new Set(env.TIMES_TO_RUN ? env.TIMES_TO_RUN.split(',').map((t) => parseInt(t)) : [900])
  const groups = env.SLACK_GROUPS ? env.SLACK_GROUPS.split(',') : []
  const checkInterval = 60000 // Run every minute (60000)
  const botParams = { icon_url: env.SLACK_BOT_ICON }

  const bot = new Slackbot({
    token: env.SLACK_TOKEN,
    name: env.SLACK_BOT_NAME || 'Pr. Police'
  })

  bot.on('start', () => {
    setInterval(() => {
      const now = moment()
      const runToday = daysToRun.has(now.format('dddd').toLowerCase())
      const runThisMinute = timesToRun.has(parseInt(now.format('kmm')))
      const readableTimestamp = now.format('dddd YYYY-DD-MM h:mm a')

      if (runToday && runThisMinute) {
        console.log(`Running at: ${readableTimestamp}`)
        run().then(notifyAllChannels)
      } else {
        console.log(`Nothing to run at: ${readableTimestamp}`)
      }
    }, checkInterval)
  })

  bot.on('message', (data) => {
    if ((isMessage(data) && isBotCommand(data)) ||
      (isDirectMessage(data) && !isBotMessage(data))) {
      run()
        .then(notifyAllChannels)
        .then((message) => {
          bot.postMessage(data.channel, message, botParams)
        })
    }
  })

  bot.on('error', (err) => {
    console.error(err)
  })

  function notifyAllChannels (message) {
    channels.map((channel) => {
      bot.postMessageToChannel(channel, message, botParams)
    })

    groups.map((group) => {
      bot.postMessageToGroup(group, message, botParams)
    })
  }
}

module.exports = server
