const Slackbot = require('slackbots')
const Github = require('github-api')
const moment = require('moment')
const messages = require('./messages')
const {
  isDirectMessage,
  isBotMessage,
  isMessage,
  isBotCommand
} = require('./helpers')

function server () {
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
  const repos = env.GH_REPOS ? env.GH_REPOS.split(',') : []
  const excludeLabels = new Set(env.GH_EXCLUDE_LABELS ? env.GH_EXCLUDE_LABELS.split(',') : [])
  const labels = env.GH_LABELS
  const checkInterval = 60000 // Run every minute (60000)
  const botParams = { icon_url: env.SLACK_BOT_ICON }
  const gh = new Github({ token: process.env['GH_TOKEN'] });

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

        getPullRequests()
          .then(buildMessage.bind(null, excludeLabels))
          .then(notifyAllChannels)
      } else {
        console.log(`Nothing to run at: ${readableTimestamp}`)
      }
    }, checkInterval)
  })

  bot.on('message', (data) => {
    if ((isMessage(data) && isBotCommand(data)) ||
      (isDirectMessage(data) && !isBotMessage(data))) {
      getPullRequests()
        .then(buildMessage.bind(null, excludeLabels))
        .then((message) => {
          bot.postMessage(data.channel, message, botParams)
        })
    }
  })

  bot.on('error', (err) => {
    console.error(err)
  })

  function getPullRequests () {
    console.log('Checking for pull requests...')

    const promises = repos.map((repo) => {
      const [ repoUser, repoName ] = repo.split('/')
      return getRepoPullRequests(repoUser, repoName, labels)
    })

    return Promise.all(promises).then((result) => result.reduceRight((prev, next) => prev.concat(next), []));
  }

  function getRepoPullRequests (user, repo, labels) {
    const remoteIssues = gh.getIssues(user, repo)
    return remoteIssues.listIssues({ labels })
      .then((resp) => {
        return resp.data.filter((repo) => repo.pull_request)
      })
      .catch((err) => {
        // this kinda sucks because github-api gives a
        // "cannot read property 'status' of undefined" when network is
        // unreachable, so we have to catch that TypeError.
        if (err instanceof TypeError) {
          throw new Error('Could not contact Github. Are you offline?')
        } else { throw err }
      })
  }

  function notifyAllChannels (message) {
    channels.map((channel) => {
      bot.postMessageToChannel(channel, message, botParams)
    })

    groups.map((group) => {
      bot.postMessageToGroup(group, message, botParams)
    })
  }
}

/**
 * buildMessage filters PR & formats the message
 * @param {Set<string>} excludeLabels
 * @param {Array<{ title: string, labels: Array<{ name: string }> }>} data
 */
function buildMessage (excludeLabels, data) {
  if (!data) {
    return messages.GITHUB_ERROR
  }

  const headers = [ messages.PR_LIST_HEADER, '\n' ]

  let includedPrs = data
  if (excludeLabels.size > 0) {
    includedPrs = data.filter((pr) => {
      const hasExcludedLabel = pr.labels.reduce((acc, label) => acc || excludeLabels.has(label.name), false)
      return !hasExcludedLabel
    })
  }

  const prMessages = includedPrs.map((pr) => `:star: ${pr.title} | ${pr.html_url}`)

  if (prMessages.length < 1) {
    return messages.NO_PULL_REQUESTS
  } else {
    return headers.concat(prMessages).join('\n')
  }
}

server.buildMessage = buildMessage
module.exports = server
