export default async ({ github, require, params }) => {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  const REPO = params.githubRepository.split('/');
  const OWNER = REPO[0];
  const REPO_NAME = REPO[1];
  let updatedPackagesString = "";
  const updatedPackages = params.updatedPackages;
  const oldJson = JSON.parse(params.oldJson || '{}');


  async function getPublicRepoInfo(pkgName) {
    const { stdout } = await execAsync(`bunx --silent npm view "${pkgName}" --json repository`);
    if(!stdout || stdout === '')
      return {}
    const repoInfo = JSON.parse(stdout);
    const url = (repoInfo.url || '').replace(/^git\+/, '').replace(/\.git$/, '');
    const parts = url.split('/');
    const owner = parts[parts.length - 2];
    const repo = parts[parts.length - 1];
    return { owner, repo, directory: repoInfo.directory || '' };
  }

  function getRepoInfo(pkgName) {
    const [org, package_name] = pkgName.split('/');
    if (!package_name)
      return {}
    return {
      owner: org.replace('@', ''),
      repo: package_name
    };
  }

  function cleanVersion(version) {
    // Match: major.minor.patch (all numeric)
    const match = version.match(/\d+\.\d+\.\d+/);
    return match ? match[0] : '';
  }

  async function isValid(v1, v2) {
    try {
      return await execAsync(`bunx semver "${cleanVersion(v1)}" -r ">=${cleanVersion(v2)}"`, { encoding: 'utf-8' });
    } catch {
      return false;
    }
  }

  async function getChangelog(owner, repo, oldVersion) {
    try {
      const { data: releases } = await github.rest.repos.listReleases({ owner, repo });
      const changelog = (
        await Promise.all(
          releases.map(async r => {
            return await isValid(r.tag_name, oldVersion) ? `\n### ${r.tag_name}\n\n${r.body || ''}\n\n` : ''
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

    return (comparePromise.value?.commits ?? listCommits.value)?.data?.map(c => `<li><a href="${c.html_url}"><code>${c.sha.slice(0, 6)}</code></a> ${c.commit.message}</li>`)?.join('')
  }

  const comments = await Promise.all(Object.entries(updatedPackages).map(async ([pkgName, newVersion]) => {
    const [resultPublic, result] = await Promise.allSettled([getPublicRepoInfo(pkgName), getRepoInfo(pkgName)]);
    const [owner, repo] = [resultPublic.value?.owner ?? result.value?.owner, resultPublic.value?.repo ?? result.value?.repo];
    if (!owner || !repo) return;

    const oldVersion =
      oldJson.dependencies?.[pkgName] ||
      oldJson.devDependencies?.[pkgName] ||
      oldJson.optionalDependencies?.[pkgName] ||
      oldJson.peerDependencies?.[pkgName] ||
      oldJson.packageManager?.split('@')?.[1] ||
      'Not found';

    const idBump = `bump-${pkgName}`
    const bumpLabel = `Bump <a href="https://github.com/${owner}/${repo}">${pkgName}</a> from <a href="#user-content-${idBump}">${oldVersion} to ${newVersion}</a>`;
    updatedPackagesString += `<li>${bumpLabel}</li>`;

    const [changelog, commitHistory] = await Promise.all([
      getChangelog(owner, repo, oldVersion),
      getCommitHistory(owner, repo, oldVersion, newVersion)
    ]);

    return `<h3 id=${idBump}>${bumpLabel}</h3>${changelog}${commitHistory ? `<details><summary>Commit history:</summary><ul>${commitHistory}</ul></details>` : ''}`
  }));

  const pr = await github.rest.pulls.create({
    owner: OWNER,
    repo: REPO_NAME,
    title: `[${params.ref}] Michijs Dependabot changes`,
    head: 'michijs-dependabot',
    base: params.ref,
    body: `## Updated Packages\n\n<ul>${updatedPackagesString}</ul>`,
  });

  await Promise.all(comments.filter(Boolean).map(comment => github.rest.issues.createComment({
    issue_number: pr.data.number,
    owner: OWNER,
    repo: REPO_NAME,
    body: comment
  })));
}
