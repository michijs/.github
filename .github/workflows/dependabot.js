export default async ({ github, require, params }) => {
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

  async function valid(version) {
    try {
      const result = (await execAsync(`bunx semver valid ${version}`, { encoding: 'utf-8' })).stdout?.trim?.();
      return result || null; // returns the version string if valid, otherwise null
    } catch {
      return null;
    }
  }

  async function gt(v1, v2) {
    return (await execAsync(`bunx semver gt ${v1} ${v2}`, { encoding: 'utf-8' })).stdout?.trim?.() === 'true';
  }

  async function lte(v1, v2) {
    return (await execAsync(`bunx semver lte ${v1} ${v2}`, { encoding: 'utf-8' })).stdout?.trim?.() === 'true';
  }

  async function getChangelog(owner, repo, oldVersion, newVersion) {
    try {
      const { data: releases } = await github.rest.repos.listReleases({ owner, repo });
      const changelog = (
        await Promise.all(
          releases.map(async r => {
            const isNotValid = (await Promise.all([valid(r.tag_name), gt(r.tag_name, oldVersion), lte(r.tag_name, newVersion)])).some(x => !x);
            return isNotValid ? '' : `\n### ${r.tag_name}\n\n${r.body || ''}\n\n`
          })
        )
      ).join('');
      if (changelog && changelog !== '') {
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

    return (comparePromise.value?.commits ?? listCommits.value).data.map(c => `<li><a href="${c.html_url}"><code>${c.sha.slice(0, 6)}</code></a> ${c.commit.message}</li>`).join('')
  }

  const comments = await Promise.all(Object.entries(updatedPackages).map(async ([pkgName, newVersion]) => {
    const repoInfo = await getRepoInfo(pkgName);
    if (!repoInfo.owner || !repoInfo.repo) return;

    const oldVersion =
      oldJson.dependencies?.[pkgName] ||
      oldJson.devDependencies?.[pkgName] ||
      oldJson.optionalDependencies?.[pkgName] ||
      oldJson.peerDependencies?.[pkgName] ||
      oldJson.packageManager?.split('@')?.[1] ||
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