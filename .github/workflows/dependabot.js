export default async ({ github, require, params }) => {
  const semver = require('semver');
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  const REPO = params.githubRepository.split('/');
  const OWNER = REPO[0];
  const REPO_NAME = REPO[1];
  let updatedPackagesString = "";
  const updatedPackages = JSON.parse(params.updatedPackages);
  const oldJson = JSON.parse(params.oldJson || '{}');


  async function getRepoInfo(pkgName) {
    try {
      const { stdout } = await execAsync(`bunx --silent npm view "${pkgName}" --json repository`);
      const repoInfo = JSON.parse(stdout || '{}');
      const url = (repoInfo.url || '').replace(/^git\+/, '').replace(/\.git$/, '');
      const parts = url.split('/');
      const owner = parts[parts.length - 2];
      const repo = parts[parts.length - 1];
      return { owner, repo, directory: repoInfo.directory || '' };
    } catch (err) {
      console.log(`Failed to get repo info for ${pkgName}: ${err.message}`);
      return {};
    }
  }

  async function getChangelog(owner, repo, oldVersion, newVersion) {
    try {
      const { data: releases } = await github.rest.repos.listReleases({ owner, repo });
      const changelog = releases
        .filter(r => semver.valid(r.tag_name))
        .filter(r => semver.gt(r.tag_name, oldVersion) && semver.lte(r.tag_name, newVersion))
        .map(r => `\n### ${r.tag_name}\n\n${r.body || ''}\n\n`)
        .join('');
      if (changelog) {
        return `<details>
        <summary>Changelog:</summary>
        <blockquote><em>Sourced from <a href="https://github.com/${owner}/${repo}/releases">releases</a>.</em>
        ${changelog}</blockquote></details>`;
      }
    } catch (err) {
      console.log(`No changelog for ${owner}/${repo}: ${err.message}`);
    }
    return '';
  }

  async function getCommitHistory(owner, repo, oldVersion, newVersion) {
    const [comparePromise, listCommits] = await Promise.allSettled([
      github.rest.repos.compareCommits({
        owner,
        repo,
        base: `v${oldVersion}`,
        head: `v${newVersion}`,
      }), github.rest.repos.listCommits({ owner, repo, per_page: 10 })
    ])

    return (comparePromise.value.commits ?? listCommits.value).data.map(c => `<li><a href="${c.html_url}"><code>${c.sha.slice(0, 6)}</code></a> ${c.commit.message}</li>`).join('')
  }

  const comments = await Promise.all(Object.entries(updatedPackages).map(async ([pkgName, newVersion]) => {
    const repoInfo = await getRepoInfo(pkgName);
    if (!repoInfo.owner || !repoInfo.repo) return;

    const oldVersion =
      oldJson.dependencies?.[pkgName] ||
      oldJson.devDependencies?.[pkgName] ||
      oldJson.optionalDependencies?.[pkgName] ||
      oldJson.peerDependencies?.[pkgName] ||
      'Not found';

    const bumpLabel = `Bump ${pkgName} from ${oldVersion} to ${newVersion}`;
    updatedPackagesString += `<li>${bumpLabel}</li>`;

    const [changelog, commitHistory] = await Promise.all([
      getChangelog(repoInfo.owner, repoInfo.repo, oldVersion, newVersion),
      getCommitHistory(repoInfo.owner, repoInfo.repo, oldVersion, newVersion)
    ]);

    return `<h3>${bumpLabel}</h3>${changelog}<details><summary>Commit history:</summary><ul>${commitHistory}</ul></details>`
  }));

  const pr = await github.rest.pulls.create({
    owner: OWNER,
    repo: REPO_NAME,
    title: '[master] Michijs Dependabot changes',
    head: 'michijs-dependabot',
    base: 'master',
    body: `## Updated Packages\n\n<ul>${updatedPackagesString}</ul>`,
  });

  await Promise.all(comments.map(comment =>
    github.rest.issues.createComment({
      issue_number: pr.data.number,
      owner: OWNER,
      repo: REPO_NAME,
      body: comment
    })
  ));
}