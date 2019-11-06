const Github = require('octonode')
const messages = require('./messages')

module.exports = { run, buildMessage }

/**
 * Runs a PR listing & returns the text output of PR police
 *
 * @returns {string}
 */
function run () {
  const { env } = process
  const repos = env.GH_REPOS ? env.GH_REPOS.split(',') : []
  const excludeLabels = new Set(env.GH_EXCLUDE_LABELS ? env.GH_EXCLUDE_LABELS.split(',') : [])
  const labels = env.GH_LABELS
  const gh = Github.client(env['GH_TOKEN'])
  const excludeDrafts = typeof env.GH_EXCLUDE_DRAFTS === "undefined" ? true : new Boolean(env.GH_EXCLUDE_DRAFTS);

  // To include draft status in response:
  gh.requestDefaults.headers.Accept = "application/vnd.github.shadow-cat-preview+json";

  return getPullRequests()
    .then(buildMessage.bind(null, excludeLabels, excludeDrafts)).catch(console.error)

  function getPullRequests () {
    console.log('Checking for pull requests...')

    const promises = repos.map((repo) => getRepoPullRequests(repo, labels))

    return Promise.all(promises).then((result) => result.reduceRight((prev, next) => prev.concat(next), []))
  }

  function getRepoPullRequests (repo, labels) {
    const prs = gh.repo(repo).prsAsync({ state: "open" }).then(([prs, _resp]) => prs)
    return prs.catch((err) => {
        // this kinda sucks because github-api gives a
        // "cannot read property 'status' of undefined" when network is
        // unreachable, so we have to catch that TypeError.
        if (err instanceof TypeError) {
          throw new Error('Could not contact Github. Are you offline?')
        } else { throw err }
      })
  }
}

/**
 * buildMessage filters PR & formats the message
 * @param {Set<string>} excludeLabels
 * @param {boolean} excludeDrafts
 * @param {Array<{ title: string, labels: Array<{ name: string }> }>} data
 */
function buildMessage (excludeLabels, excludeDrafts, data) {
  if (!data) {
    return messages.GITHUB_ERROR
  }

  const headers = [ messages.PR_LIST_HEADER, '\n' ]
  console.log({ data });

  let includedPrs = data
  if (excludeLabels.size > 0) {
    includedPrs = data.filter((data) => typeof data.draft !== "boolean" || !data.draft || !excludeDrafts).filter((pr) => {
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
