// The Playbook's routes, under /api/playbook/: the business facts with their state, and an answer
// saved there; the lessons with where each came from, the edits proposed as lessons and those marked
// not a rule, and the owner's decision on a proposal; the templates and voice rules with the wording
// in use, every saved version of a part, wording saved there, and a change shown on three
// conversations before it is saved. src/server.js's api() hands every /api/playbook/ request here
// first. (src/playbook.js is another thing: the sales playbook that compact requests read.)

import { playbookFacts, saveFact } from './factbook.js';
import { listLessons, lessonDetails, editDecisions } from './db.js';
import { editProposals, decideProposal } from './editrules.js';
import { wordingFiles, wordingVersions, saveWording, previewWording } from './wordingedit.js';

/** Answers a /api/playbook/ request. True when it answered; false leaves it to the routes after it. */
export async function playbookApi(req, res, p, url, { send, readBody }) {
  if (p === '/api/playbook/facts') {
    if (req.method === 'GET') { send(res, 200, playbookFacts()); return true; }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const out = saveFact({ title: body.title, answer: body.answer, status: body.status, from: body.from });
      if (out.error) send(res, out.status, { error: out.error });
      else send(res, 200, { fact: out.fact });
      return true;
    }
    send(res, 405, { error: 'Not allowed' });
    return true;
  }
  if (p === '/api/playbook/lessons') {
    if (req.method !== 'GET') { send(res, 405, { error: 'Not allowed' }); return true; }
    // Not a rule: each proposal marked so, as it stood then, newest first.
    const notRules = [...editDecisions().values()].filter((d) => d.decision === 'rejected').map((d) => d.proposal);
    send(res, 200, { lessons: lessonDetails(listLessons()), proposals: editProposals(), notRules });
    return true;
  }
  if (p === '/api/playbook/proposals') {
    if (req.method !== 'POST') { send(res, 405, { error: 'Not allowed' }); return true; }
    const body = (await readBody(req)) || {};
    const out = decideProposal(String(body.key || ''), body.decision);
    if (out.error) send(res, out.status, { error: out.error });
    else send(res, 200, out.lesson ? { lesson: out.lesson } : {});
    return true;
  }
  // Templates and voice rules: { files } to read; { name, part, text } to save, answered with the
  // part as listed, or the refusal in words.
  if (p === '/api/playbook/wording') {
    if (req.method === 'GET') { send(res, 200, { files: wordingFiles() }); return true; }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const out = saveWording({ name: body.name, part: body.part, text: body.text });
      if (out.error) send(res, out.status, { error: out.error });
      else send(res, 200, { part: out.part });
      return true;
    }
    send(res, 405, { error: 'Not allowed' });
    return true;
  }
  // A template change shown on three conversations before it is saved: { name, part, text }, answered
  // with { previews } (and `none` when there is nothing to show it on), or the refusal in words.
  // Nothing is saved, and nothing outside this computer is read.
  if (p === '/api/playbook/preview') {
    if (req.method !== 'POST') { send(res, 405, { error: 'Not allowed' }); return true; }
    const body = (await readBody(req)) || {};
    const out = await previewWording({ name: body.name, part: body.part, text: body.text });
    if (out.error) send(res, out.status, { error: out.error });
    else send(res, 200, out);
    return true;
  }
  // Every saved version of one part, newest first, and the file's own wording: ?kind=&name=&part=.
  if (p === '/api/playbook/versions') {
    if (req.method !== 'GET') { send(res, 405, { error: 'Not allowed' }); return true; }
    const q = url.searchParams;
    const out = wordingVersions({ kind: q.get('kind'), name: q.get('name'), part: q.get('part') ?? '' });
    if (out.error) send(res, out.status, { error: out.error });
    else send(res, 200, out);
    return true;
  }
  return false;
}
